/**
 * 선수 키우기 메일함: 메일 틀(조건·내용·선택), 하루에 한 번 새 메일, 답장 처리, 기자회견, 알림 메일
 * - 답장은 사기·인지도·돈·컨디션·능력치·숨은 성격을 조금씩 바꾼다 (FM 의 받은 편지함·선수 대화처럼)
 * - 기한 안에 답하지 않으면 마지막 선택(보통 "넘긴다")으로 처리
 */
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@shared/gameConstants";
import { ORIG_TEAMS } from "@shared/career/originalData";
import { CLAN_BY_ID, STAT_MAX_ONE, STAT_MIN_ONE, capOf, sumStats, ymd, type RookieState } from "@shared/rookie/model";
import { TRAITS, formAvg, type TraitKey } from "@shared/rookie/persona";
import { RookieError, addTrust, hireAgent, myRole, trustOf } from "./logic";
import { AGENTS, agentOf } from "@shared/rookie/squad";
import { MAIL_FROM, pendingMail, type Mail, type MailChoice, type MailFrom } from "@shared/rookie/inbox";

const rand = () => Math.random();
const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

/** 메일함 최대 보관 수 (답을 기다리는 메일은 지우지 않음) */
const INBOX_MAX = 60;
/** 같은 틀이 다시 오기까지 (일) */
const COOLDOWN = 21;

// ── 효과 ──────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
function morale(s: RookieState, n: number) { s.morale = clamp(s.morale + n, 0, 100); }
function fame(s: RookieState, n: number) { s.fame = clamp(s.fame + n, 0, 1000); }
function cond(s: RookieState, n: number) { s.cond = clamp(s.cond + n, 1, 100); }
function money(s: RookieState, n: number) { s.money = Math.max(0, s.money + n); }
/** 능력치 올리기·내리기 (한계를 넘으면 가장 높은 능력치부터 조금씩 깎음) */
function stat(s: RookieState, k: StatKey, n: number) {
  s.stats[k] = clamp(s.stats[k] + n, STAT_MIN_ONE, STAT_MAX_ONE);
  let over = sumStats(s.stats) - capOf(s);
  while (over > 0) { const top = [...STAT_KEYS].filter(x => x !== k).sort((a, b) => s.stats[b] - s.stats[a])[0]; s.stats[top]--; over--; }
}
/** 성격이 조금 바뀜 (확률). 알고 있는 성격이면 결과에 알려 줌 */
function nudge(s: RookieState, k: TraitKey, d: number, chance: number): string {
  if (!s.persona || rand() >= chance) return "";
  const before = s.persona[k];
  s.persona[k] = clamp(before + d, 1, 20);
  if (s.persona[k] === before) return "";
  return s.known?.[k] ? ` · ${TRAITS[k].name} ${d > 0 ? "▲" : "▼"}` : ` · (무언가 마음가짐이 ${d > 0 ? "단단해진" : "흔들린"} 느낌)`;
}
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
function log(s: RookieState, icon: string, text: string) {
  s.log.unshift({ day: s.day, icon, text });
  if (s.log.length > 400) s.log.length = 400;
}

// ── 보내기 ────────────────────────────────────────────────────
export function sendMail(s: RookieState, m: Omit<Mail, "id" | "day">): Mail {
  const mail: Mail = { id: (s.nextMailId = (s.nextMailId ?? 0) + 1), day: s.day, ...m };
  const inbox = (s.inbox ??= []);
  inbox.unshift(mail);
  // 오래된 것부터 정리 (답을 기다리는 메일은 남김)
  while (inbox.length > INBOX_MAX) {
    const i = inbox.map(pendingMail).lastIndexOf(false);
    if (i < 0) break;
    inbox.splice(i, 1);
  }
  return mail;
}
/** 선택 없는 알림 메일 (입단 테스트 제의·이적 제안 등) */
export function notify(s: RookieState, from: MailFrom, sender: string, title: string, body: string) {
  return sendMail(s, { from, sender, title, body });
}

// ── 메일 틀 ───────────────────────────────────────────────────
interface Tpl {
  id: string;
  from: MailFrom;
  weight: number;
  when: (s: RookieState) => boolean;
  make: (s: RookieState) => { sender: string; title: string; body: string; choices?: MailChoice[]; data?: Mail["data"]; days?: number };
  /** 선택 결과 (보여 줄 문장) */
  resolve?: (s: RookieState, choice: string, data: NonNullable<Mail["data"]>) => string;
}

const REPORTERS = ["게임조선 김 기자", "포모스 이 기자", "데일리e스포츠 박 기자", "스포츠서울 최 기자", "인벤 정 기자"];
const teamShort = (s: RookieState) => (s.team ? ORIG_TEAMS[s.team.team].short : "");
const weakest = (s: RookieState) => [...STAT_KEYS].sort((a, b) => s.stats[a] - s.stats[b])[0];
const randomStats = (n: number) => [...STAT_KEYS].sort(() => rand() - 0.5).slice(0, n);

