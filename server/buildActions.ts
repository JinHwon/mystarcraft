import { BuildType } from "./buildSystem";

/**
 * 게임 액션 타입
 */
export type GameAction = 
  | "expand" | "scout" | "build-unit" | "attack" | "defend" 
  | "tech" | "upgrade" | "harass" | "macro" | "micro" | "rush" | "all-in";

/**
 * 플레이어별 액션 설명
 */
export interface PlayerAction {
  playerName: string;
  race: "terran" | "zerg" | "protoss";
  buildType: BuildType;
  action: GameAction;
  description: string;
}

/**
 * 스타크래프트 실제 빌드 액션 데이터베이스
 */
const BUILD_ACTIONS = {
  terran: {
    macro: {
      early: [
        { action: "expand" as GameAction, description: "멀티지역 커멘드센터 건설합니다" },
        { action: "build-unit" as GameAction, description: "마린 생산을 시작합니다" },
        { action: "defend" as GameAction, description: "터렛을 배치하며 방어선을 구축합니다" },
        { action: "macro" as GameAction, description: "배럭을 추가로 지으며 생산력을 확보합니다" },
      ],
      mid: [
        { action: "expand" as GameAction, description: "추가 멀티를 확보합니다" },
        { action: "tech" as GameAction, description: "팩토리를 건설하여 탱크 생산을 준비합니다" },
        { action: "build-unit" as GameAction, description: "탱크와 벌쳐를 생산하기 시작합니다" },
        { action: "macro" as GameAction, description: "추가 생산 건물을 지으며 경제력을 강화합니다" },
      ],
      late: [
        { action: "build-unit" as GameAction, description: "배틀크루저 생산을 시작합니다" },
        { action: "attack" as GameAction, description: "대규모 병력으로 최종 공격을 준비합니다" },
      ],
    },
    aggressive: {
      early: [
        { action: "build-unit" as GameAction, description: "마린을 빠르게 모아 초반 러쉬를 준비합니다" },
        { action: "attack" as GameAction, description: "마린 러쉬로 상대 본진을 위협합니다" },
        { action: "scout" as GameAction, description: "정찰 유닛을 보내 상대 빌드를 확인합니다" },
      ],
      mid: [
        { action: "tech" as GameAction, description: "팩토리를 빠르게 건설하여 벌쳐를 생산합니다" },
        { action: "harass" as GameAction, description: "벌쳐로 상대 멀티를 괴롭힙니다" },
        { action: "attack" as GameAction, description: "계속해서 공격 압박을 이어갑니다" },
      ],
      late: [
        { action: "attack" as GameAction, description: "지속적인 공격으로 상대를 압박합니다" },
      ],
    },
    balanced: {
      early: [
        { action: "defend" as GameAction, description: "초반 방어를 안정적으로 구축합니다" },
        { action: "macro" as GameAction, description: "기본 생산 건물을 지으며 경제를 확보합니다" },
      ],
      mid: [
        { action: "expand" as GameAction, description: "상황을 보며 멀티 확보를 시도합니다" },
        { action: "micro" as GameAction, description: "상황에 맞춰 유연하게 대응합니다" },
      ],
      late: [
        { action: "attack" as GameAction, description: "경제력을 바탕으로 최종 공격을 준비합니다" },
      ],
    },
    rush: {
      early: [
        { action: "rush" as GameAction, description: "8배럭을 지어 마린을 빠르게 모읍니다" },
        { action: "all-in" as GameAction, description: "상대 앞마당을 벙커로 봉쇄합니다" },
      ],
      mid: [
        { action: "attack" as GameAction, description: "마린과 SCV를 이용해 상대를 압박합니다" },
      ],
      late: [
        { action: "attack" as GameAction, description: "계속해서 상대를 밀어붙입니다" },
      ],
    },
  },
  zerg: {
    macro: {
      early: [
        { action: "macro" as GameAction, description: "드론을 계속 생산하며 경제력을 쌓습니다" },
        { action: "expand" as GameAction, description: "해처리를 추가로 지으며 멀티를 확보합니다" },
        { action: "build-unit" as GameAction, description: "링링 생산을 시작합니다" },
      ],
      mid: [
        { action: "tech" as GameAction, description: "스포닝 풀을 지어 뮤탈리스크 생산을 준비합니다" },
        { action: "build-unit" as GameAction, description: "뮤탈리스크를 생산하기 시작합니다" },
        { action: "upgrade" as GameAction, description: "스팀팩을 연구하여 유닛을 강화합니다" },
      ],
      late: [
        { action: "build-unit" as GameAction, description: "대규모 뮤탈과 링링을 모아 최종 공격을 준비합니다" },
      ],
    },
    aggressive: {
      early: [
        { action: "build-unit" as GameAction, description: "링링을 빠르게 모아 초반 러쉬를 준비합니다" },
        { action: "attack" as GameAction, description: "링링 러쉬로 상대 본진을 위협합니다" },
      ],
      mid: [
        { action: "tech" as GameAction, description: "스포닝 풀을 지어 뮤탈리스크를 생산합니다" },
        { action: "harass" as GameAction, description: "뮤탈리스크로 상대 멀티를 계속 괴롭힙니다" },
      ],
      late: [
        { action: "attack" as GameAction, description: "뮤탈과 링링의 조합으로 최종 승리를 노립니다" },
      ],
    },
    balanced: {
      early: [
        { action: "macro" as GameAction, description: "드론 생산으로 경제를 확보합니다" },
        { action: "defend" as GameAction, description: "초반 방어를 안정적으로 구축합니다" },
      ],
      mid: [
        { action: "expand" as GameAction, description: "상황을 보며 멀티를 확보합니다" },
        { action: "build-unit" as GameAction, description: "필요한 유닛을 빠르게 생산합니다" },
      ],
      late: [
        { action: "attack" as GameAction, description: "물량과 스피드로 최종 공격을 준비합니다" },
      ],
    },
    rush: {
      early: [
        { action: "rush" as GameAction, description: "4드론으로 극초반 저글링을 뽑습니다" },
        { action: "all-in" as GameAction, description: "저글링 러쉬로 상대를 일방적으로 압박합니다" },
      ],
      mid: [
        { action: "attack" as GameAction, description: "계속해서 저글링으로 상대를 괴롭힙니다" },
      ],
      late: [
        { action: "attack" as GameAction, description: "상대가 방어하지 못하면 게임이 끝납니다" },
      ],
    },
  },
  protoss: {
    macro: {
      early: [
        { action: "defend" as GameAction, description: "포톤캐논으로 방어선을 구축합니다" },
        { action: "expand" as GameAction, description: "빠른 확장을 노리며 게이트웨이를 추가로 지습니다" },
        { action: "build-unit" as GameAction, description: "질럿 생산을 시작합니다" },
      ],
      mid: [
        { action: "tech" as GameAction, description: "템플러 아카이브를 지어 고급 유닛 생산을 준비합니다" },
        { action: "build-unit" as GameAction, description: "드라군을 생산하기 시작합니다" },
        { action: "upgrade" as GameAction, description: "플러스 업그레이드를 연구합니다" },
      ],
      late: [
        { action: "build-unit" as GameAction, description: "아비터와 캐리어를 생산하여 최종 공격을 준비합니다" },
      ],
    },
    aggressive: {
      early: [
        { action: "build-unit" as GameAction, description: "질럿을 빠르게 모아 2게이트 러쉬를 준비합니다" },
        { action: "attack" as GameAction, description: "질럿 러쉬로 상대 본진을 위협합니다" },
      ],
      mid: [
        { action: "harass" as GameAction, description: "계속해서 상대를 압박하며 경제 격차를 벌립니다" },
        { action: "attack" as GameAction, description: "질럿의 강력한 근접 공격으로 주도권을 유지합니다" },
      ],
      late: [
        { action: "tech" as GameAction, description: "고급 유닛으로 전환하여 최종 공격을 준비합니다" },
      ],
    },
    balanced: {
      early: [
        { action: "defend" as GameAction, description: "초반을 안정적으로 방어합니다" },
        { action: "macro" as GameAction, description: "기본 생산 건물을 지으며 경제를 확보합니다" },
      ],
      mid: [
        { action: "expand" as GameAction, description: "상황을 보며 멀티를 확보합니다" },
        { action: "micro" as GameAction, description: "상황에 맞춰 유연하게 대응합니다" },
      ],
      late: [
        { action: "attack" as GameAction, description: "고급 유닛으로 최종 공격을 준비합니다" },
      ],
    },
    rush: {
      early: [
        { action: "rush" as GameAction, description: "세빠닥으로 다크템플러를 빠르게 생산합니다" },
        { action: "all-in" as GameAction, description: "다크템플러로 상대 본진을 은폐 공격합니다" },
      ],
      mid: [
        { action: "attack" as GameAction, description: "다크템플러의 은폐 이동으로 상대를 압박합니다" },
      ],
      late: [
        { action: "attack" as GameAction, description: "상대가 방어하지 못하면 게임이 끝납니다" },
      ],
    },
  },
};

