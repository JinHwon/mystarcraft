/**
 * 구단 운영: 연봉·운영비·장부, 선수 사기와 이적 희망, 영입 제안(받기·보내기)과 협상, 계약, 감독 평판과 이동, 파산
 */
import { FREE_AGENT_TEAM } from "@shared/career/originalData";
import {
  AI_MIN_ROSTER,
  DEBT_LIMIT_WEEKS,
  MAX_ROSTER,
  MIN_ROSTER,
  OPERATING_COST,
  START_MONEY,
  WAGE_WEEKS,
  askingPrice,
  totalOf,
  type BonusKey,
  type CareerState,
  type Contract,
  type CPlayer,
  BONUS_NAMES,
} from "@shared/career/rules";
import { contractScore, defaultContract, expectedShare, jobThreshold, playerDemand, sellMinimum, squadRank, weeklyWage } from "@shared/career/contract";
import { activePlayers, proTeams, rosterOf, teamPower } from "@shared/career/view";
import { CareerError, clampCond, news, rand, randInt } from "./core";
import { questLabel, questProgress, questRange, questReward, sponsorOffers } from "@shared/career/sponsor";

const round10 = (v: number) => Math.round(v / 10) * 10;

// ── 장부 ───────────────────────────────────────────────────────
/** 우리 구단 돈 변화 기록 (delta: 수입 +, 지출 -) */
export function book(s: CareerState, category: string, delta: number) {
  if (!delta) return;
  if (!s.ledger || s.ledger.season !== s.season) s.ledger = { season: s.season, items: {} };
  s.ledger.items[category] = (s.ledger.items[category] ?? 0) + delta;
}
/** 우리 구단 돈을 움직이고 기록 */
export function pay(s: CareerState, category: string, delta: number) {
  s.teams[s.myTeam].money += delta;
  book(s, category, delta);
}

/** 예전 세이브 보정: 계약·평판 */
export function ensureClub(s: CareerState) {
  for (const p of activePlayers(s)) {
    if (p.team !== FREE_AGENT_TEAM && !p.contract) p.contract = defaultContract(p, s.season);
    if (p.morale === undefined) p.morale = 70;
  }
  if (!s.manager) s.manager = { reputation: 50 };
}

/** 이번 주 협상 횟수 제한 (같은 상대와 3번) */
function useTry(s: CareerState, key: string, limit = 3): number {
  const wk = `${s.season}-${s.week}`;
  if (s.triesWeek !== wk) { s.tries = {}; s.triesWeek = wk; }
  const n = (s.tries![key] ?? 0) + 1;
  if (n > limit) throw new CareerError("이번 주에는 더 협상할 수 없습니다 (협상 결렬). 다음 주에 다시 시도하세요");
  s.tries![key] = n;
  return n;
}

function moveTo(s: CareerState, p: CPlayer, team: number, contract?: Contract) {
  p.team = team;
  p.action = null;
  p.morale = 70;
  p.wantsOut = false;
  if (contract) p.contract = contract;
}

// ── 스폰서 ───────────────────────────────────────────────────────
export function chooseSponsor(s: CareerState, index: number, targets: number[]) {
  if (s.sponsor?.season === s.season) throw new CareerError("이번 시즌 스폰서는 이미 정했습니다");
  const offer = sponsorOffers(s)[index];
  if (!offer) throw new CareerError("스폰서를 선택하세요");
  const quests = offer.quests.map((q, i) => {
    const [lo, hi] = questRange(q);
    const target = Math.max(lo, Math.min(hi, Math.round(targets[i] ?? q.target)));
    return { ...q, target };
  });
  s.sponsor = { ...offer, quests, season: s.season };
  news(s, `🤝 ${offer.name}와(과) 스폰서 계약! 주 ${offer.weekly}만원 + 퀘스트 보상`);
  return { name: offer.name };
}

/** 스폰서 퀘스트 달성 확인 → 보상 지급 */
export function checkSponsor(s: CareerState) {
  const sp = s.sponsor;
  if (!sp || sp.season !== s.season) return;
  for (const q of sp.quests) {
    if (q.done || !questProgress(s, q).done) continue;
    q.done = true;
    const reward = questReward(q);
    pay(s, "스폰서 보상", reward);
    news(s, `🎁 스폰서 퀘스트 달성! "${questLabel(s, q)}" — ${sp.name}에서 ${reward.toLocaleString()}만원`);
  }
}

