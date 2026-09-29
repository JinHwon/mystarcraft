/**
 * 스타크래프트: 브루드 워 실제 데이터 (Liquipedia 기준, 시간은 "가장 빠르게" 게임 속도의 초)
 *
 * - 비용(미네랄/가스), 생산/건설 시간, 인구수, 체력(+실드), 크기
 * - 초당 공격력(DPS)과 공격 타입: 일반 / 폭발형 / 진동형
 *   폭발형: 소형 50% · 중형 75% · 대형 100%
 *   진동형: 소형 100% · 중형 50% · 대형 25%
 * - 테크 요구 조건 (건물/연구)
 */

export type Race = "terran" | "protoss" | "zerg";
export type Size = "small" | "medium" | "large";
export type DamageType = "normal" | "explosive" | "concussive";

export interface UnitDef {
  key: string;
  name: string;
  race: Race;
  min: number;
  gas: number;
  /** 인구수 (저글링/스커지는 0.5 - 1 생산에 2마리) */
  supply: number;
  /** 생산 시간(초) */
  time: number;
  /** 체력 + 실드 */
  hp: number;
  size: Size;
  air: boolean;
  /** 지상 공격 DPS */
  gDps: number;
  /** 공중 공격 DPS */
  aDps: number;
  dmg: DamageType;
  /** 스플래시 계수 (뭉친 소형·중형 유닛 상대로 추가 피해) */
  splash?: number;
  /** 생산 건물 키, "larva"(저그 애벌레) 또는 "morph:<유닛>" (변태) */
  from: string;
  requires: string[];
  /** 1회 생산 수량 (저글링/스커지 2) */
  count?: number;
  worker?: boolean;
  detector?: boolean;
  cloaked?: boolean;
  /** 전투력 계산에서 제외 (수송선 등) */
  support?: boolean;
  /** 사거리가 긴 유닛 (교전 시 선공 이점) */
  ranged?: boolean;
  /** 생체 유닛 (메딕 치료, 이레디에이트 대상) */
  bio?: boolean;
}

export interface BuildingDef {
  key: string;
  name: string;
  race: Race;
  min: number;
  gas: number;
  time: number;
  requires: string[];
  role?: "townhall" | "supply" | "gas" | "producer" | "static";
  supplyProvided?: number;
  /** 방어 건물 전투 능력 */
  defense?: { hp: number; gDps: number; aDps: number; dmg: DamageType; detector?: boolean };
}

export interface TechDef {
  key: string;
  name: string;
  race: Race;
  min: number;
  gas: number;
  time: number;
  /** 연구하는 건물 */
  at: string;
  requires: string[];
}

// ══════════════════════════════════════════════════════════════
// 유닛
// ══════════════════════════════════════════════════════════════

