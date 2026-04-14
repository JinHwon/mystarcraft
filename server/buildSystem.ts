import { StatKey } from "@shared/gameConstants";

/**
 * 플레이어 빌드 타입
 */
export type BuildType = "macro" | "aggressive" | "balanced";

/**
 * 빌드 정보
 */
export interface BuildInfo {
  type: BuildType;
  name: string;
  description: string;
  supplyPerTurn: number;
  resourcesPerTurn: number;
  healthLossPerTurn: number;
  aggressiveness: number; // 0-100, 높을수록 공격적
}

/**
 * 맵 특성
 */
export type MapCharacteristic = "balanced" | "resource-rich" | "rush-distance" | "complex-terrain";

/**
 * 능력치 기반 빌드 결정
 * 
 * 센스, 컨트롤, 물량, 수비력이 높으면 매크로 빌드 (멀티, 수비 중심)
 * 공격력, 견제, 전략, 정찰이 높으면 공격 빌드 (러쉬, 견제 중심)
 */
export function determineBuild(
  stats: Record<StatKey, number>,
  mapCharacteristic: MapCharacteristic
): BuildInfo {
  // 능력치 분류
  const macroStats = (stats.sense || 0) + (stats.control || 0) + (stats.supply || 0) + (stats.defense || 0);
  const aggressiveStats = (stats.attack || 0) + (stats.harassment || 0) + (stats.strategy || 0) + (stats.scout || 0);
  
  const totalStats = macroStats + aggressiveStats;
  const macroRatio = totalStats > 0 ? macroStats / totalStats : 0.5;
  
  // 맵 특성에 따른 조정
  let buildType: BuildType;
  
  if (mapCharacteristic === "balanced" || mapCharacteristic === "resource-rich") {
    // 균형잡힌 맵이나 자원 풍부한 맵: 센스/컨트롤/물량/수비가 유리
    buildType = macroRatio > 0.6 ? "macro" : macroRatio > 0.4 ? "balanced" : "aggressive";
  } else if (mapCharacteristic === "rush-distance" || mapCharacteristic === "complex-terrain") {
    // 러쉬거리 가깝거나 지형 복잡: 공격력/견제/전략/정찰이 유리
    buildType = aggressiveStats > macroStats ? "aggressive" : macroRatio > 0.4 ? "balanced" : "macro";
  } else {
    buildType = macroRatio > 0.5 ? "macro" : "aggressive";
  }
  
  // 빌드 정보 반환
  return getBuildInfo(buildType, stats);
}

/**
 * 빌드 타입에 따른 상세 정보
 */
function getBuildInfo(buildType: BuildType, stats: Record<StatKey, number>): BuildInfo {
  const baseStats = {
    macro: {
      name: "경제 빌드",
      description: "멀티 확보와 수비 중심의 안정적인 플레이",
      supplyPerTurn: 3,
      resourcesPerTurn: 8,
      healthLossPerTurn: 1,
      aggressiveness: 20,
    },
    aggressive: {
      name: "공격 빌드",
      description: "초반 러쉬와 견제를 통한 공격적인 플레이",
      supplyPerTurn: 5,
      resourcesPerTurn: 5,
      healthLossPerTurn: 3,
      aggressiveness: 80,
    },
    balanced: {
      name: "균형 빌드",
      description: "경제와 공격의 균형을 맞춘 유연한 플레이",
      supplyPerTurn: 4,
      resourcesPerTurn: 6,
      healthLossPerTurn: 2,
      aggressiveness: 50,
    },
  };
  
  const base = baseStats[buildType];
  
  // 능력치에 따른 미세 조정
  const controlBonus = (stats.control || 0) / 100;
  const supplyBonus = (stats.supply || 0) / 100;
  const defenseBonus = (stats.defense || 0) / 100;
  const attackBonus = (stats.attack || 0) / 100;
  
  return {
    type: buildType,
    name: base.name,
    description: base.description,
    supplyPerTurn: Math.round(base.supplyPerTurn * (1 + supplyBonus * 0.3)),
    resourcesPerTurn: Math.round(base.resourcesPerTurn * (1 + controlBonus * 0.2)),
    healthLossPerTurn: Math.max(0, base.healthLossPerTurn - defenseBonus * 0.5),
    aggressiveness: Math.min(100, base.aggressiveness + attackBonus * 0.2),
  };
}

/**
 * 스타크래프트 빌드 기반 해설 생성
 */
