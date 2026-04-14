import { StatKey } from "@shared/gameConstants";

export type BuildType = "macro" | "aggressive" | "balanced" | "rush";
export type GameAction = "expand" | "scout" | "build-unit" | "attack" | "defend" | "tech" | "upgrade" | "harass" | "macro" | "micro" | "rush" | "all-in";

/**
 * 플레이어 액션 정보
 */
export interface PlayerActionInfo {
  playerName: string;
  race: "terran" | "zerg" | "protoss";
  buildType: BuildType;
  action: GameAction;
  stats: Record<StatKey, number>;
  turn: number;
  maxTurns: number;
}

/**
 * 테란 액션별 동적 해설
 */
function getTerranCommentary(action: PlayerActionInfo): string[] {
  const { playerName, buildType, action: gameAction, stats, turn, maxTurns } = action;
  const phase = turn <= maxTurns / 3 ? "초반" : turn <= (maxTurns * 2) / 3 ? "중반" : "후반";
  const commentaries: string[] = [];

  switch (gameAction) {
    case "expand":
      commentaries.push(`${playerName} 선수 멀티지역 커멘드센터 건설합니다`);
      if (stats.sense > 600) {
        commentaries.push(`${playerName} 선수 좋은 위치에 확장을 잡았네요`);
      } else if (stats.sense < 400) {
        commentaries.push(`${playerName} 선수 위험한 위치에 멀티를 잡았습니다`);
      }
      break;

    case "build-unit":
      if (buildType === "aggressive") {
        commentaries.push(`${playerName} 선수 마린을 빠르게 모으고 있습니다`);
        if (turn <= 3) {
          commentaries.push(`${playerName} 선수 초반 러쉬를 노리는 것 같습니다`);
        }
      } else if (buildType === "macro") {
        commentaries.push(`${playerName} 선수 배럭을 추가로 지으며 생산력을 확보합니다`);
      } else {
        commentaries.push(`${playerName} 선수 필요한 병력을 생산하고 있습니다`);
      }
      break;

    case "tech":
      commentaries.push(`${playerName} 선수 팩토리를 건설합니다`);
      if (turn <= maxTurns / 2) {
        commentaries.push(`${playerName} 선수 중반 운영을 준비하고 있네요`);
      } else {
        commentaries.push(`${playerName} 선수 후반 조합을 만들려고 합니다`);
      }
      break;

    case "attack":
      commentaries.push(`${playerName} 선수 공격을 시작합니다`);
      if (stats.attack > 600) {
        commentaries.push(`${playerName} 선수 공격력이 뛰어나네요`);
      }
      break;

    case "defend":
      commentaries.push(`${playerName} 선수 터렛을 배치하며 방어선을 구축합니다`);
      if (stats.defense > 600) {
        commentaries.push(`${playerName} 선수 탄탄한 방어를 펼치고 있습니다`);
      }
      break;

    case "harass":
      commentaries.push(`${playerName} 선수 벌쳐로 상대 멀티를 괴롭힙니다`);
      if (stats.attack > 600) {
        commentaries.push(`${playerName} 선수 정교한 견제를 펼치고 있습니다`);
      }
      break;

    case "rush":
      commentaries.push(`${playerName} 선수 8배럭을 지어 마린을 빠르게 모읍니다`);
      commentaries.push(`${playerName} 선수 상대 앞마당을 벙커로 봉쇄합니다`);
      break;

    case "all-in":
      commentaries.push(`${playerName} 선수 모든 자원을 투자해 올인 공격을 준비합니다`);
      commentaries.push(`${playerName} 선수 이번 전투가 게임을 결정할 것 같습니다`);
      break;

    case "macro":
      commentaries.push(`${playerName} 선수 기본 생산 건물을 지으며 경제를 확보합니다`);
      if (stats.strategy > 600) {
        commentaries.push(`${playerName} 선수 효율적인 경제 운영을 펼치고 있습니다`);
      }
      break;

    case "scout":
      commentaries.push(`${playerName} 선수 정찰 유닛을 보내 상대 빌드를 확인합니다`);
      break;

    case "upgrade":
      commentaries.push(`${playerName} 선수 업그레이드를 진행하고 있습니다`);
      break;

    case "micro":
      commentaries.push(`${playerName} 선수 병력 조종으로 유리한 교전을 펼칩니다`);
      if (stats.control > 600) {
        commentaries.push(`${playerName} 선수 뛰어난 컨트롤을 보여주고 있네요`);
      }
      break;
  }

  return commentaries;
}

