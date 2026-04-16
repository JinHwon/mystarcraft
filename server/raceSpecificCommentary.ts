/**
 * 종족별 상세 해설 시스템 - v14.0
 * 
 * 스타크래프트1 프로리그 수준의 전문 해설
 * 종족전별 빌드오더, 유닛 상성, 전략적 맥락을 반영한 해설
 */

export type Race = "terran" | "protoss" | "zerg";
export type BattleLocation = "center" | "front" | "multi" | "main";
export type Matchup = "TvP" | "TvZ" | "TvT" | "PvZ" | "PvP" | "ZvZ" | "PvT" | "ZvT" | "ZvP";

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

function getMatchup(playerRace: Race, opponentRace: Race): Matchup {
  const map: Record<string, Matchup> = {
    "terran-protoss": "TvP", "terran-zerg": "TvZ", "terran-terran": "TvT",
    "protoss-zerg": "PvZ", "protoss-protoss": "PvP", "protoss-terran": "PvT",
    "zerg-terran": "ZvT", "zerg-protoss": "ZvP", "zerg-zerg": "ZvZ",
  };
  return map[`${playerRace}-${opponentRace}`] || "TvP";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── 테란 종족전별 전문 해설 ──

function terranVsProtoss(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = ctx;
  const supplyLead = playerSupply > opponentSupply;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return pick([
          `${playerName} 선수의 시즈탱크가 시즈모드를 펼치고 중앙에서 ${opponentName} 선수의 드래군 부대와 정면 대치! 탱크 라인이 깔린 상태에서 프로토스가 쉽게 접근하기 어렵습니다.`,
          `${playerName} 선수, 마린 메딕 조합에 시즈탱크를 섞어서 중앙 고지를 선점했습니다! ${opponentName} 선수의 질럿 드래군이 언덕 아래에서 올려다보고 있는 형국이네요.`,
          `${playerName} 선수의 메카닉 부대가 중앙에서 포진! 시즈탱크의 스플래시 데미지가 ${opponentName} 선수의 질럿 뭉치를 녹이고 있습니다!`,
        ]);
      } else if (battleLocation === "front") {
        return pick([
          `${playerName} 선수가 벙커를 앞마당에 짓고 마린을 넣어서 ${opponentName} 선수의 질럿 러쉬를 방어합니다! 테란의 전형적인 앞마당 방어 플레이네요.`,
          `${playerName} 선수의 시즈탱크가 앞마당 입구에서 시즈모드! ${opponentName} 선수의 드래군이 사거리 밖에서 견제를 시도하지만 탱크 화력이 너무 강합니다.`,
        ]);
      } else if (battleLocation === "multi") {
        return pick([
          `${playerName} 선수의 벌쳐가 스파이더 마인을 깔면서 ${opponentName} 선수의 멀티 프로브 라인을 급습! TvP에서 벌쳐 견제는 정말 효과적이죠.`,
          `${playerName} 선수가 드랍십으로 ${opponentName} 선수의 멀티에 마린 메딕을 투하! 프로토스 입장에서 가장 싫어하는 멀티 드랍이 들어갔습니다!`,
        ]);
      }
      return `${playerName} 선수의 마린 메딕 탱크 조합이 ${opponentName} 선수의 프로토스 병력과 격돌! TvP 정면 싸움에서는 시즈탱크의 포지셔닝이 핵심입니다.`;

    case "harass":
      return pick([
        `${playerName} 선수의 벌쳐가 ${opponentName} 선수의 프로브 라인을 급습합니다! 스파이더 마인까지 깔아놓으면서 프로토스 경제에 큰 타격을 주고 있어요. TvP에서 벌쳐 견제는 필수죠.`,
        `${playerName} 선수가 드랍십에 마린 메딕을 태워서 ${opponentName} 선수의 본진 뒤쪽으로 침투! 프로브를 잡으면서 경제를 흔들고 있습니다.`,
        `${playerName} 선수의 벌쳐 2~3기가 ${opponentName} 선수의 멀티 입구에 마인을 매설! 프로토스 유닛이 지나갈 때마다 마인이 터지면서 피해가 누적되고 있네요.`,
      ]);

    case "resource_drain":
      return pick([
        `${playerName} 선수의 지속적인 벌쳐 견제로 ${opponentName} 선수의 프로브 수가 크게 줄었습니다. 프로토스는 프로브가 줄면 고급 유닛 테크로 가기가 정말 힘들어지죠.`,
        `${playerName} 선수의 멀티 견제가 계속되면서 ${opponentName} 선수의 자원 수급이 크게 떨어지고 있습니다. 이러면 리버나 하이템플러 같은 고급 유닛을 뽑기 어려워집니다.`,
      ]);

    case "multi_destroy":
      return pick([
        `${playerName} 선수가 ${opponentName} 선수의 넥서스를 파괴했습니다! 프로토스는 넥서스 하나 잃으면 경제적 타격이 정말 크죠. 게이트웨이 추가도 힘들어집니다.`,
        `${playerName} 선수의 시즈탱크 푸시로 ${opponentName} 선수의 멀티 넥서스가 무너졌습니다! 이제 프로토스가 자원 열세에 몰리게 됩니다.`,
      ]);

    case "tech_upgrade":
      return pick([
        `${playerName} 선수가 무기고에서 마린 사거리 업그레이드를 올립니다! 사거리 업 마린은 드래군과의 교전에서 훨씬 유리해지죠.`,
        `${playerName} 선수가 공격력 업그레이드를 완료! 시즈탱크의 화력이 한층 더 강해져서 프로토스 유닛을 더 빨리 녹일 수 있게 됩니다.`,
      ]);

    default:
      return `${playerName} 선수가 TvP 경기에서 경제를 다지며 시즈탱크 테크를 준비하고 있습니다.`;
  }
}

