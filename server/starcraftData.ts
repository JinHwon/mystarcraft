/**
 * 스타크래프트1 빌드 오더 및 유닛 데이터베이스 v2.0
 * 실제 프로 경기에서 사용되는 빌드와 유닛 조합
 * 종족전별 상세 빌드오더 및 유닛 상성 반영
 */

export type Race = "terran" | "zerg" | "protoss";
export type Unit = string;

export interface BuildOrder {
  name: string;
  race: Race;
  vsRace: Race;
  description: string;
  earlyUnits: Unit[];
  midUnits: Unit[];
  lateUnits: Unit[];
  techPath: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface UnitStats {
  name: string;
  race: Race;
  cost: number;
  gasCost: number;
  buildTime: number;
  supply: number;
  attack: number;
  defense: number;
  speed: number;
  counters: string[];
  countersTo: string[];
  description: string;
}

// ══════════════════════════════════════════════════════════════
// 테란 빌드오더
// ══════════════════════════════════════════════════════════════

export const terranVsProtossBuild: BuildOrder[] = [
  {
    name: "1배럭 FD (팩토리 더블)",
    race: "terran",
    vsRace: "protoss",
    description: "배럭 하나 짓고 팩토리로 넘어가면서 앞마당 확장. 시즈탱크와 벌쳐로 프로토스 견제",
    earlyUnits: ["마린", "벌쳐"],
    midUnits: ["시즈탱크", "벌쳐", "마린", "메딕"],
    lateUnits: ["시즈탱크", "골리앗", "사이언스 베슬"],
    techPath: ["배럭", "팩토리", "커맨드센터", "스타포트"],
    difficulty: "intermediate",
  },
  {
    name: "2배럭 마린 푸시",
    race: "terran",
    vsRace: "protoss",
    description: "배럭 2개에서 마린을 뽑아 초반 압박. 프로토스의 넥서스 퍼스트를 견제",
    earlyUnits: ["마린", "마린", "마린", "마린"],
    midUnits: ["마린", "메딕", "시즈탱크"],
    lateUnits: ["시즈탱크", "골리앗", "사이언스 베슬"],
    techPath: ["배럭", "배럭", "팩토리"],
    difficulty: "beginner",
  },
  {
    name: "메카닉 (기계화 부대)",
    race: "terran",
    vsRace: "protoss",
    description: "팩토리 2~3개에서 시즈탱크와 골리앗 위주 생산. 시즈라인으로 밀어붙이는 전략",
    earlyUnits: ["마린", "벌쳐"],
    midUnits: ["시즈탱크", "골리앗", "벌쳐"],
    lateUnits: ["시즈탱크", "골리앗", "사이언스 베슬", "배틀크루저"],
    techPath: ["배럭", "팩토리", "팩토리", "스타포트"],
    difficulty: "advanced",
  },
];

export const terranVsZergBuild: BuildOrder[] = [
  {
    name: "1-1-1 빌드",
    race: "terran",
    vsRace: "zerg",
    description: "배럭-팩토리-스타포트 하나씩. 벌쳐로 견제하면서 드랍십 테크",
    earlyUnits: ["마린", "벌쳐"],
    midUnits: ["마린", "메딕", "시즈탱크", "벌쳐"],
    lateUnits: ["시즈탱크", "사이언스 베슬", "골리앗"],
    techPath: ["배럭", "팩토리", "스타포트"],
    difficulty: "intermediate",
  },
  {
    name: "2배럭 벙커 러쉬",
    race: "terran",
    vsRace: "zerg",
    description: "배럭 2개에서 마린 뽑고 상대 앞마당에 벙커 건설. 저그의 해처리 퍼스트를 견제",
    earlyUnits: ["마린", "마린", "마린"],
    midUnits: ["마린", "메딕", "시즈탱크"],
    lateUnits: ["시즈탱크", "사이언스 베슬"],
    techPath: ["배럭", "배럭", "팩토리"],
    difficulty: "beginner",
  },
  {
    name: "SK 테란 (5팩 벌쳐)",
    race: "terran",
    vsRace: "zerg",
    description: "팩토리 5개에서 벌쳐를 대량 생산. 마인으로 저그 멀티를 견제하면서 경제 압박",
    earlyUnits: ["마린", "벌쳐"],
    midUnits: ["벌쳐", "벌쳐", "시즈탱크"],
    lateUnits: ["시즈탱크", "골리앗", "사이언스 베슬"],
    techPath: ["배럭", "팩토리", "팩토리", "팩토리"],
    difficulty: "advanced",
  },
];

export const terranVsTerranBuild: BuildOrder[] = [
  {
    name: "시즈 확장",
    race: "terran",
    vsRace: "terran",
    description: "시즈탱크로 고지를 선점하면서 앞마당 확장. TvT의 기본 빌드",
    earlyUnits: ["마린", "시즈탱크"],
    midUnits: ["시즈탱크", "골리앗", "벌쳐"],
    lateUnits: ["배틀크루저", "사이언스 베슬"],
    techPath: ["배럭", "팩토리", "스타포트"],
    difficulty: "intermediate",
  },
];

// ══════════════════════════════════════════════════════════════
// 프로토스 빌드오더
// ══════════════════════════════════════════════════════════════

export const protossVsTerranBuild: BuildOrder[] = [
  {
    name: "2게이트 드래군",
    race: "protoss",
    vsRace: "terran",
    description: "게이트웨이 2개에서 드래군 위주 생산. 테란의 앞마당 확장을 견제",
    earlyUnits: ["질럿", "드래군", "드래군"],
    midUnits: ["드래군", "하이템플러", "질럿"],
    lateUnits: ["아칸", "리버", "아비터"],
    techPath: ["게이트웨이", "사이버네틱스 코어", "게이트웨이"],
    difficulty: "beginner",
  },
  {
    name: "리버 셔틀 (로보틱스)",
    race: "protoss",
    vsRace: "terran",
    description: "로보틱스 팩토리에서 리버와 셔틀 생산. 리버 드랍으로 테란 시즈라인 파괴",
    earlyUnits: ["질럿", "드래군"],
    midUnits: ["리버", "드래군", "하이템플러"],
    lateUnits: ["아칸", "리버", "아비터"],
    techPath: ["게이트웨이", "사이버네틱스 코어", "로보틱스 팩토리"],
    difficulty: "intermediate",
  },
  {
    name: "다크템플러 러쉬",
    race: "protoss",
    vsRace: "terran",
    description: "다크 아카이브에서 다크템플러 생산. 테란의 디텍터가 없는 틈을 노린 기습",
    earlyUnits: ["질럿", "다크템플러", "다크템플러"],
    midUnits: ["다크템플러", "드래군", "하이템플러"],
    lateUnits: ["아칸", "리버", "아비터"],
    techPath: ["게이트웨이", "사이버네틱스 코어", "템플러 아카이브"],
    difficulty: "intermediate",
  },
  {
    name: "아비터 리콜",
    race: "protoss",
    vsRace: "terran",
    description: "아비터의 리콜로 테란 본진에 병력 소환. PvT 후반 결정타",
    earlyUnits: ["질럿", "드래군"],
    midUnits: ["드래군", "하이템플러", "아비터"],
    lateUnits: ["아칸", "아비터", "캐리어"],
    techPath: ["게이트웨이", "사이버네틱스 코어", "스타게이트", "아비터 트리뷰널"],
    difficulty: "advanced",
  },
];

export const protossVsZergBuild: BuildOrder[] = [
  {
    name: "포지 캐논 (FFE)",
    race: "protoss",
    vsRace: "zerg",
    description: "포지 퍼스트로 앞마당에 캐논을 짓고 안전하게 확장. PvZ의 기본 빌드",
    earlyUnits: ["질럿"],
    midUnits: ["질럿", "드래군", "하이템플러"],
    lateUnits: ["아칸", "리버", "커세어"],
    techPath: ["포지", "게이트웨이", "사이버네틱스 코어", "템플러 아카이브"],
    difficulty: "beginner",
  },
  {
    name: "커세어 리버",
    race: "protoss",
    vsRace: "zerg",
    description: "커세어로 오버로드 사냥 + 리버 셔틀로 드론 학살. PvZ의 핵심 전략",
    earlyUnits: ["질럿", "커세어"],
    midUnits: ["커세어", "리버", "드래군"],
    lateUnits: ["아칸", "리버", "커세어"],
    techPath: ["게이트웨이", "사이버네틱스 코어", "스타게이트", "로보틱스 팩토리"],
    difficulty: "intermediate",
  },
  {
    name: "2게이트 질럿 러쉬",
    race: "protoss",
    vsRace: "zerg",
    description: "게이트웨이 2개에서 질럿을 뽑아 저그의 해처리 퍼스트를 견제",
    earlyUnits: ["질럿", "질럿", "질럿", "질럿"],
    midUnits: ["질럿", "드래군", "하이템플러"],
    lateUnits: ["아칸", "리버"],
    techPath: ["게이트웨이", "게이트웨이", "사이버네틱스 코어"],
    difficulty: "beginner",
  },
];

export const protossVsProtossBuild: BuildOrder[] = [
  {
    name: "2게이트 질럿",
    race: "protoss",
    vsRace: "protoss",
    description: "게이트웨이 2개에서 질럿 위주 생산. PvP 초반 싸움의 기본",
    earlyUnits: ["질럿", "질럿", "질럿"],
    midUnits: ["드래군", "리버"],
    lateUnits: ["리버", "아칸"],
    techPath: ["게이트웨이", "게이트웨이", "로보틱스 팩토리"],
    difficulty: "beginner",
  },
];

// ══════════════════════════════════════════════════════════════
// 저그 빌드오더
// ══════════════════════════════════════════════════════════════

export const zergVsTerranBuild: BuildOrder[] = [
  {
    name: "3해처리 뮤탈",
    race: "zerg",
    vsRace: "terran",
    description: "해처리 3개로 경제를 키우고 뮤탈리스크로 견제. ZvT의 기본 빌드",
    earlyUnits: ["저글링", "저글링"],
    midUnits: ["뮤탈리스크", "저글링", "럴커"],
    lateUnits: ["울트라리스크", "디파일러", "럴커"],
    techPath: ["스포닝풀", "해처리", "레어", "스파이어"],
    difficulty: "intermediate",
  },
  {
    name: "2해처리 럴커",
    race: "zerg",
    vsRace: "terran",
    description: "해처리 2개에서 히드라-럴커 테크. 테란의 마린 메딕을 럴커로 상대",
    earlyUnits: ["저글링", "히드라리스크"],
    midUnits: ["럴커", "히드라리스크", "저글링"],
    lateUnits: ["울트라리스크", "디파일러"],
    techPath: ["스포닝풀", "해처리", "레어", "히드라리스크 덴"],
    difficulty: "beginner",
  },
  {
    name: "저글링 올인",
    race: "zerg",
    vsRace: "terran",
    description: "스포닝풀 빠르게 짓고 저글링 물량으로 초반 올인. 테란의 벙커가 늦으면 승리",
    earlyUnits: ["저글링", "저글링", "저글링", "저글링"],
    midUnits: ["저글링", "뮤탈리스크"],
    lateUnits: ["뮤탈리스크", "럴커"],
    techPath: ["스포닝풀"],
    difficulty: "beginner",
  },
];

export const zergVsProtossBuild: BuildOrder[] = [
  {
    name: "3해처리 히드라",
    race: "zerg",
    vsRace: "protoss",
    description: "해처리 3개로 경제를 키우고 히드라리스크 물량으로 프로토스 압박",
    earlyUnits: ["저글링", "히드라리스크"],
    midUnits: ["히드라리스크", "럴커", "저글링"],
    lateUnits: ["울트라리스크", "디파일러", "럴커"],
    techPath: ["스포닝풀", "해처리", "히드라리스크 덴", "레어"],
    difficulty: "intermediate",
  },
  {
    name: "뮤탈 견제",
    race: "zerg",
    vsRace: "protoss",
    description: "뮤탈리스크로 프로브 견제하면서 경제 압박. 커세어가 나오기 전에 피해를 줘야 함",
    earlyUnits: ["저글링"],
    midUnits: ["뮤탈리스크", "저글링", "스커지"],
    lateUnits: ["히드라리스크", "럴커", "디파일러"],
    techPath: ["스포닝풀", "레어", "스파이어"],
    difficulty: "intermediate",
  },
  {
    name: "저글링 러쉬",
    race: "zerg",
    vsRace: "protoss",
    description: "저글링으로 프로토스 초반 압박. 포지 캐논이 늦으면 승리",
    earlyUnits: ["저글링", "저글링", "저글링"],
    midUnits: ["저글링", "히드라리스크"],
    lateUnits: ["럴커", "울트라리스크"],
    techPath: ["스포닝풀"],
    difficulty: "beginner",
  },
];

export const zergVsZergBuild: BuildOrder[] = [
  {
    name: "9풀 저글링",
    race: "zerg",
    vsRace: "zerg",
    description: "9서플에 스포닝풀. ZvZ 초반 저글링 싸움의 기본",
    earlyUnits: ["저글링", "저글링"],
    midUnits: ["뮤탈리스크", "저글링"],
    lateUnits: ["뮤탈리스크", "스커지"],
    techPath: ["스포닝풀", "레어", "스파이어"],
    difficulty: "beginner",
  },
];

// ══════════════════════════════════════════════════════════════
// 유닛 상세 정보 (스타크래프트1 기반)
// ══════════════════════════════════════════════════════════════

export const unitStats: Record<string, UnitStats> = {
  // ── 테란 유닛 ──
  마린: {
    name: "마린", race: "terran", cost: 50, gasCost: 0, buildTime: 24, supply: 1,
    attack: 6, defense: 0, speed: 3,
    counters: ["럴커", "리버", "하이템플러", "울트라리스크"],
    countersTo: ["뮤탈리스크", "저글링"],
    description: "테란의 기본 보병. 스팀팩으로 공격속도와 이동속도 증가. 메딕과 조합하면 강력",
  },
  메딕: {
    name: "메딕", race: "terran", cost: 50, gasCost: 25, buildTime: 30, supply: 1,
    attack: 0, defense: 0, speed: 3,
    counters: [],
    countersTo: [],
    description: "마린을 치료하는 지원 유닛. 마린 메딕 조합은 TvZ의 핵심",
  },
  파이어뱃: {
    name: "파이어뱃", race: "terran", cost: 50, gasCost: 25, buildTime: 24, supply: 1,
    attack: 16, defense: 1, speed: 3,
    counters: ["드래군", "히드라리스크"],
    countersTo: ["저글링", "질럿"],
    description: "근접 스플래시 공격. 저글링과 질럿 상대로 효과적",
  },
  벌쳐: {
    name: "벌쳐", race: "terran", cost: 75, gasCost: 0, buildTime: 30, supply: 2,
    attack: 20, defense: 0, speed: 5,
    counters: ["드래군", "질럿"],
    countersTo: ["저글링", "드론", "프로브", "SCV"],
    description: "빠른 이동속도와 스파이더 마인. 일꾼 견제의 핵심 유닛. TvZ에서 드론 학살용",
  },
  시즈탱크: {
    name: "시즈탱크", race: "terran", cost: 150, gasCost: 100, buildTime: 50, supply: 2,
    attack: 70, defense: 1, speed: 1,
    counters: ["뮤탈리스크", "리버", "아비터"],
    countersTo: ["저글링", "질럿", "히드라리스크", "드래군"],
    description: "시즈모드 시 사거리 12의 강력한 스플래시. TvZ, TvP의 핵심 유닛. 포지셔닝이 중요",
  },
  골리앗: {
    name: "골리앗", race: "terran", cost: 100, gasCost: 50, buildTime: 40, supply: 2,
    attack: 12, defense: 1, speed: 2,
    counters: ["시즈탱크", "럴커"],
    countersTo: ["뮤탈리스크", "캐리어", "배틀크루저"],
    description: "대공 특화 유닛. 뮤탈리스크와 캐리어 상대로 필수",
  },
  배틀크루저: {
    name: "배틀크루저", race: "terran", cost: 400, gasCost: 300, buildTime: 133, supply: 6,
    attack: 25, defense: 3, speed: 2,
    counters: ["스커지", "디파일러"],
    countersTo: ["대부분의 지상 유닛"],
    description: "테란의 최종 유닛. 야마토 캐논으로 고가치 유닛 저격",
  },
  "사이언스 베슬": {
    name: "사이언스 베슬", race: "terran", cost: 100, gasCost: 225, buildTime: 80, supply: 2,
    attack: 0, defense: 0, speed: 3,
    counters: ["스커지"],
    countersTo: ["럴커", "다크템플러", "뮤탈리스크"],
    description: "이레디에이트로 뮤탈 견제, 디펜시브 매트릭스로 탱크 보호, 디텍터 역할",
  },

  // ── 프로토스 유닛 ──
  질럿: {
    name: "질럿", race: "protoss", cost: 100, gasCost: 0, buildTime: 38, supply: 2,
    attack: 16, defense: 1, speed: 2,
    counters: ["럴커", "시즈탱크", "리버"],
    countersTo: ["마린", "저글링", "SCV", "드론"],
    description: "프로토스의 기본 근접 유닛. 높은 공격력. 다리 업그레이드 시 이동속도 대폭 증가",
  },
  드래군: {
    name: "드래군", race: "protoss", cost: 125, gasCost: 50, buildTime: 40, supply: 2,
    attack: 20, defense: 1, speed: 2,
    counters: ["시즈탱크", "럴커"],
    countersTo: ["뮤탈리스크", "벌쳐", "마린"],
    description: "프로토스의 기본 원거리 유닛. 사거리 업그레이드 필수. PvT, PvZ 모두 핵심",
  },
  하이템플러: {
    name: "하이템플러", race: "protoss", cost: 50, gasCost: 150, buildTime: 50, supply: 2,
    attack: 0, defense: 0, speed: 2,
    counters: ["고스트", "EMP"],
    countersTo: ["마린", "히드라리스크", "저글링"],
    description: "사이오닉 스톰으로 뭉친 유닛 학살. PvT에서 마린 녹이기, PvZ에서 히드라 녹이기 핵심",
  },
  다크템플러: {
    name: "다크템플러", race: "protoss", cost: 125, gasCost: 100, buildTime: 50, supply: 2,
    attack: 40, defense: 1, speed: 3,
    counters: ["옵저버", "사이언스 베슬", "오버로드"],
    countersTo: ["일꾼 전체", "디텍터 없는 모든 유닛"],
    description: "영구 클로킹 근접 유닛. 디텍터 없으면 잡을 수 없음. PvT 다크 러쉬의 핵심",
  },
  리버: {
    name: "리버", race: "protoss", cost: 200, gasCost: 100, buildTime: 70, supply: 4,
    attack: 100, defense: 2, speed: 1,
    countersTo: ["시즈탱크", "마린 뭉치", "저글링 뭉치", "드론 라인"],
    counters: ["뮤탈리스크", "벌쳐"],
    description: "스캐럽으로 100 데미지 스플래시. 셔틀에 태워서 드랍하는 것이 핵심. PvT, PvZ 모두 강력",
  },
  아칸: {
    name: "아칸", race: "protoss", cost: 100, gasCost: 300, buildTime: 20, supply: 4,
    attack: 30, defense: 3, speed: 2,
    counters: ["드래군", "히드라리스크"],
    countersTo: ["저글링", "마린", "질럿"],
    description: "하이템플러 2기 합체. 높은 체력과 스플래시 공격. 저글링 상대로 압도적",
  },
  캐리어: {
    name: "캐리어", race: "protoss", cost: 350, gasCost: 250, buildTime: 140, supply: 6,
    attack: 48, defense: 4, speed: 2,
    counters: ["골리앗", "스커지", "히드라리스크"],
    countersTo: ["대부분의 지상 유닛"],
    description: "인터셉터 8기를 발진시키는 프로토스 최종 유닛. 후반 게임의 핵심",
  },
  아비터: {
    name: "아비터", race: "protoss", cost: 100, gasCost: 350, buildTime: 100, supply: 4,
    attack: 10, defense: 1, speed: 3,
    counters: ["EMP", "스커지"],
    countersTo: [],
    description: "리콜로 병력 소환, 스테이시스 필드로 적 유닛 동결, 클로킹 필드로 아군 은폐. PvT 후반 핵심",
  },
  커세어: {
    name: "커세어", race: "protoss", cost: 150, gasCost: 100, buildTime: 40, supply: 2,
    attack: 5, defense: 1, speed: 5,
    counters: ["골리앗", "히드라리스크"],
    countersTo: ["오버로드", "뮤탈리스크", "스커지"],
    description: "PvZ에서 오버로드 사냥 전문. 디스럽션 웹으로 시즈탱크 무력화도 가능",
  },
  옵저버: {
    name: "옵저버", race: "protoss", cost: 25, gasCost: 75, buildTime: 40, supply: 1,
    attack: 0, defense: 0, speed: 3,
    counters: [],
    countersTo: ["럴커", "다크템플러"],
    description: "영구 클로킹 디텍터. 럴커와 다크템플러를 잡기 위한 필수 유닛",
  },

  // ── 저그 유닛 ──
  드론: {
    name: "드론", race: "zerg", cost: 50, gasCost: 0, buildTime: 20, supply: 1,
    attack: 5, defense: 0, speed: 2,
    counters: ["마린", "질럿", "벌쳐"],
    countersTo: [],
    description: "저그의 일꾼. 건물로 변태 가능. 드론 수가 곧 경제력",
  },
  저글링: {
    name: "저글링", race: "zerg", cost: 25, gasCost: 0, buildTime: 15, supply: 1,
    attack: 5, defense: 0, speed: 4,
    counters: ["파이어뱃", "아칸", "리버", "시즈탱크"],
    countersTo: ["마린", "SCV", "프로브", "드론"],
    description: "저그의 기본 유닛. 2마리씩 생산. 서라운드와 물량이 핵심. 아드레날린 업 시 공속 2배",
  },
  히드라리스크: {
    name: "히드라리스크", race: "zerg", cost: 75, gasCost: 25, buildTime: 28, supply: 1,
    attack: 10, defense: 0, speed: 2,
    counters: ["시즈탱크", "리버", "하이템플러"],
    countersTo: ["뮤탈리스크", "드래군", "캐리어"],
    description: "저그의 원거리 유닛. 사거리 업 필수. 럴커로 변태 가능. ZvP의 핵심 유닛",
  },
  뮤탈리스크: {
    name: "뮤탈리스크", race: "zerg", cost: 100, gasCost: 100, buildTime: 40, supply: 2,
    attack: 9, defense: 0, speed: 5,
    counters: ["골리앗", "커세어", "사이언스 베슬"],
    countersTo: ["SCV", "프로브", "드론", "시즈탱크"],
    description: "빠른 이동속도와 바운스 공격. 일꾼 견제의 핵심. ZvT에서 SCV 학살, ZvP에서 프로브 견제",
  },
  럴커: {
    name: "럴커", race: "zerg", cost: 125, gasCost: 125, buildTime: 40, supply: 2,
    attack: 20, defense: 1, speed: 2,
    counters: ["사이언스 베슬", "옵저버"],
    countersTo: ["마린", "질럿", "저글링", "히드라리스크"],
    description: "버로우 상태에서 직선 스플래시 공격. 디텍터 없으면 잡을 수 없음. ZvT, ZvP 모두 핵심",
  },
  울트라리스크: {
    name: "울트라리스크", race: "zerg", cost: 200, gasCost: 200, buildTime: 60, supply: 4,
    attack: 20, defense: 3, speed: 3,
    counters: ["시즈탱크", "리버", "다크 스웜"],
    countersTo: ["마린", "질럿", "저글링"],
    description: "저그의 최종 지상 유닛. 높은 체력과 방어력. 디파일러의 다크 스웜과 조합하면 무적",
  },
  디파일러: {
    name: "디파일러", race: "zerg", cost: 50, gasCost: 150, buildTime: 50, supply: 2,
    attack: 0, defense: 1, speed: 2,
    counters: ["사이언스 베슬", "EMP"],
    countersTo: ["시즈탱크", "캐리어", "배틀크루저"],
    description: "다크 스웜으로 원거리 공격 무효화, 플레이그로 적 유닛 체력 감소. ZvT 후반의 핵심",
  },
  스커지: {
    name: "스커지", race: "zerg", cost: 25, gasCost: 75, buildTime: 30, supply: 1,
    attack: 110, defense: 0, speed: 5,
    counters: ["골리앗", "커세어"],
    countersTo: ["캐리어", "배틀크루저", "아비터", "사이언스 베슬"],
    description: "자폭 공중 유닛. 2마리씩 생산. 고가치 공중 유닛 저격 전문",
  },
  가디언: {
    name: "가디언", race: "zerg", cost: 100, gasCost: 200, buildTime: 40, supply: 2,
    attack: 20, defense: 2, speed: 1,
    counters: ["골리앗", "커세어", "뮤탈리스크"],
    countersTo: ["건물", "시즈탱크", "벙커"],
    description: "장거리 공중 폭격기. 사거리 8로 건물과 지상 유닛을 안전하게 공격",
  },
};

// ══════════════════════════════════════════════════════════════
// 빌드 오더 선택 (종족전별)
// ══════════════════════════════════════════════════════════════

export function selectBuildOrder(
  playerRace: Race,
  opponentRace: Race,
  difficulty: "beginner" | "intermediate" | "advanced"
): BuildOrder {
  let builds: BuildOrder[] = [];

  if (playerRace === "terran" && opponentRace === "protoss") builds = terranVsProtossBuild;
  else if (playerRace === "terran" && opponentRace === "zerg") builds = terranVsZergBuild;
  else if (playerRace === "terran" && opponentRace === "terran") builds = terranVsTerranBuild;
  else if (playerRace === "protoss" && opponentRace === "terran") builds = protossVsTerranBuild;
  else if (playerRace === "protoss" && opponentRace === "zerg") builds = protossVsZergBuild;
  else if (playerRace === "protoss" && opponentRace === "protoss") builds = protossVsProtossBuild;
  else if (playerRace === "zerg" && opponentRace === "terran") builds = zergVsTerranBuild;
  else if (playerRace === "zerg" && opponentRace === "protoss") builds = zergVsProtossBuild;
  else if (playerRace === "zerg" && opponentRace === "zerg") builds = zergVsZergBuild;

  const filteredBuilds = builds.filter(b => {
    if (difficulty === "beginner") return b.difficulty === "beginner";
    if (difficulty === "intermediate") return b.difficulty !== "advanced";
    return true;
  });
  
  return filteredBuilds.length > 0
    ? filteredBuilds[Math.floor(Math.random() * filteredBuilds.length)]
    : builds[0] || terranVsProtossBuild[0];
}

/**
 * 유닛 상성 확인
 */
export function getUnitCounters(unit: string): string[] {
  return unitStats[unit]?.counters || [];
}

export function getUnitCountersTo(unit: string): string[] {
  return unitStats[unit]?.countersTo || [];
}

/**
 * 종족전별 유닛 추천
 */
export function recommendUnit(
  opponentUnits: string[],
  availableResources: number,
  playerRace: Race,
  opponentRace?: Race
): string | null {
  const allUnits = Object.values(unitStats).filter(u => u.race === playerRace);
  
  // 상대 유닛을 카운터하는 유닛 찾기
  for (const opponentUnit of opponentUnits) {
    const counters = getUnitCounters(opponentUnit);
    for (const counter of counters) {
      const unit = unitStats[counter];
      if (unit && unit.race === playerRace && unit.cost <= availableResources) {
        return counter;
      }
    }
  }

  // 종족전별 기본 추천
  if (playerRace === "terran") {
    if (opponentRace === "zerg") return "시즈탱크";
    if (opponentRace === "protoss") return "시즈탱크";
    return "마린";
  }
  if (playerRace === "protoss") {
    if (opponentRace === "zerg") return "하이템플러";
    if (opponentRace === "terran") return "드래군";
    return "질럿";
  }
  if (playerRace === "zerg") {
    if (opponentRace === "terran") return "럴커";
    if (opponentRace === "protoss") return "히드라리스크";
    return "저글링";
  }
  
  return null;
}