// ── 한 주 (finishWeek 에서) ─────────────────────────────────────────
export function weeklyClub(s: CareerState) {
  const me = s.teams[s.myTeam];
  const mine = rosterOf(s, s.myTeam);
  // 연봉 (정규시즌 동안 나눠 지급) + 운영비
  if (s.phase === "regular") {
    const wages = mine.reduce((sum, p) => sum + weeklyWage(p), 0);
    pay(s, "연봉", -wages);
  }
  pay(s, "운영비", -OPERATING_COST);
  // 스폰서 후원금·퀘스트
  if (s.sponsor?.season === s.season) pay(s, "스폰서", s.sponsor.weekly);
  checkSponsor(s);

  // 출전 기회에 따른 사기
  const played = s.matches.filter(m => m.done && m.stage === "regular" && (m.a === s.myTeam || m.b === s.myTeam)).length;
  if (s.phase === "regular" && played >= 3) {
    for (const p of mine) {
      const share = (p.sApps ?? 0) / played;
      const exp = expectedShare(squadRank(s, p));
      let d = share >= exp ? 5 : share >= exp * 0.5 ? 0 : -6;
      // 출전 보장 조건을 못 지킬 것 같으면 더 떨어짐
      if (p.contract?.minApps && share * 11 < p.contract.minApps) d -= 5;
      p.morale = Math.max(0, Math.min(100, (p.morale ?? 70) + d));
      if (!p.wantsOut && p.morale < 35) {
        p.wantsOut = true;
        news(s, `😤 ${p.name} 선수가 출전 기회가 적다며 이적을 희망합니다`);
      } else if (p.wantsOut && p.morale >= 60) {
        p.wantsOut = false;
        news(s, `😊 ${p.name} 선수가 마음을 돌렸습니다 (이적 희망 철회)`);
      }
      if (p.wantsOut && rand() < 0.5) p.cond = clampCond(p.cond - 1);
    }
  }

  // 받은 제안 만료 (2주)
  s.offers = (s.offers ?? []).filter(o => o.season === s.season && s.week - o.week < 2 && s.players[o.player]?.team === s.myTeam);
  // 새 영입 제안 (다른 팀 → 우리 선수)
  if (s.phase !== "offseason" && mine.length > MIN_ROSTER + 1 && rand() < 0.35) {
    const pool = mine.filter(p => !s.offers!.some(o => o.player === p.id));
    const weights = pool.map(p => (p.wantsOut ? 4 : 1) * (totalOf(p.stats) / 5000));
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = rand() * sum, target: CPlayer | undefined;
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { target = pool[i]; break; } }
    const v = target ? askingPrice(target, s.season) : 0;
    const buyers = proTeams(s).filter(t => t.id !== s.myTeam && rosterOf(s, t.id).length < MAX_ROSTER && t.money > v * 0.8);
    if (target && buyers.length) {
      const team = buyers[randInt(0, buyers.length - 1)];
      const fee = round10(v * (0.7 + rand() * 0.3) * (target.wantsOut ? 0.9 : 1));
      const max = round10(Math.min(team.money, v * (1.1 + rand() * 0.25)));
      s.offers!.push({ id: (s.nextOfferId = (s.nextOfferId ?? 1) + 1), player: target.id, team: team.id, fee, max: Math.max(fee, max), season: s.season, week: s.week, tries: 0, status: "pending" });
      news(s, `📨 ${team.name}에서 ${target.name} 선수 영입을 제안했습니다 (${fee.toLocaleString()}만원)`);
    }
  }

  // 자금 확인: 3주 연속 적자면 구단 해체
  if (me.money < 0) {
    s.debtWeeks = (s.debtWeeks ?? 0) + 1;
    if (s.debtWeeks >= DEBT_LIMIT_WEEKS) {
      s.gameOver = { season: s.season, week: s.week, reason: "운영 자금이 바닥나 구단이 해체되었습니다" };
      news(s, `💀 ${s.gameOver.reason}`);
    } else {
      news(s, `⚠️ 운영 자금이 부족합니다! ${DEBT_LIMIT_WEEKS - s.debtWeeks}주 안에 흑자로 돌리지 못하면 구단이 해체됩니다`);
    }
  } else s.debtWeeks = 0;
}