function terranVsZerg(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = ctx;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return pick([
          `${playerName} 선수의 마린 메딕 부대가 중앙에서 ${opponentName} 선수의 저글링 럴커와 정면 대치! 스캔으로 럴커를 잡아내면서 시즈탱크가 포격을 가합니다!`,
          `${playerName} 선수의 시즈탱크 라인이 중앙에 깔렸습니다! ${opponentName} 선수의 뮤탈리스크가 측면에서 견제를 시도하지만 터렛과 골리앗이 방어하고 있네요.`,
          `${playerName} 선수, 마린 메딕에 사이언스 베슬까지 붙여서 중앙 진출! 이레디에이트로 ${opponentName} 선수의 뮤탈 뭉치를 견제하면서 전진합니다!`,
        ]);
      } else if (battleLocation === "front") {
        return pick([
          `${playerName} 선수가 벙커 2개를 앞마당에 완성! ${opponentName} 선수의 초반 저글링 러쉬를 완벽하게 막아냅니다. TvZ에서 벙커 타이밍이 정말 중요하죠.`,
          `${playerName} 선수의 앞마당 시즈탱크가 ${opponentName} 선수의 저글링 물량을 시즈모드로 녹이고 있습니다! 저그 입장에서 시즈탱크 라인을 뚫기가 정말 어렵습니다.`,
        ]);
      } else if (battleLocation === "multi") {
        return pick([
          `${playerName} 선수의 벌쳐가 ${opponentName} 선수의 3멀티 드론 라인을 급습! TvZ에서 벌쳐의 드론 학살은 저그에게 치명적이죠.`,
          `${playerName} 선수가 드랍십으로 ${opponentName} 선수의 멀티에 마린 메딕을 투하! 드론을 잡으면서 해처리까지 위협하고 있습니다!`,
        ]);
      }
      return `${playerName} 선수의 마린 메딕 시즈탱크 조합이 ${opponentName} 선수의 저그 병력과 격돌! TvZ에서는 포지셔닝과 스캔 타이밍이 승부를 가릅니다.`;

    case "harass":
      return pick([
        `${playerName} 선수의 벌쳐가 ${opponentName} 선수의 드론 라인을 급습! 스파이더 마인을 깔아놓으면서 저그의 경제를 흔들고 있습니다. TvZ에서 벌쳐 견제는 게임을 좌우하죠.`,
        `${playerName} 선수가 벌쳐 3기로 ${opponentName} 선수의 3멀티를 동시에 견제! 저그가 저글링을 분산 배치해야 하는 상황이 만들어졌습니다.`,
        `${playerName} 선수의 드랍십이 ${opponentName} 선수의 본진 뒤쪽에 마린을 투하! 스포어 콜로니가 없는 틈을 노린 정확한 타이밍이네요.`,
      ]);

    case "resource_drain":
      return pick([
        `${playerName} 선수의 벌쳐 견제로 ${opponentName} 선수의 드론 수가 급감! 저그는 드론이 줄면 라바도 줄어서 병력 생산에도 차질이 생기죠.`,
        `${playerName} 선수의 지속적인 멀티 견제로 ${opponentName} 선수의 가스 수급이 끊겼습니다. 뮤탈리스크나 럴커 같은 가스 유닛을 뽑기 힘들어지네요.`,
      ]);

    case "multi_destroy":
      return pick([
        `${playerName} 선수가 ${opponentName} 선수의 해처리를 파괴! 저그에게 해처리는 생산 시설이자 자원 기지라서 타격이 두 배로 큽니다.`,
        `${playerName} 선수의 시즈탱크 푸시로 ${opponentName} 선수의 3멀티 해처리가 무너졌습니다! 저그의 라바 수급이 크게 줄어들게 됩니다.`,
      ]);

    case "tech_upgrade":
      return pick([
        `${playerName} 선수가 사이언스 베슬 테크를 올립니다! 이레디에이트로 뮤탈리스크를 견제하고 디펜시브 매트릭스로 시즈탱크를 보호할 수 있게 되죠.`,
        `${playerName} 선수가 시즈모드 연구를 완료! 이제 저글링 물량을 시즈탱크로 녹일 수 있게 됩니다. TvZ의 핵심 테크죠.`,
      ]);

    default:
      return `${playerName} 선수가 TvZ 경기에서 벙커와 시즈탱크로 방어를 다지며 경제를 키우고 있습니다.`;
  }
}