const TEMPLATES: Tpl[] = [
  {
    id: "coach_night", from: "coach", weight: 3, when: s => !!s.team,
    make: s => ({
      sender: `${teamShort(s)} 코치`, title: "오늘 밤 개인 훈련 어때?",
      body: "요즘 손이 좀 굳은 것 같더라. 숙소 들어가기 전에 나랑 두 시간만 더 맞춰 보자. 무리하면 내일 컨디션이 걱정이긴 한데… 선택은 네가 해.",
      choices: [{ id: "yes", label: "하겠습니다", hint: "컨디션 ↓ · 능력치 ↑" }, { id: "no", label: "오늘은 쉬겠습니다", hint: "컨디션 지키기" }],
    }),
    resolve: (s, c) => {
      if (c === "yes") {
        cond(s, -15);
        const keys = randomStats(2); const g = keys.map(k => { const v = randInt(3, 6); stat(s, k, v); return `${STAT_LABELS[k]} +${v}`; });
        addTrust(s, 3);
        return `코치와 밤늦게까지 연습했습니다. ${g.join(", ")} · 컨디션 -15 · 코치 신뢰 ↑${nudge(s, "prof", 1, 0.3)}`;
      }
      cond(s, 5); addTrust(s, -1);
      return `"그래, 쉬는 것도 실력이다." 컨디션 +5`;
    },
  },
  {
    id: "media_interview", from: "media", weight: 2, when: s => s.fame >= 40,
    make: s => ({
      sender: pick(REPORTERS), title: "인터뷰 요청드립니다",
      body: `요즘 ${s.status === "pro" ? "프로 무대에서" : "아마추어 무대에서"} 이름이 자주 들리더군요. 짧게 인터뷰 가능할까요? 독자들이 앞으로의 목표를 궁금해합니다.`,
      choices: [{ id: "humble", label: "겸손하게 답한다", hint: "무난함" }, { id: "bold", label: "자신감 있게 목표를 밝힌다", hint: "인지도 ↑ · 부담도" }, { id: "no", label: "정중히 거절한다" }],
    }),
    resolve: (s, c) => {
      if (c === "humble") { fame(s, 5); morale(s, 2); return "\"아직 배울 게 많습니다.\" 차분한 인터뷰가 실렸습니다. 인지도 +5, 사기 +2"; }
      if (c === "bold") {
        fame(s, 10);
        if ((s.persona?.pres ?? 10) <= 8) { morale(s, -3); return "\"우승이 목표입니다!\" 기사가 크게 나갔지만 괜히 부담이 됩니다. 인지도 +10, 사기 -3"; }
        morale(s, 4); return `"우승이 목표입니다!" 당당한 인터뷰에 팬들이 열광합니다. 인지도 +10, 사기 +4${nudge(s, "amb", 1, 0.2)}`;
      }
      fame(s, -2); morale(s, 1); return "인터뷰를 거절했습니다. 연습에 집중합니다. 인지도 -2, 사기 +1";
    },
  },
  {
    id: "rival_provoke", from: "rival", weight: 2, when: s => !!s.rival,
    make: s => ({
      sender: s.rival.name, title: `${s.rival.name} 님이 커뮤니티에 글을 올렸습니다`,
      body: `"${s.name}? 다음에 만나면 그냥 끝내줄게 ㅋ 요즘 실력 많이 늘었다던데 글쎄…" 댓글이 수십 개 달렸습니다.`,
      choices: [{ id: "reply", label: "받아친다: \"경기로 보여줄게\"", hint: "다음 라이벌전이 더 뜨거워짐" }, { id: "ignore", label: "무시한다" }],
    }),
    resolve: (s, c) => {
      if (c === "reply") {
        fame(s, 8); morale(s, 5);
        (s.flags ??= {}).rivalHeat = s.day + 21;
        return "댓글 전쟁이 붙었습니다! 3주 안에 라이벌을 만나면 이기든 지든 화제가 됩니다. 인지도 +8, 사기 +5";
      }
      morale(s, 2);
      return `신경 쓰지 않기로 했습니다. 사기 +2${nudge(s, "det", 1, 0.15)}`;
    },
  },
  {
    id: "fan_letter", from: "fan", weight: 3, when: s => s.fame >= 20 || s.fanCafe.members >= 20,
    make: () => ({
      sender: pick(["고등학생 팬", "직장인 팬", "PC방 단골", "해외 팬", "어린 팬"]), title: "응원 편지가 도착했습니다",
      body: pick([
        "어제 경기 보고 처음으로 스타를 다시 켰어요. 꼭 프로 무대에서 보고 싶어요!",
        "힘든 시기에 경기 보는 게 낙이에요. 지더라도 끝까지 하는 모습이 좋아요.",
        "사인 한 장만 받을 수 있을까요? 동생이 진짜 팬이에요 ㅠㅠ",
      ]),
      choices: [{ id: "warm", label: "정성껏 답장한다", hint: "사기 · 팬" }, { id: "short", label: "짧게 고맙다고 한다" }],
    }),
    resolve: (s, c) => {
      if (c === "warm") { morale(s, 4); s.fanCafe.members += Math.max(3, Math.round(s.fanCafe.members * 0.05)); return `정성 어린 답장에 팬카페가 들썩입니다. 사기 +4 · 팬카페 회원 증가${nudge(s, "soc", 1, 0.12)}`; }
      morale(s, 1); return "짧게 답장했습니다. 사기 +1";
    },
  },
  {
    id: "fan_meet", from: "fan", weight: 1.5, when: s => s.fanCafe.members >= 150,
    make: s => ({
      sender: "팬카페 운영진", title: "이번 주말 정모에 와 주실 수 있나요?",
      body: `회원 ${s.fanCafe.members.toLocaleString()}명 기념 정모를 합니다. 잠깐이라도 얼굴 비춰 주시면 다들 정말 좋아할 거예요. (식사비 조금 보태 주시면 더 좋고요 ㅎㅎ)`,
      choices: [{ id: "go", label: "참석한다 (5만원)", hint: "컨디션 ↓ · 인지도·팬 ↑" }, { id: "no", label: "다음에 가겠다고 한다" }],
    }),
    resolve: (s, c) => {
      if (c === "go") {
        if (s.money < 5) return "돈이 모자라 참석하지 못했습니다";
        money(s, -5); cond(s, -8); fame(s, 8); s.fanCafe.members += 20; morale(s, 3);
        return "정모에서 사인과 사진을 잔뜩! 인지도 +8, 팬카페 +20명, 사기 +3, 컨디션 -8";
      }
      s.fanCafe.members = Math.max(0, Math.round(s.fanCafe.members * 0.97)); return "아쉬워하는 팬들이 조금 있었습니다 (팬카페 -3%)";
    },
  },
  {
    id: "family_worry", from: "family", weight: 2, when: s => s.status === "amateur" && s.day >= 90,
    make: () => ({
      sender: "어머니", title: "밥은 잘 먹고 다니니?",
      body: "요즘 밤낮이 바뀐 것 같아서 걱정이야. 게임 하는 거 반대하는 건 아니지만… 이게 정말 네 길인지 한 번 이야기해 보자.",
      choices: [{ id: "talk", label: "솔직하게 이야기한다", hint: "사기 ↑" }, { id: "prove", label: "결과로 보여드리겠다고 한다", hint: "각오" }, { id: "study", label: "공부도 병행하겠다고 한다", hint: "용돈 ↑ · 컨디션 ↓" }],
      days: 5,
    }),
    resolve: (s, c) => {
      if (c === "talk") { morale(s, 6); return "한참을 이야기했습니다. 마음이 한결 가벼워졌습니다. 사기 +6"; }
      if (c === "prove") { morale(s, -2); return `"알았다. 대신 1년이다." 각오를 다졌습니다. 사기 -2${nudge(s, "det", 1, 0.3)}`; }
      cond(s, -5); money(s, 10); morale(s, 2); return "공부를 병행하기로 했습니다. 부모님이 용돈을 보태 주셨습니다 (+10만원, 컨디션 -5, 사기 +2)";
    },
  },
  {
    id: "partjob", from: "friend", weight: 2, when: s => s.money < 30 && s.status !== "pro",
    make: () => ({
      sender: "동네 친구", title: "주말에 가게 좀 도와줄래?",
      body: "우리 삼촌 가게에 주말 알바가 비었대. 일당 넉넉하게 준다는데 해 볼래? 대신 하루 종일 서 있어야 해 ㅋㅋ",
      choices: [{ id: "yes", label: "한다", hint: "돈 ↑ · 컨디션 ↓" }, { id: "no", label: "연습해야 해서 거절" }],
    }),
    resolve: (s, c) => {
      if (c === "yes") { money(s, 25); cond(s, -15); return "주말 알바로 25만원을 벌었습니다. 컨디션 -15"; }
      return `연습에 집중합니다${nudge(s, "prof", 1, 0.1)}`;
    },
  },
  {
    id: "streamer_collab", from: "friend", weight: 1.5, when: s => s.fame >= 60,
    make: () => ({
      sender: pick(["인기 BJ 철구리", "BJ 별풍선왕", "스타 유튜버 빌드킹"]), title: "합방 한번 하실래요?",
      body: "제 방송에서 같이 팀플 한판 하시죠! 시청자들이 요즘 님 얘기 많이 해요. 수익은 반반!",
      choices: [{ id: "yes", label: "좋아요", hint: "인지도·돈 ↑ · 컨디션 ↓" }, { id: "no", label: "죄송하지만 거절" }],
    }),
    resolve: (s, c) => {
      if (c === "yes") { fame(s, 12); money(s, 10); cond(s, -8); s.stream.fans += 20; return "합방이 대박! 인지도 +12, 10만원, 방송 팬 +20, 컨디션 -8"; }
      return "정중히 거절했습니다";
    },
  },
  {
    id: "sponsor_pcbang", from: "sponsor", weight: 1.5, when: s => s.fame >= 80 && s.status !== "pro",
    make: () => ({
      sender: pick(["스타PC방 사장님", "제로PC방 본사", "게이머존 PC방"]), title: "PC방 후원 제안",
      body: "저희 PC방 이름을 아이디 옆에 걸어 주시면 후원금을 드리겠습니다. 가끔 저희 매장에서 방송도 해 주시고요!",
      choices: [{ id: "yes", label: "계약한다", hint: "돈 ↑" }, { id: "no", label: "거절한다" }],
    }),
    resolve: (s, c) => {
      if (c === "yes") { money(s, 40); fame(s, 4); return "PC방 후원 계약! 40만원을 받았습니다. 인지도 +4"; }
      return "후원을 거절했습니다";
    },
  },
  {
    id: "gear_sponsor", from: "sponsor", weight: 1, when: s => s.fame >= 150,
    make: () => ({
      sender: "게이밍 기어 브랜드", title: "마우스 협찬 제안",
      body: "저희 신제품 마우스를 써 보시고 SNS에 후기 한 줄만 남겨 주세요. 제품은 그냥 드립니다.",
      choices: [{ id: "yes", label: "받는다", hint: "장비 아이템" }, { id: "no", label: "쓰던 장비가 편해서 거절" }],
    }),
    resolve: (s, c) => {
      if (c === "yes") { s.inventory.m1 = (s.inventory.m1 ?? 0) + 1; fame(s, 3); return "M-BLACK 마우스를 받았습니다 (가방). 인지도 +3"; }
      morale(s, 1); return "거절했습니다. 사기 +1";
    },
  },
  {
    id: "clan_newbie", from: "clan", weight: 2.5, when: s => !!s.clan,
    make: s => ({
      sender: `[${CLAN_BY_ID[s.clan!.id]?.tag}] 클랜장`, title: "신입 좀 봐줄 수 있어?",
      body: "이번에 들어온 신입이 너랑 같은 종족이라 그런데, 시간 날 때 연습 좀 같이 해 주라. 클랜 분위기에도 좋고.",
      choices: [{ id: "yes", label: "돕겠습니다", hint: "컨디션 ↓ · 클랜 점수·친분 ↑" }, { id: "no", label: "요즘 바빠서…" }],
    }),
    resolve: (s, c) => {
      if (!s.clan) return "클랜을 나와서 답장을 보내지 못했습니다";
      if (c === "yes") { cond(s, -8); s.clan.points += 5; morale(s, 2); return `신입을 가르치며 오히려 기본기를 되짚었습니다. 클랜 점수 +5, 사기 +2, 컨디션 -8${nudge(s, "soc", 1, 0.2)}`; }
      s.clan.points = Math.max(0, s.clan.points - 2); return "클랜장이 조금 서운해합니다 (클랜 점수 -2)";
    },
  },
  {
    id: "community_tip", from: "friend", weight: 2, when: () => true,
    make: () => {
      const k = pick(["strategy", "sense", "scout", "defense"] as StatKey[]);
      return {
        sender: "커뮤니티 고수", title: `[공략] 요즘 메타 ${STAT_LABELS[k]} 정리.txt`,
        body: `장문의 공략 글이 올라왔습니다. 제대로 연구하면 ${STAT_LABELS[k]}에 도움이 될 것 같지만, 따라 해 보려면 하루 종일 걸릴 것 같습니다.`,
        choices: [{ id: "study", label: "연구한다", hint: `${STAT_LABELS[k]} ↑ · 컨디션 ↓` }, { id: "skip", label: "넘긴다" }],
        data: { k },
      };
    },
    resolve: (s, c, d) => {
      if (c === "study") { const k = d.k as StatKey; const v = randInt(3, 6); stat(s, k, v); cond(s, -6); return `공략을 연구했습니다. ${STAT_LABELS[k]} +${v}, 컨디션 -6`; }
      return "다음에 보기로 했습니다";
    },
  },
  {
    id: "burnout", from: "friend", weight: 4, when: s => s.cond < 30 || s.streak <= -4,
    make: () => ({
      sender: "룸메이트", title: "너 요즘 좀 이상해",
      body: "밤새 모니터만 보고 있던데 눈이 퀭하다. 이러다 진짜 쓰러진다. 며칠만이라도 손 놓고 쉬는 게 어때?",
      choices: [{ id: "rest", label: "푹 쉰다", hint: "컨디션·사기 ↑ · 감각 조금 ↓" }, { id: "push", label: "참고 계속한다", hint: "각오" }],
      days: 3,
    }),
    resolve: (s, c) => {
      if (c === "rest") { cond(s, 30); morale(s, 4); const k = pick([...STAT_KEYS]); stat(s, k, -2); return `푹 쉬었습니다. 컨디션 +30, 사기 +4, ${STAT_LABELS[k]} -2 (감각 저하)`; }
      morale(s, -5); return `이를 악물고 버팁니다. 사기 -5${nudge(s, "det", 1, 0.25)}`;
    },
  },
  {
    id: "wrist", from: "system", weight: 1.5, when: s => s.record.w + s.record.l >= 150,
    make: () => ({
      sender: "내 몸", title: "손목이 시큰거립니다",
      body: "마우스를 잡을 때마다 손목이 찌릿합니다. 병원에 가 보는 게 좋을까요?",
      choices: [{ id: "doctor", label: "병원에 간다 (15만원)", hint: "안전" }, { id: "endure", label: "파스 붙이고 참는다", hint: "운이 나쁘면 악화" }],
      days: 3,
    }),
    resolve: (s, c) => {
      if (c === "doctor") {
        if (s.money < 15) { cond(s, -10); return "병원비가 없어 참았습니다… 컨디션 -10"; }
        money(s, -15); cond(s, 10); return "물리치료를 받았습니다. 컨디션 +10 (15만원)";
      }
      if (rand() < 0.4) { const keys = randomStats(2); for (const k of keys) stat(s, k, -6); cond(s, -15); return `통증이 심해졌습니다… ${keys.map(k => STAT_LABELS[k]).join("·")} -6, 컨디션 -15`; }
      return "다행히 며칠 지나니 괜찮아졌습니다";
    },
  },
  {
    id: "match_fixing", from: "system", weight: 0.4, when: s => s.status !== "amateur",
    make: () => ({
      sender: "모르는 번호", title: "좋은 제안 하나 할게요",
      body: "다음 경기 하나만 살짝 져 주시면 수고비를 섭섭지 않게 드리겠습니다. 아무도 모를 겁니다.",
      choices: [{ id: "report", label: "협회에 신고한다", hint: "인지도 ↑" }, { id: "refuse", label: "단호히 거절한다" }],
      days: 2,
    }),
    resolve: (s, c) => {
      if (c === "report") { fame(s, 12); morale(s, -3); return `신고가 기사화되며 '클린 게이머'로 이름을 알렸습니다. 인지도 +12, 사기 -3 (마음이 무겁습니다)${nudge(s, "det", 1, 0.3)}`; }
      fame(s, 3); return `단호히 거절했습니다. 인지도 +3${nudge(s, "prof", 1, 0.2)}`;
    },
  },
  {
    id: "old_friends", from: "friend", weight: 2, when: () => true,
    make: () => ({
      sender: "고등학교 친구들", title: "이번 주말 MT 갈래?",
      body: "다들 너 본 지 너무 오래됐다고 난리다. 1박 2일 바다 가는데 같이 가자!",
      choices: [{ id: "go", label: "간다", hint: "사기 ↑ · 컨디션 ↓" }, { id: "practice", label: "연습해야 해서 못 간다", hint: "능력치 조금 ↑ · 사기 ↓" }],
    }),
    resolve: (s, c) => {
      if (c === "go") { morale(s, 10); cond(s, -10); return "오랜만에 신나게 놀았습니다. 사기 +10, 컨디션 -10"; }
      const k = pick([...STAT_KEYS]); const v = randInt(2, 4); stat(s, k, v); morale(s, -2);
      return `혼자 연습실에 남았습니다. ${STAT_LABELS[k]} +${v}, 사기 -2${nudge(s, "prof", 1, 0.15)}`;
    },
  },
  {
    id: "weekly_mvp", from: "media", weight: 5, when: s => (formAvg(s.recent) ?? 0) >= 8,
    make: s => ({ sender: pick(REPORTERS), title: `이주의 ${s.status === "pro" ? "프로" : "아마추어"} MVP 선정!`, body: `최근 5경기 평균 평점 ${formAvg(s.recent)!.toFixed(1)}. 이번 주 가장 뜨거운 선수로 뽑혔습니다. 축하합니다! (인지도 +10, 사기 +5)` }),
  },
  {
    id: "rival_news", from: "rival", weight: 1.5, when: s => !!s.rival && sumStats(s.rival.stats) > sumStats(s.stats) * 1.04,
    make: s => ({
      sender: "커뮤니티 소식", title: `${s.rival.name}, 요즘 무섭게 성장 중`,
      body: `라이벌 ${s.rival.name}의 실력이 부쩍 늘었다는 소문입니다. 래더에서도 승승장구 중이라고…`,
      choices: [{ id: "fire", label: "자극받는다", hint: "사기 ↑" }, { id: "calm", label: "내 페이스대로 간다" }],
    }),
    resolve: (s, c) => {
      if (c === "fire") { morale(s, 5); return `불이 붙었습니다! 사기 +5${nudge(s, "amb", 1, 0.2)}`; }
      morale(s, 1); return `흔들리지 않기로 했습니다. 사기 +1${nudge(s, "cons", 1, 0.1)}`;
    },
  },
  {
    id: "map_study", from: "friend", weight: 1.5, when: s => !!s.ladderMaps?.sel?.length,
    make: s => {
      const mapId = pick(s.ladderMaps!.sel);
      return {
        sender: "맵 분석 채널", title: "이번 달 래더 맵 완벽 분석 영상",
        body: "이번 달 래더 맵의 지형·러시 거리·종족별 빌드를 정리한 영상이 올라왔습니다. 보고 나면 그 맵이 훨씬 편해질 것 같습니다.",
        choices: [{ id: "watch", label: "본다", hint: "맵 이해도 ↑" }, { id: "skip", label: "다음에" }],
        data: { mapId },
      };
    },
    resolve: (s, c, d) => {
      if (c === "watch") { const id = Number(d.mapId); (s.mapGames ??= {})[id] = (s.mapGames[id] ?? 0) + 8; cond(s, -3); return "영상을 보며 맵을 공부했습니다. 맵 이해도 ↑, 컨디션 -3"; }
      return "다음에 보기로 했습니다";
    },
  },
  {
    id: "coach_talk", from: "coach", weight: 4, when: s => !!s.team && (formAvg(s.recent) ?? 7) < 6.3,
    make: s => ({
      sender: `${teamShort(s)} 감독`, title: "잠깐 면담 좀 하자",
      body: `요즘 평점이 ${formAvg(s.recent)?.toFixed(1)}이다. 무슨 일 있니? 솔직하게 말해 봐.`,
      choices: [{ id: "work", label: "더 노력하겠습니다", hint: "각오" }, { id: "honest", label: "솔직히 힘들다고 말한다", hint: "사기 ↑" }, { id: "excuse", label: "운이 없었다고 한다" }],
      days: 3,
    }),
    resolve: (s, c) => {
      if (c === "work") { const k = weakest(s); const v = randInt(2, 4); stat(s, k, v); cond(s, -5); morale(s, -1); addTrust(s, 2); return `감독님과 약점을 짚어 봤습니다. ${STAT_LABELS[k]} +${v}, 컨디션 -5 · 코치 신뢰 ↑${nudge(s, "prof", 1, 0.2)}`; }
      if (c === "honest") { morale(s, 6); cond(s, 8); addTrust(s, 1); return "\"그래, 며칠 쉬어 가자.\" 사기 +6, 컨디션 +8"; }
      morale(s, 2); addTrust(s, -4); return `감독님 표정이 굳었습니다. 사기 +2 · 코치 신뢰 ↓${nudge(s, "det", -1, 0.15)}`;
    },
  },
  {
    id: "agent_intro", from: "agent", weight: 2, when: s => !s.agent && s.fame >= AGENTS[0].fame && s.status !== "amateur",
    make: () => ({
      sender: AGENTS[0].name, title: "제가 선수님을 맡아 보고 싶습니다",
      body: `요즘 눈여겨보고 있었습니다. 연봉 협상이나 이적 제안은 저 같은 사람이 있어야 유리하죠. 계약금 ${AGENTS[0].hire}만원에 월급의 ${Math.round(AGENTS[0].fee * 100)}%만 받겠습니다. (${AGENTS[0].desc})`,
      choices: [{ id: "hire", label: `계약한다 (${AGENTS[0].hire}만원)`, hint: "협상·제안 ↑ · 수수료" }, { id: "no", label: "아직은 혼자 해 보겠다" }],
      days: 7,
    }),
    resolve: (s, c) => {
      if (c !== "hire") return "정중히 거절했습니다";
      try { hireAgent(s, 1); return `${AGENTS[0].name}과(와) 계약했습니다`; } catch (e) { return `계약하지 못했습니다: ${(e as Error).message}`; }
    },
  },
  {
    id: "agent_pitch", from: "agent", weight: 3, when: s => !!s.agent && !!s.team && !s.team.loan && s.offers.length === 0,
    make: s => {
      const others = ORIG_TEAMS.filter(t => t.id < 12 && t.id !== s.team!.team);
      const team = pick(others).id;
      return {
        sender: agentOf(s)!.name, title: `${ORIG_TEAMS[team].name}이(가) 관심을 보입니다`,
        body: `${ORIG_TEAMS[team].name} 쪽에서 조용히 연락이 왔습니다. 지금보다 좋은 조건을 받아낼 수 있을 것 같은데, 정식으로 제안을 받아 볼까요? (지금 구단에는 들키지 않게 처리하겠습니다)`,
        choices: [{ id: "yes", label: "제안을 받아 봐 주세요", hint: "이적 제안" }, { id: "no", label: "지금 팀에 집중하겠습니다", hint: "코치 신뢰 조금 ↑" }],
        data: { team },
      };
    },
    resolve: (s, c, d) => {
      if (!s.team) return "지금은 소속 구단이 없어 넘겼습니다";
      if (c === "yes") {
        const team = Number(d.team), a = agentOf(s);
        const salary = Math.round(s.team.salary * (1.15 + rand() * 0.25 + (a?.nego ?? 0) / 2));
        s.offers.push({ team, salary, until: s.day + 7 });
        return `${ORIG_TEAMS[team].name}이(가) 월급 ${salary}만원을 제시했습니다. 일주일 안에 구단 화면에서 결정하세요`;
      }
      addTrust(s, 2); morale(s, 1); return "지금 팀에서 증명하기로 했습니다. 코치 신뢰 ↑, 사기 +1";
    },
  },
  {
    id: "captain", from: "coach", weight: 3, when: s => myRole(s) === "ace" && trustOf(s) >= 80 && !(s.flags?.captain),
    make: s => ({
      sender: `${ORIG_TEAMS[s.team!.team].short} 감독`, title: "주장을 맡아 줄 수 있겠니?",
      body: "팀 분위기를 잡아 줄 사람이 필요하다. 네가 주장을 맡아 줬으면 한다. 책임이 무거운 자리라 부담도 될 거다.",
      choices: [{ id: "yes", label: "맡겠습니다", hint: "인지도·신뢰 ↑ · 부담" }, { id: "no", label: "아직은 경기에만 집중하고 싶습니다" }],
      days: 5,
    }),
    resolve: (s, c) => {
      if (c === "yes") { (s.flags ??= {}).captain = 99999; fame(s, 15); addTrust(s, 5); morale(s, (s.persona?.pres ?? 10) >= 12 ? 5 : -2); return `주장 완장을 찼습니다! 인지도 +15 · 코치 신뢰 ↑${nudge(s, "soc", 1, 0.25)}`; }
      morale(s, 1); return "감독님이 이해해 주셨습니다";
    },
  },
];
const TPL = Object.fromEntries(TEMPLATES.map(t => [t.id, t])) as Record<string, Tpl>;

