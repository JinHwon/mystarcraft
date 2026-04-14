import { BuildType } from "./buildSystem";

/**
 * 게임 액션 타입
 */
export type GameAction = 
  | "expand" | "scout" | "build-unit" | "attack" | "defend" 
  | "tech" | "upgrade" | "harass" | "macro" | "micro";

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
 * 종족별 빌드 액션 데이터베이스
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
  const phase = turn <= maxTurns / 3 ? "초반" : turn <= (maxTurns * 2) / 3 ? "중반" : "후반";
  
  // 액션 조합에 따른 해설
  const commentaries: string[] = [];
  
  commentaries.push(player1Action.description);
  commentaries.push(player2Action.description);
  
  // 상황 설명 추가
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
  }
  
  return commentaries.join("\n");
}
