/**
 * 동적 게임 엔진 v17.0
 * 
 * 핵심:
 * 1. 교전 빈번, 자원 빠르게 증가
 * 2. 멀티/앞마당 파괴 → 자원 수급률 감소
 * 3. 결정적 한방 → 게임 빨리 종료
 * 4. 능력치 높으면 불리한 전투도 승리 가능
 * 5. 80% 이상 유리 → 게임 종료
 */

import { generateTurnCommentary, generateGameEndCommentary } from "./conciseCommentary";
import {
  initializeBuildOrder,
  type BuildOrderState,
} from "@shared/buildOrder";
import {
  GAME_MAX_TROOPS,
  GAME_MAX_RESOURCES,
  GAME_INITIAL_TROOPS,
  GAME_INITIAL_RESOURCES,
  BUILD_RESOURCE_RATES,
  BUILD_TROOP_RATES,
} from "@shared/gameConstants";
import {
  generateGameEvent,
  generateSituationCommentary,
  type GameEvent,
} from "./gameEventGenerator";

export interface PlayerAction {
  type: "barracks_first" | "cc_first" | "gateway_first" | "hatch_first" | "unit_produced" | "building_built" | "tech_upgraded" | "multi_taken" | "attack" | "scout" | "counter_tech";
  data: string;
}

export interface PlayerState {
  id: number;
  name: string;
  race: "terran" | "zerg" | "protoss";
  supply: number;
  resources: number;
  health: number;
  stats?: {
    attack: number; defense: number; speed: number; economy: number;
    sense: number; control: number; harassment: number; strategy: number;
    scouting: number; massProduction: number;
  };
  multiCount: number;
  productionFacilities: number;
  /** 앞마당 파괴 여부 - 파괴되면 자원 수급 대폭 감소 */
  frontBaseDestroyed: boolean;
  hasObserver: boolean; hasVessel: boolean; hasArbiter: boolean;
  hasRecall: boolean; hasEMP: boolean; hasStasisField: boolean;
  buildStrategy?: "barracks_first" | "cc_first" | "gateway_first" | "hatch_first";
  buildOrder: BuildOrderState;
  producedUnitsFirstTime: Set<string>;
  unitsProduced: string[];
  lastAction?: PlayerAction;
}

export interface GameState {
  turn: number;
  gameEnded: boolean;
  winner?: number;
  player1: PlayerState;
  player2: PlayerState;
  player1Advantage: number;
  player1Events: string[];
  player2Events: string[];
  turnCommentaries: string[];
}

function makePlayer(
  id: number, name: string, race: "terran" | "zerg" | "protoss",
  stats?: Record<string, number>
): PlayerState {
  return {
    id, name, race,
    supply: GAME_INITIAL_TROOPS,
    resources: GAME_INITIAL_RESOURCES,
    health: 100,
    stats: stats ? {
      attack: stats.attack || 50, defense: stats.defense || 50,
      speed: stats.speed || 50, economy: stats.economy || 50,
      sense: stats.sense || 50, control: stats.control || 50,
      harassment: stats.harassment || 50, strategy: stats.strategy || 50,
      scouting: stats.scouting || 50, massProduction: stats.massProduction || 50,
    } : undefined,
    multiCount: 1,
    productionFacilities: 1,
    frontBaseDestroyed: false,
    hasObserver: false, hasVessel: false, hasArbiter: false,
    hasRecall: false, hasEMP: false, hasStasisField: false,
    buildOrder: initializeBuildOrder(race),
    producedUnitsFirstTime: new Set(),
    unitsProduced: [],
  };
}

export function initializeGameState(
  p1Id: number, p1Name: string, p1Race: "terran" | "zerg" | "protoss",
  p2Id: number, p2Name: string, p2Race: "terran" | "zerg" | "protoss",
  p1Stats?: Record<string, number>, p2Stats?: Record<string, number>
): GameState {
  return {
    turn: 0, gameEnded: false,
    player1: makePlayer(p1Id, p1Name, p1Race, p1Stats),
    player2: makePlayer(p2Id, p2Name, p2Race, p2Stats),
    player1Advantage: 50,
    player1Events: [], player2Events: [],
    turnCommentaries: [],
  };
}

// ── 빌드 전략 ──────────────────────────────────────────────────

function getRaceBuildStrategies(race: "terran" | "zerg" | "protoss") {
  switch (race) {
    case "terran": return ["barracks_first", "cc_first"] as const;
    case "protoss": return ["gateway_first"] as const;
    case "zerg": return ["hatch_first"] as const;
  }
}