function terranVsTerran(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, battleLocation } = ctx;

  switch (eventType) {
    case "engagement":
      return pick([
        `${playerName} 선수의 시즈탱크가 고지에서 시즈모드! ${opponentName} 선수의 탱크보다 먼저 자리를 잡았습니다. TvT에서는 탱크 포지션이 곧 승리죠.`,
        `${playerName} 선수와 ${opponentName} 선수의 시즈탱크끼리 포격전! TvT 탱크전은 한 발 차이로 승부가 갈리는 긴장감 넘치는 싸움입니다.`,
        `${playerName} 선수가 드랍십으로 ${opponentName} 선수의 탱크 라인 뒤쪽에 병력을 투하! TvT에서 드랍은 탱크 라인을 무력화하는 핵심 전술이죠.`,
      ]);
    case "harass":
      return pick([
        `${playerName} 선수의 벌쳐가 ${opponentName} 선수의 SCV 라인을 급습! TvT에서도 벌쳐 견제는 경제를 흔드는 좋은 수단입니다.`,
        `${playerName} 선수가 드랍십으로 ${opponentName} 선수의 본진에 마린을 투하! 탱크 라인 뒤를 노린 기습이네요.`,
      ]);
    default:
      return `${playerName} 선수가 TvT 경기에서 시즈탱크 포지션 싸움을 준비하고 있습니다.`;
  }
}

// ── 프로토스 종족전별 전문 해설 ──

function protossVsTerran(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = ctx;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return pick([
          `${playerName} 선수의 질럿 드래군 조합이 중앙에서 ${opponentName} 선수의 시즈탱크 라인에 돌격! 하이템플러의 사이오닉 스톰이 마린 뭉치를 녹이고 있습니다!`,
          `${playerName} 선수가 리버를 셔틀에 태워서 ${opponentName} 선수의 시즈탱크 라인 위로 스캐럽을 투하! PvT에서 리버 셔틀은 탱크 라인을 깨는 핵심 전술이죠.`,
          `${playerName} 선수의 아비터가 리콜로 ${opponentName} 선수의 본진에 병력을 소환! 프로토스의 리콜 전술이 작렬합니다!`,
        ]);
      } else if (battleLocation === "front") {
        return pick([
          `${playerName} 선수가 포톤캐논과 질럿으로 앞마당을 방어! ${opponentName} 선수의 마린 푸시를 막아내고 있습니다.`,
          `${playerName} 선수의 드래군이 앞마당에서 ${opponentName} 선수의 벌쳐를 저격! 사거리 업그레이드 드래군은 벌쳐 상대로 효과적이죠.`,
        ]);
      } else if (battleLocation === "multi") {
        return pick([
          `${playerName} 선수의 질럿이 ${opponentName} 선수의 멀티 SCV를 급습! 프로토스 질럿의 높은 공격력으로 SCV가 순식간에 녹고 있습니다.`,
          `${playerName} 선수가 다크템플러로 ${opponentName} 선수의 멀티를 기습! 코맷셋이 없으면 다크템플러를 잡을 수가 없죠.`,
        ]);
      }
      return `${playerName} 선수의 프로토스 병력이 ${opponentName} 선수의 테란과 격돌! PvT에서는 하이템플러의 스톰과 리버의 스캐럽이 핵심 딜링입니다.`;

    case "harass":
      return pick([
        `${playerName} 선수의 다크템플러가 ${opponentName} 선수의 SCV 라인을 급습! 코맷셋 에너지가 없으면 속수무책이죠. PvT에서 다크템플러 견제는 정말 강력합니다.`,
        `${playerName} 선수가 리버 셔틀로 ${opponentName} 선수의 멀티를 견제! 스캐럽 한 방에 SCV 여러 기가 날아갑니다.`,
        `${playerName} 선수의 질럿 2기가 ${opponentName} 선수의 앞마당 SCV를 견제! 질럿의 높은 공격력이 빛을 발하고 있네요.`,
      ]);

    case "resource_drain":
      return pick([
        `${playerName} 선수의 다크템플러 견제로 ${opponentName} 선수의 SCV 수가 크게 줄었습니다. 테란은 SCV가 줄면 미네랄 수급이 바로 떨어지죠.`,
        `${playerName} 선수의 리버 셔틀 견제가 계속되면서 ${opponentName} 선수의 경제가 흔들리고 있습니다. 테란이 팩토리 유닛을 뽑기 힘들어지네요.`,
      ]);

    case "multi_destroy":
      return pick([
        `${playerName} 선수가 ${opponentName} 선수의 커맨드센터를 파괴! 테란의 멀티가 날아가면서 자원 수급에 큰 차질이 생겼습니다.`,
        `${playerName} 선수의 질럿 드래군 푸시로 ${opponentName} 선수의 앞마당 커맨드센터가 무너졌습니다! 이제 테란이 본진 자원만으로 버텨야 합니다.`,
      ]);

    case "tech_upgrade":
      return pick([
        `${playerName} 선수가 템플러 아카이브에서 사이오닉 스톰 연구를 완료! 이제 마린 뭉치를 스톰 한 방으로 녹일 수 있게 됩니다. PvT의 핵심 테크죠.`,
        `${playerName} 선수가 질럿 다리 업그레이드를 완료! 이제 질럿이 벌쳐보다 빨라져서 견제와 전투 모두에서 활용도가 높아집니다.`,
        `${playerName} 선수가 아비터 테크를 올립니다! 리콜과 스테이시스 필드, 클로킹 필드까지 PvT 후반의 핵심 유닛이죠.`,
      ]);

    default:
      return `${playerName} 선수가 PvT 경기에서 드래군과 리버 테크를 준비하며 경제를 다지고 있습니다.`;
  }
}

