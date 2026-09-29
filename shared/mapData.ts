/**
 * 프로 리그에서 실제로 쓰였던 스타크래프트: 브루드 워 맵 목록
 *
 * 수치(0~100)는 게임용으로 단순화한 추정치다.
 * - rushDistance: 러쉬거리 (낮을수록 가까움 → 초반 러쉬·공격 유리, 높을수록 멀음 → 운영·수비 유리)
 * - resources: 자원량 (높을수록 풍부 → 물량·운영 능력치 영향이 커짐)
 * - complexity: 지형 복잡도 (높을수록 길목·언덕 많음 → 컨트롤·견제·시즈 유리, 근접 유닛 불리 / 낮을수록 넓은 평지)
 * - race: 종족 성향 (1 = 중립, 0.95~1.05 정도의 완만한 보정. 실제 결과는 지형·능력치와 함께 정해짐)
 */
export interface MapInfo {
  name: string;
  nameEn: string;
  players: number;
  era: string;
  description: string;
  rushDistance: number;
  resources: number;
  complexity: number;
  race: { terran: number; zerg: number; protoss: number };
  emoji: string;
}

const r = (terran: number, zerg: number, protoss: number) => ({ terran, zerg, protoss });

export const PRO_MAPS: MapInfo[] = [
  { name: "헌터스", nameEn: "The Hunters", players: 8, era: "1999~2000", emoji: "🏹", description: "초창기 대회를 대표하는 넓은 8인용 맵. 자원이 넉넉하고 길이 단순하다", rushDistance: 45, resources: 65, complexity: 30, race: r(1, 1.02, 1) },
  { name: "로스트 템플", nameEn: "Lost Temple", players: 4, era: "2000~2003", emoji: "🏛️", description: "섬 멀티와 본진 절벽으로 유명한 고전 명맵. 절벽 드랍과 벌처 견제가 핵심", rushDistance: 55, resources: 50, complexity: 60, race: r(1.03, 0.98, 1) },
  { name: "노스탤지어", nameEn: "Nostalgia", players: 2, era: "2002~2003", emoji: "🌅", description: "넓은 중앙과 안정적인 앞마당을 가진 운영형 맵", rushDistance: 60, resources: 55, complexity: 45, race: r(0.99, 0.99, 1.02) },
  { name: "기요틴", nameEn: "Guillotine", players: 4, era: "2003", emoji: "🪓", description: "좁은 입구와 넓은 중앙. 저그의 물량전이 잘 통하는 맵", rushDistance: 50, resources: 55, complexity: 50, race: r(0.98, 1.04, 0.98) },
  { name: "머큐리", nameEn: "Mercury", players: 2, era: "2003", emoji: "☿️", description: "러쉬거리가 길어 더블 커맨드·배짱 빌드가 자주 나온 맵", rushDistance: 68, resources: 55, complexity: 50, race: r(1.02, 0.99, 0.99) },
  { name: "레퀴엠", nameEn: "Requiem", players: 2, era: "2004", emoji: "⚰️", description: "언덕과 좁은 길목이 많아 테란의 시즈 라인이 강력한 맵", rushDistance: 55, resources: 50, complexity: 65, race: r(1.04, 0.97, 0.99) },
  { name: "알카노이드", nameEn: "Arkanoid", players: 2, era: "2004", emoji: "🧱", description: "블록처럼 나뉜 지형과 긴 러쉬거리. 탱크·리버 같은 중장갑 운영이 빛나는 맵", rushDistance: 72, resources: 55, complexity: 70, race: r(1.03, 0.97, 1) },
  { name: "루나", nameEn: "Luna", players: 4, era: "2004~2005", emoji: "🌙", description: "탁 트인 4인용 맵. 넓은 교전이 많아 저그·프로토스의 물량전이 강하다", rushDistance: 48, resources: 55, complexity: 35, race: r(0.97, 1.02, 1.01) },
  { name: "레이드 어썰트", nameEn: "Raid Assault", players: 2, era: "2005", emoji: "🎯", description: "중앙 언덕 싸움이 중요한 맵. 공격적인 타이밍이 자주 나온다", rushDistance: 50, resources: 50, complexity: 55, race: r(1, 1, 1) },
  { name: "러시아워", nameEn: "Rush Hour", players: 4, era: "2005", emoji: "🚦", description: "이름처럼 러쉬거리가 가까운 편. 초반 공격이 잦은 맵", rushDistance: 38, resources: 50, complexity: 50, race: r(1.01, 1.01, 0.98) },
  { name: "포르테", nameEn: "Forte", players: 2, era: "2005", emoji: "🎼", description: "멀리 떨어진 본진과 여유로운 앞마당. 장기전 운영이 많이 나온 맵", rushDistance: 70, resources: 60, complexity: 50, race: r(0.99, 1, 1.02) },
  { name: "리버 오브 플레임", nameEn: "River of Flames", players: 2, era: "2005", emoji: "🔥", description: "용암 강으로 나뉜 지형. 길목 싸움과 드랍이 중요한 맵", rushDistance: 55, resources: 50, complexity: 65, race: r(1.02, 0.98, 1) },
  { name: "815", nameEn: "815", players: 3, era: "2005~2006", emoji: "🇰🇷", description: "3인용 맵. 상대 위치에 따라 러쉬거리가 달라지는 변수가 많은 맵", rushDistance: 52, resources: 55, complexity: 55, race: r(1, 1.01, 0.99) },
  { name: "알케미스트", nameEn: "Alchemist", players: 2, era: "2006", emoji: "⚗️", description: "복잡한 길목과 언덕이 많은 맵. 컨트롤과 견제가 승부를 가른다", rushDistance: 58, resources: 50, complexity: 68, race: r(1.02, 0.98, 1) },
  { name: "아카디아", nameEn: "Arcadia", players: 2, era: "2006", emoji: "🏞️", description: "무난한 러쉬거리와 넓은 중앙을 가진 밸런스형 맵", rushDistance: 55, resources: 55, complexity: 45, race: r(1, 1, 1) },
  { name: "롱기누스", nameEn: "Longinus", players: 2, era: "2006", emoji: "🗡️", description: "대각선 구도의 긴 러쉬거리. 운영 싸움이 치열한 맵", rushDistance: 64, resources: 55, complexity: 50, race: r(1, 1.01, 0.99) },
  { name: "타우 크로스", nameEn: "Tau Cross", players: 3, era: "2006~2007", emoji: "✳️", description: "3인용 맵. 좁은 입구 덕에 초반 수비가 쉬운 편", rushDistance: 56, resources: 50, complexity: 55, race: r(1.01, 0.99, 1) },
  { name: "백두대간", nameEn: "Baekdu Mountains", players: 2, era: "2006~2007", emoji: "⛰️", description: "산맥처럼 이어진 언덕 지형. 고지대를 잡은 쪽이 유리하다", rushDistance: 60, resources: 50, complexity: 66, race: r(1.03, 0.97, 1) },
  { name: "몬티 홀", nameEn: "Monty Hall", players: 2, era: "2007", emoji: "🚪", description: "여러 갈래의 길로 상대 진출을 읽기 어려운 맵. 정찰이 중요", rushDistance: 58, resources: 55, complexity: 60, race: r(0.99, 1.01, 1) },
  { name: "블루 스톰", nameEn: "Blue Storm", players: 2, era: "2007", emoji: "🌊", description: "앞마당 방어가 쉬운 운영형 맵. 프로토스의 캐리어 운영이 자주 나왔다", rushDistance: 62, resources: 60, complexity: 45, race: r(0.99, 0.99, 1.03) },
  { name: "카트리나", nameEn: "Katrina", players: 4, era: "2007", emoji: "🌀", description: "소용돌이 모양의 4인용 맵. 공격 경로가 다양하다", rushDistance: 52, resources: 55, complexity: 55, race: r(1, 1.01, 0.99) },
  { name: "안드로메다", nameEn: "Andromeda", players: 4, era: "2007~2008", emoji: "🌌", description: "뒷마당 멀티가 쉬운 대표적 운영 맵. 자원이 풍부해 물량 싸움이 된다", rushDistance: 70, resources: 75, complexity: 40, race: r(0.97, 1.02, 1.02) },
  { name: "파이썬", nameEn: "Python", players: 4, era: "2007~2008", emoji: "🐍", description: "넓은 평지가 많은 4인용 맵. 저그의 물량이 잘 통한다", rushDistance: 55, resources: 58, complexity: 38, race: r(0.98, 1.04, 0.99) },
  { name: "데스티네이션", nameEn: "Destination", players: 2, era: "2007~2009", emoji: "🌉", description: "다리로 이어진 긴 러쉬거리. 저그와 프로토스가 선호한 운영 맵", rushDistance: 75, resources: 60, complexity: 62, race: r(0.97, 1.02, 1.01) },
  { name: "신 단장의 능선", nameEn: "Heartbreak Ridge", players: 2, era: "2008", emoji: "💔", description: "러쉬거리가 짧고 앞마당이 노출된 맵. 공격적인 테란이 강했다", rushDistance: 42, resources: 50, complexity: 50, race: r(1.03, 0.99, 0.98) },
  { name: "투혼", nameEn: "Fighting Spirit", players: 4, era: "2008~2010", emoji: "⚔️", description: "가장 오래 쓰인 밸런스 맵의 대명사. 무난한 러쉬거리와 넓은 중앙", rushDistance: 50, resources: 55, complexity: 45, race: r(1, 1, 1) },
  { name: "네오 메두사", nameEn: "Neo Medusa", players: 2, era: "2008", emoji: "🐍", description: "좁은 길목이 많은 맵. 테란의 시즈 라인이 뚫기 어렵다", rushDistance: 48, resources: 50, complexity: 64, race: r(1.04, 0.98, 0.98) },
  { name: "오델로", nameEn: "Othello", players: 4, era: "2008", emoji: "⚫", description: "흑백 대칭 구조의 4인용 맵. 멀티 싸움이 중요하다", rushDistance: 54, resources: 55, complexity: 50, race: r(1, 1, 1) },
  { name: "매치포인트", nameEn: "Match Point", players: 2, era: "2008~2009", emoji: "🎾", description: "넓은 러쉬거리와 안정적인 앞마당. 장기전이 많이 나온 맵", rushDistance: 62, resources: 55, complexity: 45, race: r(0.99, 1.01, 1) },
  { name: "폴라리스 랩소디", nameEn: "Polaris Rhapsody", players: 4, era: "2009", emoji: "⭐", description: "탁 트인 중앙과 다양한 멀티. 운영과 물량이 중요한 맵", rushDistance: 55, resources: 60, complexity: 42, race: r(0.99, 1.01, 1.01) },
  { name: "청풍명월", nameEn: "Chungpungmyungwol", players: 2, era: "2009", emoji: "🍃", description: "지형이 단순하고 병력 싸움이 정직하게 나오는 맵", rushDistance: 55, resources: 55, complexity: 40, race: r(0.99, 1.01, 1) },
  { name: "비프로스트", nameEn: "Bifrost", players: 3, era: "2009~2010", emoji: "🌈", description: "무지개 다리로 이어진 3인용 맵. 위치별로 유불리가 갈린다", rushDistance: 55, resources: 55, complexity: 55, race: r(1.01, 0.99, 1) },
  { name: "서킷 브레이커", nameEn: "Circuit Breaker", players: 4, era: "2009~2011", emoji: "🔌", description: "안정적인 앞마당과 넓은 맵. 프로토스의 운영이 강한 편", rushDistance: 60, resources: 55, complexity: 45, race: r(0.99, 0.99, 1.03) },
  { name: "벤젠", nameEn: "Benzene", players: 2, era: "2010", emoji: "⌬", description: "육각형 구조의 맵. 길목이 많아 수비형 운영이 유리하다", rushDistance: 60, resources: 50, complexity: 60, race: r(1.02, 0.98, 1) },
  { name: "태양의 제국", nameEn: "Empire of the Sun", players: 4, era: "2010", emoji: "☀️", description: "넓고 밝은 4인용 맵. 정면 힘싸움이 자주 나온다", rushDistance: 52, resources: 58, complexity: 42, race: r(1, 1.01, 1) },
];
