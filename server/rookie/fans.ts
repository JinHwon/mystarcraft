/**
 * 선수 키우기: 팬카페 · 커뮤니티(SNS) 반응 글
 * 큰 일이 있을 때마다 글이 올라오고, 좋은 일이면 팬카페 회원이 늘고 악플이면 사기가 조금 떨어진다
 */
import { nickname, type FanPost, type RookieState } from "@shared/rookie/model";

export type FanKind =
  | "proBeat" | "eventWin" | "eventPodium" | "eventOut" | "courageWin" | "courageLose" | "draftPick" | "draftMiss"
  | "join" | "promoUp" | "promoDown" | "plWin" | "plLose" | "slump" | "awake" | "rivalWin" | "rivalLose"
  | "streamHit" | "streamFlop" | "contract" | "fa" | "transfer";

type Mood = FanPost["mood"];
/** [분위기, 팬카페 글들, 커뮤니티 글들, 회원 증가] */
const T: Record<FanKind, [Mood, string[], string[], number]> = {
  proBeat: ["good", ["{n}님 래더에서 {x} 잡았대요!!! 실화냐", "프로 상대로 이기는 거 봤어요? 우리 {n} 미쳤다", "역시 될성부른 떡잎 ㄷㄷ"], ["아마추어 {n}이라는 애가 래더에서 {x} 이김 ㅋㅋ", "{x} 래더에서 아마추어한테 털림 ㄹㅇ", "{n} 이 선수 누구임? 폼 미쳤던데"], 25],
  eventWin: ["good", ["{x} 우승 축하드려요!!! 🎉🎉", "우승컵 든 {n}님 너무 멋있다 ㅠㅠ", "역시 우리 {n} 믿고 있었다"], ["{x} 우승 {n}… 이름 기억해둬라", "아마 대회 휩쓰는 {n} 프로 가도 되겠는데?"], 40],
  eventPodium: ["good", ["{x} 입상 축하해요! 다음엔 우승 가즈아", "상금으로 맛있는 거 사드세요 ㅎㅎ"], ["{n} 이번 {x}에서 입상했네", "{n} 요즘 폼 괜찮은 듯"], 15],
  eventOut: ["neutral", ["오늘은 아쉬웠지만 다음 대회 응원할게요!", "컨디션이 안 좋았던 거 같아요 ㅠ 푹 쉬세요"], ["{n} {x}에서 일찍 떨어짐 ㅋㅋ", "역시 대회는 다르네"], 2],
  courageWin: ["good", ["커리지 매치 우승!!! 이제 준프로 {n}님 ㅠㅠ", "드래프트까지 가즈아아아", "꿈에 한 발짝 더 가까이! 축하해요"], ["커리지 우승 {n} 물건이던데", "이번 커리지 우승자 {n} 프로 갈 각"], 60],
  courageLose: ["neutral", ["괜찮아요 다음 커리지 매치가 있잖아요!", "{n}님 포기하지 마세요 ㅠ"], ["{n} 커리지 또 떨어졌냐", "커리지는 운도 필요함"], 3],
  draftPick: ["good", ["드래프트 지명!!!! 프로게이머 {n} 탄생 ㅠㅠㅠ", "{x} 유니폼 입은 모습 너무 기대돼요", "이 카페 1기 회원인 게 자랑스럽다"], ["{x} {n} 지명함 ㄷㄷ 신인왕 후보", "드래프트 {n} 뽑힌 거 좋은 픽인 듯"], 120],
  draftMiss: ["bad", ["ㅠㅠ 이번엔 안 됐지만 꼭 프로 될 거예요", "구단들 보는 눈이 없네요"], ["{n} 드래프트 미지명 ㅋㅋ", "드래프트 떨어진 {n} 이제 어떡함"], -5],
  join: ["good", ["프로게이머 {n}! {x} 입단 축하해요 🎉", "이제 TV에서 볼 수 있는 건가요?!"], ["{x}에 신인 {n} 입단", "{n} 입단 테스트 뚫었다던데"], 100],
  promoUp: ["good", ["1군 승격!!! 이제 프로리그 나오는 거죠?", "{n}님 프로리그 데뷔 기다립니다"], ["{x} 승강전 {n} 1군 올라감", "신인 {n} 1군 승격 빠르네"], 50],
  promoDown: ["bad", ["2군 강등 ㅠㅠ 다시 올라가면 돼요", "힘내세요 {n}님…"], ["{n} 2군 강등 ㅋㅋ 거품이었나", "{n} 요즘 폼 별로더라"], -10],
  plWin: ["good", ["프로리그 승리!!! 오늘 경기 미쳤다", "{n} 선수 인터뷰 언제 해요?ㅋㅋ", "{x}전 승리 축하해요"], ["{n} 오늘 경기력 좋던데", "{x} 상대로 {n} 승리 ㄷㄷ"], 20],
  plLose: ["neutral", ["오늘은 졌지만 잘 싸웠어요!", "다음 경기에서 복수해요"], ["{n} 오늘 무기력하던데", "{x} 상대로 {n} 패배"], 0],
  slump: ["bad", ["요즘 많이 지치셨죠? 응원합니다 ㅠㅠ", "슬럼프는 누구나 와요! 힘내세요"], ["{n} 요즘 왜 이럼 ㅋㅋ 연패중", "{n} 손 풀렸네 은퇴각?", "{n} 슬럼프 길어질 듯"], -8],
  awake: ["good", ["{n}님 돌아왔다!!! 각성 모드 ON", "이게 우리가 알던 {n}이지 ㅠㅠ"], ["{n} 폼 미쳤다 각성함", "요즘 {n} 무서운데?"], 30],
  rivalWin: ["good", ["라이벌 {r} 잡았다!!! 속이 다 시원하네요", "{n} vs {r} 명경기였어요"], ["{n} vs {r} 라이벌전 {n} 승 ㅋㅋ", "{r} 또 {n}한테 짐"], 12],
  rivalLose: ["bad", ["{r}한테 진 거 너무 아쉽다 ㅠ 다음엔 꼭!", "라이벌전은 원래 이기고 지고 하는 거예요"], ["{r}가 {n}보다 한 수 위인 듯", "{n} {r} 상대로 약하네 ㅋㅋ"], -2],
  streamHit: ["good", ["방송 너무 재밌었어요 ㅋㅋㅋ 별풍 쏘고 갑니다", "{n}님 방송 매일 해주세요!!"], ["{n} 방송 시청자 {x}명 찍음", "{n} 방송 꿀잼이던데"], 20],
  streamFlop: ["neutral", ["오늘 방송 저 혼자 봤나요 ㅋㅋ 힘내요", "꾸준히 하면 시청자 늘어요!"], ["{n} 방송 시청자 한 자릿수 ㅋㅋ"], 1],
  contract: ["good", ["재계약 축하해요! 월급 {x}만원이면 대박", "구단이 {n}님 가치를 알아봤네요"], ["{n} 재계약 월급 {x}만원", "{n} 연봉 협상 잘했네"], 15],
  fa: ["bad", ["FA라니… 꼭 좋은 팀 찾으실 거예요", "어느 팀이든 {n}님 데려가면 이득!"], ["{n} 협상 결렬 FA 나옴 ㄷㄷ", "{n} 몸값 너무 부른 듯"], -5],
  transfer: ["good", ["{x}에서도 응원할게요!!", "새 팀 유니폼도 잘 어울려요"], ["{n} {x} 이적 ㄷㄷ", "{n} 이적료 얼마임?"], 20],
};

