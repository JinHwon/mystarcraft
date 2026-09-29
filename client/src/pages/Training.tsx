import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { STAT_KEYS, STAT_LABELS, STAT_MAX, calcGrade, type StatKey } from "@shared/gameConstants";
import { TRAINING_MENUS, REST_CONDITION, REST_FATIGUE, conditionMultiplier } from "@shared/teamConstants";
import { ConditionBadge, FatigueBar, GradeTag, RaceTag } from "@/components/team/PlayerBadges";

type LogEntry = {
  id: number;
  playerName: string;
  menu: string;
  outcome: "great" | "normal" | "poor";
  gains: Partial<Record<StatKey, number>>;
};

const OUTCOME_TEXT = {
  great: { label: "대성공!", className: "text-amber-300" },
  normal: { label: "성공", className: "text-emerald-300" },
  poor: { label: "부진", className: "text-gray-400" },
};

export default function Training() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const teamQuery = trpc.team.get.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [flash, setFlash] = useState<Partial<Record<StatKey, number>>>({});

  const roster = teamQuery.data?.roster ?? [];
  useEffect(() => {
    if (selectedId !== null || roster.length === 0) return;
    const fromUrl = Number(new URLSearchParams(search).get("player"));
    setSelectedId(roster.some(p => p.id === fromUrl) ? fromUrl : roster[0].id);
  }, [roster, search, selectedId]);

  const trainMutation = trpc.team.train.useMutation({
    onSuccess: (r, vars) => {
      // 결과를 바로 화면에 반영
      utils.team.get.setData(undefined, old => old && {
        ...old,
        gold: old.gold - r.goldSpent,
        roster: old.roster.map(p => {
          if (p.id !== vars.playerId) return p;
          const stats = { ...p.stats };
          (Object.entries(r.gains) as [StatKey, number][]).forEach(([k, v]) => { stats[k] += v; });
          const totalStats = STAT_KEYS.reduce((s, k) => s + stats[k], 0);
          return { ...p, stats, totalStats, grade: calcGrade(totalStats), fatigue: r.fatigue, condition: r.condition };
        }),
      });
      setLog(prev => [{ id: Date.now(), playerName: r.playerName, menu: r.menu, outcome: r.outcome, gains: r.gains }, ...prev].slice(0, 12));
      setFlash(r.gains);
      setTimeout(() => setFlash({}), 1200);
      utils.player.get.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const restMutation = trpc.team.rest.useMutation({
    onSuccess: r => {
      toast.success(`😴 ${r.playerName} 선수 휴식 완료`);
      utils.team.get.invalidate();
      utils.player.get.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  if (teamQuery.isLoading || !teamQuery.data) {
    return <div className="p-8 text-gray-400">훈련장 준비 중...</div>;
  }
  const player = roster.find(p => p.id === selectedId) ?? roster[0];
  if (!player) return null;
  const gold = teamQuery.data.gold;

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold text-amber-400">🏋️ 훈련장</h1>
          <p className="text-gray-400 text-sm">피로도를 써서 능력치를 올립니다. 컨디션이 좋을수록 효과가 크고 대성공 확률도 올라갑니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-yellow-400 font-bold">💰 {gold.toLocaleString()}G</span>
          <Button size="sm" variant="outline" onClick={() => navigate("/team")}>👥 팀 관리</Button>
        </div>
      </div>

      {/* 선수 선택 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {roster.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={cn(
              "shrink-0 px-3 py-2 rounded-lg border-2 text-left transition-all",
              p.id === player.id ? "border-amber-500 bg-amber-950/40" : "border-slate-700 bg-slate-900 hover:border-slate-500"
            )}
          >
            <div className="text-sm font-bold text-white">{p.name}</div>
            <div className="flex items-center gap-2"><RaceTag race={p.race} /><span className="text-[11px] text-gray-400 font-mono">{p.fatigue}</span></div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* 선수 상태 */}
        <Card className="lg:col-span-2 bg-slate-900 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">{player.name} <RaceTag race={player.race} /></span>
              <GradeTag grade={player.grade} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <ConditionBadge condition={player.condition} />
              <span className="text-xs text-gray-400">경기력 ×{conditionMultiplier(player.condition).toFixed(2)}</span>
            </div>
            <FatigueBar fatigue={player.fatigue} />
            <div className="space-y-1.5 pt-1">
              {STAT_KEYS.map(k => {
                const v = player.stats[k];
                const gained = flash[k];
                return (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-12 shrink-0">{STAT_LABELS[k]}</span>
                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-700", gained ? "bg-amber-400" : "bg-indigo-500")} style={{ width: `${(v / STAT_MAX) * 100}%` }} />
                    </div>
                    <span className="text-xs font-mono text-white w-10 text-right">{v}</span>
                    <span className={cn("text-xs font-bold w-8 text-amber-300 transition-opacity", gained ? "opacity-100" : "opacity-0")}>+{gained ?? 0}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs text-gray-400">합계 <b className="text-white font-mono">{player.totalStats.toLocaleString()}</b></span>
              <Button
                size="sm"
                variant="outline"
                disabled={player.rested || restMutation.isPending}
                onClick={() => restMutation.mutate({ playerId: player.id })}
                title={`하루 1회 · 피로도 +${REST_FATIGUE}, 컨디션 +${REST_CONDITION}`}
              >{player.rested ? "오늘 휴식 완료" : `😴 휴식 (피로도 +${REST_FATIGUE})`}</Button>
            </div>
          </CardContent>
        </Card>

        {/* 훈련 메뉴 */}
        <div className="lg:col-span-3 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TRAINING_MENUS.map(m => {
              const lacking = player.fatigue < m.fatigue + 1 || gold < m.gold;
              return (
                <button
                  key={m.key}
                  disabled={lacking || trainMutation.isPending}
                  onClick={() => trainMutation.mutate({ playerId: player.id, menu: m.key })}
                  className={cn(
                    "rounded-lg border-2 p-3 text-left transition-all",
                    lacking ? "border-slate-800 bg-slate-900/40 opacity-50 cursor-not-allowed"
                      : m.key === "camp" ? "border-orange-700 bg-orange-950/30 hover:border-orange-500"
                      : "border-slate-700 bg-slate-900 hover:border-indigo-500 active:scale-95"
                  )}
                >
                  <div className="text-2xl">{m.emoji}</div>
                  <div className="text-sm font-bold text-white mt-1">{m.name}</div>
                  <div className="text-[11px] text-gray-400 leading-tight mt-0.5 min-h-[28px]">{m.description}</div>
                  <div className="text-[11px] mt-1.5 text-gray-300">
                    ⚡{m.fatigue}{m.gold > 0 && <span className="text-yellow-400"> · {m.gold}G</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <Card className="bg-slate-950/60 border-slate-800">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-300">📋 훈련 기록</CardTitle></CardHeader>
            <CardContent className="space-y-1 max-h-64 overflow-y-auto">
              {log.length === 0 && <p className="text-xs text-gray-500">아직 훈련 기록이 없습니다.</p>}
              {log.map(e => (
                <div key={e.id} className="text-xs flex flex-wrap gap-x-2 border-b border-slate-800/60 py-1">
                  <span className="text-white font-semibold">{e.playerName}</span>
                  <span className="text-gray-400">{e.menu}</span>
                  <span className={cn("font-bold", OUTCOME_TEXT[e.outcome].className)}>{OUTCOME_TEXT[e.outcome].label}</span>
                  <span className="text-amber-200">
                    {Object.entries(e.gains).map(([k, v]) => `${STAT_LABELS[k as StatKey]} +${v}`).join(" · ") || "변화 없음"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
