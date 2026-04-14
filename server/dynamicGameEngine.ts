/**
 * 동적 게임 엔진 - 스타크래프트 실제 메커니즘 반영
 * 
 * 핵심 메커니즘:
 * 1. 배럭/게이트 우선순위 (배럭 먼저 = 안전, 커맨드센터 먼저 = 경제)
 * 2. 멀티 확장 경제 (멀티 확장 시 자원 증가량 크게 증가)
 * 3. 종족전 상성 (테란 메카닉, 프로토스 고급 유닛, 저그 물량)
 * 4. 기술 카운터 (EMP, 스테이시스필드, 리콜)
 * 5. 생산기지 확장 (배럭/게이트 추가 시 병력 생산 속도 증가)
 * 6. 정찰 유닛 (옵저버/배슬로 상대 유닛 정보 수집)
 */

import { generateTurnCommentary, generateGameEndCommentary } from "./conciseCommentary";

export interface PlayerAction {
  type: "barracks_first" | "cc_first" | "unit_produced" | "building_built" | "tech_upgraded" | "multi_taken" | "attack" | "scout" | "counter_tech";
  data: string;
}

export interface PlayerState {
  id: number;
  name: string;
  race: "terran" | "zerg" | "protoss";
  supply: number;
  resources: number;
  health: number;
  
  // 경제 시스템
  multiCount: number;
  productionFacilities: number; // 배럭/게이트 개수
  
  // 기술 시스템
  hasObserver: boolean; // 옵저버 (프로토스 정찰)
  hasVessel: boolean; // 배슬 (테란 정찰)
  hasArbiter: boolean; // 아비터 (프로토스 기술)
  hasRecall: boolean; // 리콜 기술 여부
  hasEMP: boolean; // EMP 기술 여부
  hasStasisField: boolean; // 스테이시스필드 여부
  
  // 빌드 선택
  buildStrategy?: "barracks_first" | "cc_first" | "gateway_first" | "hatch_first";
  
  // 게임 진행 기록
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
  allCommentaries: string[];
}

/**
 * 게임 상태 초기화
 */
export function initializeGameState(
  player1Id: number,
  player1Name: string,
  player1Race: "terran" | "zerg" | "protoss",
  player2Id: number,
  player2Name: string,
  player2Race: "terran" | "zerg" | "protoss"
): GameState {
  return {
    turn: 0,
    gameEnded: false,
    player1: {
      id: player1Id,
      name: player1Name,
      race: player1Race,
      supply: 50,
      resources: 200,
      health: 100,
      multiCount: 1,
      productionFacilities: 0,
      hasObserver: false,
      hasVessel: false,
      hasArbiter: false,
      hasRecall: false,
      hasEMP: false,
      hasStasisField: false,
      unitsProduced: [],
    },
    player2: {
      id: player2Id,
      name: player2Name,
      race: player2Race,
      supply: 50,
      resources: 200,
      health: 100,
      multiCount: 1,
      productionFacilities: 0,
      hasObserver: false,
      hasVessel: false,
      hasArbiter: false,
      hasRecall: false,
      hasEMP: false,
      hasStasisField: false,
      unitsProduced: [],
    },
    player1Advantage: 50,
    allCommentaries: [],
  };
}

/**
 * 턴 진행
 */
export function progressTurn(gameState: GameState): void {
  gameState.turn++;

  // 초반 빌드 선택 (1턴)
  if (gameState.turn === 1) {
    selectInitialBuild(gameState.player1);
    selectInitialBuild(gameState.player2);
  }

  // 플레이어 1 액션
  const player1Action = generatePlayerAction(gameState.player1, gameState.player2, gameState.turn);
  if (player1Action) {
    gameState.player1.lastAction = player1Action;
    applyAction(gameState.player1, player1Action, gameState.turn);
  }

  // 플레이어 2 액션
  const player2Action = generatePlayerAction(gameState.player2, gameState.player1, gameState.turn);
  if (player2Action) {
    gameState.player2.lastAction = player2Action;
    applyAction(gameState.player2, player2Action, gameState.turn);
  }

  // 자원 생성 (멀티 확장 시 크게 증가)
  gameState.player1.resources += 10 * gameState.player1.multiCount + 5 * gameState.player1.productionFacilities;
  gameState.player2.resources += 10 * gameState.player2.multiCount + 5 * gameState.player2.productionFacilities;

  // 병력 자동 증가 (생산기지가 많을수록 빠르게 증가)
  const player1ProductionBonus = 1 + gameState.player1.productionFacilities * 0.3;
  const player2ProductionBonus = 1 + gameState.player2.productionFacilities * 0.3;
  
  gameState.player1.supply += Math.floor(gameState.player1.resources / 100) * player1ProductionBonus;
  gameState.player2.supply += Math.floor(gameState.player2.resources / 100) * player2ProductionBonus;

  // 유불리 계산
  calculateAdvantage(gameState);

  // 해설 생성
  const commentaries = generateTurnCommentary(gameState, gameState.player1.name, gameState.player2.name);
  gameState.allCommentaries.push(...commentaries);

  // 게임 종료 판정
  checkGameEnd(gameState);
}

