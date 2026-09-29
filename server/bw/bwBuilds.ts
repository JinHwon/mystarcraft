/**
 * 종족전별 실제 프로 빌드 오더
 *
 * opening : [인구수 조건, 건물/연구/유닛 키 | "expand"] - 순서대로 실행
 * tech    : 오프닝 이후 순서대로 올리는 테크 (건물/연구)
 * producers: 활성 기지 1개당 생산 건물 목표 수
 * comp    : 중반 병력 구성 비율 / lateComp: 후반 구성 (lateTech 완성 후)
 * expand  : [게임 시간(초), 목표 기지 수]
 * push    : 계획된 첫 공격 타이밍
 */
import type { Race } from "./bwData";

export type PlanStyle = "cheese" | "aggressive" | "standard" | "greedy";
export type HarassKind = "vulture_raid" | "bio_drop" | "wraith_cloak" | "reaver_drop" | "dark_templar" | "corsair_overlord" | "muta_harass" | "ling_runby";

export interface Plan {
  key: string;
  name: string;
  race: Race;
  vs: Race;
  weight: number;
  style: PlanStyle;
  /** 해설용 설명 */
  desc: string;
  opening: Array<[number, string]>;
  tech: string[];
  producers: Record<string, number>;
  producerMax: Record<string, number>;
  comp: Record<string, number>;
  lateTech?: string;
  lateComp?: Record<string, number>;
  expand: Array<[number, number]>;
  push?: { at: number; minArmySupply: number; name: string };
  harass: HarassKind[];
  /** 빌드 간 승률 보정 계수 (밸런스 시뮬레이션으로 산출, 기본 1) */
  power?: number;
}

const T = "terran" as const, P = "protoss" as const, Z = "zerg" as const;