/** 선택 없는 메일의 즉시 효과 */
function applyNoChoice(s: RookieState, id: string) {
  if (id === "weekly_mvp") { fame(s, 10); morale(s, 5); }
}

/** 하루에 한 번: 조건이 맞는 메일 하나 (확률). 같은 메일은 3주 안에 다시 오지 않음 */
export function dailyMail(s: RookieState) {
  const busy = s.team || s.clan ? 0.42 : 0.32;
  if (rand() >= busy) return null;
  const cd = (s.mailCd ??= {});
  const ok = TEMPLATES.filter(t => (cd[t.id] ?? -999) + COOLDOWN <= s.day && t.when(s));
  if (!ok.length) return null;
  let r = rand() * ok.reduce((a, t) => a + t.weight, 0);
  const t = ok.find(x => (r -= x.weight) < 0) ?? ok[ok.length - 1];
  cd[t.id] = s.day;
  const m = t.make(s);
  if (!m.choices) applyNoChoice(s, t.id);
  return sendMail(s, { from: t.from, sender: m.sender, title: m.title, body: m.body, tpl: t.id, data: m.data, choices: m.choices, until: m.choices ? s.day + (m.days ?? 4) : undefined });
}

/** 메일 읽음 */
export function readMail(s: RookieState, id: number) {
  const m = (s.inbox ?? []).find(x => x.id === id);
  if (!m) throw new RookieError("없는 메일입니다");
  m.read = true;
  return m;
}