/**
 * 초반 빌드 선택 - 배럭/게이트 우선순위 반영
 * 
 * 배럭 먼저 = 안전한 초반 (병력 우선)
 * 커맨드센터 먼저 = 경제 중실 (자원 우선)
 */
function selectInitialBuild(player: PlayerState): void {
  const strategies: Array<"barracks_first" | "cc_first" | "gateway_first" | "hatch_first"> = [];
  
  if (player.race === "terran") {
    // 테란: 배럭 먼저 (60%) vs 커맨드센터 먼저 (40%)
    strategies.push("barracks_first", "barracks_first", "barracks_first", "cc_first", "cc_first");
  } else if (player.race === "protoss") {
    // 프로토스: 게이트웨이 먼저 (60%) vs 커맨드센터 먼저 (40%)
    strategies.push("gateway_first", "gateway_first", "gateway_first", "cc_first", "cc_first");
  } else {
    // 저그: 해처리 먼저 (60%) vs 커맨드센터 먼저 (40%)
    strategies.push("hatch_first", "hatch_first", "hatch_first", "cc_first", "cc_first");
  }
  
  player.buildStrategy = strategies[Math.floor(Math.random() * strategies.length)];
}

/**
 * 플레이어 액션 생성
 */
function generatePlayerAction(
  player: PlayerState,
  opponent: PlayerState,
  turn: number
): PlayerAction | null {
  const actions: PlayerAction[] = [];

  // 초반 빌드 선택 액션 (1-3턴)
  if (turn <= 3 && player.buildStrategy) {
    if (turn === 1 && player.buildStrategy === "barracks_first") {
      actions.push({ type: "barracks_first", data: "배럭" });
    } else if (turn === 1 && player.buildStrategy === "cc_first") {
      actions.push({ type: "cc_first", data: "커맨드센터" });
    } else if (turn === 1 && player.buildStrategy === "gateway_first") {
      actions.push({ type: "barracks_first", data: "게이트웨이" });
    } else if (turn === 1 && player.buildStrategy === "hatch_first") {
      actions.push({ type: "barracks_first", data: "해처리" });
    }
  }

  // 게임 진행 단계별 액션
  // 게임 진행 단계별 액션
  let availableUnits = getAvailableUnitsByPhase(player.race, turn);

  // 종족전 상성 기반 유닛 선택 (중반 이후)
  if (turn > 15 && availableUnits.length > 0) {
    // 테란 vs 프로토스: 메카닉 중심
    if (player.race === "terran" && opponent.race === "protoss") {
      const mechanicUnits = ["벌쳐", "탱크", "골리앗", "배틀크루저"];
      const filtered = availableUnits.filter(u => mechanicUnits.includes(u));
      if (filtered.length > 0) availableUnits = filtered;
    }
    // 프로토스 vs 테란: 고급 유닛 중심
    else if (player.race === "protoss" && opponent.race === "terran") {
      const advancedUnits = ["다크템플러", "하이템플러", "리버", "케리어"];
      const filtered = availableUnits.filter(u => advancedUnits.includes(u) || u === "질럿" || u === "드래군");
      if (filtered.length > 0) availableUnits = filtered;
    }
    // 저그: 물량 중심
    else if (player.race === "zerg") {
      const massUnits = ["저글링", "뮤탈리스크", "울트라", "러커"];
      const filtered = availableUnits.filter(u => massUnits.includes(u));
      if (filtered.length > 0) availableUnits = filtered;
    }
  }

  // 자원이 충분하면 유닛 생산
  if (player.resources > 50 && availableUnits.length > 0) {
    const unit = availableUnits[Math.floor(Math.random() * availableUnits.length)];
    actions.push({ type: "unit_produced", data: unit });
  }

  // 자원이 충분하면 건물 건설 (생산기지 추가)
  if (player.resources > 100 && Math.random() < 0.4 && player.productionFacilities < 3) {
    const buildings = getAvailableBuildings(player.race, turn);
    if (buildings.length > 0) {
      const building = buildings[Math.floor(Math.random() * buildings.length)];
      actions.push({ type: "building_built", data: building });
    }
  }

  // 기술 업그레이드 - 상대 기술에 대응
  if (player.resources > 150 && Math.random() < 0.25) {
    const techs = getAvailableTechs(player.race, turn);
    if (techs.length > 0) {
      // 상대 기술에 대응하는 기술 우선
      let selectedTechs = techs;
      if (opponent.hasArbiter && player.race === "terran") {
        const empTechs = techs.filter(t => t.includes("EMP"));
        if (empTechs.length > 0) selectedTechs = empTechs;
      } else if (opponent.hasVessel && player.race === "protoss") {
        const recallTechs = techs.filter(t => t.includes("리콜"));
        if (recallTechs.length > 0) selectedTechs = recallTechs;
      }
      
      const tech = selectedTechs[Math.floor(Math.random() * selectedTechs.length)];
      actions.push({ type: "tech_upgraded", data: tech });
    }
  }

  // 멀티 확장 (자원이 충분하고 멀티가 3개 미만일 때)
  // 경제 중심 빌드는 멀티를 더 많이 동스
  if (player.resources > 250 && player.multiCount < 3) {
    const multiChance = player.buildStrategy === "cc_first" ? 0.35 : 0.15;
    if (Math.random() < multiChance) {
      actions.push({ type: "multi_taken", data: (player.multiCount + 1).toString() });
    }
  }

  // 정찰 유닛 (상대 유닛 정보 수집)
  if (player.resources > 100 && turn > 10 && Math.random() < 0.15) {
    if (player.race === "protoss" && !player.hasObserver) {
      actions.push({ type: "scout", data: "옵저버" });
    } else if (player.race === "terran" && !player.hasVessel) {
      actions.push({ type: "scout", data: "배슬" });
    }
  }

  // 기술 카운터 (상대 기술에 대응)
  if (player.resources > 200 && turn > 15 && Math.random() < 0.15) {
    if (opponent.hasArbiter && player.race === "terran" && !player.hasVessel) {
      actions.push({ type: "counter_tech", data: "배슬" });
    } else if (opponent.hasVessel && player.race === "protoss" && !player.hasArbiter) {
      actions.push({ type: "counter_tech", data: "아비터" });
    }
  }

  // 공격 (병력이 충분할 때)
  if (player.supply > opponent.supply * 1.2 && Math.random() < 0.3) {
    const targets = ["멀티", "본진", "앞마당"];
    const target = targets[Math.floor(Math.random() * targets.length)];
    actions.push({ type: "attack", data: target });
  }

  return actions.length > 0 ? actions[Math.floor(Math.random() * actions.length)] : null;
}

