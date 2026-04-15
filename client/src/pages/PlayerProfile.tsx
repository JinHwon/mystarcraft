import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Plus, Minus, ChevronUp, Star, TrendingUp, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatRadarChart } from "@/components/StatRadarChart";
import {
  STAT_KEYS,
  STAT_LABELS,
  STAT_MAX,
  GRADE_COLORS,
  RACE_LABELS,
  RACE_COLORS,
  calcGrade,
  calcGradeIndex,
  calcTotalStats,
  GRADES,
  GRADE_BASE,
  GRADE_STEP,
  FATIGUE_MAX,
  FATIGUE_NORMAL_THRESHOLD,
  calcFatigueStatPenalty,
} from "../../../shared/gameConstants";
import type { StatKey } from "../../../shared/gameConstants";

type StatBoosts = Partial<Record<StatKey, number>>;

function StatBar({ label, value, max = STAT_MAX, color }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-bold text-foreground tabular-nums">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: color ?? "oklch(0.65 0.18 220)",
          }}
        />
      </div>
    </div>
  );
}

function GradeBadge({ grade, size = "md" }: { grade: string; size?: "sm" | "md" | "lg" }) {
  const color = GRADE_COLORS[grade as keyof typeof GRADE_COLORS] ?? "#9CA3AF";
  const sizeClasses = {
    sm: "text-sm px-2 py-0.5",
    md: "text-base px-3 py-1",
    lg: "text-2xl px-5 py-2",
  };
  return (
    <span
      className={cn("inline-flex items-center justify-center font-black rounded-lg border tracking-widest", sizeClasses[size])}
      style={{
        color,
        borderColor: `${color}60`,
        backgroundColor: `${color}12`,
        textShadow: `0 0 10px ${color}80`,
        boxShadow: `0 0 12px ${color}20`,
      }}
    >
      {grade}
    </span>
  );
}