const CAFE_AUTHORS = ["열혈팬", "1호팬", "응원단장", "직관러", "팬카페 매니저", "새벽방송 시청자", "PC방 사장님", "동네 친구"];
const SNS_AUTHORS = ["스갤러", "익명", "e스포츠 기자", "커뮤 눈팅러", "래더 고인물", "프로 지망생", "해설 지망생"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function fanPosts(s: RookieState, kind: FanKind, x = ""): { posts: FanPost[]; members: number; mood: Mood } {
  const [mood, cafe, sns, grow] = T[kind];
  const fill = (txt: string) => txt.replaceAll("{n}", s.name).replaceAll("{r}", s.rival.name).replaceAll("{x}", x);
  const posts: FanPost[] = [];
  const likesBase = 3 + Math.round(s.fanCafe.members / 15);
  // 팬카페는 회원이 조금이라도 있어야 글이 올라옴
  if (s.fanCafe.members >= 5 || mood === "good") {
    posts.push({ day: s.day, author: `${pick(CAFE_AUTHORS)}${Math.random() < 0.5 ? "" : Math.floor(Math.random() * 99) + 1}`, text: fill(pick(cafe)), likes: Math.round(likesBase * (0.5 + Math.random())), src: "cafe", mood: mood === "bad" ? "neutral" : "good" });
  }
  // 커뮤니티 글 (악플도 섞임)
  posts.push({ day: s.day, author: Math.random() < 0.5 ? pick(SNS_AUTHORS) : nickname(), text: fill(pick(sns)), likes: Math.round((2 + s.fame / 10) * (0.3 + Math.random())), src: "sns", mood });
  const members = Math.round(grow * (1 + s.fame / 300) * (0.6 + Math.random() * 0.8));
  return { posts, members, mood };
}