function generatePlayerAction(gs: GameState, p: PlayerState): PlayerAction | null {
  if (gs.turn === 1 && !p.buildStrategy) {
    const strats = getRaceBuildStrategies(p.race);
    const s = strats[Math.floor(Math.random() * strats.length)];
    p.buildStrategy = s;
    return { type: s, data: s };
  }
  const t = gs.turn;
  if (t >= 5 && t <= 15 && p.resources > 400 && Math.random() < 0.25) {
    const bldgs: Record<string, string[]> = {
      terran: ["배럭", "팩토리", "스타포트"],
      protoss: ["게이트웨이", "사이버네틱스 코어", "로보틱스 팩토리"],
      zerg: ["스포닝풀", "레어", "하이브"],
    };
    const list = bldgs[p.race] || [];
    if (list.length) return { type: "building_built", data: list[Math.floor(Math.random() * list.length)] };
  }
  if (t >= 6 && p.resources > 200 && Math.random() < 0.35) {
    const units: Record<string, string[]> = {
      terran: ["마린", "메딕", "파이어뱃", "벌쳐", "탱크"],
      protoss: ["질럿", "드래군", "옵저버", "리버"],
      zerg: ["저글링", "히드라", "뮤탈리스크", "럴커"],
    };
    const list = units[p.race] || [];
    if (list.length) return { type: "unit_produced", data: list[Math.floor(Math.random() * list.length)] };
  }
  return null;
}

// ── 자원/병력 증가 ──────────────────────────────────────────────

function updateResourcesAndTroops(gs: GameState, p: PlayerState): void {
  if (gs.gameEnded) return;
  const strat = p.buildStrategy || "barracks_first";
  const rRate = BUILD_RESOURCE_RATES[strat] || 100;
  const tRate = BUILD_TROOP_RATES[strat] || 1.0;

  let ecoMul = 1.0;
  if (p.stats) ecoMul = 1.0 + (p.stats.economy - 50) / 400;
  let troopMul = 1.0;
  if (p.stats) troopMul = 1.0 + (p.stats.massProduction - 50) / 400;

  // 앞마당 파괴 시 자원 수급 50% 감소
  const frontPenalty = p.frontBaseDestroyed ? 0.5 : 1.0;

  // 종족별 유불리: 테란은 자원 1.5배 빠름
  const raceResourceBonus = p.race === 'terran' ? 1.5 : 1.0;
  // 종족별 유불리: 저그는 병력 1.5배 빠름
  const raceTroopBonus = p.race === 'zerg' ? 1.5 : 1.0;

  // 자원 증가: 기본 100~150/턴 * 멀티 수 (대폭 증가)
  const resInc = rRate * p.multiCount * ecoMul * frontPenalty * raceResourceBonus;
  const resVar = 1.0 + (Math.random() - 0.5) * 0.3;
  p.resources = Math.min(GAME_MAX_RESOURCES, p.resources + resInc * resVar);

  // 병력 증가: 생산기지당 3~4 (자원이 충분할 때만)
  if (p.resources > 100) {
    const troopInc = 3.5 * p.productionFacilities * tRate * troopMul * frontPenalty * raceTroopBonus;
    const troopVar = 1.0 + (Math.random() - 0.5) * 0.3;
    p.supply = Math.min(GAME_MAX_TROOPS, p.supply + troopInc * troopVar);
    // 병력 생산에 자원 소모
    p.resources = Math.max(0, p.resources - troopInc * 2);
  }
}

// ── 전투 시스템 ──────────────────────────────────────────────────