export function generateBuildCommentary(
  turn: number,
  maxTurns: number,
  buildType: BuildType,
  race: "terran" | "zerg" | "protoss",
  isWinning: boolean,
  buildInfo: BuildInfo
): string {
  const phase = turn <= maxTurns / 3 ? "early" : turn <= (maxTurns * 2) / 3 ? "mid" : "late";
  
  // 종족별 빌드 해설
  const buildCommentaries = {
    terran: {
      macro: {
        early: [
          "테란이 안정적인 초반 빌드를 시작합니다. 배럭을 지으며 마린 생산을 준비하고 있습니다.",
          "테란이 빠른 확장을 노리고 있습니다. 본진 수비를 최소화하며 경제력 확보에 집중합니다.",
          "테란이 터렛을 배치하며 방어선을 구축하고 있습니다. 안정적인 초반 운영입니다.",
        ],
        mid: [
          "테란이 멀티를 확보했습니다. 이제 경제력을 바탕으로 병력을 모으고 있습니다.",
          "테란이 팩토리를 추가로 지으며 유닛 다양화를 시도합니다. 탱크와 벌쳐 조합을 준비 중입니다.",
          "테란이 드롭십을 준비하고 있습니다. 견제와 멀티 방어를 동시에 노리는 전략입니다.",
        ],
        late: [
          "테란의 경제력이 우위를 점하고 있습니다. 대규모 병력을 모아 최종 공격을 준비합니다.",
          "테란이 배틀크루저를 생산하기 시작했습니다. 게임 후반으로 접어듭니다.",
        ],
      },
      aggressive: {
        early: [
          "테란이 초반 러쉬를 시도합니다! 마린을 빠르게 모아 상대 본진을 위협하고 있습니다.",
          "테란이 벌쳐 러쉬를 준비하고 있습니다. 빠른 팩토리 건설로 공격적인 플레이를 노립니다.",
        ],
        mid: [
          "테란이 계속해서 견제를 이어갑니다. 상대의 멀티를 괴롭히며 경제력 격차를 벌립니다.",
          "테란이 탱크를 앞세워 진격하고 있습니다. 공격적인 포지셔닝으로 주도권을 유지합니다.",
        ],
        late: [
          "테란이 지속적인 압박으로 상대를 몰아붙이고 있습니다. 최종 승리를 노립니다.",
        ],
      },
      balanced: {
        early: [
          "테란이 초반을 안정적으로 넘기고 있습니다. 적절한 방어와 경제의 균형을 맞추고 있습니다.",
        ],
        mid: [
          "테란이 상황에 맞춰 유연하게 대응하고 있습니다. 필요하면 공격, 필요하면 수비합니다.",
        ],
        late: [
          "테란이 게임을 잘 컨트롤하고 있습니다. 경험과 판단력으로 우위를 점하고 있습니다.",
        ],
      },
    },
    zerg: {
      macro: {
        early: [
          "저그가 드론을 계속 생산하며 경제력을 쌓고 있습니다. 안정적인 초반 운영입니다.",
          "저그가 해처리를 추가로 지으며 멀티 확보를 준비합니다. 물량 전략을 노리고 있습니다.",
        ],
        mid: [
          "저그의 경제력이 우수해집니다. 뮤탈리스크와 링링 조합으로 견제를 시작합니다.",
          "저그가 스팀팩을 연구하며 유닛 강화에 집중합니다. 물량과 스피드의 조합입니다.",
        ],
        late: [
          "저그가 대규모 물량을 모았습니다. 뮤탈리스크 무리와 링링으로 압박합니다.",
        ],
      },
      aggressive: {
        early: [
          "저그가 초반 러쉬를 시도합니다! 링링을 빠르게 모아 상대를 괴롭히고 있습니다.",
          "저그가 뮤탈리스크 러쉬를 준비합니다. 빠른 에어 유닛으로 공중 우위를 노립니다.",
        ],
        mid: [
          "저그가 계속해서 상대를 압박합니다. 링링과 뮤탈의 조합으로 주도권을 유지합니다.",
        ],
        late: [
          "저그의 물량이 상대를 압도합니다. 최종 승리를 목전에 두고 있습니다.",
        ],
      },
      balanced: {
        early: [
          "저그가 초반을 잘 넘기고 있습니다. 경제와 방어의 균형을 맞추고 있습니다.",
        ],
        mid: [
          "저그가 상황에 맞춰 대응하고 있습니다. 필요한 유닛을 빠르게 생산합니다.",
        ],
        late: [
          "저그가 게임을 잘 컨트롤하고 있습니다. 물량과 스피드로 우위를 점하고 있습니다.",
        ],
      },
    },
    protoss: {
      macro: {
        early: [
          "프로토스가 안정적인 초반을 구축합니다. 포톤캐논으로 방어선을 만들고 있습니다.",
          "프로토스가 빠른 확장을 노립니다. 게이트웨이를 추가로 지으며 경제력을 확보합니다.",
        ],
        mid: [
          "프로토스가 드라군으로 병력을 모으고 있습니다. 안정적인 중반 운영입니다.",
          "프로토스가 템플러 아카이브를 지으며 고급 유닛 생산을 준비합니다.",
        ],
        late: [
          "프로토스가 고급 유닛을 생산하기 시작합니다. 아비터와 캐리어로 최종 공격을 준비합니다.",
        ],
      },
      aggressive: {
        early: [
          "프로토스가 초반 질럿 러쉬를 시도합니다! 빠른 게이트웨이로 공격적인 플레이를 노립니다.",
          "프로토스가 2게이트 러쉬를 준비하고 있습니다. 초반 압박이 시작됩니다.",
        ],
        mid: [
          "프로토스가 계속해서 상대를 압박합니다. 질럿의 강력한 근접 공격으로 주도권을 유지합니다.",
        ],
        late: [
          "프로토스가 고급 유닛으로 전환하며 최종 공격을 준비합니다.",
        ],
      },
      balanced: {
        early: [
          "프로토스가 초반을 안정적으로 운영하고 있습니다. 경제와 방어의 균형을 맞추고 있습니다.",
        ],
        mid: [
          "프로토스가 상황에 맞춰 유연하게 대응합니다. 필요한 유닛을 생산합니다.",
        ],
        late: [
          "프로토스가 게임을 잘 컨트롤하고 있습니다. 고급 유닛으로 우위를 점하고 있습니다.",
        ],
      },
    },
  };
  
  const commentaryList = buildCommentaries[race][buildType][phase];
  return commentaryList[Math.floor(Math.random() * commentaryList.length)];
}
