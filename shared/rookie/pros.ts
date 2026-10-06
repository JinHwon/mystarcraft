/**
 * 선수 키우기: 프로게이머 표기 (게임 아이디 + 본명) · 클랜별 소속 프로
 * 원작 선수 데이터는 본명만 있어서, 아이디(게임 닉네임)는 아래 표로 따로 둔다 (확실한 것만, 없으면 본명만 표시)
 */
import { initialPlayers } from "../career/init";
import type { Race } from "../career/rules";
import { CLANS, CLAN_BY_ID, clanRoster, type ClanMember } from "./model";

export const PROS = initialPlayers();

/** [본명, 소속팀 번호, 게임 아이디] — 같은 이름이 둘 이상이라 팀 번호로 구분 */
const PRO_GAMER_IDS: Array<[string, number, string]> = [
  ["이영호", 0, "Flash"], ["김택용", 4, "Bisu"], ["송병구", 1, "Stork"], ["이제동", 6, "Jaedong"], ["정명훈", 4, "Fantasy"],
  ["변형태", 7, "Bomber"], ["이윤열", 11, "Nada"], ["마재윤", 12, "Savior"], ["어윤수", 4, "Soulkey"], ["임요환", 4, "Boxer"],
  ["홍진호", 10, "Yellow"], ["염보성", 5, "Check"], ["조일장", 2, "Jangbi"], ["장윤철", 7, "Sharp"],
];
const GAMER_ID = new Map<number, string>();
for (const [name, team, id] of PRO_GAMER_IDS) {
  const p = PROS.find(x => x.name === name && x.team === team);
  if (p) GAMER_ID.set(p.id, id);
}
/** 프로의 게임 아이디 (모르면 본명) */
export const proGamerId = (id: number) => GAMER_ID.get(id) ?? PROS[id].name;
/** 화면 표기: 아이디(본명) */
export const proLabel = (id: number) => (GAMER_ID.has(id) ? `${GAMER_ID.get(id)}(${PROS[id].name})` : PROS[id].name);
export const proIdByName = (name: string) => PROS.find(p => p.name === name)?.id;

/** 클랜 한 곳에 들어가는 프로 수 (단계별) */
const PRO_SLOTS: Record<number, number> = { 1: 0, 2: 3, 3: 5, 4: 8, 5: 12 };
let assigned: Map<string, number[]> | null = null;
/**
 * 클랜별 소속 프로(원작 선수 번호): 직접 적어 둔 선수가 먼저, 남은 선수는 능력치가 높은 순서로 높은 단계 클랜부터 채움
 * (한 선수는 한 클랜에만)
 */
export function clanProIds(clanId: string): number[] {
  if (!assigned) {
    const map = new Map<string, number[]>();
    const taken = new Set<number>();
    for (const c of CLANS) {
      const ids: number[] = [];
      for (const n of c.pros) { const id = proIdByName(n); if (id !== undefined && !taken.has(id)) { taken.add(id); ids.push(id); } }
      map.set(c.id, ids);
    }
    const total = (id: number) => Object.values(PROS[id].stats).reduce((a, b) => a + b, 0);
    const rest = PROS.map(p => p.id).filter(id => !taken.has(id)).sort((a, b) => total(b) - total(a));
    const order = [...CLANS].sort((a, b) => b.tier - a.tier);
    // 단계가 높은 클랜부터, 클랜마다 한 명씩 돌아가며 채움
    let progress = true;
    while (rest.length && progress) {
      progress = false;
      for (const c of order) {
        const ids = map.get(c.id)!;
        if (ids.length >= PRO_SLOTS[c.tier] || ids.length >= c.size - 6 || !rest.length) continue;
        ids.push(rest.shift()!);
        progress = true;
      }
    }
    assigned = map;
  }
  return assigned.get(clanId) ?? [];
}
/** 프로가 소속된 클랜 (없으면 undefined) */
export function clanOfPro(proId: number): string | undefined {
  for (const c of CLANS) if (clanProIds(c.id).includes(proId)) return c.id;
  return undefined;
}
export const clanTagOfPro = (proId: number) => { const id = clanOfPro(proId); return id ? CLAN_BY_ID[id].tag : undefined; };
export type { Race };

/** 클랜 명단: 프로는 원작 선수 능력치와 게임 아이디·본명으로 채움 */
export function clanMembers(clanId: string): ClanMember[] {
  const c = CLAN_BY_ID[clanId];
  return clanRoster(c, clanProIds(clanId)).map(m => {
    if (!m.pro) return m;
    const p = PROS[m.pro.id];
    const id = proGamerId(p.id);
    return { ...m, name: id, ...(id !== p.name ? { real: p.name } : {}), race: p.race, stats: { ...p.stats }, pro: { id: p.id, team: p.team } };
  });
}
