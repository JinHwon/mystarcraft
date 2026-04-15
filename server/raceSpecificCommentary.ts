/**
 * 종족별 상세 해설 시스템 - v13.0
 * 
 * 테란/프로토스/저그 각 종족의 특성을 반영한 상세한 해설을 생성합니다.
 */

export type Race = "terran" | "protoss" | "zerg";
export type BattleLocation = "center" | "front" | "multi" | "main";

export interface CommentaryContext {
  playerName: string;
  playerRace: Race;
  opponentName: string;
  opponentRace: Race;
  playerSupply: number;
  opponentSupply: number;
  playerResources: number;
  opponentResources: number;
  battleLocation?: BattleLocation;
  playerAdvantage: number;
}

/**
 * 테란 특화 해설
 */
export function generateTerranCommentary(context: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = context;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return `${playerName} 선수의 메카닉 유닛들이 중앙에서 ${opponentName} 선수와 힘싸움을 벌입니다! 탱크의 강력한 화력이 빛나고 있어요.`;
      } else if (battleLocation === "front") {
        return `${playerName} 선수가 앞마당 앞쪽에서 ${opponentName} 선수의 병력을 맞이합니다! 마린과 벌쳐의 조합이 효과적이네요.`;
      } else if (battleLocation === "multi") {
        return `${playerName} 선수가 ${opponentName} 선수의 멀티 기지를 공격합니다! 배럭에서 뽑은 마린들이 건물을 파괴하고 있어요.`;
      }
      return `${playerName} 선수의 테란 병력이 ${opponentName} 선수와 교전을 벌입니다!`;

    case "harass":
      return `${playerName} 선수의 벌쳐가 ${opponentName} 선수의 자원 채취지를 견제합니다! 마인을 깔면서 상대 경제를 흔들고 있어요.`;

    case "resource_drain":
      return `${playerName} 선수의 지속적인 견제로 ${opponentName} 선수의 자원 수급이 크게 줄어들고 있습니다. 테란의 견제 플레이가 먹혀들고 있네요.`;

    case "multi_destroy":
      return `${playerName} 선수의 공격대가 ${opponentName} 선수의 멀티 기지를 완전히 파괴했습니다! 배럭과 팩토리에서 나온 병력들이 건물을 모두 부수고 있어요.`;

    case "tech_upgrade":
      return `${playerName} 선수가 공격력 업그레이드를 완료했습니다! 이제 마린과 탱크의 화력이 한층 더 강해질 것 같습니다.`;

    default:
      return `${playerName} 선수의 테란이 경제를 다지고 있습니다.`;
  }
}

/**
 * 프로토스 특화 해설
 */
export function generateProtossCommentary(context: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = context;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return `${playerName} 선수의 프로토스 병력이 중앙에서 ${opponentName} 선수와 대치합니다! 질럿의 강력한 공격력과 드래군의 원거리 공격이 조화를 이루고 있어요.`;
      } else if (battleLocation === "front") {
        return `${playerName} 선수가 앞마당 앞쪽에서 ${opponentName} 선수의 병력을 방어합니다! 포톤캐논의 강력한 방어력이 도움이 되고 있네요.`;
      } else if (battleLocation === "multi") {
        return `${playerName} 선수가 ${opponentName} 선수의 멀티 기지를 공격합니다! 질럿들이 건물을 부수고 있어요.`;
      }
      return `${playerName} 선수의 프로토스 병력이 ${opponentName} 선수와 교전을 벌입니다!`;

    case "harass":
      return `${playerName} 선수의 질럿이 ${opponentName} 선수의 자원 채취지를 견제합니다! 강력한 공격력으로 상대 경제를 흔들고 있어요.`;

    case "resource_drain":
      return `${playerName} 선수의 지속적인 견제로 ${opponentName} 선수의 자원 수급이 크게 줄어들고 있습니다. 프로토스의 초반 견제가 효과적이네요.`;

    case "multi_destroy":
      return `${playerName} 선수의 공격대가 ${opponentName} 선수의 멀티 기지를 완전히 파괴했습니다! 질럿과 드래군이 건물을 모두 부수고 있어요.`;

    case "tech_upgrade":
      return `${playerName} 선수가 공격력 업그레이드를 완료했습니다! 이제 질럿과 드래군의 공격력이 한층 더 강해질 것 같습니다.`;

    default:
      return `${playerName} 선수의 프로토스가 기술을 다지고 있습니다.`;
  }
}