/**
 * 게임 진행 단계별 사용 가능한 유닛
 */
function getAvailableUnitsByPhase(race: string, turn: number): string[] {
  // 초반 (1-10턴): 기본 유닛
  if (turn <= 10) {
    const basicUnits: Record<string, string[]> = {
      terran: ["마린", "SCV"],
      zerg: ["저글링", "드론"],
      protoss: ["질럿", "프로브"],
    };
    return basicUnits[race] || [];
  }

  // 중반 (11-25턴): 기본 + 중급 유닛
  if (turn <= 25) {
    const midUnits: Record<string, string[]> = {
      terran: ["마린", "벌쳐", "탱크", "SCV"],
      zerg: ["저글링", "뮤탈리스크", "히드라", "드론"],
      protoss: ["질럿", "드래군", "다크템플러", "프로브"],
    };
    return midUnits[race] || [];
  }

  // 후반 (26턴 이상): 모든 유닛
  const allUnits: Record<string, string[]> = {
    terran: ["마린", "벌쳐", "탱크", "골리앗", "배틀크루저", "SCV"],
    zerg: ["저글링", "뮤탈리스크", "히드라", "울트라", "러커", "드론"],
    protoss: ["질럿", "드래군", "다크템플러", "하이템플러", "리버", "케리어", "프로브"],
  };
  return allUnits[race] || [];
}

/**
 * 사용 가능한 건물 (생산기지)
 */
function getAvailableBuildings(race: string, turn: number): string[] {
  const buildings: Record<string, string[]> = {
    terran: ["배럭", "팩토리", "스타포트"],
    zerg: ["스포닝풀", "스파이어", "해처리"],
    protoss: ["게이트웨이", "로보틱스", "스타게이트"],
  };
  return buildings[race] || [];
}

