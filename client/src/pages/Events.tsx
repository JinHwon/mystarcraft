import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type QuestTab = "daily" | "cumulative";

const REWARD_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  gold: { label: "골드", icon: "💰", color: "text-yellow-400" },
  exp: { label: "경험치", icon: "⭐", color: "text-blue-400" },
  fatigue: { label: "피로도", icon: "⚡", color: "text-green-400" },
  stat_points: { label: "스탯 포인트", icon: "📊", color: "text-purple-400" },
};

export default function Events() {
  const [activeTab, setActiveTab] = useState<QuestTab>("daily");

  const questsQuery = trpc.quest.list.useQuery();
  const progressQuery = trpc.quest.getProgress.useQuery();
  const utils = trpc.useUtils();
  // 보상 수령: 누르는 즉시 화면에 반영(낙관적 업데이트), 실패하면 되돌림
  const claimMutation = trpc.quest.claimReward.useMutation({
    onMutate: async ({ questId }) => {
      await utils.quest.getProgress.cancel();
      const previous = utils.quest.getProgress.getData();
      utils.quest.getProgress.setData(undefined, old => (old ?? []).map(p => p.questId === questId ? { ...p, rewardClaimed: true } : p));
      utils.quest.getRewardableCount.setData(undefined, old => Math.max(0, (old ?? 1) - 1));
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) utils.quest.getProgress.setData(undefined, context.previous);
      utils.quest.getRewardableCount.invalidate();
      toast.error(error?.message ?? "보상 수령 실패");
    },
    onSuccess: (result) => {
      const reward = REWARD_LABELS[result.rewardType];
      toast.success(`${reward?.icon ?? "🎁"} ${reward?.label ?? "보상"} +${result.rewardValue} 획득!`);
      // 골드·경험치 등은 백그라운드에서 갱신
      utils.player.get.invalidate();
      utils.quest.getRewardableCount.invalidate();
    },
  });

  const claimAllMutation = trpc.quest.claimAll.useMutation({
    onSuccess: r => {
      const text = Object.entries(r.totals).map(([k, v]) => `${REWARD_LABELS[k]?.icon ?? "🎁"} ${REWARD_LABELS[k]?.label ?? k} +${v}`).join(" · ");
      toast.success(`보상 ${r.count}개 수령! ${text}`);
      utils.quest.getProgress.invalidate();
      utils.quest.getRewardableCount.invalidate();
      utils.player.get.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const quests = questsQuery.data ?? [];
  const progressList = progressQuery.data ?? [];

  // getProgress 함수 먼저 정의
  const getProgress = (questId: number) => {
    return progressList.find((p) => p.questId === questId);
  };

  const dailyQuests = quests
    .filter((q) => q.type === "daily")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const cumulativeQuests = quests
    .filter((q) => q.type === "cumulative")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const displayedQuests = activeTab === "daily" ? dailyQuests : cumulativeQuests;

  // 정렬: 보상 받을 수 있는 퀘스트 → 진행 중 → 보상 수령 완료
  const questOrder = (questId: number) => {
    const p = getProgress(questId);
    if (p?.completed && !p.rewardClaimed) return 0;
    if (p?.rewardClaimed) return 2;
    return 1;
  };
  const sortedQuests = [...displayedQuests].sort((a, b) => {
    const diff = questOrder(a.id) - questOrder(b.id);
    if (diff !== 0) return diff;
    return a.sortOrder - b.sortOrder;
  });

  const handleClaim = (questId: number) => {
    claimMutation.mutate({ questId });
  };

  const dailyCompleted = dailyQuests.filter((q) => {
    const p = getProgress(q.id);
    return p?.rewardClaimed;
  }).length;

  const cumulativeCompleted = cumulativeQuests.filter((q) => {
    const p = getProgress(q.id);
    return p?.rewardClaimed;
  }).length;

  if (questsQuery.isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400 text-lg">퀘스트 로딩 중...</div>
      </div>
    );
  }

  const claimable = [...dailyQuests, ...cumulativeQuests].filter(q => {
    const p = getProgress(q.id);
    return p?.completed && !p.rewardClaimed;
  }).length;

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-3xl mx-auto">
      <div className="hidden md:block">
        <h1 className="text-3xl font-black text-foreground">🎁 퀘스트</h1>
        <p className="text-muted-foreground text-sm">퀘스트를 완료하고 보상을 받으세요</p>
      </div>

      {/* 모두 받기 */}
      {claimable > 0 && (
        <button
          onClick={() => claimAllMutation.mutate()}
          disabled={claimAllMutation.isPending}
          className="w-full flex items-center justify-between rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-3 text-white shadow-lg active:scale-[0.99] transition-transform"
        >
          <span className="font-bold">🎁 받을 수 있는 보상 {claimable}개</span>
          <span className="text-sm font-black bg-white/20 rounded-full px-3 py-1">{claimAllMutation.isPending ? "받는 중..." : "모두 받기"}</span>
        </button>
      )}

      {/* 탭 */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-card border border-border">
        {([["daily", "🔄 일일", dailyCompleted, dailyQuests.length], ["cumulative", "🏆 누적", cumulativeCompleted, cumulativeQuests.length]] as const).map(([key, label, done, total]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn("py-2.5 rounded-lg text-sm font-bold transition-colors",
              activeTab === key ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}
          >
            {label} <span className="text-xs opacity-80">({done}/{total})</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground px-1">
        {activeTab === "daily" ? "일일 퀘스트는 매일 자정(한국 시간)에 초기화됩니다." : "누적 퀘스트는 계정당 한 번만 보상을 받을 수 있습니다."}
      </p>

      {/* 퀘스트 목록 */}
      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        {sortedQuests.map((quest) => {
          const progress = getProgress(quest.id);
          const progressValue = progress?.progress ?? 0;
          const isCompleted = progress?.completed ?? false;
          const isClaimed = progress?.rewardClaimed ?? false;
          const pct = Math.min(100, (progressValue / quest.conditionValue) * 100);
          const reward = REWARD_LABELS[quest.rewardType];
          return (
            <div key={quest.id} className={cn("flex items-center gap-3 px-3 py-3", isClaimed && "opacity-50", isCompleted && !isClaimed && "bg-amber-500/10")}>
              <div className="w-10 h-10 shrink-0 rounded-xl bg-muted flex items-center justify-center text-xl">{isClaimed ? "✅" : quest.iconEmoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("font-bold text-sm truncate", isClaimed ? "line-through text-muted-foreground" : "text-foreground")}>{quest.title}</span>
                  <span className={cn("shrink-0 text-[11px] font-semibold", reward?.color ?? "text-foreground")}>{reward?.icon} +{quest.rewardValue}</span>
                </div>
                {quest.description && <div className="text-[11px] text-muted-foreground truncate">{quest.description}</div>}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", isCompleted ? "bg-emerald-400" : "bg-primary")} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={cn("text-[11px] font-mono", isCompleted ? "text-emerald-300" : "text-muted-foreground")}>{Math.min(progressValue, quest.conditionValue)}/{quest.conditionValue}</span>
                </div>
              </div>
              {isCompleted && !isClaimed && (
                <Button size="sm" onClick={() => handleClaim(quest.id)} className="shrink-0 h-9 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold">
                  받기
                </Button>
              )}
            </div>
          );
        })}
        {sortedQuests.length === 0 && <div className="text-center py-12 text-muted-foreground">등록된 퀘스트가 없습니다</div>}
      </div>
    </div>
  );
}