function protossVsZerg(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = ctx;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return pick([
          `${playerName} 선수의 질럿 드래군 하이템플러 조합이 중앙에서 ${opponentName} 선수의 히드라 럴커와 격돌! 사이오닉 스톰이 히드라 뭉치를 녹이고 있습니다!`,
          `${playerName} 선수의 리버가 스캐럽으로 ${opponentName} 선수의 저글링 물량을 한 방에 쓸어버립니다! PvZ에서 리버는 저글링 상대로 최강이죠.`,
          `${playerName} 선수의 아칸이 ${opponentName} 선수의 저글링 떼를 스플래시로 녹이고 있습니다! 아칸은 저글링 상대로 압도적인 유닛이죠.`,
        ]);
      } else if (battleLocation === "front") {
        return pick([
          `${playerName} 선수가 포지 캐논으로 앞마당을 방어! ${opponentName} 선수의 저글링 러쉬를 막아내고 있습니다. PvZ 초반 포지 타이밍이 정말 중요하죠.`,
          `${playerName} 선수의 질럿이 앞마당 입구에서 ${opponentName} 선수의 저글링을 막고 있습니다! 좁은 입구에서 질럿의 높은 공격력이 빛나네요.`,
        ]);
      } else if (battleLocation === "multi") {
        return pick([
          `${playerName} 선수의 질럿이 ${opponentName} 선수의 3멀티 드론 라인을 급습! 질럿 2기만으로도 드론을 대량 학살할 수 있죠.`,
          `${playerName} 선수가 커세어로 ${opponentName} 선수의 오버로드를 사냥! PvZ에서 커세어는 저그의 시야를 빼앗는 핵심 유닛입니다.`,
        ]);
      }
      return `${playerName} 선수의 프로토스 병력이 ${opponentName} 선수의 저그와 격돌! PvZ에서는 스톰과 리버의 스플래시 데미지가 저그 물량을 상대하는 핵심입니다.`;

    case "harass":
      return pick([
        `${playerName} 선수의 커세어가 ${opponentName} 선수의 오버로드를 사냥하면서 시야를 빼앗고 있습니다! PvZ에서 커세어 견제는 저그의 정보력을 차단하는 핵심 전술이죠.`,
        `${playerName} 선수의 질럿 2기가 ${opponentName} 선수의 멀티 드론을 급습! 질럿의 높은 공격력으로 드론이 순식간에 녹고 있습니다.`,
        `${playerName} 선수가 다크템플러로 ${opponentName} 선수의 본진을 기습! 오버로드가 없는 지역이라 저그가 속수무책입니다.`,
      ]);

    case "resource_drain":
      return pick([
        `${playerName} 선수의 커세어 견제로 ${opponentName} 선수의 오버로드가 대부분 사라졌습니다. 저그는 오버로드 없이는 서플라이도 부족하고 시야도 없어서 정말 힘들어지죠.`,
        `${playerName} 선수의 지속적인 질럿 견제로 ${opponentName} 선수의 드론 수가 급감! 저그의 라바 생산에도 차질이 생기고 있습니다.`,
      ]);

    case "multi_destroy":
      return pick([
        `${playerName} 선수가 ${opponentName} 선수의 해처리를 파괴! 저그에게 해처리 하나는 라바 3개, 즉 병력 6기 이상의 생산력 손실이죠.`,
        `${playerName} 선수의 리버 셔틀이 ${opponentName} 선수의 멀티 해처리를 스캐럽으로 파괴! 저그의 경제와 생산력이 동시에 타격받았습니다.`,
      ]);

    case "tech_upgrade":
      return pick([
        `${playerName} 선수가 사이오닉 스톰 연구를 완료! PvZ에서 스톰은 히드라 뭉치를 녹이는 최강의 스킬이죠.`,
        `${playerName} 선수가 커세어 테크를 올립니다! 오버로드 사냥으로 저그의 시야와 서플라이를 동시에 압박할 수 있게 됩니다.`,
      ]);

    default:
      return `${playerName} 선수가 PvZ 경기에서 포지 캐논으로 방어하며 하이템플러 테크를 준비하고 있습니다.`;
  }
}