export const UNITS: Record<string, UnitDef> = {
  // ── 테란 ──
  scv: { key: "scv", name: "SCV", race: "terran", min: 50, gas: 0, supply: 1, time: 12.6, hp: 60, size: "small", air: false, gDps: 5, aDps: 0, dmg: "normal", from: "command_center", requires: [], worker: true },
  marine: { key: "marine", name: "마린", race: "terran", min: 50, gas: 0, supply: 1, time: 15, hp: 40, size: "small", air: false, gDps: 9.6, aDps: 9.6, dmg: "normal", from: "barracks", requires: [], ranged: true, bio: true },
  firebat: { key: "firebat", name: "파이어뱃", race: "terran", min: 50, gas: 25, supply: 1, time: 15, hp: 50, size: "small", air: false, gDps: 17.5, aDps: 0, dmg: "concussive", splash: 0.6, from: "barracks", requires: ["academy"], bio: true },
  medic: { key: "medic", name: "메딕", race: "terran", min: 50, gas: 25, supply: 1, time: 19, hp: 60, size: "small", air: false, gDps: 0, aDps: 0, dmg: "normal", from: "barracks", requires: ["academy"], bio: true },
  vulture: { key: "vulture", name: "벌처", race: "terran", min: 75, gas: 0, supply: 2, time: 19, hp: 80, size: "medium", air: false, gDps: 16, aDps: 0, dmg: "concussive", from: "factory", requires: [] },
  siege_tank: { key: "siege_tank", name: "시즈 탱크", race: "terran", min: 150, gas: 100, supply: 2, time: 32, hp: 150, size: "large", air: false, gDps: 19.5, aDps: 0, dmg: "explosive", from: "factory", requires: ["machine_shop"], ranged: true },
  goliath: { key: "goliath", name: "골리앗", race: "terran", min: 100, gas: 50, supply: 2, time: 25, hp: 125, size: "large", air: false, gDps: 13, aDps: 21.8, dmg: "normal", from: "factory", requires: ["armory"], ranged: true },
  wraith: { key: "wraith", name: "레이스", race: "terran", min: 150, gas: 100, supply: 2, time: 38, hp: 120, size: "large", air: true, gDps: 6.4, aDps: 21.8, dmg: "explosive", from: "starport", requires: [] },
  dropship: { key: "dropship", name: "드랍십", race: "terran", min: 100, gas: 100, supply: 2, time: 32, hp: 150, size: "large", air: true, gDps: 0, aDps: 0, dmg: "normal", from: "starport", requires: [], support: true },
  science_vessel: { key: "science_vessel", name: "사이언스 베슬", race: "terran", min: 100, gas: 225, supply: 2, time: 50, hp: 200, size: "large", air: true, gDps: 0, aDps: 0, dmg: "normal", from: "starport", requires: ["science_facility"], detector: true },

  // ── 프로토스 ──
  probe: { key: "probe", name: "프로브", race: "protoss", min: 50, gas: 0, supply: 1, time: 12.6, hp: 40, size: "small", air: false, gDps: 5, aDps: 0, dmg: "normal", from: "nexus", requires: [], worker: true },
  zealot: { key: "zealot", name: "질럿", race: "protoss", min: 100, gas: 0, supply: 2, time: 25, hp: 160, size: "small", air: false, gDps: 17.5, aDps: 0, dmg: "normal", from: "gateway", requires: [] },
  dragoon: { key: "dragoon", name: "드라군", race: "protoss", min: 125, gas: 50, supply: 2, time: 32, hp: 180, size: "large", air: false, gDps: 16, aDps: 16, dmg: "explosive", from: "gateway", requires: ["cybernetics_core"], ranged: true },
  high_templar: { key: "high_templar", name: "하이 템플러", race: "protoss", min: 50, gas: 150, supply: 2, time: 32, hp: 80, size: "small", air: false, gDps: 0, aDps: 0, dmg: "normal", from: "gateway", requires: ["templar_archives"] },
  dark_templar: { key: "dark_templar", name: "다크 템플러", race: "protoss", min: 125, gas: 100, supply: 2, time: 32, hp: 120, size: "small", air: false, gDps: 32, aDps: 0, dmg: "normal", from: "gateway", requires: ["templar_archives"], cloaked: true },
  archon: { key: "archon", name: "아칸", race: "protoss", min: 0, gas: 0, supply: 4, time: 13, hp: 360, size: "large", air: false, gDps: 36, aDps: 36, dmg: "normal", splash: 0.8, from: "morph:high_templar", requires: ["templar_archives"] },
  observer: { key: "observer", name: "옵저버", race: "protoss", min: 25, gas: 75, supply: 1, time: 25, hp: 60, size: "small", air: true, gDps: 0, aDps: 0, dmg: "normal", from: "robotics_facility", requires: ["observatory"], detector: true, cloaked: true, support: true },
  shuttle: { key: "shuttle", name: "셔틀", race: "protoss", min: 200, gas: 0, supply: 2, time: 38, hp: 140, size: "large", air: true, gDps: 0, aDps: 0, dmg: "normal", from: "robotics_facility", requires: [], support: true },
  reaver: { key: "reaver", name: "리버", race: "protoss", min: 200, gas: 100, supply: 4, time: 44, hp: 180, size: "large", air: false, gDps: 40, aDps: 0, dmg: "normal", splash: 1.2, from: "robotics_facility", requires: ["robotics_support_bay"], ranged: true },
  corsair: { key: "corsair", name: "커세어", race: "protoss", min: 150, gas: 100, supply: 2, time: 25, hp: 180, size: "medium", air: true, gDps: 0, aDps: 15, dmg: "explosive", splash: 1.0, from: "stargate", requires: [] },
  carrier: { key: "carrier", name: "캐리어", race: "protoss", min: 550, gas: 250, supply: 6, time: 88, hp: 450, size: "large", air: true, gDps: 38, aDps: 38, dmg: "normal", from: "stargate", requires: ["fleet_beacon"], ranged: true },
  arbiter: { key: "arbiter", name: "아비터", race: "protoss", min: 100, gas: 350, supply: 4, time: 100, hp: 350, size: "large", air: true, gDps: 5.3, aDps: 5.3, dmg: "explosive", from: "stargate", requires: ["arbiter_tribunal"] },

  // ── 저그 ──
  drone: { key: "drone", name: "드론", race: "zerg", min: 50, gas: 0, supply: 1, time: 12.6, hp: 40, size: "small", air: false, gDps: 5, aDps: 0, dmg: "normal", from: "larva", requires: [], worker: true },
  overlord: { key: "overlord", name: "오버로드", race: "zerg", min: 100, gas: 0, supply: 0, time: 25, hp: 200, size: "large", air: true, gDps: 0, aDps: 0, dmg: "normal", from: "larva", requires: [], detector: true, support: true },
  zergling: { key: "zergling", name: "저글링", race: "zerg", min: 25, gas: 0, supply: 0.5, time: 18, hp: 35, size: "small", air: false, gDps: 15, aDps: 0, dmg: "normal", from: "larva", requires: ["spawning_pool"], count: 2, bio: true },
  hydralisk: { key: "hydralisk", name: "히드라리스크", race: "zerg", min: 75, gas: 25, supply: 1, time: 18, hp: 80, size: "medium", air: false, gDps: 16, aDps: 16, dmg: "explosive", from: "larva", requires: ["hydralisk_den"], ranged: true, bio: true },
  lurker: { key: "lurker", name: "럴커", race: "zerg", min: 50, gas: 100, supply: 2, time: 25, hp: 125, size: "medium", air: false, gDps: 13, aDps: 0, dmg: "normal", splash: 1.3, from: "morph:hydralisk", requires: ["lurker_aspect"], cloaked: true, ranged: true, bio: true },
  mutalisk: { key: "mutalisk", name: "뮤탈리스크", race: "zerg", min: 100, gas: 100, supply: 2, time: 25, hp: 120, size: "small", air: true, gDps: 10, aDps: 10, dmg: "normal", splash: 0.3, from: "larva", requires: ["spire"], bio: true },
  scourge: { key: "scourge", name: "스커지", race: "zerg", min: 12.5, gas: 37.5, supply: 0.5, time: 19, hp: 25, size: "small", air: true, gDps: 0, aDps: 30, dmg: "normal", from: "larva", requires: ["spire"], count: 2, bio: true },
  ultralisk: { key: "ultralisk", name: "울트라리스크", race: "zerg", min: 200, gas: 200, supply: 4, time: 38, hp: 400, size: "large", air: false, gDps: 32, aDps: 0, dmg: "normal", from: "larva", requires: ["ultralisk_cavern"], bio: true },
  defiler: { key: "defiler", name: "디파일러", race: "zerg", min: 50, gas: 150, supply: 2, time: 32, hp: 80, size: "medium", air: false, gDps: 0, aDps: 0, dmg: "normal", from: "larva", requires: ["defiler_mound"], bio: true },
};