/**
 * 게임 페이즈별 액션 생성
 */
export function generatePlayerActions(
  playerName: string,
  race: "terran" | "zerg" | "protoss",
  buildType: BuildType,
  turn: number,
  maxTurns: number
): PlayerAction {
  const phase = turn <= maxTurns / 3 ? "early" : turn <= (maxTurns * 2) / 3 ? "mid" : "late";
  const actions = BUILD_ACTIONS[race][buildType][phase];
  const action = actions[Math.floor(Math.random() * actions.length)];
  
  return {
    playerName,
    race,
    buildType,
    action: action.action,
    description: `${playerName} 선수 ${action.description}`,
  };
}

/**
 * 두 플레이어의 액션을 조합하여 해설 생성
 */
export function generateGameCommentary(
  player1Action: PlayerAction,
  player2Action: PlayerAction,
  turn: number,
  maxTurns: number
): string {
  const commentaries: string[] = [];
  
  commentaries.push(player1Action.description);
  commentaries.push(player2Action.description);
  
  // 액션 조합에 따른 상황 설명
  if (player1Action.action === "attack" && player2Action.action === "defend") {
    commentaries.push(`${player1Action.playerName} 선수의 공격에 ${player2Action.playerName} 선수가 방어하고 있습니다.`);
  } else if (player1Action.action === "defend" && player2Action.action === "attack") {
    commentaries.push(`${player2Action.playerName} 선수의 공격에 ${player1Action.playerName} 선수가 방어하고 있습니다.`);
  } else if (player1Action.action === "attack" && player2Action.action === "attack") {
    commentaries.push(`양 선수 모두 공격적인 플레이를 펼치고 있습니다. 병력들이 돌도 도는 눈치싸움이 치열합니다.`);
  } else if (player1Action.action === "macro" && player2Action.action === "macro") {
    commentaries.push(`양 선수 모두 경제력 확보에 집중하고 있습니다. 게임의 흐름이 천천히 진행되고 있습니다.`);
  } else if (player1Action.action === "harass" || player2Action.action === "harass") {
    commentaries.push(`견제 플레이가 이어지고 있습니다. 긴장감 있는 경기입니다.`);
  } else if (player1Action.action === "rush" || player2Action.action === "rush") {
    commentaries.push(`초반 러쉬 전략이 펼쳐지고 있습니다. 게임의 승패가 결정될 중요한 순간입니다.`);
  } else if (player1Action.action === "all-in" || player2Action.action === "all-in") {
    commentaries.push(`올인 공격으로 게임을 끝내려는 시도가 있습니다. 이 전투의 결과가 게임을 좌우할 것 같습니다.`);
  }
  
  return commentaries.join("\n");
}