function protossVsProtoss(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, battleLocation } = ctx;

  switch (eventType) {
    case "engagement":
      return pick([
        `${playerName} 선수의 리버가 ${opponentName} 선수의 질럿 드래군 뭉치에 스캐럽을 투하! PvP에서 리버는 게임을 뒤집을 수 있는 핵심 유닛이죠.`,
        `${playerName} 선수와 ${opponentName} 선수의 드래군끼리 사거리 싸움! PvP 드래군전은 마이크로 컨트롤이 승부를 가릅니다.`,
        `${playerName} 선수의 질럿이 ${opponentName} 선수의 드래군 사이로 파고들어 근접전! PvP에서 질럿의 높은 공격력이 빛나는 순간입니다.`,
      ]);
    case "harass":
      return pick([
        `${playerName} 선수의 다크템플러가 ${opponentName} 선수의 프로브 라인을 급습! 옵저버가 없으면 다크템플러를 잡을 수 없죠. PvP에서 다크 러쉬는 게임을 끝낼 수 있습니다.`,
        `${playerName} 선수가 리버 셔틀로 ${opponentName} 선수의 멀티를 견제! 스캐럽 한 방에 프로브가 대량으로 날아갑니다.`,
      ]);
    default:
      return `${playerName} 선수가 PvP 경기에서 드래군과 리버 테크를 준비하고 있습니다.`;
  }
}

// ── 저그 종족전별 전문 해설 ──

