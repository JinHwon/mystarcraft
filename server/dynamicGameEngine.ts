/**
 * 동적 게임 엔진
 * 게임 상태를 관리하고 턴별로 게임을 진행
 */

import { generateTurnCommentary, generateGameEndCommentary } from "./conciseCommentary";

export interface PlayerAction {
  type: "unit_produced" | "building_built" | "tech_upgraded" | "multi_taken" | "attack";
  data: string;
}

export interface PlayerState {
  id: number;
  name: string;
  race: "terran" | "zerg" | "protoss";
  supply: number;
  resources: number;
  health: number;
  multiCount: number;
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

  // 플레이어 1 액션
  const player1Action = generatePlayerAction(gameState.player1, gameState.player2, gameState.turn);
  if (player1Action) {
    gameState.player1.lastAction = player1Action;
    applyAction(gameState.player1, player1Action);
  }

  // 플레이어 2 액션
  const player2Action = generatePlayerAction(gameState.player2, gameState.player1, gameState.turn);
  if (player2Action) {
    gameState.player2.lastAction = player2Action;
    applyAction(gameState.player2, player2Action);
  }

  // 자원 생성
  gameState.player1.resources += 10 * gameState.player1.multiCount;
  gameState.player2.resources += 10 * gameState.player2.multiCount;

  // 병력 자동 증가
  gameState.player1.supply += Math.floor(gameState.player1.resources / 100);
  gameState.player2.supply += Math.floor(gameState.player2.resources / 100);

  // 유불리 계산
  calculateAdvantage(gameState);

  // 해설 생성
  const commentaries = generateTurnCommentary(gameState, gameState.player1.name, gameState.player2.name);
  gameState.allCommentaries.push(...commentaries);

  // 게임 종료 판정
  checkGameEnd(gameState);
}

/**
 * 플레이어 액션 생성 - 게임 진행 단계에 따라 다른 유닛 생산
 */
function generatePlayerAction(
  player: PlayerState,
  opponent: PlayerState,
  turn: number
): PlayerAction | null {
  const actions: PlayerAction[] = [];

  // 게임 진행 단계별 유닛 선택
  let availableUnits = getAvailableUnitsByPhase(player.race, turn);

  // 자원이 충분하면 유닛 생산
  if (player.resources > 50 && availableUnits.length > 0) {
    const unit = availableUnits[Math.floor(Math.random() * availableUnits.length)];
    actions.push({ type: "unit_produced", data: unit });
  }

  // 자원이 충분하면 건물 건설
  if (player.resources > 100 && Math.random() < 0.3) {
    const buildings = getAvailableBuildings(player.race, turn);
    if (buildings.length > 0) {
      const building = buildings[Math.floor(Math.random() * buildings.length)];
      actions.push({ type: "building_built", data: building });
    }
  }

  // 기술 업그레이드
  if (player.resources > 150 && Math.random() < 0.2) {
    const techs = getAvailableTechs(player.race);
    const tech = techs[Math.floor(Math.random() * techs.length)];
    actions.push({ type: "tech_upgraded", data: tech });
  }

  // 멀티 확장
  if (player.resources > 200 && player.multiCount < 3 && Math.random() < 0.15) {
    actions.push({ type: "multi_taken", data: (player.multiCount + 1).toString() });
  }

  // 공격
  if (player.supply > opponent.supply * 1.3 && Math.random() < 0.3) {
    const targets = ["멀티 넥서스", "해처리", "커맨드센터", "앞마당"];
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
      terran: ["마린", "배럭"],
      zerg: ["저글링", "스포닝풀"],
      protoss: ["질럿", "게이트웨이"],
    };
    return basicUnits[race] || [];
  }

  // 중반 (11-25턴): 기본 + 중급 유닛
  if (turn <= 25) {
    const midUnits: Record<string, string[]> = {
      terran: ["마린", "배럭", "팩토리", "벌쳐", "탱크"],
      zerg: ["저글링", "뮤탈리스크", "히드라", "스포닝풀"],
      protoss: ["질럿", "드래군", "게이트웨이", "포지"],
    };
    return midUnits[race] || [];
  }

  // 후반 (26턴 이상): 모든 유닛
  const allUnits: Record<string, string[]> = {
    terran: ["마린", "배럭", "팩토리", "벌쳐", "탱크", "골리앗", "배틀크루저"],
    zerg: ["저글링", "뮤탈리스크", "히드라", "울트라", "러커", "디파일러", "가디언"],
    protoss: ["질럿", "드래군", "다크템플러", "하이템플러", "리버", "아칸", "케리어"],
  };
  return allUnits[race] || [];
}