// ── 시즌 끝 (finishSeason 에서) ────────────────────────────────────
export function seasonEndClub(s: CareerState, myResult: string, champion: number) {
  checkSponsor(s);
  const mine = rosterOf(s, s.myTeam);
  // 다승 랭킹 (이번 시즌 전체 선수)
  const ranking = activePlayers(s).filter(p => p.team !== FREE_AGENT_TEAM).sort((a, b) => b.sWins - a.sWins || a.sLosses - b.sLosses);
  const mostWins = ranking[0];
  const top10 = new Set(ranking.slice(0, 10).map(p => p.id));
  const msl = s.msl?.season === s.season ? s.msl : undefined;
  for (const p of mine) {
    const b = p.contract?.bonus ?? {};
    const earned: Array<[BonusKey, number]> = [];
    if (b.proTitle && champion === s.myTeam) earned.push(["proTitle", b.proTitle]);
    if (b.mslTitle && msl?.champion === p.id) earned.push(["mslTitle", b.mslTitle]);
    if (b.mostWins && mostWins?.id === p.id) earned.push(["mostWins", b.mostWins]);
    if (b.topRank && top10.has(p.id)) earned.push(["topRank", b.topRank]);
    for (const [k, v] of earned) {
      pay(s, "성과 보너스", -v);
      news(s, `💰 ${p.name} 선수 ${BONUS_NAMES[k]} 보너스 ${v.toLocaleString()}만원 지급`);
    }
    // 출전 보장 위반
    if (p.contract?.minApps && (p.sApps ?? 0) < p.contract.minApps) {
      p.morale = Math.max(0, (p.morale ?? 70) - 30);
      p.wantsOut = true;
      news(s, `😠 ${p.name} 선수: 출전 보장(${p.contract.minApps}경기) 조건이 지켜지지 않았다며 이적을 요구합니다`);
    }
  }
  if (mostWins) news(s, `🏅 ${s.season}시즌 다승왕: ${mostWins.name} (${mostWins.sWins}승)`);

  // 감독 평판
  const m = s.manager ?? (s.manager = { reputation: 50 });
  const delta = { 우승: 20, 준우승: 12, 플레이오프: 7, 준플레이오프: 4 }[myResult] ?? -6;
  const mslBonus = msl?.champion !== undefined && s.players[msl.champion]?.team === s.myTeam ? 5 : 0;
  m.reputation = Math.max(0, Math.min(100, m.reputation + delta + mslBonus));

  // 감독 제의: 평판이 높으면 더 강한 팀에서
  const ranked = proTeams(s).sort((a, b) => teamPower(s, b.id) - teamPower(s, a.id));
  const offers = ranked
    .map((t, i) => ({ t, need: jobThreshold(i) }))
    .filter(({ t, need }) => t.id !== s.myTeam && m.reputation >= need && rand() < 0.5)
    .slice(0, 2)
    .map(({ t }) => t.id);
  s.jobOffers = offers;
  for (const id of offers) news(s, `🤵 ${s.teams[id].name}에서 감독 제의가 왔습니다! (구단 운영 → 감독)`);
}

// ── 새 시즌 (startNextSeason 에서) ──────────────────────────────────
export function newSeasonClub(s: CareerState) {
  for (const p of activePlayers(s)) {
    p.sApps = 0;
    if (p.team === FREE_AGENT_TEAM) { delete p.contract; continue; }
    const c = p.contract ?? defaultContract(p, s.season);
    c.years--;
    if (c.years <= 0) {
      if (p.team === s.myTeam) {
        news(s, `📄 ${p.name} 선수 계약 만료 → 자유계약 선수가 되었습니다`);
        p.team = FREE_AGENT_TEAM;
        p.action = null;
        delete p.contract;
        continue;
      }
      // 다른 팀은 자동 재계약
      p.contract = defaultContract(p, s.season);
      continue;
    }
    p.contract = c;
  }
  // 다른 팀 선수 중 일부는 이적 희망 (싸게 데려올 기회)
  for (const p of activePlayers(s)) {
    if (p.team === s.myTeam || p.team === FREE_AGENT_TEAM) continue;
    p.wantsOut = rand() < 0.06;
  }
  s.offers = [];
  s.agreements = {};
  s.jobOffers = [];
  s.ledger = { season: s.season, items: {} };
}