export const PLANS: Plan[] = [
  // ════════════════════════ 테란 vs 저그 ════════════════════════
  {
    key: "tvz_1rax_fe", name: "배럭 더블", race: T, vs: Z, weight: 0.55, style: "standard",
    desc: "1배럭 이후 앞마당 커맨드 센터, 바이오닉(마린·메딕) + 사이언스 베슬 운영",
    opening: [[9, "supply_depot"], [11, "barracks"], [15, "expand"], [16, "supply_depot"], [17, "refinery"], [18, "bunker"], [19, "barracks"], [21, "academy"], [23, "engineering_bay"], [24, "barracks"]],
    tech: ["stim", "comsat", "u238", "t_infantry_weapons", "factory", "starport", "science_facility", "irradiate"],
    producers: { barracks: 2.5, factory: 0.2, starport: 0.4 }, producerMax: { barracks: 10, factory: 1, starport: 2 },
    comp: { marine: 0.66, medic: 0.2, firebat: 0.08, siege_tank: 0.06 },
    lateTech: "science_facility", lateComp: { marine: 0.58, medic: 0.18, firebat: 0.08, science_vessel: 0.1, siege_tank: 0.06 },
    expand: [[150, 2], [600, 3], [900, 4], [1200, 5]],
    push: { at: 470, minArmySupply: 30, name: "스팀팩 타이밍 러쉬" },
    harass: ["bio_drop"],
    power: 0.843,
  },
  {
    key: "tvz_mech", name: "메카닉 (골리앗·탱크)", race: T, vs: Z, weight: 0.15, style: "standard",
    desc: "1배럭 1팩토리 후 앞마당, 골리앗·시즈 탱크 중심의 메카닉 운영",
    opening: [[9, "supply_depot"], [11, "barracks"], [12, "refinery"], [15, "factory"], [16, "expand"], [17, "supply_depot"], [19, "machine_shop"], [20, "refinery"], [23, "armory"]],
    tech: ["siege_mode", "charon_boosters", "comsat", "t_vehicle_weapons", "engineering_bay", "starport", "science_facility", "irradiate"],
    producers: { factory: 2.2, barracks: 0.5, starport: 0.3 }, producerMax: { factory: 8, barracks: 2, starport: 1 },
    comp: { goliath: 0.45, siege_tank: 0.3, vulture: 0.15, marine: 0.1 },
    lateTech: "science_facility", lateComp: { goliath: 0.42, siege_tank: 0.3, vulture: 0.12, science_vessel: 0.08, marine: 0.08 },
    expand: [[200, 2], [660, 3], [960, 4], [1260, 5]],
    push: { at: 720, minArmySupply: 60, name: "메카닉 진출" },
    harass: ["vulture_raid"],
    power: 1.4,
  },
  {
    key: "tvz_bbs", name: "BBS (2배럭 마린 러쉬)", race: T, vs: Z, weight: 0.07, style: "cheese",
    desc: "8·9 배럭 이후 서플라이, 초반 마린으로 끝내려는 치즈 러쉬",
    opening: [[8, "barracks"], [9, "barracks"], [10, "supply_depot"], [15, "supply_depot"]],
    tech: ["academy", "stim", "expand", "refinery", "comsat", "engineering_bay", "factory", "starport", "science_facility"],
    producers: { barracks: 3, starport: 0.2 }, producerMax: { barracks: 8, starport: 1 },
    comp: { marine: 0.8, medic: 0.15, firebat: 0.05 },
    expand: [[420, 2], [840, 3], [1140, 4]],
    push: { at: 165, minArmySupply: 6, name: "BBS 마린 러쉬" },
    harass: [],
    power: 0.793,
  },

  // ════════════════════════ 테란 vs 프로토스 ════════════════════════
  {
    key: "tvp_fd", name: "팩토리 더블 (팩더블)", race: T, vs: P, weight: 0.55, style: "standard",
    desc: "1팩토리 이후 앞마당, 시즈 탱크·벌처 메카닉과 골리앗 운영",
    opening: [[9, "supply_depot"], [11, "barracks"], [12, "refinery"], [15, "factory"], [16, "expand"], [17, "supply_depot"], [18, "machine_shop"], [20, "refinery"], [22, "factory"], [24, "supply_depot"]],
    tech: ["siege_mode", "spider_mines", "ion_thrusters", "engineering_bay", "armory", "t_vehicle_weapons", "comsat", "starport", "science_facility", "emp", "charon_boosters"],
    producers: { factory: 2.5, barracks: 0.3, starport: 0.3 }, producerMax: { factory: 10, barracks: 1, starport: 1 },
    comp: { siege_tank: 0.42, vulture: 0.34, goliath: 0.18, marine: 0.06 },
    lateTech: "science_facility", lateComp: { siege_tank: 0.36, vulture: 0.3, goliath: 0.26, science_vessel: 0.08 },
    expand: [[230, 2], [660, 3], [960, 4], [1260, 5]],
    push: { at: 660, minArmySupply: 70, name: "탱크 조이기" },
    harass: ["vulture_raid"],
    power: 1.068,
  },
  {
    key: "tvp_1f1s", name: "원팩 원스타 (레이스·드랍)", race: T, vs: P, weight: 0.18, style: "aggressive",
    desc: "팩토리와 스타포트를 빠르게 올려 레이스·드랍십으로 흔드는 운영",
    opening: [[9, "supply_depot"], [11, "barracks"], [12, "refinery"], [15, "factory"], [17, "supply_depot"], [19, "starport"], [20, "machine_shop"], [21, "expand"], [23, "refinery"]],
    tech: ["siege_mode", "cloaking_field", "ion_thrusters", "spider_mines", "engineering_bay", "armory", "comsat", "science_facility", "emp", "t_vehicle_weapons"],
    producers: { factory: 2.2, barracks: 0.3, starport: 0.5 }, producerMax: { factory: 8, barracks: 1, starport: 2 },
    comp: { siege_tank: 0.36, vulture: 0.3, goliath: 0.16, wraith: 0.1, dropship: 0.03, marine: 0.05 },
    expand: [[300, 2], [720, 3], [1020, 4], [1320, 5]],
    push: { at: 720, minArmySupply: 60, name: "탱크 진출" },
    harass: ["wraith_cloak", "vulture_raid"],
    power: 1.4,
  },
  {
    key: "tvp_2fac", name: "투팩 벌처 타이밍", race: T, vs: P, weight: 0.2, style: "aggressive",
    desc: "팩토리 2개에서 벌처·탱크를 모아 7분대에 치고 나가는 타이밍 러쉬",
    opening: [[9, "supply_depot"], [11, "barracks"], [12, "refinery"], [15, "factory"], [17, "supply_depot"], [19, "factory"], [21, "machine_shop"], [23, "supply_depot"]],
    tech: ["siege_mode", "ion_thrusters", "spider_mines", "expand", "armory", "engineering_bay", "comsat", "starport", "science_facility", "emp"],
    producers: { factory: 2.8, barracks: 0.3, starport: 0.2 }, producerMax: { factory: 9, barracks: 1, starport: 1 },
    comp: { siege_tank: 0.4, vulture: 0.42, goliath: 0.12, marine: 0.06 },
    expand: [[480, 2], [800, 3], [1100, 4]],
    push: { at: 400, minArmySupply: 26, name: "투팩 벌처·탱크 타이밍" },
    harass: ["vulture_raid"],
    power: 0.752,
  },
  {
    key: "tvp_bbs", name: "BBS (2배럭 마린 러쉬)", race: T, vs: P, weight: 0.07, style: "cheese",
    desc: "8·9 배럭 이후 서플라이, 초반 마린으로 프로토스를 흔드는 치즈 러쉬",
    opening: [[8, "barracks"], [9, "barracks"], [10, "supply_depot"], [15, "supply_depot"]],
    tech: ["refinery", "factory", "expand", "machine_shop", "siege_mode", "academy", "comsat", "armory"],
    producers: { barracks: 2, factory: 1.5 }, producerMax: { barracks: 4, factory: 6 },
    comp: { marine: 0.5, siege_tank: 0.3, vulture: 0.2 },
    expand: [[480, 2], [840, 3], [1140, 4]],
    push: { at: 170, minArmySupply: 6, name: "BBS 마린 러쉬" },
    harass: [],
    power: 0.941,
  },

  // ════════════════════════ 테란 vs 테란 ════════════════════════
  {
    key: "tvt_1fe", name: "원팩 더블", race: T, vs: T, weight: 0.6, style: "standard",
    desc: "1팩토리 이후 앞마당, 시즈 탱크 라인과 드랍십·레이스 운영",
    opening: [[9, "supply_depot"], [11, "barracks"], [12, "refinery"], [15, "factory"], [17, "supply_depot"], [19, "machine_shop"], [20, "expand"], [22, "refinery"]],
    tech: ["siege_mode", "starport", "ion_thrusters", "armory", "engineering_bay", "comsat", "charon_boosters", "t_vehicle_weapons", "science_facility"],
    producers: { factory: 2.4, barracks: 0.3, starport: 0.4 }, producerMax: { factory: 8, barracks: 1, starport: 2 },
    comp: { siege_tank: 0.45, vulture: 0.18, goliath: 0.22, wraith: 0.06, dropship: 0.03, marine: 0.06 },
    expand: [[270, 2], [720, 3], [1020, 4], [1320, 5]],
    push: { at: 780, minArmySupply: 70, name: "탱크 라인 전진" },
    harass: ["vulture_raid", "bio_drop"],
    power: 0.965,
  },
  {
    key: "tvt_2star", name: "투스타 레이스", race: T, vs: T, weight: 0.28, style: "aggressive",
    desc: "스타포트 2개에서 클로킹 레이스를 모아 견제 후 메카닉 전환",
    opening: [[9, "supply_depot"], [11, "barracks"], [12, "refinery"], [15, "factory"], [17, "starport"], [18, "starport"], [20, "supply_depot"]],
    tech: ["cloaking_field", "machine_shop", "siege_mode", "expand", "armory", "comsat", "engineering_bay", "t_vehicle_weapons"],
    producers: { factory: 1.8, starport: 0.8, barracks: 0.3 }, producerMax: { factory: 6, starport: 2, barracks: 1 },
    comp: { wraith: 0.3, siege_tank: 0.35, goliath: 0.2, vulture: 0.15 },
    expand: [[420, 2], [840, 3], [1140, 4]],
    push: { at: 540, minArmySupply: 30, name: "레이스·탱크 압박" },
    harass: ["wraith_cloak"],
    power: 1.042,
  },
  {
    key: "tvt_bbs", name: "BBS (2배럭 마린 러쉬)", race: T, vs: T, weight: 0.12, style: "cheese",
    desc: "8·9 배럭 이후 서플라이, 마린과 SCV로 끝내려는 치즈 러쉬",
    opening: [[8, "barracks"], [9, "barracks"], [10, "supply_depot"], [15, "supply_depot"]],
    tech: ["refinery", "factory", "machine_shop", "siege_mode", "expand", "academy", "comsat", "armory"],
    producers: { barracks: 2, factory: 1.5 }, producerMax: { barracks: 4, factory: 6 },
    comp: { marine: 0.45, siege_tank: 0.35, vulture: 0.2 },
    expand: [[480, 2], [840, 3], [1140, 4]],
    push: { at: 165, minArmySupply: 6, name: "BBS 마린 러쉬" },
    harass: [],
    power: 1.048,
  },

  // ════════════════════════ 프로토스 vs 저그 ════════════════════════
  {
    key: "pvz_ffe", name: "포지 더블 (커세어·템플러)", race: P, vs: Z, weight: 0.6, style: "standard",
    desc: "포지와 캐논으로 앞마당을 가져간 뒤 커세어로 제공권, 질럿·아칸·하이 템플러 운영",
    opening: [[8, "pylon"], [10, "forge"], [11, "photon_cannon"], [13, "expand"], [15, "gateway"], [16, "assimilator"], [17, "pylon"], [19, "cybernetics_core"], [21, "photon_cannon"]],
    tech: ["stargate", "p_ground_weapons", "citadel_of_adun", "leg_enhancements", "templar_archives", "psionic_storm", "robotics_facility", "observatory"],
    producers: { gateway: 2.5, stargate: 0.4, robotics_facility: 0.2 }, producerMax: { gateway: 12, stargate: 1, robotics_facility: 1 },
    comp: { zealot: 0.55, corsair: 0.12, dragoon: 0.23, dark_templar: 0.05, observer: 0.02, reaver: 0.03 },
    lateTech: "psionic_storm", lateComp: { zealot: 0.46, archon: 0.12, high_templar: 0.12, dragoon: 0.18, corsair: 0.08, observer: 0.02, reaver: 0.02 },
    expand: [[120, 2], [600, 3], [900, 4], [1200, 5]],
    push: { at: 660, minArmySupply: 60, name: "질럿·아칸 한방 진출" },
    harass: ["corsair_overlord", "dark_templar"],
    power: 1.106,
  },
  {
    key: "pvz_2gate", name: "2게이트 질럿 러쉬", race: P, vs: Z, weight: 0.15, style: "aggressive",
    desc: "게이트웨이 2개에서 질럿을 모아 초반에 저그를 압박",
    opening: [[8, "pylon"], [10, "gateway"], [12, "gateway"], [14, "pylon"]],
    tech: ["assimilator", "cybernetics_core", "expand", "forge", "citadel_of_adun", "leg_enhancements", "templar_archives", "psionic_storm", "stargate"],
    producers: { gateway: 3, stargate: 0.2 }, producerMax: { gateway: 10, stargate: 1 },
    comp: { zealot: 0.65, dragoon: 0.25, corsair: 0.05, dark_templar: 0.05 },
    lateTech: "psionic_storm", lateComp: { zealot: 0.5, archon: 0.12, high_templar: 0.1, dragoon: 0.2, corsair: 0.08 },
    expand: [[360, 2], [720, 3], [1020, 4]],
    push: { at: 210, minArmySupply: 10, name: "2게이트 질럿 압박" },
    harass: ["dark_templar"],
    power: 0.75,
  },
  {
    key: "pvz_ffe_dt", name: "포지 더블 다크템플러", race: P, vs: Z, weight: 0.25, style: "standard",
    desc: "포지 더블 이후 빠른 템플러 아카이브, 다크 템플러로 흔들고 템플러 운영",
    opening: [[8, "pylon"], [10, "forge"], [11, "photon_cannon"], [13, "expand"], [15, "gateway"], [16, "assimilator"], [18, "cybernetics_core"], [20, "citadel_of_adun"], [22, "templar_archives"]],
    tech: ["psionic_storm", "stargate", "leg_enhancements", "p_ground_weapons", "robotics_facility", "observatory"],
    producers: { gateway: 2.6, stargate: 0.3 }, producerMax: { gateway: 12, stargate: 1 },
    comp: { zealot: 0.5, dark_templar: 0.1, dragoon: 0.2, high_templar: 0.08, archon: 0.07, corsair: 0.05 },
    expand: [[120, 2], [660, 3], [960, 4], [1260, 5]],
    push: { at: 720, minArmySupply: 60, name: "템플러 한방 진출" },
    harass: ["dark_templar", "corsair_overlord"],
    power: 0.958,
  },

  // ════════════════════════ 프로토스 vs 테란 ════════════════════════
  {
    key: "pvt_21nexus", name: "21넥 (원게이트 더블)", race: P, vs: T, weight: 0.55, style: "standard",
    desc: "1게이트 사이버네틱스 코어 이후 빠른 넥서스, 드라군·질럿과 아비터 운영",
    opening: [[8, "pylon"], [10, "gateway"], [12, "assimilator"], [14, "cybernetics_core"], [15, "pylon"], [18, "singularity_charge"], [21, "expand"], [22, "gateway"]],
    tech: ["robotics_facility", "observatory", "citadel_of_adun", "leg_enhancements", "p_ground_weapons", "templar_archives", "psionic_storm", "stargate", "arbiter_tribunal", "stasis_field"],
    producers: { gateway: 3, robotics_facility: 0.25, stargate: 0.25 }, producerMax: { gateway: 12, robotics_facility: 1, stargate: 1 },
    comp: { dragoon: 0.6, zealot: 0.32, observer: 0.03, reaver: 0.05 },
    lateTech: "arbiter_tribunal", lateComp: { dragoon: 0.48, zealot: 0.34, high_templar: 0.06, arbiter: 0.06, observer: 0.03, reaver: 0.03 },
    expand: [[200, 2], [630, 3], [930, 4], [1230, 5]],
    push: { at: 720, minArmySupply: 70, name: "드라군·질럿 한방 진출" },
    harass: ["reaver_drop"],
    power: 1.093,
  },
  {
    key: "pvt_dt", name: "다크템플러 드랍", race: P, vs: T, weight: 0.2, style: "aggressive",
    desc: "빠른 템플러 아카이브로 다크 템플러를 뽑아 테란의 탐지 준비를 시험",
    opening: [[8, "pylon"], [10, "gateway"], [12, "assimilator"], [14, "cybernetics_core"], [16, "pylon"], [18, "citadel_of_adun"], [20, "templar_archives"], [22, "gateway"]],
    tech: ["expand", "singularity_charge", "robotics_facility", "observatory", "leg_enhancements", "psionic_storm", "stargate", "arbiter_tribunal"],
    producers: { gateway: 3, robotics_facility: 0.2 }, producerMax: { gateway: 10, robotics_facility: 1 },
    comp: { dragoon: 0.5, zealot: 0.3, dark_templar: 0.15, observer: 0.03, high_templar: 0.02 },
    expand: [[380, 2], [780, 3], [1080, 4]],
    push: { at: 540, minArmySupply: 30, name: "다크 이후 드라군 진출" },
    harass: ["dark_templar"],
    power: 0.798,
  },
  {
    key: "pvt_carrier", name: "캐리어 운영", race: P, vs: T, weight: 0.25, style: "greedy",
    desc: "21넥 이후 스타게이트와 플릿 비콘, 캐리어로 테란 메카닉을 상대",
    opening: [[8, "pylon"], [10, "gateway"], [12, "assimilator"], [14, "cybernetics_core"], [15, "pylon"], [18, "singularity_charge"], [21, "expand"], [23, "assimilator"]],
    tech: ["robotics_facility", "observatory", "stargate", "fleet_beacon", "p_ground_weapons", "citadel_of_adun", "leg_enhancements"],
    producers: { gateway: 2.2, stargate: 0.8, robotics_facility: 0.2 }, producerMax: { gateway: 8, stargate: 3, robotics_facility: 1 },
    comp: { dragoon: 0.55, zealot: 0.3, observer: 0.03, reaver: 0.12 },
    lateTech: "fleet_beacon", lateComp: { carrier: 0.35, dragoon: 0.35, zealot: 0.27, observer: 0.03 },
    expand: [[200, 2], [600, 3], [900, 4], [1200, 5]],
    push: { at: 900, minArmySupply: 80, name: "캐리어 한방 진출" },
    harass: ["reaver_drop"],
    power: 1.182,
  },

  // ════════════════════════ 프로토스 vs 프로토스 ════════════════════════
  {
    key: "pvp_1gate", name: "원게이트 코어 드라군", race: P, vs: P, weight: 0.45, style: "standard",
    desc: "1게이트 코어 드라군 이후 로보틱스, 리버·옵저버와 드라군 싸움",
    opening: [[8, "pylon"], [10, "gateway"], [12, "assimilator"], [14, "cybernetics_core"], [16, "pylon"], [17, "singularity_charge"], [19, "gateway"], [22, "robotics_facility"]],
    tech: ["observatory", "robotics_support_bay", "expand", "citadel_of_adun", "leg_enhancements", "p_ground_weapons", "templar_archives", "psionic_storm"],
    producers: { gateway: 3, robotics_facility: 0.4 }, producerMax: { gateway: 10, robotics_facility: 2 },
    comp: { dragoon: 0.62, zealot: 0.22, reaver: 0.1, observer: 0.03, shuttle: 0.03 },
    expand: [[420, 2], [780, 3], [1080, 4]],
    push: { at: 600, minArmySupply: 40, name: "드라군·리버 진출" },
    harass: ["reaver_drop"],
    power: 0.9,
  },
  {
    key: "pvp_2gate_reaver", name: "2게이트 리버", race: P, vs: P, weight: 0.25, style: "aggressive",
    desc: "게이트웨이 2개 이후 빠른 로보틱스, 셔틀 리버로 프로브 라인 공략",
    opening: [[8, "pylon"], [10, "gateway"], [12, "gateway"], [13, "assimilator"], [15, "cybernetics_core"], [18, "robotics_facility"], [20, "robotics_support_bay"]],
    tech: ["singularity_charge", "observatory", "expand", "citadel_of_adun", "leg_enhancements", "templar_archives", "psionic_storm"],
    producers: { gateway: 2.6, robotics_facility: 0.5 }, producerMax: { gateway: 9, robotics_facility: 2 },
    comp: { dragoon: 0.5, zealot: 0.25, reaver: 0.15, shuttle: 0.06, observer: 0.04 },
    expand: [[480, 2], [840, 3], [1140, 4]],
    push: { at: 480, minArmySupply: 26, name: "셔틀 리버 압박" },
    harass: ["reaver_drop"],
    power: 1.075,
  },
  {
    key: "pvp_dt", name: "다크템플러 러쉬", race: P, vs: P, weight: 0.15, style: "aggressive",
    desc: "빠른 템플러 아카이브로 다크 템플러, 상대 옵저버 유무가 승부처",
    opening: [[8, "pylon"], [10, "gateway"], [12, "assimilator"], [14, "cybernetics_core"], [16, "pylon"], [18, "citadel_of_adun"], [20, "templar_archives"]],
    tech: ["singularity_charge", "expand", "robotics_facility", "observatory", "leg_enhancements", "psionic_storm"],
    producers: { gateway: 3, robotics_facility: 0.3 }, producerMax: { gateway: 9, robotics_facility: 1 },
    comp: { dragoon: 0.5, zealot: 0.25, dark_templar: 0.2, observer: 0.05 },
    expand: [[420, 2], [780, 3], [1080, 4]],
    push: { at: 480, minArmySupply: 20, name: "다크 템플러 진출" },
    harass: ["dark_templar"],
    power: 1.209,
  },
  {
    key: "pvp_2gate", name: "2게이트 질럿", race: P, vs: P, weight: 0.15, style: "cheese",
    desc: "게이트웨이 2개에서 질럿을 몰아 초반 압박",
    opening: [[8, "pylon"], [9, "gateway"], [10, "gateway"], [12, "pylon"]],
    tech: ["assimilator", "cybernetics_core", "singularity_charge", "robotics_facility", "observatory", "expand", "citadel_of_adun", "templar_archives"],
    producers: { gateway: 3.2, robotics_facility: 0.3 }, producerMax: { gateway: 9, robotics_facility: 1 },
    comp: { zealot: 0.45, dragoon: 0.45, reaver: 0.07, observer: 0.03 },
    expand: [[480, 2], [840, 3], [1140, 4]],
    push: { at: 200, minArmySupply: 10, name: "2게이트 질럿 러쉬" },
    harass: [],
    power: 1.049,
  },

  // ════════════════════════ 저그 vs 테란 ════════════════════════
  {
    key: "zvt_3hat_muta", name: "3해처리 뮤탈", race: Z, vs: T, weight: 0.55, style: "standard",
    desc: "12앞마당 이후 3해처리 레어, 뮤탈리스크 견제 후 럴커·디파일러·울트라 운영",
    opening: [[9, "overlord"], [12, "expand"], [11, "spawning_pool"], [11, "extractor"], [13, "overlord"], [15, "lair"], [17, "expand"], [18, "overlord"], [19, "spire"]],
    tech: ["metabolic_boost", "extractor", "evolution_chamber", "hydralisk_den", "lurker_aspect", "queens_nest", "hive", "defiler_mound", "consume", "ultralisk_cavern", "chitinous_plating", "adrenal_glands", "z_melee_attacks"],
    producers: { hatchery: 0.35 }, producerMax: { hatchery: 3 },
    comp: { mutalisk: 0.45, zergling: 0.35, scourge: 0.06, lurker: 0.14 },
    lateTech: "hive", lateComp: { zergling: 0.45, lurker: 0.15, ultralisk: 0.22, defiler: 0.06, mutalisk: 0.07, scourge: 0.05 },
    expand: [[110, 2], [240, 3], [720, 4], [1000, 5], [1300, 6]],
    push: { at: 780, minArmySupply: 60, name: "럴커·저글링 진출" },
    harass: ["muta_harass", "ling_runby"],
    power: 0.858,
  },
  {
    key: "zvt_3hat_lurker", name: "3해처리 럴커", race: Z, vs: T, weight: 0.25, style: "standard",
    desc: "12앞마당 3해처리 이후 빠른 럴커로 바이오닉 진출을 막고 하이브 운영",
    opening: [[9, "overlord"], [12, "expand"], [11, "spawning_pool"], [11, "extractor"], [13, "overlord"], [15, "lair"], [16, "hydralisk_den"], [17, "expand"], [18, "overlord"], [19, "lurker_aspect"]],
    tech: ["metabolic_boost", "extractor", "evolution_chamber", "queens_nest", "hive", "defiler_mound", "consume", "ultralisk_cavern", "chitinous_plating", "adrenal_glands", "spire"],
    producers: { hatchery: 0.35 }, producerMax: { hatchery: 3 },
    comp: { zergling: 0.5, hydralisk: 0.2, lurker: 0.3 },
    lateTech: "hive", lateComp: { zergling: 0.45, lurker: 0.18, ultralisk: 0.22, defiler: 0.07, hydralisk: 0.08 },
    expand: [[110, 2], [240, 3], [720, 4], [1000, 5], [1300, 6]],
    push: { at: 540, minArmySupply: 36, name: "럴커 조이기" },
    harass: ["ling_runby"],
    power: 0.861,
  },
  {
    key: "zvt_9pool", name: "9드론 발업 저글링", race: Z, vs: T, weight: 0.13, style: "aggressive",
    desc: "9드론 스포닝 풀 이후 저글링 발업, 초반 저글링으로 테란 입구를 두드림",
    opening: [[9, "spawning_pool"], [9, "extractor"], [10, "overlord"], [10, "metabolic_boost"], [12, "expand"]],
    tech: ["lair", "spire", "expand", "extractor", "evolution_chamber", "hydralisk_den", "lurker_aspect", "queens_nest", "hive", "defiler_mound", "consume"],
    producers: { hatchery: 0.4 }, producerMax: { hatchery: 3 },
    comp: { zergling: 0.6, mutalisk: 0.3, scourge: 0.05, lurker: 0.05 },
    lateTech: "hive", lateComp: { zergling: 0.5, lurker: 0.15, defiler: 0.07, mutalisk: 0.18, scourge: 0.1 },
    expand: [[200, 2], [480, 3], [800, 4], [1100, 5]],
    push: { at: 180, minArmySupply: 5, name: "발업 저글링 러쉬" },
    harass: ["ling_runby", "muta_harass"],
    power: 1.244,
  },
  {
    key: "zvt_4pool", name: "4드론 러쉬", race: Z, vs: T, weight: 0.03, style: "cheese",
    desc: "4드론 스포닝 풀, 저글링 6기로 SCV를 노리는 극단적인 치즈 러쉬",
    opening: [[4, "spawning_pool"], [5, "overlord"]],
    tech: ["extractor", "metabolic_boost", "expand", "lair", "spire", "expand", "hydralisk_den", "lurker_aspect"],
    producers: { hatchery: 0.5 }, producerMax: { hatchery: 2 },
    comp: { zergling: 0.75, mutalisk: 0.2, lurker: 0.05 },
    expand: [[330, 2], [600, 3], [900, 4]],
    push: { at: 125, minArmySupply: 3, name: "4드론 저글링 러쉬" },
    harass: ["ling_runby"],
    power: 1.4,
  },

  // ════════════════════════ 저그 vs 프로토스 ════════════════════════
  {
    key: "zvp_3hat_hydra", name: "3해처리 히드라", race: Z, vs: P, weight: 0.55, style: "standard",
    desc: "12앞마당 3해처리, 히드라리스크 물량으로 압박 후 럴커·디파일러 운영",
    opening: [[9, "overlord"], [12, "expand"], [11, "spawning_pool"], [11, "extractor"], [13, "overlord"], [15, "expand"], [16, "hydralisk_den"], [17, "overlord"], [18, "lair"]],
    tech: ["hydra_upgrades", "metabolic_boost", "evolution_chamber", "z_missile_attacks", "extractor", "lurker_aspect", "queens_nest", "hive", "defiler_mound", "consume", "ultralisk_cavern", "chitinous_plating", "spire"],
    producers: { hatchery: 0.4 }, producerMax: { hatchery: 3 },
    comp: { hydralisk: 0.6, zergling: 0.3, lurker: 0.1 },
    lateTech: "hive", lateComp: { hydralisk: 0.35, zergling: 0.3, lurker: 0.13, ultralisk: 0.12, defiler: 0.06, scourge: 0.04 },
    expand: [[110, 2], [220, 3], [700, 4], [1000, 5], [1300, 6]],
    push: { at: 540, minArmySupply: 50, name: "히드라 타이밍 러쉬" },
    harass: ["ling_runby"],
    power: 1.004,
  },
  {
    key: "zvp_muta", name: "3해처리 뮤탈", race: Z, vs: P, weight: 0.22, style: "standard",
    desc: "레어 이후 스파이어, 뮤탈리스크로 커세어 없는 프로토스를 흔드는 운영",
    opening: [[9, "overlord"], [12, "expand"], [11, "spawning_pool"], [11, "extractor"], [13, "overlord"], [15, "lair"], [17, "expand"], [18, "overlord"], [19, "spire"]],
    tech: ["metabolic_boost", "hydralisk_den", "hydra_upgrades", "evolution_chamber", "extractor", "lurker_aspect", "queens_nest", "hive", "defiler_mound", "consume"],
    producers: { hatchery: 0.35 }, producerMax: { hatchery: 3 },
    comp: { mutalisk: 0.5, zergling: 0.2, hydralisk: 0.3 },
    lateTech: "hive", lateComp: { hydralisk: 0.35, zergling: 0.3, lurker: 0.12, defiler: 0.06, mutalisk: 0.12, scourge: 0.05 },
    expand: [[110, 2], [240, 3], [720, 4], [1000, 5], [1300, 6]],
    push: { at: 720, minArmySupply: 60, name: "히드라·저글링 진출" },
    harass: ["muta_harass", "ling_runby"],
    power: 0.842,
  },
  {
    key: "zvp_9pool", name: "9드론 발업 저글링", race: Z, vs: P, weight: 0.13, style: "aggressive",
    desc: "9드론 스포닝 풀 이후 발업 저글링으로 포지 더블을 흔드는 운영",
    opening: [[9, "spawning_pool"], [9, "extractor"], [10, "overlord"], [10, "metabolic_boost"], [12, "expand"]],
    tech: ["hydralisk_den", "lair", "hydra_upgrades", "expand", "extractor", "evolution_chamber", "lurker_aspect", "queens_nest", "hive", "defiler_mound", "consume"],
    producers: { hatchery: 0.4 }, producerMax: { hatchery: 3 },
    comp: { zergling: 0.45, hydralisk: 0.45, lurker: 0.1 },
    lateTech: "hive", lateComp: { hydralisk: 0.35, zergling: 0.35, lurker: 0.15, defiler: 0.07, scourge: 0.08 },
    expand: [[200, 2], [460, 3], [800, 4], [1100, 5]],
    push: { at: 185, minArmySupply: 5, name: "발업 저글링 러쉬" },
    harass: ["ling_runby"],
    power: 1.254,
  },
  {
    key: "zvp_4pool", name: "4드론 러쉬", race: Z, vs: P, weight: 0.05, style: "cheese",
    desc: "4드론 스포닝 풀, 포지 더블을 노리는 저글링 치즈 러쉬",
    opening: [[4, "spawning_pool"], [5, "overlord"]],
    tech: ["extractor", "metabolic_boost", "expand", "hydralisk_den", "lair", "hydra_upgrades", "expand"],
    producers: { hatchery: 0.5 }, producerMax: { hatchery: 2 },
    comp: { zergling: 0.6, hydralisk: 0.4 },
    expand: [[330, 2], [600, 3], [900, 4]],
    push: { at: 125, minArmySupply: 3, name: "4드론 저글링 러쉬" },
    harass: ["ling_runby"],
    power: 1.4,
  },

  // ════════════════════════ 저그 vs 저그 ════════════════════════
  {
    key: "zvz_9pool_muta", name: "9풀 발업 뮤탈", race: Z, vs: Z, weight: 0.6, style: "standard",
    desc: "9드론 스포닝 풀 발업 저글링으로 초반을 버틴 뒤 빠른 스파이어, 뮤탈·스커지 싸움",
    opening: [[9, "spawning_pool"], [9, "extractor"], [10, "overlord"], [10, "metabolic_boost"], [12, "lair"], [13, "spire"], [15, "expand"]],
    tech: ["evolution_chamber", "extractor", "expand", "hydralisk_den", "queens_nest", "hive"],
    producers: { hatchery: 0.4 }, producerMax: { hatchery: 3 },
    comp: { zergling: 0.45, mutalisk: 0.45, scourge: 0.1 },
    lateTech: "hive", lateComp: { mutalisk: 0.45, zergling: 0.35, scourge: 0.1, hydralisk: 0.1 },
    expand: [[330, 2], [660, 3], [960, 4]],
    push: { at: 480, minArmySupply: 20, name: "뮤탈리스크 교전" },
    harass: ["muta_harass"],
    power: 0.984,
  },
  {
    key: "zvz_12hat", name: "12앞마당", race: Z, vs: Z, weight: 0.25, style: "greedy",
    desc: "12앞마당으로 드론을 늘린 뒤 뮤탈리스크 물량",
    opening: [[9, "overlord"], [12, "expand"], [11, "spawning_pool"], [11, "extractor"], [13, "overlord"], [14, "metabolic_boost"], [15, "lair"], [17, "spire"]],
    tech: ["evolution_chamber", "extractor", "expand", "hydralisk_den", "queens_nest", "hive"],
    producers: { hatchery: 0.35 }, producerMax: { hatchery: 3 },
    comp: { zergling: 0.4, mutalisk: 0.5, scourge: 0.1 },
    expand: [[110, 2], [480, 3], [840, 4]],
    push: { at: 540, minArmySupply: 26, name: "뮤탈리스크 진출" },
    harass: ["muta_harass"],
    power: 0.949,
  },
  {
    key: "zvz_4pool", name: "4드론 러쉬", race: Z, vs: Z, weight: 0.15, style: "cheese",
    desc: "4드론 스포닝 풀, 상대 저그의 드론을 노리는 저글링 러쉬",
    opening: [[4, "spawning_pool"], [5, "overlord"]],
    tech: ["extractor", "metabolic_boost", "lair", "spire", "expand"],
    producers: { hatchery: 0.5 }, producerMax: { hatchery: 2 },
    comp: { zergling: 0.7, mutalisk: 0.25, scourge: 0.05 },
    expand: [[360, 2], [660, 3]],
    push: { at: 125, minArmySupply: 3, name: "4드론 저글링 러쉬" },
    harass: ["ling_runby"],
    power: 1.194,
  },
];

/** 종족전에 맞는 빌드 선택 - 전략 능력치가 높을수록 치즈보다 정석 빌드를 선호 */
export function pickPlan(race: Race, vs: Race, strategySkill: number, rand: () => number): Plan {
  const candidates = PLANS.filter(p => p.race === race && p.vs === vs);
  const weights = candidates.map(p => {
    let w = p.weight;
    if (p.style === "cheese") w *= Math.max(0.3, 1 - strategySkill * 0.5);
    if (p.style === "standard") w *= 1 + Math.max(0, strategySkill) * 0.3;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[0];
}