/**
 * 저그 특화 해설
 */
export function generateZergCommentary(context: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = context;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return `${playerName} 선수의 저그 병력이 중앙에서 ${opponentName} 선수와 힘싸움을 벌입니다! 저글링의 물량과 뮤탈리스크의 기동력이 빛나고 있어요.`;
      } else if (battleLocation === "front") {
        return `${playerName} 선수가 앞마당 앞쪽에서 ${opponentName} 선수의 병력을 맞이합니다! 저글링의 빠른 속도로 상대를 압박하고 있네요.`;
      } else if (battleLocation === "multi") {
        return `${playerName} 선수가 ${opponentName} 선수의 멀티 기지를 공격합니다! 저글링 떼가 건물을 부수고 있어요.`;
      }
      return `${playerName} 선수의 저그 병력이 ${opponentName} 선수와 교전을 벌입니다!`;

    case "harass":
      return `${playerName} 선수의 저글링이 ${opponentName} 선수의 자원 채취지를 견제합니다! 물량으로 상대 경제를 흔들고 있어요.`;

    case "resource_drain":
      return `${playerName} 선수의 지속적인 견제로 ${opponentName} 선수의 자원 수급이 크게 줄어들고 있습니다. 저그의 물량 견제가 먹혀들고 있네요.`;

    case "multi_destroy":
      return `${playerName} 선수의 공격대가 ${opponentName} 선수의 멀티 기지를 완전히 파괴했습니다! 저글링 떼와 뮤탈리스크가 건물을 모두 부수고 있어요.`;

    case "tech_upgrade":
      return `${playerName} 선수가 공격력 업그레이드를 완료했습니다! 이제 저글링과 뮤탈리스크의 공격력이 한층 더 강해질 것 같습니다.`;

    default:
      return `${playerName} 선수의 저그가 드론 경제를 다지고 있습니다.`;
  }
}

/**
 * 종족별 해설 생성
 */
export function generateRaceSpecificCommentary(context: CommentaryContext, eventType: string): string {
  switch (context.playerRace) {
    case "terran":
      return generateTerranCommentary(context, eventType);
    case "protoss":
      return generateProtossCommentary(context, eventType);
    case "zerg":
      return generateZergCommentary(context, eventType);
    default:
      return `${context.playerName} 선수가 게임을 진행하고 있습니다.`;
  }
}

/**
 * 중립 해설 (교전, 게임 종료 등)
 */
export function generateNeutralCommentary(context: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, playerAdvantage } = context;

  switch (eventType) {
    case "engagement_result":
      if (playerAdvantage > 60) {
        return `${playerName} 선수가 교전에서 우위를 점했습니다! ${opponentName} 선수의 병력이 큰 손실을 입었어요.`;
      } else if (playerAdvantage < 40) {
        return `${opponentName} 선수가 교전에서 우위를 점했습니다! ${playerName} 선수의 병력이 큰 손실을 입었어요.`;
      }
      return `양 선수 모두 교전에서 손실을 입었습니다. 아직 승패가 결정되지 않았네요.`;

    case "game_end":
      if (playerAdvantage > 50) {
        return `${playerName} 선수가 게임을 승리했습니다! 우수한 경제 운영과 전술로 상대를 압도했어요.`;
      } else {
        return `${opponentName} 선수가 게임을 승리했습니다! 우수한 경제 운영과 전술로 상대를 압도했어요.`;
      }

    case "situation_close":
      return `양 선수 모두 신중하게 플레이하고 있습니다. 아직 결정적인 순간이 없네요.`;

    case "situation_balanced":
      return `경기가 팽팽하게 진행 중입니다. 양 팀 모두 기회를 노리고 있어요.`;

    default:
      return `게임이 진행 중입니다.`;
  }
}

/**
 * 전투 위치 결정
 */
export function determineBattleLocation(): BattleLocation {
  const random = Math.random();
  if (random < 0.4) return "center";
  if (random < 0.7) return "front";
  if (random < 0.9) return "multi";
  return "main";
}