/** 답장: 고른 선택의 결과를 적용하고 결과 문장을 메일에 남김 */
export function answerMail(s: RookieState, id: number, choice: string, auto = false): Mail {
  const m = (s.inbox ?? []).find(x => x.id === id);
  if (!m) throw new RookieError("없는 메일입니다");
  if (!pendingMail(m)) throw new RookieError("이미 답장한 메일입니다");
  if (!m.choices!.some(c => c.id === choice)) throw new RookieError("없는 선택입니다");
  const t = m.tpl ? TPL[m.tpl] : undefined;
  const result = m.tpl === "press" ? resolvePress(s, choice, m.data ?? {}) : t?.resolve ? t.resolve(s, choice, m.data ?? {}) : "";
  m.picked = choice;
  m.read = true;
  m.result = (auto ? "(답이 없어 자동으로) " : "") + result;
  const label = m.choices!.find(c => c.id === choice)?.label ?? "";
  log(s, MAIL_FROM[m.from].icon, `${m.sender}: "${m.title}" → ${label}${result ? ` · ${result}` : ""}`);
  return m;
}

/** 기한이 지난 메일은 마지막 선택으로 자동 처리 */
export function expireMails(s: RookieState) {
  for (const m of s.inbox ?? []) {
    if (pendingMail(m) && m.until !== undefined && s.day > m.until) answerMail(s, m.id, m.choices![m.choices!.length - 1].id, true);
  }
}