function zergVsTerran(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = ctx;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return pick([
          `${playerName} 선수의 럴커가 중앙에서 버로우! ${opponentName} 선수의 마린 메딕 부대가 럴커의 스파인에 녹고 있습니다! 스캔이 없으면 럴커를 잡을 수가 없죠.`,
          `${playerName} 선수의 뮤탈리스크 편대가 ${opponentName} 선수의 시즈탱크 라인을 측면에서 급습! 뮤탈의 바운스 데미지가 시즈모드 탱크에 치명적입니다!`,
          `${playerName} 선수의 저글링 물량이 ${opponentName} 선수의 마린 라인을 둘러싸고 있습니다! 저글링 서라운드가 완벽하게 들어갔네요!`,
          `${playerName} 선수의 울트라리스크가 ${opponentName} 선수의 마린 메딕 라인을 돌파! 울트라의 높은 체력과 공격력 앞에 마린이 속수무책입니다.`,
        ]);
      } else if (battleLocation === "front") {
        return pick([
          `${playerName} 선수의 저글링이 ${opponentName} 선수의 앞마당 벙커를 둘러싸고 공격! 벙커가 무너지면 앞마당이 바로 뚫리는 상황입니다.`,
          `${playerName} 선수의 럴커가 ${opponentName} 선수의 앞마당 입구에서 버로우! 마린이 접근하면 스파인으로 녹이는 완벽한 포지션이네요.`,
        ]);
      } else if (battleLocation === "multi") {
        return pick([
          `${playerName} 선수의 뮤탈리스크가 ${opponentName} 선수의 멀티 SCV를 급습! 뮤탈의 빠른 이동속도로 터렛이 없는 멀티를 노렸습니다.`,
          `${playerName} 선수의 저글링이 ${opponentName} 선수의 3멀티를 급습! 벙커가 없는 멀티는 저글링 앞에 무방비 상태죠.`,
        ]);
      }
      return `${playerName} 선수의 저그 병력이 ${opponentName} 선수의 테란과 격돌! ZvT에서는 럴커와 뮤탈리스크의 조합이 테란의 시즈탱크 라인을 상대하는 핵심입니다.`;

    case "harass":
      return pick([
        `${playerName} 선수의 뮤탈리스크가 ${opponentName} 선수의 SCV 라인을 급습! 뮤탈의 바운스 데미지로 SCV가 연쇄적으로 녹고 있습니다. ZvT에서 뮤탈 견제는 정말 강력하죠.`,
        `${playerName} 선수의 저글링이 ${opponentName} 선수의 앞마당 뒤쪽으로 침투! 벙커 사각지대를 노린 정확한 견제입니다.`,
        `${playerName} 선수의 뮤탈리스크 5기가 ${opponentName} 선수의 멀티를 돌면서 SCV를 학살! 터렛이 올라오기 전에 최대한 피해를 주고 있네요.`,
      ]);

    case "resource_drain":
      return pick([
        `${playerName} 선수의 뮤탈리스크 견제로 ${opponentName} 선수의 SCV 수가 크게 줄었습니다. 테란은 SCV 없이는 미네랄도 가스도 캘 수 없으니 경제가 무너지고 있네요.`,
        `${playerName} 선수의 저글링 견제가 계속되면서 ${opponentName} 선수가 벙커와 터렛에 자원을 쏟아붓고 있습니다. 방어에 자원을 쓰느라 공격 유닛을 못 뽑는 악순환이죠.`,
      ]);

    case "multi_destroy":
      return pick([
        `${playerName} 선수가 ${opponentName} 선수의 커맨드센터를 파괴! 뮤탈리스크와 저글링의 협공으로 멀티가 순식간에 무너졌습니다.`,
        `${playerName} 선수의 저글링 물량이 ${opponentName} 선수의 앞마당 커맨드센터를 부수고 있습니다! 벙커가 무너진 후 저글링이 쏟아져 들어갔네요.`,
      ]);

    case "tech_upgrade":
      return pick([
        `${playerName} 선수가 럴커 테크를 올립니다! 히드라가 럴커로 변태하면 테란의 마린 메딕 조합을 상대하기 훨씬 수월해지죠.`,
        `${playerName} 선수가 뮤탈리스크 공격력 업그레이드를 완료! 이제 뮤탈의 바운스 데미지가 더 강해져서 SCV 학살이 더 빨라집니다.`,
        `${playerName} 선수가 아드레날린 글랜즈 연구를 완료! 저글링의 공격속도가 2배로 빨라져서 마린 상대로 훨씬 강해집니다.`,
      ]);

    default:
      return `${playerName} 선수가 ZvT 경기에서 드론 경제를 키우며 뮤탈리스크 테크를 준비하고 있습니다.`;
  }
}