function resolveEngagement(gs: GameState): { winnerIsP1: boolean; decisive: boolean } {
  const p1 = gs.player1, p2 = gs.player2;
  let p1Pow = p1.supply, p2Pow = p2.supply;

  // 능력치 보정 (최대 ±40%)
  if (p1.stats) {
    const bonus = (p1.stats.attack + p1.stats.control + p1.stats.strategy) / 150;
    p1Pow *= (1 + (bonus - 1) * 0.4);
  }
  if (p2.stats) {
    const bonus = (p2.stats.attack + p2.stats.control + p2.stats.strategy) / 150;
    p2Pow *= (1 + (bonus - 1) * 0.4);
  }
  // 랜덤 ±15%
  p1Pow *= 1 + (Math.random() - 0.5) * 0.3;
  p2Pow *= 1 + (Math.random() - 0.5) * 0.3;

  // 종족별 유불리: 프로토스는 전투 승률 1.5배 높음
  if (p1.race === 'protoss') p1Pow *= 1.5;
  if (p2.race === 'protoss') p2Pow *= 1.5;

  const winP1 = p1Pow >= p2Pow;

  // 피해 계산
  const winLoss = 0.12 + Math.random() * 0.13;  // 승자 12~25% 손실
  const loseLoss = 0.30 + Math.random() * 0.25;  // 패자 30~55% 손실
  const winResLoss = 50 + Math.random() * 150;
  const loseResLoss = 200 + Math.random() * 400;

  if (winP1) {
    p1.supply = Math.max(3, p1.supply - Math.round(p1.supply * winLoss));
    p2.supply = Math.max(3, p2.supply - Math.round(p2.supply * loseLoss));
    p1.resources = Math.max(0, p1.resources - winResLoss);
    p2.resources = Math.max(0, p2.resources - loseResLoss);
  } else {
    p2.supply = Math.max(3, p2.supply - Math.round(p2.supply * winLoss));
    p1.supply = Math.max(3, p1.supply - Math.round(p1.supply * loseLoss));
    p2.resources = Math.max(0, p2.resources - winResLoss);
    p1.resources = Math.max(0, p1.resources - loseResLoss);
  }

  // 결정적 한방 판정: 패자 병력이 15 이하로 떨어지면 decisive
  const loserSupply = winP1 ? p2.supply : p1.supply;
  const decisive = loserSupply <= 15;

  return { winnerIsP1: winP1, decisive };
}

// ── 메인 게임 루프 ──────────────────────────────────────────────