/**
 * 저그 액션별 동적 해설
 */
function getZergCommentary(action: PlayerActionInfo): string[] {
  const { playerName, buildType, action: gameAction, stats, turn, maxTurns } = action;
  const commentaries: string[] = [];

  switch (gameAction) {
    case "expand":
      commentaries.push(`${playerName} 선수 해처리를 지으며 멀티를 확보합니다`);
      if (stats.sense > 600) {
        commentaries.push(`${playerName} 선수 좋은 타이밍에 멀티를 잡았습니다`);
      }
      break;

    case "build-unit":
      if (buildType === "aggressive" && turn <= 3) {
        commentaries.push(`${playerName} 선수 드론을 빠르게 모으고 있습니다`);
        commentaries.push(`${playerName} 선수 초반 드론 러쉬를 준비하는 것 같습니다`);
      } else {
        commentaries.push(`${playerName} 선수 저글링과 뮤탈리스크를 생산합니다`);
      }
      break;

    case "tech":
      commentaries.push(`${playerName} 선수 스포닝 풀을 건설합니다`);
      commentaries.push(`${playerName} 선수 업그레이드와 변신 준비를 하고 있습니다`);
      break;

    case "attack":
      commentaries.push(`${playerName} 선수 저글링 무리로 공격을 시작합니다`);
      if (stats.attack > 600) {
        commentaries.push(`${playerName} 선수 맹렬한 공격을 펼치고 있습니다`);
      }
      break;

    case "defend":
      commentaries.push(`${playerName} 선수 방어 태세를 갖추고 있습니다`);
      break;

    case "harass":
      commentaries.push(`${playerName} 선수 뮤탈리스크로 상대를 괴롭힙니다`);
      commentaries.push(`${playerName} 선수 민첩한 견제를 펼치고 있네요`);
      break;

    case "rush":
      commentaries.push(`${playerName} 선수 4드론 또는 5드론 러쉬를 시도합니다`);
      commentaries.push(`${playerName} 선수 초반 압박이 심할 것 같습니다`);
      break;

    case "macro":
      commentaries.push(`${playerName} 선수 드론을 계속 생산하며 경제를 확보합니다`);
      if (stats.supply > 600) {
        commentaries.push(`${playerName} 선수 안정적인 경제 운영을 펼치고 있습니다`);
      }
      break;

    case "scout":
      commentaries.push(`${playerName} 선수 정찰 드론을 보내 상대를 확인합니다`);
      break;

    case "upgrade":
      commentaries.push(`${playerName} 선수 공격력 업그레이드를 진행합니다`);
      break;

    case "micro":
      commentaries.push(`${playerName} 선수 저글링 무리의 움직임으로 유리한 교전을 펼칩니다`);
      break;

    case "all-in":
      commentaries.push(`${playerName} 선수 모든 저글링을 모아 올인 공격을 시도합니다`);
      break;
  }

  return commentaries;
}

/**
 * 프로토스 액션별 동적 해설
 */