/**
 * 견제 성공 확률 계산
 */
export function calculateHarassSuccessRate(harasserStats: Record<string, number>, defenderStats: Record<string, number>): number {
  // 견제자의 견제 능력이 높을수록 성공률 증가
  const harassAbility = (harasserStats.attack || 0) + (harasserStats.harass || 0) * 1.5;
  // 방어자의 방어 능력이 높을수록 성공률 감소
  const defenseAbility = (defenderStats.defense || 0) + (defenderStats.sense || 0) * 0.5;
  
  const baseRate = 0.5;
  const rate = baseRate + (harassAbility - defenseAbility) / 1000;
  return Math.max(0.1, Math.min(0.9, rate));
}

/**
 * 날빌 감지 및 판단
 */
export function detectRushBuild(buildType: BuildType, turn: number): boolean {
  // 초반(턴 1-3)에 rush 빌드면 날빌
  return buildType === "aggressive" && turn <= 3;
}

/**
 * 유불리 판단
 */
export function evaluateAdvantage(
  player1Supply: number,
  player1Resources: number,
  player1Health: number,
  player2Supply: number,
  player2Resources: number,
  player2Health: number
): { advantagePlayer: 1 | 2 | null; advantagePercent: number } {
  // 병력, 자원, 체력을 종합적으로 판단
  const player1Power = (player1Supply * 10) + (player1Resources * 0.5) + (player1Health * 0.5);
  const player2Power = (player2Supply * 10) + (player2Resources * 0.5) + (player2Health * 0.5);
  
  const totalPower = player1Power + player2Power;
  if (totalPower === 0) return { advantagePlayer: null, advantagePercent: 0 };
  
  const player1Percent = (player1Power / totalPower) * 100;
  const player2Percent = (player2Power / totalPower) * 100;
  
  // 30% 이상 차이나면 유불리 판단
  if (player1Percent > player2Percent + 30) {
    return { advantagePlayer: 1, advantagePercent: player1Percent - player2Percent };
  } else if (player2Percent > player1Percent + 30) {
    return { advantagePlayer: 2, advantagePercent: player2Percent - player1Percent };
  }
  
  return { advantagePlayer: null, advantagePercent: 0 };
}

/**
 * 게임 종료 조건 판단
 */
export function shouldGameEnd(
  player1Supply: number,
  player1Resources: number,
  player1Health: number,
  player2Supply: number,
  player2Resources: number,
  player2Health: number,
  turn: number
): boolean {
  // 한 명의 체력이 0이 되면 게임 종료
  if (player1Health <= 0 || player2Health <= 0) return true;
  
  // 유불리가 심하면 게임 종료
  const advantage = evaluateAdvantage(player1Supply, player1Resources, player1Health, player2Supply, player2Resources, player2Health);
  if (advantage.advantagePlayer !== null && advantage.advantagePercent > 50) return true;
  
  // 최소 턴 수 이상 진행되었으면 게임 종료 가능
  if (turn >= 15) {
    // 한 명이 병력과 자원이 모두 거의 없으면 게임 종료
    if ((player1Supply < 5 && player1Resources < 50) || (player2Supply < 5 && player2Resources < 50)) return true;
  }
  
  return false;
}