// ── 기자회견 (큰 경기 뒤) ─────────────────────────────────────────
/**
 * 대회·커리지 매치·클랜전 결과 뒤 기자회견: 겸손 · 자신감 · 도발 (이겼을 때) / 인정 · 변명 · 다짐 (졌을 때)
 * 답을 안 하면 첫 번째(무난한) 답으로
 */
export function pressConference(s: RookieState, what: string, won: boolean) {
  const choices: MailChoice[] = won
    ? [{ id: "humble", label: "\"상대도 강했습니다. 운이 따랐어요\"", hint: "무난함" }, { id: "confident", label: "\"준비한 대로 됐습니다. 다음도 자신 있어요\"", hint: "인지도 ↑" }, { id: "bold", label: "\"솔직히 상대가 약했어요\"", hint: "화제 ↑ · 역풍 위험" }]
    : [{ id: "accept", label: "\"상대가 더 잘했습니다\"", hint: "무난함" }, { id: "vow", label: "\"반드시 돌아오겠습니다\"", hint: "각오" }, { id: "excuse", label: "\"컨디션이 좋지 않았습니다\"", hint: "사기 ↑ · 인지도 ↓" }];
  // 가장 무난한 답이 기본 (기한이 지나면 첫 번째로) → 자동 처리용으로 첫 번째를 끝에 둠
  const ordered = [...choices.slice(1), choices[0]];
  return sendMail(s, {
    from: "media", sender: pick(REPORTERS), tpl: "press", data: { won: won ? 1 : 0, what },
    title: `${what} ${won ? "우승" : "경기"} 후 기자회견`,
    body: won ? `${what} 우승 축하드립니다! 지금 기분이 어떠신가요? 팬들에게 한마디 부탁드립니다.` : `${what}에서 아쉽게 졌습니다. 오늘 경기를 돌아보신다면요?`,
    choices: ordered, until: s.day + 2,
  });
}
function resolvePress(s: RookieState, c: string, d: NonNullable<Mail["data"]>): string {
  const pres = s.persona?.pres ?? 10;
  if (d.won) {
    if (c === "humble") { fame(s, 6); morale(s, 2); return "겸손한 소감에 호평이 이어집니다. 인지도 +6, 사기 +2"; }
    if (c === "confident") { fame(s, 12); morale(s, pres >= 10 ? 4 : 1); return `자신감 넘치는 인터뷰가 화제입니다. 인지도 +12, 사기 +${pres >= 10 ? 4 : 1}`; }
    (s.flags ??= {}).rivalHeat = s.day + 21;
    if (rand() < 0.35) { fame(s, -8); morale(s, -3); return "발언이 역풍을 맞았습니다. 비난 댓글이 쏟아집니다… 인지도 -8, 사기 -3"; }
    fame(s, 20); morale(s, 3); return `도발이 화제가 됐습니다! 인지도 +20, 사기 +3 · 3주 동안 라이벌전이 뜨거워집니다`;
  }
  if (c === "accept") { fame(s, 3); morale(s, 2); return "패배를 깔끔하게 인정했습니다. 인지도 +3, 사기 +2"; }
  if (c === "vow") { morale(s, 5); fame(s, 2); return `다음을 다짐했습니다. 사기 +5, 인지도 +2${nudge(s, "det", 1, 0.25)}`; }
  morale(s, 3); fame(s, -6); return "핑계처럼 들렸다는 반응이 많습니다. 사기 +3, 인지도 -6";
}

/** 라이벌전이 뜨거운 동안 (도발·댓글 전쟁 뒤) 라이벌을 만나면 결과가 더 화제가 됨 */
export function rivalHeatResult(s: RookieState, won: boolean): string | null {
  const until = s.flags?.rivalHeat;
  if (until === undefined || s.day > until) return null;
  delete s.flags!.rivalHeat;
  if (won) { fame(s, 15); morale(s, 5); return "말한 대로 이겼습니다! 커뮤니티가 뒤집어졌습니다 (인지도 +15, 사기 +5)"; }
  fame(s, -5); morale(s, -8); return "큰소리쳤는데 졌습니다… 놀림거리가 됐습니다 (인지도 -5, 사기 -8)";
}

/** 오늘 날짜 (메일 화면용) */
export const mailDate = (day: number) => { const d = ymd(day); return `${d.m}/${d.d}`; };