/**
 * 액션 적용
 */
function applyAction(player: PlayerState, action: PlayerAction): void {
  switch (action.type) {
    case "unit_produced":
      player.resources -= 50;
      player.unitsProduced.push(action.data);
      break;
    case "building_built":
      player.resources -= 100;
      break;
    case "tech_upgraded":
      player.resources -= 150;
      break;
    case "multi_taken":
      player.resources -= 200;
      player.multiCount = parseInt(action.data as any) || player.multiCount + 1;
      break;
    case "attack":
      player.resources -= 30;
      break;
  }
}

/**
 * 사용 가능한 건물
 */
function getAvailableBuildings(race: string, turn: number): string[] {
  if (turn <= 15) {
    const earlyBuildings: Record<string, string[]> = {
      terran: ["커맨드센터", "배럭"],
      zerg: ["해처리", "스포닝풀"],
      protoss: ["넥서스", "게이트웨이"],
    };
    return earlyBuildings[race] || [];
  }

  const buildings: Record<string, string[]> = {
    terran: ["커맨드센터", "배럭", "팩토리", "스타포트", "터렛", "번커"],
    zerg: ["해처리", "스포닝풀", "하이드라덴", "스파이어", "울트라리스크 캐번"],
    protoss: ["넥서스", "게이트웨이", "포지", "로보틱스", "스타게이트"],
  };
  return buildings[race] || [];
}

/**
 * 사용 가능한 기술
 */
function getAvailableTechs(race: string): string[] {
  const techs: Record<string, string[]> = {
    terran: ["공격력 업", "방어력 업", "속도 업", "무기고 업"],
    zerg: ["공격력 업", "방어력 업", "속도 업", "카라팩"],
    protoss: ["공격력 업", "방어력 업", "속도 업", "플라즈마 실드"],
  };
  return techs[race] || [];
}

/**
 * 유불리 계산
 */
function calculateAdvantage(gameState: GameState): void {
  const player1Score = gameState.player1.supply * 2 + gameState.player1.resources / 10 + gameState.player1.health;
  const player2Score = gameState.player2.supply * 2 + gameState.player2.resources / 10 + gameState.player2.health;

  const totalScore = player1Score + player2Score;
  gameState.player1Advantage = Math.round((player1Score / totalScore) * 100);
}

/**
 * 게임 종료 판정
 */
function checkGameEnd(gameState: GameState): void {
  // 자원이 0 이하면 패배
  if (gameState.player1.resources <= 0) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player2.id;
    const commentaries = generateGameEndCommentary(gameState.player2.name, gameState.player1.name);
    gameState.allCommentaries.push(...commentaries);
    return;
  }

  if (gameState.player2.resources <= 0) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1.id;
    const commentaries = generateGameEndCommentary(gameState.player1.name, gameState.player2.name);
    gameState.allCommentaries.push(...commentaries);
    return;
  }

  // 유불리가 70% 이상 차이나면 게임 종료
  if (gameState.player1Advantage >= 70 || gameState.player1Advantage <= 30) {
    gameState.gameEnded = true;
    gameState.winner = gameState.player1Advantage >= 70 ? gameState.player1.id : gameState.player2.id;
    const winnerName = gameState.player1Advantage >= 70 ? gameState.player1.name : gameState.player2.name;
    const loserName = gameState.player1Advantage >= 70 ? gameState.player2.name : gameState.player1.name;
    const commentaries = generateGameEndCommentary(winnerName, loserName);
    gameState.allCommentaries.push(...commentaries);
  }
}

/**
 * 게임 상태를 턴 데이터로 변환
 */
export function gameStateToTurnData(gameState: GameState) {
  return {
    turn: gameState.turn,
    player1Commentary: gameState.player1.lastAction ? [gameState.allCommentaries[gameState.allCommentaries.length - 3]] : [],
    player2Commentary: gameState.player2.lastAction ? [gameState.allCommentaries[gameState.allCommentaries.length - 2]] : [],
    player1Supply: gameState.player1.supply,
    player1Resources: gameState.player1.resources,
    player2Supply: gameState.player2.supply,
    player2Resources: gameState.player2.resources,
    player1Health: gameState.player1.health,
    player2Health: gameState.player2.health,
    allCommentaries: gameState.allCommentaries,
  };
}
