/**
 * 브루드 워 엔진(bw/bwEngine)으로 한 세트를 진행하는 래퍼.
 * 커리어 모드의 프로리그·스타리그 세트가 모두 이 함수를 쓴다.
 */
import { StatKey, calcEffectiveStatsWithFatigue } from "@shared/gameConstants";
import { initializeGameState, progressTurn, gameStateToTurnData, type FeedEvent } from "./bw/bwEngine";
import { LegacyCaster } from "./bw/legacyCommentary";

type Race = "terran" | "zerg" | "protoss";
type MapTraits = { rushDistance: number; resources: number; complexity: number };

/** 한 세트 최대 턴 수 (한 턴 = 게임 시간 20초, 최대 약 40분) */
const MAX_TURNS = 125;

/** 리그 세트 결과 */
export interface SetResult {
  winnerId: number;
  /** 게임 시간(초) */
  duration: number;
  endReason?: string;
  /** 문자중계 하이라이트 ([mm:ss] 포함) */
  highlights: string[];
  /** 전체 중계 (원작식 중계 화면용) */
  timeline?: SetTimeline;
  /** 선수별 경기 내용 집계 [p1, p2] (경기 뒤 능력치 변동에 씀) */
  content: [SetContent, SetContent];
}

/** 한 선수의 경기 내용 (엔진 이벤트 집계) */
export interface SetContent {
  /** 공격을 나감 / 공격해서 교전 승리 */
  attacks: number; attackWins: number;
  /** 상대 공격을 막아냄 / 막지 못함 */
  holds: number; holdFails: number;
  /** 상대 기지를 파괴 / 내 기지를 잃음 */
  basesKilled: number; basesLost: number;
  /** 견제·급습으로 잡은 수 / 당한 수 */
  harassKills: number; harassLost: number;
  /** 접전 승리 / 불리한 교전 뒤집기 / 압승 / 완패 */
  closeWins: number; upsets: number; crushes: number; crushed: number;
  /** 초반 공격을 막음 / 초반 공격에 당함 */
  earlyHolds: number; earlyLost: number;
  expands: number; techs: number; counters: number; pushes: number;
}

const emptyContent = (): SetContent => ({
  attacks: 0, attackWins: 0, holds: 0, holdFails: 0, basesKilled: 0, basesLost: 0, harassKills: 0, harassLost: 0,
  closeWins: 0, upsets: 0, crushes: 0, crushed: 0, earlyHolds: 0, earlyLost: 0, expands: 0, techs: 0, counters: 0, pushes: 0,
});

/** 엔진 이벤트 → 선수별 경기 내용 */
function tally(events: FeedEvent[], c: [SetContent, SetContent]) {
  const me = (side: number) => c[side === 1 ? 0 : 1], other = (side: number) => c[side === 1 ? 1 : 0];
  let lastEarlyAttack: number | undefined;
  for (const e of events) {
    switch (e.k) {
      case "attack": me(e.side).attacks++; lastEarlyAttack = e.early ? e.side : undefined; break;
      case "fight": {
        const w = me(e.winner), l = other(e.winner);
        if (e.attacker === e.winner) w.attackWins++; else { w.holds++; l.holdFails++; }
        if (e.attacker !== e.winner && lastEarlyAttack === e.attacker) { w.earlyHolds++; }
        if (e.attacker === e.winner && lastEarlyAttack === e.winner) { l.earlyLost++; }
        if (e.close) w.closeWins++;
        if (e.upset) w.upsets++;
        if (e.crush) { w.crushes++; l.crushed++; }
        lastEarlyAttack = undefined;
        break;
      }
      case "base": me(e.victim).basesLost++; other(e.victim).basesKilled++; break;
      case "raid": case "harass": if (e.killed > 0) { me(e.side).harassKills += e.killed; other(e.side).harassLost += e.killed; } break;
      case "expand": me(e.side).expands++; break;
      case "tech": me(e.side).techs++; break;
      case "counter": me(e.side).counters++; break;
      case "push": me(e.side).pushes++; break;
    }
  }
}

/** 원작식 중계 화면 데이터: 해설 한 줄씩(시간·말한 선수) + 턴별 병력/자원 */
export interface SetTimeline {
  lines: Array<{ t: number; side: 0 | 1 | 2; text: string }>;
  frames: Array<{ t: number; army: [number, number]; res: [number, number] }>;
}

const HIGHLIGHT_RE = /빌드는|공격!|교전 승리|뒤집|역습!|수비 성공|무너|지켜냅|GG|판정|드랍|난입|급습|견제!/;

/**
 * 리그 한 세트 진행
 * - withHighlights: 하이라이트 문자중계 수집
 * - withTimeline: 원작 해설 문장으로 된 전체 중계 + 턴별 병력/자원 (중계 화면용)
 */
export function simulateSet(
  p1: { id: number; name: string; race: Race; stats: Record<StatKey, number>; fatigue: number },
  p2: { id: number; name: string; race: Race; stats: Record<StatKey, number>; fatigue: number },
  mapRaceAdvantage: Record<string, number>,
  mapTraits: MapTraits,
  withHighlights = true,
  withTimeline = false
): SetResult {
  const gs = initializeGameState(
    p1.id, p1.name, p1.race, p2.id, p2.name, p2.race,
    calcEffectiveStatsWithFatigue(p1.stats, p1.fatigue),
    calcEffectiveStatsWithFatigue(p2.stats, p2.fatigue),
    mapTraits, mapRaceAdvantage
  );
  const highlights: string[] = [];
  // 중계 화면용: 원작 해설 문장으로 중계 (엔진 이벤트 → 원작 문장)
  const timeline: SetTimeline | undefined = withTimeline ? { lines: [], frames: [{ t: 0, army: [0, 0], res: [0, 0] }] } : undefined;
  const caster = withTimeline ? new LegacyCaster({ side: 1, name: p1.name, race: p1.race }, { side: 2, name: p2.name, race: p2.race }) : undefined;
  // 경기 내용 집계를 위해 엔진 이벤트는 항상 받음
  gs.feed = [];
  const content: [SetContent, SetContent] = [emptyContent(), emptyContent()];
  let turns = 0;
  while (!gs.gameEnded && turns < MAX_TURNS) {
    progressTurn(gs);
    turns++;
    const events = gs.feed.splice(0);
    tally(events, content);
    if (timeline && caster) {
      caster.feed(events);
      caster.quiet(gs.time);
      const d = gameStateToTurnData(gs);
      timeline.frames.push({ t: gs.time, army: [d.p1.armySupply, d.p2.armySupply], res: [d.p1.incomePerMin, d.p2.incomePerMin] });
    }
    if (withHighlights) {
      // 해설에는 이미 [mm:ss] 시간이 붙어 있음
      for (const c of gs.turnCommentaries) if (HIGHLIGHT_RE.test(c)) highlights.push(c);
    }
  }
  if (!gs.gameEnded) {
    gs.gameEnded = true;
    gs.winner = gs.player1Advantage >= 50 ? gs.player1.id : gs.player2.id;
    caster?.feed([{ t: gs.time, k: "judge", winner: gs.winner === gs.player1.id ? 1 : 2 }]);
  }
  if (timeline && caster) timeline.lines = caster.lines();
  // 너무 길면 앞부분(빌드)과 뒷부분(결정적 장면) 위주로 줄임
  const trimmed = highlights.length > 18 ? [...highlights.slice(0, 4), ...highlights.slice(-14)] : highlights;
  return { winnerId: gs.winner ?? p1.id, duration: gs.time, endReason: gs.endReason, highlights: trimmed, timeline, content };
}
