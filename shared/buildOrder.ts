/**
 * 스타크래프트 빌드 오더 및 테크 트리 시스템
 */

export type Race = "terran" | "protoss" | "zerg";
export type Building = string;

/**
 * 테란 빌드 오더
 * 배럭 → 팩토리 → 스타포트
 */
export const TERRAN_BUILD_ORDER: Record<string, Building[]> = {
  initial: ["배럭"], // 초반: 배럭만 가능
  barracks: ["팩토리"], // 배럭 이후: 팩토리 가능
  factory: ["스타포트"], // 팩토리 이후: 스타포트 가능
};

export const TERRAN_UNITS: Record<string, string[]> = {
  initial: ["마린", "SCV"], // 초반: 마린, SCV
  barracks: ["마린", "메딕", "파이어뱃"], // 배럭: 마린, 메딕, 파이어뱃
  factory: ["벌쳐", "탱크", "골리앗"], // 팩토리: 벌쳐, 탱크, 골리앗
  starport: ["배틀크루저", "배슬", "사이언스 베슬"], // 스타포트: 배틀크루저, 배슬
};

/**
 * 프로토스 빌드 오더
 * 게이트 → 사이버네틱스 코어 → (로보틱스 또는 스타게이트)
 */
export const PROTOSS_BUILD_ORDER: Record<string, Building[]> = {
  initial: ["게이트웨이"], // 초반: 게이트웨이만 가능
  gateway: ["사이버네틱스 코어"], // 게이트웨이 이후: 코어 가능
  core: ["로보틱스 팩토리", "스타게이트"], // 코어 이후: 로보틱스 또는 스타게이트 가능
};

export const PROTOSS_UNITS: Record<string, string[]> = {
  initial: ["질럿", "프로브"], // 초반: 질럿, 프로브
  gateway: ["질럿", "드래군"], // 게이트웨이: 질럿, 드래군
  robotics: ["옵저버", "리버", "드래군"], // 로보틱스: 옵저버, 리버
  stargate: ["케리어", "아비터"], // 스타게이트: 케리어, 아비터
};

/**
 * 저그 빌드 오더
 * 스포닝풀 → 레어 → 하이브
 */
export const ZERG_BUILD_ORDER: Record<string, Building[]> = {
  initial: ["스포닝풀"], // 초반: 스포닝풀만 가능
  spawning_pool: ["레어"], // 스포닝풀 이후: 레어 가능
  lair: ["하이브"], // 레어 이후: 하이브 가능
};

export const ZERG_UNITS: Record<string, string[]> = {
  initial: ["저글링", "드론"], // 초반: 저글링, 드론
  spawning_pool: ["저글링", "히드라"], // 스포닝풀: 저글링, 히드라
  lair: ["뮤탈리스크", "럴커", "히드라"], // 레어: 뮤탈리스크, 럴커
  hive: ["울트라, 가디언, 디파일러"], // 하이브: 울트라, 가디언, 디파일러
};

/**
 * 빌드 오더 상태 추적
 */
export interface BuildOrderState {
  race: Race;
  completedBuildings: Building[]; // 완성된 건물
  availableBuildings: Building[]; // 건설 가능한 건물
  availableUnits: string[]; // 생산 가능한 유닛
}

/**
 * 빌드 오더 상태 초기화
 */
export function initializeBuildOrder(race: Race): BuildOrderState {
  const buildOrder =
    race === "terran"
      ? TERRAN_BUILD_ORDER
      : race === "protoss"
        ? PROTOSS_BUILD_ORDER
        : ZERG_BUILD_ORDER;

  const units =
    race === "terran"
      ? TERRAN_UNITS
      : race === "protoss"
        ? PROTOSS_UNITS
        : ZERG_UNITS;

  return {
    race,
    completedBuildings: [],
    availableBuildings: buildOrder.initial || [],
    availableUnits: units.initial || [],
  };
}

/**
 * 건물 완성 시 빌드 오더 업데이트
 */
export function updateBuildOrder(state: BuildOrderState, building: Building): void {
  if (!state.completedBuildings.includes(building)) {
    state.completedBuildings.push(building);
  }

  const buildOrder =
    state.race === "terran"
      ? TERRAN_BUILD_ORDER
      : state.race === "protoss"
        ? PROTOSS_BUILD_ORDER
        : ZERG_BUILD_ORDER;

  const units =
    state.race === "terran"
      ? TERRAN_UNITS
      : state.race === "protoss"
        ? PROTOSS_UNITS
        : ZERG_UNITS;

  // 건물 이름으로 다음 가능한 건물 찾기
  let nextBuildings: Building[] = [];

  if (state.race === "terran") {
    if (building === "배럭") {
      nextBuildings = buildOrder.barracks || [];
    } else if (building === "팩토리") {
      nextBuildings = buildOrder.factory || [];
    }
  } else if (state.race === "protoss") {
    if (building === "게이트웨이") {
      nextBuildings = buildOrder.gateway || [];
    } else if (building === "사이버네틱스 코어") {
      nextBuildings = buildOrder.core || [];
    }
  } else if (state.race === "zerg") {
    if (building === "스포닝풀") {
      nextBuildings = buildOrder.spawning_pool || [];
    } else if (building === "레어") {
      nextBuildings = buildOrder.lair || [];
    }
  }

  // 새로운 건물 추가
  nextBuildings.forEach(b => {
    if (!state.availableBuildings.includes(b)) {
      state.availableBuildings.push(b);
    }
  });

  // 유닛 업데이트
  if (state.race === "terran") {
    if (state.completedBuildings.includes("배럭")) {
      (units.barracks || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
    if (state.completedBuildings.includes("팩토리")) {
      (units.factory || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
    if (state.completedBuildings.includes("스타포트")) {
      (units.starport || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
  } else if (state.race === "protoss") {
    if (state.completedBuildings.includes("게이트웨이")) {
      (units.gateway || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
    if (state.completedBuildings.includes("로보틱스 팩토리")) {
      (units.robotics || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
    if (state.completedBuildings.includes("스타게이트")) {
      (units.stargate || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
  } else if (state.race === "zerg") {
    if (state.completedBuildings.includes("스포닝풀")) {
      (units.spawning_pool || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
    if (state.completedBuildings.includes("레어")) {
      (units.lair || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
    if (state.completedBuildings.includes("하이브")) {
      (units.hive || []).forEach(u => {
        if (!state.availableUnits.includes(u)) {
          state.availableUnits.push(u);
        }
      });
    }
  }
}

/**
 * 건물 건설 가능 여부 확인
 */
export function canBuildBuilding(state: BuildOrderState, building: Building): boolean {
  return state.availableBuildings.includes(building);
}

/**
 * 유닛 생산 가능 여부 확인
 */
export function canProduceUnit(state: BuildOrderState, unit: string): boolean {
  return state.availableUnits.includes(unit);
}