// ══════════════════════════════════════════════════════════════
// 건물
// ══════════════════════════════════════════════════════════════

export const BUILDINGS: Record<string, BuildingDef> = {
  // ── 테란 ──
  command_center: { key: "command_center", name: "커맨드 센터", race: "terran", min: 400, gas: 0, time: 75, requires: [], role: "townhall", supplyProvided: 10 },
  supply_depot: { key: "supply_depot", name: "서플라이 디팟", race: "terran", min: 100, gas: 0, time: 25, requires: [], role: "supply", supplyProvided: 8 },
  refinery: { key: "refinery", name: "리파이너리", race: "terran", min: 100, gas: 0, time: 25, requires: [], role: "gas" },
  barracks: { key: "barracks", name: "배럭", race: "terran", min: 150, gas: 0, time: 50, requires: [], role: "producer" },
  engineering_bay: { key: "engineering_bay", name: "엔지니어링 베이", race: "terran", min: 125, gas: 0, time: 38, requires: [] },
  academy: { key: "academy", name: "아카데미", race: "terran", min: 150, gas: 0, time: 50, requires: ["barracks"] },
  bunker: { key: "bunker", name: "벙커", race: "terran", min: 100, gas: 0, time: 19, requires: ["barracks"], role: "static", defense: { hp: 350, gDps: 30, aDps: 30, dmg: "normal" } },
  missile_turret: { key: "missile_turret", name: "미사일 터렛", race: "terran", min: 75, gas: 0, time: 19, requires: ["engineering_bay"], role: "static", defense: { hp: 200, gDps: 0, aDps: 25, dmg: "explosive", detector: true } },
  factory: { key: "factory", name: "팩토리", race: "terran", min: 200, gas: 100, time: 50, requires: ["barracks"], role: "producer" },
  machine_shop: { key: "machine_shop", name: "머신 샵", race: "terran", min: 50, gas: 50, time: 25, requires: ["factory"] },
  armory: { key: "armory", name: "아머리", race: "terran", min: 100, gas: 50, time: 50, requires: ["factory"] },
  starport: { key: "starport", name: "스타포트", race: "terran", min: 150, gas: 100, time: 44, requires: ["factory"], role: "producer" },
  science_facility: { key: "science_facility", name: "사이언스 퍼실리티", race: "terran", min: 100, gas: 150, time: 38, requires: ["starport"] },

  // ── 프로토스 ──
  nexus: { key: "nexus", name: "넥서스", race: "protoss", min: 400, gas: 0, time: 75, requires: [], role: "townhall", supplyProvided: 9 },
  pylon: { key: "pylon", name: "파일런", race: "protoss", min: 100, gas: 0, time: 19, requires: [], role: "supply", supplyProvided: 8 },
  assimilator: { key: "assimilator", name: "어시밀레이터", race: "protoss", min: 100, gas: 0, time: 25, requires: [], role: "gas" },
  gateway: { key: "gateway", name: "게이트웨이", race: "protoss", min: 150, gas: 0, time: 38, requires: ["pylon"], role: "producer" },
  forge: { key: "forge", name: "포지", race: "protoss", min: 150, gas: 0, time: 25, requires: ["pylon"] },
  photon_cannon: { key: "photon_cannon", name: "포톤 캐논", race: "protoss", min: 150, gas: 0, time: 32, requires: ["forge"], role: "static", defense: { hp: 200, gDps: 22, aDps: 22, dmg: "normal", detector: true } },
  cybernetics_core: { key: "cybernetics_core", name: "사이버네틱스 코어", race: "protoss", min: 200, gas: 0, time: 38, requires: ["gateway"] },
  robotics_facility: { key: "robotics_facility", name: "로보틱스 퍼실리티", race: "protoss", min: 200, gas: 200, time: 50, requires: ["cybernetics_core"], role: "producer" },
  observatory: { key: "observatory", name: "옵저버토리", race: "protoss", min: 50, gas: 100, time: 19, requires: ["robotics_facility"] },
  robotics_support_bay: { key: "robotics_support_bay", name: "로보틱스 서포트 베이", race: "protoss", min: 150, gas: 100, time: 19, requires: ["robotics_facility"] },
  stargate: { key: "stargate", name: "스타게이트", race: "protoss", min: 150, gas: 150, time: 44, requires: ["cybernetics_core"], role: "producer" },
  citadel_of_adun: { key: "citadel_of_adun", name: "시타델 오브 아둔", race: "protoss", min: 150, gas: 100, time: 38, requires: ["cybernetics_core"] },
  templar_archives: { key: "templar_archives", name: "템플러 아카이브", race: "protoss", min: 150, gas: 200, time: 38, requires: ["citadel_of_adun"] },
  fleet_beacon: { key: "fleet_beacon", name: "플릿 비콘", race: "protoss", min: 300, gas: 200, time: 38, requires: ["stargate"] },
  arbiter_tribunal: { key: "arbiter_tribunal", name: "아비터 트리뷰널", race: "protoss", min: 200, gas: 150, time: 38, requires: ["templar_archives", "stargate"] },

  // ── 저그 ──
  hatchery: { key: "hatchery", name: "해처리", race: "zerg", min: 300, gas: 0, time: 75, requires: [], role: "townhall", supplyProvided: 1 },
  extractor: { key: "extractor", name: "익스트랙터", race: "zerg", min: 50, gas: 0, time: 25, requires: [], role: "gas" },
  spawning_pool: { key: "spawning_pool", name: "스포닝 풀", race: "zerg", min: 200, gas: 0, time: 50, requires: [] },
  evolution_chamber: { key: "evolution_chamber", name: "에볼루션 챔버", race: "zerg", min: 75, gas: 0, time: 25, requires: [] },
  hydralisk_den: { key: "hydralisk_den", name: "히드라리스크 덴", race: "zerg", min: 100, gas: 50, time: 25, requires: ["spawning_pool"] },
  sunken_colony: { key: "sunken_colony", name: "성큰 콜로니", race: "zerg", min: 125, gas: 0, time: 26, requires: ["spawning_pool"], role: "static", defense: { hp: 300, gDps: 30, aDps: 0, dmg: "explosive" } },
  spore_colony: { key: "spore_colony", name: "스포어 콜로니", race: "zerg", min: 125, gas: 0, time: 26, requires: ["evolution_chamber"], role: "static", defense: { hp: 400, gDps: 0, aDps: 24, dmg: "normal", detector: true } },
  spire: { key: "spire", name: "스파이어", race: "zerg", min: 200, gas: 150, time: 75, requires: ["lair"] },
  queens_nest: { key: "queens_nest", name: "퀸즈 네스트", race: "zerg", min: 150, gas: 100, time: 38, requires: ["lair"] },
  ultralisk_cavern: { key: "ultralisk_cavern", name: "울트라리스크 캐번", race: "zerg", min: 150, gas: 200, time: 50, requires: ["hive"] },
  defiler_mound: { key: "defiler_mound", name: "디파일러 마운드", race: "zerg", min: 100, gas: 100, time: 38, requires: ["hive"] },
};