/**
 * 사용 가능한 기술
 */
function getAvailableTechs(race: string, turn: number): string[] {
  const techs: Record<string, string[]> = {
    terran: ["마린 공격력", "마린 방어력", "배슬 EMP"],
    zerg: ["저글링 공격력", "뮤탈 속도", "울트라 방어력"],
    protoss: ["질럿 발업", "드래군 발업", "아비터 리콜", "스테이시스필드"],
  };
  return techs[race] || [];
}

/**
 * 액션 적용
 */
function applyAction(player: PlayerState, action: PlayerAction, turn: number): void {
  switch (action.type) {
    case "barracks_first":
    case "cc_first":
      // 초반 빌드 선택 - 생산기지 추가
      player.productionFacilities += 1;
      player.resources -= 50;
      break;

    case "unit_produced":
      // 유닛 생산
      player.unitsProduced.push(action.data);
      player.supply += 10;
      player.resources -= 30;
      break;

    case "building_built":
      // 건물 건설 (생산기지 추가)
      player.productionFacilities += 1;
      player.resources -= 80;
      break;

    case "tech_upgraded":
      // 기술 업그레이드
      if (action.data.includes("EMP")) {
        player.hasEMP = true;
      } else if (action.data.includes("리콜")) {
        player.hasRecall = true;
      } else if (action.data.includes("스테이시스")) {
        player.hasStasisField = true;
      }
      player.resources -= 120;
      break;

    case "multi_taken":
      // 멀티 확장
      player.multiCount += 1;
      player.resources -= 150;
      break;

    case "scout":
      // 정찰 유닛
      if (action.data === "옵저버") {
        player.hasObserver = true;
      } else if (action.data === "배슬") {
        player.hasVessel = true;
      }
      player.resources -= 100;
      break;

    case "counter_tech":
      // 기술 카운터
      if (action.data === "배슬") {
        player.hasVessel = true;
        player.hasEMP = true;
      } else if (action.data === "아비터") {
        player.hasArbiter = true;
        player.hasRecall = true;
      }
      player.resources -= 150;
      break;

    case "attack":
      // 공격 - 상대 병력 감소
      player.supply -= 5;
      player.resources -= 20;
      break;
  }

  // 자원이 음수가 되지 않도록 처리
  if (player.resources < 0) {
    player.resources = 0;
  }
}

/**
 * 유불리 계산
 */
function calculateAdvantage(gameState: GameState): void {
  // 병력 * 2 + 자원 * 0.5 + 멀티 * 20 + 생산기지 * 10
  const player1Score = 
    gameState.player1.supply * 2 + 
    gameState.player1.resources * 0.5 + 
    gameState.player1.multiCount * 20 + 
    gameState.player1.productionFacilities * 10;

  const player2Score = 
    gameState.player2.supply * 2 + 
    gameState.player2.resources * 0.5 + 
    gameState.player2.multiCount * 20 + 
    gameState.player2.productionFacilities * 10;

  const totalScore = player1Score + player2Score;
  gameState.player1Advantage = totalScore > 0 ? Math.round((player1Score / totalScore) * 100) : 50;
}

/**
 * 게임 종료 판정
 */
function checkGameEnd(gameState: GameState): void {
  // 자원이 0 이하면 패배
  if (gameState.player1.resources <= 0 && gameState.player1.supply <= 10) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player2.id;
    return;
  }

  if (gameState.player2.resources <= 0 && gameState.player2.supply <= 10) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1.id;
    return;
  }

  // 유불리 70% 이상 차이 시 게임 종료
  if (gameState.player1Advantage >= 70) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1.id;
    return;
  }

  if (gameState.player1Advantage <= 30) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player2.id;
    return;
  }

  // 최대 100턴 도달 시 게임 종료
  if (gameState.turn >= 100) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1Advantage >= 50 ? gameState.player1.id : gameState.player2.id;
  }
}

/**
 * 게임 상태를 턴 데이터로 변환
 */
export function gameStateToTurnData(gameState: GameState) {
  return {
    turn: gameState.turn,
    player1Commentary: [],
    player2Commentary: [],
    player1Supply: gameState.player1.supply,
    player1Resources: gameState.player1.resources,
    player2Supply: gameState.player2.supply,
    player2Resources: gameState.player2.resources,
    player1Health: gameState.player1.health,
    player2Health: gameState.player2.health,
    allCommentaries: gameState.allCommentaries,
  };
}