function zergVsProtoss(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, battleLocation } = ctx;

  switch (eventType) {
    case "engagement":
      if (battleLocation === "center") {
        return pick([
          `${playerName} 선수의 히드라리스크 부대가 중앙에서 ${opponentName} 선수의 질럿 드래군과 격돌! 히드라의 집중 사격이 드래군을 빠르게 녹이고 있습니다!`,
          `${playerName} 선수의 럴커가 중앙에서 버로우! ${opponentName} 선수의 질럿이 럴커의 스파인에 녹고 있습니다. 옵저버가 없으면 럴커를 잡을 수 없죠.`,
          `${playerName} 선수의 뮤탈리스크 편대가 ${opponentName} 선수의 드래군 부대 위를 날면서 견제! ZvP에서 뮤탈의 기동력은 프로토스에게 큰 위협이죠.`,
        ]);
      } else if (battleLocation === "front") {
        return pick([
          `${playerName} 선수의 저글링이 ${opponentName} 선수의 앞마당 포지 캐논을 우회해서 프로브를 급습! 캐논 사각지대를 정확히 노렸네요.`,
          `${playerName} 선수의 히드라리스크가 ${opponentName} 선수의 앞마당에서 드래군과 사거리 싸움! 히드라의 빠른 공격속도가 빛나고 있습니다.`,
        ]);
      } else if (battleLocation === "multi") {
        return pick([
          `${playerName} 선수의 뮤탈리스크가 ${opponentName} 선수의 멀티 프로브를 급습! 커세어가 없는 틈을 노린 정확한 타이밍이네요.`,
          `${playerName} 선수의 저글링이 ${opponentName} 선수의 3멀티를 급습! 포지 캐논이 없는 멀티는 저글링 앞에 무방비 상태입니다.`,
        ]);
      }
      return `${playerName} 선수의 저그 병력이 ${opponentName} 선수의 프로토스와 격돌! ZvP에서는 히드라 럴커 조합으로 프로토스의 지상군을 상대하는 것이 핵심입니다.`;

    case "harass":
      return pick([
        `${playerName} 선수의 뮤탈리스크가 ${opponentName} 선수의 프로브 라인을 급습! ZvP에서 뮤탈 견제는 프로토스의 경제를 흔드는 핵심 전술이죠.`,
        `${playerName} 선수의 저글링이 ${opponentName} 선수의 멀티 프로브를 견제! 포지 캐논 사각지대를 노린 정확한 타이밍입니다.`,
        `${playerName} 선수의 스커지가 ${opponentName} 선수의 커세어를 격추! 커세어가 없어지면 뮤탈리스크가 자유롭게 견제할 수 있게 되죠.`,
      ]);

    case "resource_drain":
      return pick([
        `${playerName} 선수의 뮤탈리스크 견제로 ${opponentName} 선수의 프로브 수가 급감! 프로토스는 프로브가 줄면 고급 유닛 테크가 늦어지죠.`,
        `${playerName} 선수의 지속적인 견제로 ${opponentName} 선수가 포지 캐논에 자원을 쏟아붓고 있습니다. 방어에 자원을 쓰느라 공격 유닛이 부족해지는 상황이네요.`,
      ]);

    case "multi_destroy":
      return pick([
        `${playerName} 선수가 ${opponentName} 선수의 넥서스를 파괴! 히드라 럴커의 협공으로 멀티가 순식간에 무너졌습니다.`,
        `${playerName} 선수의 저글링 물량이 ${opponentName} 선수의 멀티 넥서스를 부수고 있습니다! 포지 캐논이 무너진 후 저글링이 쏟아져 들어갔네요.`,
      ]);

    case "tech_upgrade":
      return pick([
        `${playerName} 선수가 럴커 테크를 올립니다! ZvP에서 럴커는 질럿을 상대하는 최강의 유닛이죠. 옵저버 없이는 잡을 수가 없습니다.`,
        `${playerName} 선수가 히드라 사거리 업그레이드를 완료! 이제 드래군과의 사거리 싸움에서 히드라가 유리해집니다.`,
      ]);

    default:
      return `${playerName} 선수가 ZvP 경기에서 드론 경제를 키우며 히드라 럴커 테크를 준비하고 있습니다.`;
  }
}

function zergVsZerg(ctx: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, battleLocation } = ctx;

  switch (eventType) {
    case "engagement":
      return pick([
        `${playerName} 선수의 뮤탈리스크가 ${opponentName} 선수의 뮤탈리스크와 공중전! ZvZ 뮤탈전은 마이크로 컨트롤이 승부를 가르는 치열한 싸움이죠.`,
        `${playerName} 선수의 저글링이 ${opponentName} 선수의 저글링과 정면 대치! ZvZ 저글링전은 서라운드와 포지셔닝이 핵심입니다.`,
        `${playerName} 선수의 스커지가 ${opponentName} 선수의 뮤탈리스크를 격추! ZvZ에서 스커지는 뮤탈 카운터의 핵심이죠.`,
      ]);
    case "harass":
      return pick([
        `${playerName} 선수의 뮤탈리스크가 ${opponentName} 선수의 드론 라인을 급습! ZvZ에서 뮤탈 견제는 경제를 흔드는 핵심 전술입니다.`,
        `${playerName} 선수의 저글링이 ${opponentName} 선수의 멀티 드론을 견제! 선충이 없는 멀티는 저글링 앞에 무방비 상태죠.`,
      ]);
    default:
      return `${playerName} 선수가 ZvZ 경기에서 뮤탈리스크 테크를 준비하며 드론 경제를 키우고 있습니다.`;
  }
}

// ── 메인 해설 라우터 ──

/**
 * 테란 특화 해설 (종족전별 분기)
 */
export function generateTerranCommentary(context: CommentaryContext, eventType: string): string {
  switch (context.opponentRace) {
    case "protoss": return terranVsProtoss(context, eventType);
    case "zerg": return terranVsZerg(context, eventType);
    case "terran": return terranVsTerran(context, eventType);
    default: return `${context.playerName} 선수의 테란이 경기를 진행하고 있습니다.`;
  }
}

/**
 * 프로토스 특화 해설 (종족전별 분기)
 */
export function generateProtossCommentary(context: CommentaryContext, eventType: string): string {
  switch (context.opponentRace) {
    case "terran": return protossVsTerran(context, eventType);
    case "zerg": return protossVsZerg(context, eventType);
    case "protoss": return protossVsProtoss(context, eventType);
    default: return `${context.playerName} 선수의 프로토스가 경기를 진행하고 있습니다.`;
  }
}