// ── 받은 제안에 답하기 ───────────────────────────────────────────
export function respondOffer(s: CareerState, offerId: number, action: "accept" | "reject" | "counter", fee?: number) {
  const o = s.offers?.find(x => x.id === offerId);
  if (!o) throw new CareerError("이미 끝난 제안입니다");
  const p = s.players[o.player];
  const team = s.teams[o.team];
  const remove = () => { s.offers = s.offers!.filter(x => x.id !== o.id); };
  const sell = (price: number) => {
    if (s.live) throw new CareerError("경기 중에는 선수를 보낼 수 없습니다");
    if (rosterOf(s, s.myTeam).length <= MIN_ROSTER) throw new CareerError(`선수가 최소 ${MIN_ROSTER}명은 있어야 합니다`);
    if (rosterOf(s, o.team).length >= MAX_ROSTER) throw new CareerError(`${team.name} 선수단이 가득 찼습니다`);
    team.money -= price;
    pay(s, "이적료 수입", price);
    moveTo(s, p, o.team);
    remove();
    news(s, `🤝 ${p.name} 선수를 ${team.name}에 ${price.toLocaleString()}만원에 보냈습니다`);
    return { result: "sold" as const, fee: price, message: "합의" };
  };
  if (action === "accept") return sell(o.fee);
  if (action === "reject") {
    remove();
    if (p.wantsOut) p.morale = Math.max(0, (p.morale ?? 50) - 10);
    return { result: "rejected" as const, message: "거절했습니다" };
  }
  // 역제안
  if (!fee || fee <= 0) throw new CareerError("금액을 입력하세요");
  o.tries++;
  if (fee <= o.fee) return sell(o.fee);
  if (fee <= o.max) return sell(fee);
  if (o.tries >= 3 || fee > o.max * 1.35) {
    remove();
    news(s, `❌ ${team.name}, ${p.name} 선수 영입 협상 결렬`);
    return { result: "withdrawn" as const, message: `${team.name}: "그 금액은 곤란합니다. 협상을 끝내겠습니다" (협상 결렬)` };
  }
  o.fee = round10(Math.min(o.max, (o.fee + o.max) / 2 + (fee - o.max) * 0.1));
  o.status = "countered";
  return { result: "countered" as const, fee: o.fee, message: `${team.name}: "${o.fee.toLocaleString()}만원까지는 생각해 보겠습니다" (보류 · 역제안)` };
}

// ── 다른 팀 선수 영입 요청 (이적료 협상) ────────────────────────────────
export function bidPlayer(s: CareerState, pid: number, fee: number) {
  const p = s.players[pid];
  if (!p || p.team === s.myTeam || p.team === FREE_AGENT_TEAM) throw new CareerError("다른 팀 선수만 영입 요청할 수 있습니다");
  if (fee < 0) throw new CareerError("금액을 확인하세요");
  const team = s.teams[p.team];
  if (rosterOf(s, p.team).length <= AI_MIN_ROSTER) throw new CareerError(`${team.name}: "선수가 부족해서 보낼 수 없습니다"`);
  if (rosterOf(s, s.myTeam).length >= MAX_ROSTER) throw new CareerError(`선수단은 최대 ${MAX_ROSTER}명입니다`);
  if (s.teams[s.myTeam].money < fee) throw new CareerError("소지금이 부족합니다");
  const n = useTry(s, `bid-${pid}`);
  const min = sellMinimum(s, p);
  if (fee >= min) {
    s.agreements = { ...s.agreements, [pid]: { team: p.team, fee, season: s.season, week: s.week } };
    return { result: "agreed" as const, message: `${team.name}: "좋습니다. 이제 선수와 계약 조건을 협의하세요" (합의)`, demand: playerDemand(s, p, s.myTeam) };
  }
  if (fee >= min * 0.75 && n < 3) {
    const counter = round10(min * (1 + seeded2(pid, n) * 0.06));
    return { result: "countered" as const, fee: counter, message: `${team.name}: "${counter.toLocaleString()}만원이면 고려해 보겠습니다" (보류 · 역제안)` };
  }
  return { result: "rejected" as const, message: `${team.name}: "그 금액으로는 보낼 수 없습니다" (거절)` };
}
const seeded2 = (a: number, b: number) => ((a * 9301 + b * 49297) % 233280) / 233280;

