import { useMemo, useState } from "react";
import { ArrowLeft, Search, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RACE_LABELS } from "@shared/gameConstants";

export interface MapRow {
  id: number;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  raceAdvantage: unknown;
  rushDistance: number;
  resources: number;
  complexity: number;
  iconEmoji: string;
  players?: number | null;
  era?: string | null;
  isActive?: number | null;
}

type Filter = "all" | "short" | "long" | "complex" | "open" | "rich";
type Sort = "era" | "name" | "mine";

const FILTERS: { key: Filter; label: string; test: (m: MapRow) => boolean }[] = [
  { key: "all", label: "전체", test: () => true },
  { key: "short", label: "⚡ 러쉬거리 짧음", test: m => m.rushDistance <= 45 },
  { key: "long", label: "🐢 러쉬거리 김", test: m => m.rushDistance >= 62 },
  { key: "complex", label: "🧗 복잡한 지형", test: m => m.complexity >= 60 },
  { key: "open", label: "🏜️ 넓은 평지", test: m => m.complexity <= 42 },
  { key: "rich", label: "💎 자원 풍부", test: m => m.resources >= 60 },
];

export function parseRaceAdvantage(raw: unknown): Record<string, number> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw as Record<string, number>;
}

/** 지형으로 판단한 이 맵의 성격 (능력치와 어떻게 연동되는지) */
export function mapKeyPoints(m: Pick<MapRow, "rushDistance" | "complexity" | "resources">): string[] {
  const out: string[] = [];
  if (m.rushDistance <= 45) out.push("초반 러쉬·공격력 유리");
  else if (m.rushDistance >= 62) out.push("수비·운영형 빌드 유리");
  if (m.complexity >= 60) out.push("컨트롤·견제·시즈 유리, 근접 유닛 불리");
  else if (m.complexity <= 42) out.push("넓은 교전, 물량·저그 유리");
  if (m.resources >= 60) out.push("자원 풍부 → 물량 능력치 중요");
  else if (m.resources <= 45) out.push("자원 부족 → 빠른 확장 싸움");
  if (out.length === 0) out.push("밸런스형 맵");
  return out;
}

function TraitBar({ label, value, left, right, color }: { label: string; value: number; left: string; right: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span className="text-slate-500">{left} ↔ {right}</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function RaceLean({ adv }: { adv: Record<string, number> }) {
  const items = (["terran", "zerg", "protoss"] as const).map(r => {
    const v = adv[r] ?? 1;
    const lean = v >= 1.03 ? "▲▲" : v > 1.005 ? "▲" : v <= 0.97 ? "▼▼" : v < 0.995 ? "▼" : "–";
    const color = lean.startsWith("▲") ? "text-emerald-400" : lean.startsWith("▼") ? "text-rose-400" : "text-slate-500";
    return (
      <span key={r} className="flex items-center gap-0.5">
        <span className="text-slate-400">{RACE_LABELS[r]}</span>
        <span className={cn("font-bold", color)}>{lean}</span>
      </span>
    );
  });
  return <div className="flex gap-3 text-[11px]">{items}</div>;
}

export default function MapPicker({ maps, playerRace, onSelect, onBack }: {
  maps: MapRow[];
  playerRace?: string;
  onSelect: (mapId: number) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("era");
  const [players, setPlayers] = useState<0 | 2 | 3 | 4>(0);

  const active = useMemo(() => maps.filter(m => m.isActive !== 0), [maps]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = FILTERS.find(x => x.key === filter)!;
    const list = active.filter(m => {
      if (!f.test(m)) return false;
      if (players && (players === 4 ? (m.players ?? 2) < 4 : (m.players ?? 2) !== players)) return false;
      if (!q) return true;
      return [m.name, m.nameEn, m.era, m.description].some(s => (s ?? "").toLowerCase().includes(q));
    });
    const myLean = (m: MapRow) => parseRaceAdvantage(m.raceAdvantage)[playerRace ?? ""] ?? 1;
    return list.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name, "ko")
        : sort === "mine" ? myLean(b) - myLean(a)
        : (a.era ?? "").localeCompare(b.era ?? "") || a.name.localeCompare(b.name, "ko"));
  }, [active, query, filter, sort, players, playerRace]);

  const pickRandom = () => {
    const pool = shown.length ? shown : active;
    if (pool.length) onSelect(pool[Math.floor(Math.random() * pool.length)].id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
      <div className="max-w-5xl mx-auto">
        <Button onClick={onBack} variant="ghost" className="text-slate-400 hover:text-white mb-2" size="sm">
          <ArrowLeft className="w-4 h-4 mr-1" /> 뒤로가기
        </Button>
        <div className="text-center mb-4 md:mb-6">
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-1">맵 선택</h1>
          <p className="text-xs md:text-sm text-slate-400">
            프로 리그에서 실제로 쓰인 맵 {active.length}개. 러쉬거리·복잡도·자원량이 종족과 능력치에 맞물려 유불리가 정해집니다.
          </p>
        </div>

        {/* 검색 / 필터 */}
        <div className="space-y-2 mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="맵 이름·영문명·시대로 검색 (예: 투혼, Python, 2008)"
                className="pl-9 bg-slate-800 border-slate-700"
              />
            </div>
            <Button onClick={pickRandom} variant="outline" className="shrink-0" disabled={active.length === 0}>
              <Shuffle className="w-4 h-4 mr-1" /> 랜덤
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn("text-xs px-2.5 py-1 rounded-full border", filter === f.key ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500")}
              >{f.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500">인원</span>
            {([0, 2, 3, 4] as const).map(n => (
              <button
                key={n}
                onClick={() => setPlayers(n)}
                className={cn("px-2 py-0.5 rounded border", players === n ? "bg-slate-600 border-slate-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400")}
              >{n === 0 ? "전체" : n === 4 ? "4인 이상" : `${n}인`}</button>
            ))}
            <span className="text-slate-500 ml-2">정렬</span>
            {([["era", "시대순"], ["name", "이름순"], ["mine", "내 종족 유리순"]] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={cn("px-2 py-0.5 rounded border", sort === k ? "bg-slate-600 border-slate-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400")}
              >{l}</button>
            ))}
            <span className="ml-auto text-slate-500">{shown.length}개</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map(map => {
            const adv = parseRaceAdvantage(map.raceAdvantage);
            return (
              <button
                key={map.id}
                onClick={() => onSelect(map.id)}
                className="text-left bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-xl p-3.5 transition-all space-y-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-2xl leading-none">{map.iconEmoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate">{map.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {map.nameEn}{map.nameEn ? " · " : ""}{map.players ?? 2}인용{map.era ? ` · ${map.era}` : ""}
                    </div>
                  </div>
                </div>
                {map.description && <p className="text-xs text-slate-400 leading-snug line-clamp-2">{map.description}</p>}
                <div className="space-y-1.5">
                  <TraitBar label={`러쉬거리 ${map.rushDistance}`} value={map.rushDistance} left="가까움" right="멂" color="bg-orange-500" />
                  <TraitBar label={`복잡도 ${map.complexity}`} value={map.complexity} left="평지" right="길목" color="bg-cyan-500" />
                  <TraitBar label={`자원량 ${map.resources}`} value={map.resources} left="적음" right="풍부" color="bg-yellow-500" />
                </div>
                <RaceLean adv={adv} />
                <div className="flex flex-wrap gap-1">
                  {mapKeyPoints(map).map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">{t}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        {shown.length === 0 && (
          <p className="text-center text-slate-500 py-12">조건에 맞는 맵이 없습니다</p>
        )}
      </div>
    </div>
  );
}