/**
 * 저그 특화 해설 (종족전별 분기)
 */
export function generateZergCommentary(context: CommentaryContext, eventType: string): string {
  switch (context.opponentRace) {
    case "terran": return zergVsTerran(context, eventType);
    case "protoss": return zergVsProtoss(context, eventType);
    case "zerg": return zergVsZerg(context, eventType);
    default: return `${context.playerName} 선수의 저그가 경기를 진행하고 있습니다.`;
  }
}

/**
 * 종족별 해설 생성
 */
export function generateRaceSpecificCommentary(context: CommentaryContext, eventType: string): string {
  switch (context.playerRace) {
    case "terran": return generateTerranCommentary(context, eventType);
    case "protoss": return generateProtossCommentary(context, eventType);
    case "zerg": return generateZergCommentary(context, eventType);
    default: return `${context.playerName} 선수가 게임을 진행하고 있습니다.`;
  }
}

/**
 * 중립 해설 (교전 결과, 게임 종료 등) - 종족전 맥락 반영
 */
export function generateNeutralCommentary(context: CommentaryContext, eventType: string): string {
  const { playerName, opponentName, playerSupply, opponentSupply, playerAdvantage, playerRace, opponentRace } = context;
  const matchup = getMatchup(playerRace, opponentRace);

  switch (eventType) {
    case "engagement_result":
      if (playerAdvantage > 60) {
        const supplyDiff = playerSupply - opponentSupply;
        if (supplyDiff > 50) {
          return pick([
            `${playerName} 선수가 교전에서 대승! 병력 차이가 ${Math.round(supplyDiff)}이나 벌어졌습니다. 이 정도 병력 차이면 다음 교전도 유리하겠네요.`,
            `${playerName} 선수의 압도적인 승리! 상대 병력을 대량으로 소모시키면서 게임의 주도권을 완전히 가져왔습니다.`,
          ]);
        }
        return pick([
          `${playerName} 선수가 교전에서 우위를 점했습니다! ${opponentName} 선수의 병력이 큰 손실을 입었어요.`,
          `${playerName} 선수의 승리! 이 교전으로 병력 차이가 더 벌어졌습니다. ${opponentName} 선수가 빠르게 병력을 보충해야 합니다.`,
        ]);
      } else if (playerAdvantage < 40) {
        return pick([
          `${opponentName} 선수가 교전에서 우위를 점했습니다! ${playerName} 선수의 병력이 큰 손실을 입었어요.`,
          `${opponentName} 선수의 승리! 이 교전으로 게임의 흐름이 바뀔 수 있는 중요한 순간이었습니다.`,
        ]);
      }
      return pick([
        `양 선수 모두 교전에서 손실을 입었습니다. 아직 승패가 결정되지 않았네요. 누가 먼저 병력을 보충하느냐가 관건입니다.`,
        `치열한 교전이었습니다! 양쪽 모두 병력 손실이 크네요. 이제 자원과 생산기지가 많은 쪽이 유리해집니다.`,
      ]);

    case "game_end":
      if (playerAdvantage > 50) {
        return pick([
          `${playerName} 선수가 ${matchup} 경기에서 승리! 우수한 경제 운영과 병력 운용으로 상대를 압도했습니다. GG!`,
          `${playerName} 선수의 승리! 멀티 확장으로 자원을 확보하고 생산기지에서 병력을 쏟아내면서 결국 상대를 무너뜨렸습니다.`,
        ]);
      } else {
        return pick([
          `${opponentName} 선수가 ${matchup} 경기에서 승리! 우수한 경제 운영과 병력 운용으로 상대를 압도했습니다. GG!`,
          `${opponentName} 선수의 승리! 효율적인 자원 관리와 전투에서의 우위로 경기를 가져갔습니다.`,
        ]);
      }

    case "situation_close":
      return pick([
        `양 선수 모두 신중하게 플레이하고 있습니다. 멀티를 먹고 생산기지를 늘려서 병력을 확보하는 쪽이 유리해질 것 같네요.`,
        `아직 결정적인 순간이 없습니다. 양쪽 모두 경제를 키우면서 대규모 교전을 준비하고 있어요.`,
      ]);

    case "situation_balanced":
      return pick([
        `경기가 팽팽하게 진행 중입니다. 자원 확보와 병력 생산 속도가 승부를 가를 것 같네요.`,
        `양 팀 모두 기회를 노리고 있습니다. 다음 대규모 교전이 게임의 분수령이 될 것 같아요.`,
      ]);

    default:
      return `${matchup} 경기가 진행 중입니다.`;
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