// ── 계약 협상 (영입 합의 후, 또는 우리 선수 재계약) ─────────────────────
export function negotiateContract(s: CareerState, pid: number, offer: Contract) {
  const p = s.players[pid];
  if (!p) throw new CareerError("선수를 찾을 수 없습니다");
  const incoming = p.team !== s.myTeam;
  const deal = s.agreements?.[pid];
  if (incoming && (!deal || deal.season !== s.season || deal.week !== s.week || deal.team !== p.team)) {
    throw new CareerError("먼저 구단과 이적료를 합의해야 합니다");
  }
  if (!(offer.salary > 0) || !(offer.years >= 1 && offer.years <= 20)) throw new CareerError("연봉과 계약 기간을 확인하세요");
  useTry(s, `contract-${pid}`);
  const demand = playerDemand(s, p, s.myTeam);
  const { score, need } = contractScore(offer, demand);
  if (score >= need * 0.97) {
    // 계약 성사
    const c: Contract = { ...offer, years: offer.years + (s.phase === "offseason" ? 1 : 0) };
    if (incoming) {
      if (s.live) throw new CareerError("경기 중에는 영입할 수 없습니다");
      if (rosterOf(s, s.myTeam).length >= MAX_ROSTER) throw new CareerError(`선수단은 최대 ${MAX_ROSTER}명입니다`);
      if (s.teams[s.myTeam].money < deal!.fee) throw new CareerError("소지금이 부족합니다");
      const from = s.teams[p.team];
      pay(s, "이적료 지출", -deal!.fee);
      from.money += deal!.fee;
      moveTo(s, p, s.myTeam, c);
      delete s.agreements![pid];
      news(s, `✍️ ${p.name} 선수 영입! (이적료 ${deal!.fee.toLocaleString()}만원, 연봉 ${c.salary.toLocaleString()}만원)`);
      return { result: "signed" as const, message: `${p.name}: "잘 부탁드립니다!" (계약 성사)` };
    }
    p.contract = c;
    p.wantsOut = false;
    p.morale = Math.min(100, (p.morale ?? 60) + 15);
    news(s, `✍️ ${p.name} 선수 재계약 (연봉 ${c.salary.toLocaleString()}만원, ${offer.years}년)`);
    return { result: "signed" as const, message: `${p.name}: "앞으로도 열심히 하겠습니다!" (재계약 성사)` };
  }
  if (score >= need * 0.8) return { result: "countered" as const, message: `${p.name}: "조금만 더 신경 써 주시면 좋겠습니다" (보류)`, demand };
  return { result: "rejected" as const, message: `${p.name}: "그 조건으로는 어렵습니다" (거절)`, demand };
}

// ── 감독 이동 ───────────────────────────────────────────────────
export function acceptJob(s: CareerState, teamId: number) {
  if (!s.jobOffers?.includes(teamId)) throw new CareerError("받은 제의가 아닙니다");
  if (s.live) throw new CareerError("경기 중에는 옮길 수 없습니다");
  const old = s.teams[s.myTeam], next = s.teams[teamId];
  // 감독이 모은 자금은 새 구단으로 함께 이동
  const money = old.money;
  old.money = START_MONEY;
  next.money = money;
  for (const p of rosterOf(s, s.myTeam)) p.action = null;
  s.myTeam = teamId;
  s.jobOffers = [];
  s.offers = [];
  s.agreements = {};
  s.debtWeeks = 0;
  s.manager = { reputation: s.manager?.reputation ?? 50, moves: (s.manager?.moves ?? 0) + 1 };
  news(s, `🤵 ${next.name} 감독으로 부임했습니다! (운영 자금 ${money.toLocaleString()}만원과 함께)`);
  return { team: teamId };
}