export default function PlayerProfile() {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const { data: playerData, isLoading } = trpc.player.get.useQuery();
  const { data: playerItems = [] } = trpc.shop.getPlayerItems.useQuery();
  const { data: activeEvents = [] } = trpc.event.listActive.useQuery();
  const [allocating, setAllocating] = useState<StatKey | null>(null);
  const [allocPoints, setAllocPoints] = useState(5); // 5씩 증감
  const fileRef = useRef<HTMLInputElement>(null);

  const allocateMutation = trpc.player.allocateStat.useMutation({
    onSuccess: () => {
      utils.player.get.invalidate();
      toast.success("능력치가 강화되었습니다!");
      setAllocating(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadMutation = trpc.player.uploadPhoto.useMutation({
    onSuccess: () => {
      utils.player.get.invalidate();
      toast.success("사진이 업데이트되었습니다!");
    },
    onError: () => toast.error("사진 업로드에 실패했습니다"),
  });

  const addExpMutation = trpc.player.addExp.useMutation({
    onSuccess: (data) => {
      utils.player.get.invalidate();
      if (data.leveledUp) {
        toast.success(`레벨 업! Lv.${data.level} 달성! 포인트 +${data.levelsGained * 20}`, {
          duration: 4000,
        });
      } else {
        toast.success(`경험치 +50 획득`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("5MB 이하 파일만 가능합니다"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const base64 = result.split(",")[1] ?? "";
      uploadMutation.mutate({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!playerData) return null;

  const { stats } = playerData;
  if (!stats) return null;

  // 착용 중인 아이템 능력치 합산
  const itemBoosts: Partial<Record<StatKey, number>> = {};
  playerItems.forEach((pi) => {
    if (!pi.equipped) return;
    const boosts = (pi.item.statBoosts as StatBoosts) ?? {};
    Object.entries(boosts).forEach(([k, v]) => {
      const key = k as StatKey;
      itemBoosts[key] = (itemBoosts[key] ?? 0) + (v ?? 0);
    });
  });

  // 실제 표시 능력치 = 기본 능력치 + 착용 아이템 보너스
  const effectiveStats: Record<StatKey, number> = {
    sense: Math.min(stats.sense + (itemBoosts.sense ?? 0), STAT_MAX),
    control: Math.min(stats.control + (itemBoosts.control ?? 0), STAT_MAX),
    attack: Math.min(stats.attack + (itemBoosts.attack ?? 0), STAT_MAX),
    harass: Math.min(stats.harass + (itemBoosts.harass ?? 0), STAT_MAX),
    strategy: Math.min(stats.strategy + (itemBoosts.strategy ?? 0), STAT_MAX),
    supply: Math.min(stats.supply + (itemBoosts.supply ?? 0), STAT_MAX),
    defense: Math.min(stats.defense + (itemBoosts.defense ?? 0), STAT_MAX),
    scout: Math.min(stats.scout + (itemBoosts.scout ?? 0), STAT_MAX),
  };

  const totalStats = calcTotalStats(effectiveStats);
  const grade = calcGrade(totalStats);
  const gradeIdx = calcGradeIndex(totalStats);
  const gradeColor = GRADE_COLORS[grade];
  const raceColor = RACE_COLORS[playerData.race] ?? "#4A9EFF";

  // 다음 등급까지 필요 점수
  const nextGradeThreshold = GRADE_BASE + (gradeIdx + 1) * GRADE_STEP;
  const currentGradeThreshold = GRADE_BASE + gradeIdx * GRADE_STEP;
  const gradeProgress = gradeIdx >= GRADES.length - 1
    ? 100
    : ((totalStats - currentGradeThreshold) / GRADE_STEP) * 100;

  // 경험치 바
  const expPct = Math.min((playerData.exp / playerData.expToNext) * 100, 100);

  const statColors: Record<StatKey, string> = {
    sense: "#4A9EFF",
    control: "#34D399",
    attack: "#F87171",
    harass: "#FBBF24",
    strategy: "#A78BFA",
    supply: "#FB923C",
    defense: "#60A5FA",
    scout: "#F472B6",
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-foreground">선수 관리</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">선수 능력치를 강화하고 성장시키세요</p>
        </div>
        {user?.role === "admin" && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => addExpMutation.mutate({ amount: 50 })}
            disabled={addExpMutation.isPending}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            경험치 획득 (+50)
          </Button>
        )}
      </div>

      {/* 활성 이벤트 배너 */}
      {activeEvents.length > 0 && (
        <div className="bg-gradient-to-r from-amber-900 to-orange-900 border-2 border-amber-500 rounded-lg p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-amber-300">🎉 진행 중인 이벤트:</span>
            {activeEvents.map((event) => (
              <span key={event.id} className="inline-flex items-center gap-1 bg-slate-900 px-3 py-1 rounded-full text-sm text-amber-300 border border-amber-600">
                <span className="text-lg">{{"exp_double": "⭐", "fatigue_unlimited": "⚡", "gold_double": "💰", "stat_boost": "📈"}[event.type as string] || "🎯"}</span>
                {event.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 선수 카드 */}
        <div className="lg:col-span-1 space-y-4">
          {/* 선수 프로필 카드 */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {/* 배경 헤더 */}
            <div className="h-20 relative" style={{ background: `linear-gradient(135deg, ${raceColor}20, ${raceColor}08)` }}>
              <div className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage: "linear-gradient(oklch(0.25 0.02 240 / 0.3) 1px, transparent 1px), linear-gradient(90deg, oklch(0.25 0.02 240 / 0.3) 1px, transparent 1px)",
                  backgroundSize: "20px 20px"
                }}
              />
            </div>

            <div className="px-5 pb-5">
              {/* 프로필 사진 */}
              <div className="relative -mt-10 mb-4 w-fit">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden border-4 bg-muted cursor-pointer relative group"
                  style={{ borderColor: raceColor }}
                  onClick={() => fileRef.current?.click()}
                >
                  {playerData.photoUrl ? (
                    <img src={playerData.photoUrl} alt={playerData.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>
                {uploadMutation.isPending && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>

              {/* 이름 & 종족 */}
              <div className="mb-4">
                <h2 className="text-xl font-black text-foreground">{playerData.name}</h2>
                <p className="text-sm font-semibold" style={{ color: raceColor }}>
                  {playerData.race === "terran" ? "🚀" : playerData.race === "zerg" ? "🦂" : "💎"} {RACE_LABELS[playerData.race]}
                </p>
              </div>

              {/* 레벨 & 경험치 */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-foreground">Lv.{playerData.level}</span>
                  <span className="text-muted-foreground">{playerData.exp} / {playerData.expToNext} EXP</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${expPct}%`, background: raceColor }}
                  />
                </div>
              </div>

              {/* 등급 */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">현재 등급</p>
                  <GradeBadge grade={grade} size="md" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-1">총 능력치</p>
                  <p className="text-lg font-black text-foreground">{totalStats.toLocaleString()}</p>
                </div>
              </div>

              {/* 등급 진행도 */}
              {gradeIdx < GRADES.length - 1 && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">다음 등급까지</span>
                    <span className="font-medium" style={{ color: gradeColor }}>
                      {(nextGradeThreshold - totalStats).toLocaleString()}점 필요
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${gradeProgress}%`, backgroundColor: gradeColor }}
                    />
                  </div>
                </div>
              )}

              {/* 피로도 */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">피로도</p>
                    <p className="text-lg font-black text-foreground">{playerData.fatigue} / {FATIGUE_MAX}</p>
                  </div>
                  {playerData.fatigue < FATIGUE_NORMAL_THRESHOLD && (
                    <div className="text-right">
                      <p className="text-xs text-yellow-500 font-semibold mb-1">능력치 패널티</p>
                      <p className="text-lg font-black text-yellow-500">{Math.round(calcFatigueStatPenalty(playerData.fatigue) * 100)}%</p>
                    </div>
                  )}
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(playerData.fatigue / FATIGUE_MAX) * 100}%`,
                      background: playerData.fatigue >= FATIGUE_NORMAL_THRESHOLD
                        ? "oklch(0.65 0.18 140)"
                        : playerData.fatigue >= 50
                        ? "oklch(0.65 0.18 50)"
                        : "oklch(0.65 0.18 0)"
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 미배분 포인트 카드 */}
          {playerData.statPoints > 0 && (
            <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 glow-blue">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-primary">미배분 포인트</span>
              </div>
              <p className="text-3xl font-black text-foreground">{playerData.statPoints}</p>
              <p className="text-xs text-muted-foreground mt-1">아래 능력치에 포인트를 배분하세요</p>
            </div>
          )}

          {/* 등급 목록 */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">등급 목록</h3>
            <div className="space-y-1.5">
              {GRADES.map((g, i) => {
                const threshold = GRADE_BASE + i * GRADE_STEP;
                const isCurrentGrade = g === grade;
                return (
                  <div key={g} className={cn(
                    "flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-all",
                    isCurrentGrade ? "bg-muted/80" : ""
                  )}>
                    <GradeBadge grade={g} size="sm" />
                    <span className="text-muted-foreground">{threshold.toLocaleString()}점~</span>
                    {isCurrentGrade && <span className="text-primary text-xs font-bold">현재</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 오른쪽: 능력치 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 능력치 카드 */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-foreground">능력치</h3>
              {playerData.statPoints > 0 && (
                <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-medium">
                  배분 가능: {playerData.statPoints}pt
                </span>
              )}
            </div>

            <div className="space-y-5">
              {STAT_KEYS.map((key) => {
                const baseVal = stats[key];
                const bonus = itemBoosts[key] ?? 0;
                const val = effectiveStats[key];
                const isAllocating = allocating === key;
                const color = statColors[key];
                return (
                  <div key={key} className="space-y-2">
                    <StatBar label={STAT_LABELS[key]} value={val} color={color} />
                    {bonus > 0 && (
                      <p className="text-xs text-right" style={{ color }}>
                        기본 {baseVal} <span className="font-bold">+{bonus} (아이템)</span>
                      </p>
                    )}

                    {/* 포인트 배분 UI */}
                    {playerData.statPoints > 0 && (
                      <div className={cn(
                        "overflow-hidden transition-all duration-300",
                        isAllocating ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
                      )}>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => setAllocPoints(Math.max(5, allocPoints - 5))}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="text-sm font-bold text-foreground w-8 text-center">{allocPoints}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => setAllocPoints(Math.min(playerData.statPoints, allocPoints + 5))}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs font-bold"
                            style={{ backgroundColor: color, color: "white" }}
                            onClick={() => allocateMutation.mutate({ statKey: key, points: allocPoints })}
                            disabled={allocateMutation.isPending}
                          >
                            {allocateMutation.isPending ? "..." : `+${allocPoints} 배분`}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => setAllocating(null)}
                          >
                            취소
                          </Button>
                        </div>
                      </div>
                    )}

                    {playerData.statPoints > 0 && !isAllocating && (
                      <div className="flex gap-2">
                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => { setAllocating(key); setAllocPoints(5); }}
                        >
                          <ChevronUp className="w-3 h-3" />
                          포인트 배분
                        </button>
                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => allocateMutation.mutate({ statKey: key, points: playerData.statPoints })}
                          disabled={allocateMutation.isPending}
                        >
                          <Star className="w-3 h-3" />
                          전부 배분
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 능력치 레이더 차트 */}
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 self-start">능력치 분포</h3>
            <StatRadarChart stats={effectiveStats} grade={grade} gradeColor={gradeColor} size={300} />
          </div>

          {/* 경기결과 조회 */}
          <div className="bg-card border border-border rounded-2xl p-6 col-span-full">
            <h3 className="font-bold text-foreground mb-4">경기 기록</h3>
            <p className="text-sm text-muted-foreground mb-4">지난 경기의 능력치 변동 내역을 확인하세요</p>
            <a href="/game-results">
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                <TrendingUp className="w-4 h-4 mr-2" />
                경기결과 조회
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