// ══════════════════════════════════════════════════════════════
// 연구 / 업그레이드 (레어·하이브·컴샛처럼 건물 변태/부속도 포함)
// ══════════════════════════════════════════════════════════════

export const TECHS: Record<string, TechDef> = {
  // ── 테란 ──
  comsat: { key: "comsat", name: "컴샛 스테이션", race: "terran", min: 50, gas: 50, time: 25, at: "command_center", requires: ["academy"] },
  stim: { key: "stim", name: "스팀팩", race: "terran", min: 100, gas: 100, time: 50, at: "academy", requires: [] },
  u238: { key: "u238", name: "U-238 쉘(마린 사거리)", race: "terran", min: 150, gas: 150, time: 63, at: "academy", requires: [] },
  siege_mode: { key: "siege_mode", name: "시즈 모드", race: "terran", min: 150, gas: 150, time: 50, at: "machine_shop", requires: [] },
  ion_thrusters: { key: "ion_thrusters", name: "벌처 속도 업그레이드", race: "terran", min: 100, gas: 100, time: 63, at: "machine_shop", requires: [] },
  spider_mines: { key: "spider_mines", name: "스파이더 마인", race: "terran", min: 100, gas: 100, time: 50, at: "machine_shop", requires: [] },
  charon_boosters: { key: "charon_boosters", name: "골리앗 사거리 업그레이드", race: "terran", min: 100, gas: 100, time: 83, at: "machine_shop", requires: ["armory"] },
  cloaking_field: { key: "cloaking_field", name: "레이스 클로킹", race: "terran", min: 150, gas: 150, time: 63, at: "starport", requires: [] },
  irradiate: { key: "irradiate", name: "이레디에이트", race: "terran", min: 200, gas: 200, time: 50, at: "science_facility", requires: [] },
  emp: { key: "emp", name: "EMP 쇼크웨이브", race: "terran", min: 200, gas: 200, time: 76, at: "science_facility", requires: [] },
  t_infantry_weapons: { key: "t_infantry_weapons", name: "보병 공격력 +1", race: "terran", min: 100, gas: 100, time: 167, at: "engineering_bay", requires: [] },
  t_vehicle_weapons: { key: "t_vehicle_weapons", name: "차량 공격력 +1", race: "terran", min: 100, gas: 100, time: 167, at: "armory", requires: [] },

  // ── 프로토스 ──
  singularity_charge: { key: "singularity_charge", name: "드라군 사거리(싱귤래리티 차지)", race: "protoss", min: 150, gas: 150, time: 104, at: "cybernetics_core", requires: [] },
  leg_enhancements: { key: "leg_enhancements", name: "질럿 발업(레그 인핸스먼트)", race: "protoss", min: 150, gas: 150, time: 83, at: "citadel_of_adun", requires: [] },
  psionic_storm: { key: "psionic_storm", name: "사이오닉 스톰", race: "protoss", min: 200, gas: 200, time: 76, at: "templar_archives", requires: [] },
  stasis_field: { key: "stasis_field", name: "스테이시스 필드", race: "protoss", min: 150, gas: 150, time: 63, at: "arbiter_tribunal", requires: [] },
  p_ground_weapons: { key: "p_ground_weapons", name: "지상 공격력 +1", race: "protoss", min: 100, gas: 100, time: 167, at: "forge", requires: [] },

  // ── 저그 ──
  lair: { key: "lair", name: "레어", race: "zerg", min: 150, gas: 100, time: 63, at: "hatchery", requires: ["spawning_pool"] },
  hive: { key: "hive", name: "하이브", race: "zerg", min: 200, gas: 150, time: 75, at: "hatchery", requires: ["lair", "queens_nest"] },
  metabolic_boost: { key: "metabolic_boost", name: "저글링 발업(메타볼릭 부스트)", race: "zerg", min: 100, gas: 100, time: 63, at: "spawning_pool", requires: [] },
  hydra_upgrades: { key: "hydra_upgrades", name: "히드라 사거리·속도 업그레이드", race: "zerg", min: 150, gas: 150, time: 63, at: "hydralisk_den", requires: ["lair"] },
  lurker_aspect: { key: "lurker_aspect", name: "럴커 변태 연구", race: "zerg", min: 200, gas: 200, time: 76, at: "hydralisk_den", requires: ["lair"] },
  adrenal_glands: { key: "adrenal_glands", name: "아드레날린(저글링 공속)", race: "zerg", min: 200, gas: 200, time: 63, at: "spawning_pool", requires: ["hive"] },
  consume: { key: "consume", name: "컨슘(다크 스웜 운용)", race: "zerg", min: 100, gas: 100, time: 63, at: "defiler_mound", requires: [] },
  chitinous_plating: { key: "chitinous_plating", name: "울트라 방어력(키틴질 장갑)", race: "zerg", min: 150, gas: 150, time: 83, at: "ultralisk_cavern", requires: [] },
  z_melee_attacks: { key: "z_melee_attacks", name: "근접 공격력 +1", race: "zerg", min: 100, gas: 100, time: 167, at: "evolution_chamber", requires: [] },
  z_missile_attacks: { key: "z_missile_attacks", name: "원거리 공격력 +1", race: "zerg", min: 100, gas: 100, time: 167, at: "evolution_chamber", requires: [] },
};