function getProtossCommentary(action: PlayerActionInfo): string[] {
  const { playerName, buildType, action: gameAction, stats, turn, maxTurns } = action;
  const commentaries: string[] = [];

  switch (gameAction) {
    case "expand":
      commentaries.push(`${playerName} 선수 넥서스를 지으며 멀티를 확보합니다`);
      if (stats.sense > 600) {
        commentaries.push(`${playerName} 선수 안전한 위치에 확장을 잡았습니다`);
      }
      break;

    case "build-unit":
      if (buildType === "aggressive" && turn <= 3) {
        commentaries.push(`${playerName} 선수 다크템플러를 빠르게 준비합니다`);
        commentaries.push(`${playerName} 선수 세빠닥 빌드를 노리는 것 같습니다`);
      } else {
        commentaries.push(`${playerName} 선수 프로브를 생산하며 경제를 확보합니다`);
      }
      break;

    case "tech":
      commentaries.push(`${playerName} 선수 사이버네틱스 코어를 건설합니다`);
      commentaries.push(`${playerName} 선수 업그레이드와 고급 유닛 준비를 하고 있습니다`);
      break;

    case "attack":
      commentaries.push(`${playerName} 선수 질럿 무리로 공격을 시작합니다`);
      if (stats.attack > 600) {
        commentaries.push(`${playerName} 선수 강력한 공격을 펼치고 있습니다`);
      }
      break;

    case "defend":
      commentaries.push(`${playerName} 선수 포톤 캐논을 배치하며 방어합니다`);
      break;

    case "harass":
      commentaries.push(`${playerName} 선수 다크템플러로 상대를 괴롭힙니다`);
      commentaries.push(`${playerName} 선수 은폐된 유닛으로 정교한 견제를 펼치고 있습니다`);
      break;

    case "rush":
      commentaries.push(`${playerName} 선수 빠른 다크템플러 공격을 준비합니다`);
      commentaries.push(`${playerName} 선수 상대가 대비하지 못할 초반 공격이 올 것 같습니다`);
      break;

    case "macro":
      commentaries.push(`${playerName} 선수 프로브를 계속 생산하며 경제를 강화합니다`);
      if (stats.strategy > 600) {
        commentaries.push(`${playerName} 선수 효율적인 자원 관리를 펼치고 있습니다`);
      }
      break;

    case "scout":
      commentaries.push(`${playerName} 선수 프로브를 보내 상대 빌드를 정찰합니다`);
      break;

    case "upgrade":
      commentaries.push(`${playerName} 선수 무기 및 방어력 업그레이드를 진행합니다`);
      break;

    case "micro":
      commentaries.push(`${playerName} 선수 질럿의 움직임으로 유리한 교전을 펼칩니다`);
      if (stats.control > 600) {
        commentaries.push(`${playerName} 선수 뛰어난 컨트롤을 보여주고 있네요`);
      }
      break;

    case "all-in":
      commentaries.push(`${playerName} 선수 모든 유닛을 모아 올인 공격을 시도합니다`);
      break;
  }

  return commentaries;
}

/**
 * 플레이어 액션에 따른 동적 해설 생성
 */
export function generateDynamicCommentary(action: PlayerActionInfo): string[] {
  const { race } = action;

  switch (race) {
    case "terran":
      return getTerranCommentary(action);
    case "zerg":
      return getZergCommentary(action);
    case "protoss":
      return getProtossCommentary(action);
    default:
      return [`${action.playerName} 선수 게임을 진행하고 있습니다`];
  }
}

/**
 * 액션에 따른 병력/자원 변화 계산
 */
export function calculateActionImpact(
  action: GameAction,
  playerStats: Record<StatKey, number>,
  currentSupply: number,
  currentResources: number,
  buildType: BuildType
): { supplyChange: number; resourceChange: number } {
  let supplyChange = 0;
  let resourceChange = 0;

  switch (action) {
    case "expand":
      // 멀티 확장: 자원 소비, 나중에 자원 증가
      resourceChange = -100;
      supplyChange = 0;
      break;

    case "build-unit":
      // 유닛 생산: 자원 소비, 병력 증가
      resourceChange = -50;
      supplyChange = Math.round(15 + (playerStats.supply / 500) * 5);
      break;

    case "tech":
      // 기술 건물: 자원 소비
      resourceChange = -80;
      supplyChange = 0;
      break;

    case "attack":
      // 공격: 병력 손실 가능
      supplyChange = -Math.round((playerStats.attack / 500) * 3);
      resourceChange = 0;
      break;

    case "defend":
      // 방어: 자원 소비로 방어 건물 건설
      resourceChange = -30;
      supplyChange = 0;
      break;

    case "harass":
      // 견제: 자원 소비, 상대 자원 피해
      resourceChange = -20;
      supplyChange = -Math.round((playerStats.attack / 500) * 2);
      break;

    case "macro":
      // 경제: 자원 증가
      resourceChange = Math.round(20 + (playerStats.strategy / 500) * 10);
      supplyChange = 0;
      break;

    case "scout":
      // 정찰: 자원 소비 적음
      resourceChange = -10;
      supplyChange = 0;
      break;

    case "upgrade":
      // 업그레이드: 자원 소비
      resourceChange = -40;
      supplyChange = 0;
      break;

    case "micro":
      // 미크로: 효율적인 교전으로 손실 감소
      supplyChange = Math.round((playerStats.control / 500) * 2);
      resourceChange = 0;
      break;

    case "rush":
      // 러쉬: 병력 증가, 자원 소비
      resourceChange = -100;
      supplyChange = Math.round(30 + (playerStats.attack / 500) * 10);
      break;

    case "all-in":
      // 올인: 모든 자원 투자
      resourceChange = -150;
      supplyChange = Math.round(50 + (playerStats.supply / 500) * 15);
      break;
  }

  return { supplyChange, resourceChange };
}