export function progressGame(gs: GameState): void {
  if (gs.gameEnded) return;
  gs.turn++;
  gs.turnCommentaries = [];

  // 액션
  const a1 = generatePlayerAction(gs, gs.player1);
  const a2 = generatePlayerAction(gs, gs.player2);
  if (a1) gs.player1.lastAction = a1;
  if (a2) gs.player2.lastAction = a2;

  // 자원/병력 증가
  updateResourcesAndTroops(gs, gs.player1);
  updateResourcesAndTroops(gs, gs.player2);

  // 멀티 확장 (자원 충분 + 확률)
  if (gs.player1.resources > 2000 && gs.player1.multiCount < 4 && Math.random() < 0.12) {
    gs.player1.multiCount++;
    gs.player1.resources -= 600;
  }
  if (gs.player2.resources > 2000 && gs.player2.multiCount < 4 && Math.random() < 0.12) {
    gs.player2.multiCount++;
    gs.player2.resources -= 600;
  }

  // 생산기지 추가
  if (gs.player1.resources > 1500 && gs.player1.productionFacilities < 5 && Math.random() < 0.1) {
    gs.player1.productionFacilities++;
    gs.player1.resources -= 300;
  }
  if (gs.player2.resources > 1500 && gs.player2.productionFacilities < 5 && Math.random() < 0.1) {
    gs.player2.productionFacilities++;
    gs.player2.resources -= 300;
  }

  // 앞마당 복구 (10% 확률)
  if (gs.player1.frontBaseDestroyed && Math.random() < 0.10) {
    gs.player1.frontBaseDestroyed = false;
  }
  if (gs.player2.frontBaseDestroyed && Math.random() < 0.10) {
    gs.player2.frontBaseDestroyed = false;
  }

  // 이벤트 생성
  const ctx = {
    turn: gs.turn,
    player1: { id: gs.player1.id, name: gs.player1.name, race: gs.player1.race, supply: gs.player1.supply, resources: gs.player1.resources, multiCount: gs.player1.multiCount },
    player2: { id: gs.player2.id, name: gs.player2.name, race: gs.player2.race, supply: gs.player2.supply, resources: gs.player2.resources, multiCount: gs.player2.multiCount },
    player1Advantage: gs.player1Advantage,
  };

  const evt = generateGameEvent(ctx);
  let decisive = false;

  if (evt) {
    if (evt.type === "engagement") {
      const result = resolveEngagement(gs);
      decisive = result.decisive;
      gs.turnCommentaries.push(evt.commentary);
      if (decisive) {
        const winner = result.winnerIsP1 ? gs.player1.name : gs.player2.name;
        gs.turnCommentaries.push(`[중립] ${winner} 선수의 대승! 결정적인 전투였습니다!`);
      }
    } else if (evt.type === "harass") {
      // 견제: 자원 피해 + 결정적 견제 가능
      const dmg = 300 + Math.random() * 500;
      if (evt.playerId === 1) {
        gs.player2.resources = Math.max(0, gs.player2.resources - dmg);
      } else {
        gs.player1.resources = Math.max(0, gs.player1.resources - dmg);
      }
      // 결정적 견제: 상대 자원이 100 이하로 떨어지면
      const targetRes = evt.playerId === 1 ? gs.player2.resources : gs.player1.resources;
      if (targetRes <= 100) decisive = true;
      gs.turnCommentaries.push(evt.commentary);
      if (decisive) {
        const attacker = evt.playerId === 1 ? gs.player1.name : gs.player2.name;
        gs.turnCommentaries.push(`[중립] ${attacker} 선수의 견제가 치명적이었습니다! 상대 경제가 붕괴되었습니다!`);
      }
    } else if (evt.type === "resource_drain") {
      const drain = 200 + Math.random() * 400;
      if (evt.playerId === 1) {
        gs.player2.resources = Math.max(0, gs.player2.resources - drain);
      } else {
        gs.player1.resources = Math.max(0, gs.player1.resources - drain);
      }
      gs.turnCommentaries.push(evt.commentary);
    } else if (evt.type === "multi_destroy") {
      // 멀티 또는 앞마당 파괴
      const destroyFront = Math.random() < 0.4; // 40% 확률로 앞마당 파괴
      if (evt.playerId === 1) {
        if (destroyFront && !gs.player2.frontBaseDestroyed) {
          gs.player2.frontBaseDestroyed = true;
          gs.player2.resources = Math.max(0, gs.player2.resources - 300);
          gs.turnCommentaries.push(`${gs.player1.name} 선수가 상대방의 앞마당을 파괴했습니다! 자원 수급에 큰 타격!`);
        } else if (gs.player2.multiCount > 1) {
          gs.player2.multiCount--;
          gs.player2.resources = Math.max(0, gs.player2.resources - 400);
          gs.turnCommentaries.push(`${gs.player1.name} 선수가 상대방의 멀티를 파괴했습니다! 경제력이 크게 줄었습니다!`);
        } else {
          gs.turnCommentaries.push(evt.commentary);
        }
      } else {
        if (destroyFront && !gs.player1.frontBaseDestroyed) {
          gs.player1.frontBaseDestroyed = true;
          gs.player1.resources = Math.max(0, gs.player1.resources - 300);
          gs.turnCommentaries.push(`${gs.player2.name} 선수가 상대방의 앞마당을 파괴했습니다! 자원 수급에 큰 타격!`);
        } else if (gs.player1.multiCount > 1) {
          gs.player1.multiCount--;
          gs.player1.resources = Math.max(0, gs.player1.resources - 400);
          gs.turnCommentaries.push(`${gs.player2.name} 선수가 상대방의 멀티를 파괴했습니다! 경제력이 크게 줄었습니다!`);
        } else {
          gs.turnCommentaries.push(evt.commentary);
        }
      }
    } else if (evt.type === "tech_upgrade") {
      gs.turnCommentaries.push(evt.commentary);
    }
  } else if (gs.turn % 5 === 0) {
    gs.turnCommentaries.push(generateSituationCommentary());
  }

  // 유불리 계산
  const s1 = gs.player1.supply * 2.5 + gs.player1.resources / 150;
  const s2 = gs.player2.supply * 2.5 + gs.player2.resources / 150;
  const total = s1 + s2;
  gs.player1Advantage = total > 0 ? (s1 / total) * 100 : 50;

  // 게임 종료: 80% 이상 유리 or 결정적 한방 후 75% 이상 or 최대 턴
  const endByAdvantage = gs.player1Advantage > 80 || gs.player1Advantage < 20;
  const endByDecisive = decisive && (gs.player1Advantage > 75 || gs.player1Advantage < 25);
  if (gs.turn >= 120 || endByAdvantage || endByDecisive) {
    gs.gameEnded = true;
    gs.winner = gs.player1Advantage > 50 ? gs.player1.id : gs.player2.id;
  }

  // 턴별 해설
  const comms = generateTurnCommentary(gs, gs.player1.name, gs.player2.name);
  if (comms?.length) gs.turnCommentaries.push(...comms);

  // 종료 해설
  if (gs.gameEnded) {
    const isP1Win = gs.winner === gs.player1.id;
    const end = generateGameEndCommentary(gs.player1.name, gs.player2.name, isP1Win);
    if (end) gs.turnCommentaries.push(end);
  }
}

export function progressTurn(gs: GameState): void { progressGame(gs); }

export function gameStateToTurnData(gs: GameState) {
  return {
    turn: gs.turn,
    player1Commentary: [], player2Commentary: [],
    player1Supply: Math.round(gs.player1.supply),
    player1Resources: Math.round(gs.player1.resources),
    player2Supply: Math.round(gs.player2.supply),
    player2Resources: Math.round(gs.player2.resources),
    player1Health: gs.player1.health,
    player2Health: gs.player2.health,
    commentaries: [...gs.turnCommentaries],
  };
}