// ══════════════════════════════════════════════════════════════
// 종족별 역할
// ══════════════════════════════════════════════════════════════

export const RACE_ROLES: Record<Race, { townhall: string; supply: string; gas: string; worker: string; name: string }> = {
  terran: { townhall: "command_center", supply: "supply_depot", gas: "refinery", worker: "scv", name: "테란" },
  protoss: { townhall: "nexus", supply: "pylon", gas: "assimilator", worker: "probe", name: "프로토스" },
  zerg: { townhall: "hatchery", supply: "overlord", gas: "extractor", worker: "drone", name: "저그" },
};

/** 공격 타입 × 크기 배율 */
export function damageMultiplier(dmg: DamageType, size: Size): number {
  if (dmg === "explosive") return size === "small" ? 0.5 : size === "medium" ? 0.75 : 1;
  if (dmg === "concussive") return size === "small" ? 1 : size === "medium" ? 0.5 : 0.25;
  return 1;
}

/** 이름 조회 (유닛/건물/연구) */
export function nameOf(key: string): string {
  return UNITS[key]?.name ?? BUILDINGS[key]?.name ?? TECHS[key]?.name ?? key;
}

/** 경제 상수 (초당) */
export const ECONOMY = {
  /** 일꾼 1기 미네랄 채취량 (분당 약 62, 가까운 패치 기준) */
  mineralPerWorker: 62 / 60,
  /** 베이스당 최적 미네랄 일꾼 수 (패치당 2기) */
  optimalMineralWorkers: 16,
  /** 과포화 상한 (패치당 3기) - 초과분 효율 약 1/3 */
  maxMineralWorkers: 24,
  oversaturatedRate: 0.3,
  /** 가스 3일꾼 기준 분당 약 108 */
  gasPerRefinery: 108 / 60,
  gasWorkers: 3,
  /** 베이스 자원량: 미네랄 1500 × 8패치, 가스 5000 */
  baseMinerals: 12000,
  baseGas: 5000,
  /** 해처리당 애벌레 생성 간격(초) / 최대 보유 */
  larvaInterval: 12,
  larvaMax: 3,
  supplyMax: 200,
};

/** 기지 이름 */
export const BASE_NAMES = ["본진", "앞마당", "3번째 멀티", "4번째 멀티", "5번째 멀티", "6번째 멀티"];
