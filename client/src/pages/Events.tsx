import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold text-amber-400 mb-1">📋 퀘스트</h1>
        <p className="text-gray-400 text-sm">퀘스트를 완료하고 보상을 받으세요</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("daily")}
          className={cn(
            "flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all border-2",
            activeTab === "daily"
              ? "bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/20"
              : "bg-slate-800 border-slate-700 text-gray-400 hover:border-slate-600 hover:text-gray-300"
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <span>🔄</span>
            <span>일일퀘스트</span>
            <span className="text-xs opacity-75">
              ({dailyCompleted}/{dailyQuests.length})
            </span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab("cumulative")}
          className={cn(
            "flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all border-2",
            activeTab === "cumulative"
              ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20"
              : "bg-slate-800 border-slate-700 text-gray-400 hover:border-slate-600 hover:text-gray-300"
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <span>🏆</span>
            <span>누적보상퀘스트</span>
            <span className="text-xs opacity-75">
              ({cumulativeCompleted}/{cumulativeQuests.length})
            </span>
          </div>
        </button>
      </div>

      {/* 탭 설명 */}
      <div
        className={cn(
          "rounded-lg p-3 text-sm border",
          activeTab === "daily"
            ? "bg-amber-950/40 border-amber-800/50 text-amber-300"
            : "bg-purple-950/40 border-purple-800/50 text-purple-300"
        )}
      >
        {activeTab === "daily"
          ? "🔄 일일퀘스트는 매일 자정에 초기화됩니다. 매일 새로 보상을 받을 수 있어요!"
          : "🏆 누적보상퀘스트는 계정당 1번만 보상을 받을 수 있습니다."}
      </div>

      {/* 퀘스트 목록 */}
      <div className="space-y-3">
        {sortedQuests.map((quest) => {
          const progress = getProgress(quest.id);
          const progressValue = progress?.progress ?? 0;
          const isCompleted = progress?.completed ?? false;
          const isClaimed = progress?.rewardClaimed ?? false;
          const progressPercent = Math.min(
            100,
            (progressValue / quest.conditionValue) * 100
          );
          const reward = REWARD_LABELS[quest.rewardType];

          return (
            <Card
              key={quest.id}
              className={cn(
                "border-2 transition-all",
                isClaimed
                  ? "bg-slate-900/50 border-slate-700 opacity-60"
                  : isCompleted
                  ? activeTab === "daily"
                    ? "bg-amber-950/30 border-amber-600 shadow-lg shadow-amber-600/10"
                    : "bg-purple-950/30 border-purple-600 shadow-lg shadow-purple-600/10"
                  : "bg-slate-900 border-slate-700"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* 아이콘 */}
                  <div
                    className={cn(
                      "text-3xl flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-lg",
                      isClaimed
                        ? "bg-slate-800"
                        : isCompleted
                        ? activeTab === "daily"
                          ? "bg-amber-900/50"
                          : "bg-purple-900/50"
                        : "bg-slate-800"
                    )}
                  >
                    {isClaimed ? "✅" : quest.iconEmoji}
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className={cn(
                          "font-bold text-base",
                          isClaimed
                            ? "text-gray-500 line-through"
                            : "text-white"
                        )}
                      >
                        {quest.title}
                      </h3>
                      {isClaimed && (
                        <span className="text-xs bg-slate-700 text-gray-400 px-2 py-0.5 rounded">
                          완료
                        </span>
                      )}
                    </div>
                    {quest.description && (
                      <p className="text-xs text-gray-400 mb-2">
                        {quest.description}
                      </p>
                    )}

                    {/* 진행 바 */}
                    <div className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">진행도</span>
                        <span
                          className={cn(
                            "font-mono",
                            isCompleted ? "text-green-400" : "text-gray-300"
                          )}
                        >
                          {progressValue}/{quest.conditionValue}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            isClaimed
                              ? "bg-slate-600"
                              : isCompleted
                              ? "bg-green-500"
                              : activeTab === "daily"
                              ? "bg-amber-500"
                              : "bg-purple-500"
                          )}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* 보상 정보 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">보상:</span>
                        <span className="text-sm">
                          {reward?.icon ?? "🎁"}
                        </span>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            reward?.color ?? "text-white"
                          )}
                        >
                          {reward?.label ?? quest.rewardType} +
                          {quest.rewardValue}
                        </span>
                      </div>

                      {/* 보상 수령 버튼 */}
                      {isCompleted && !isClaimed && (
                        <Button
                          size="sm"
                          onClick={() => handleClaim(quest.id)}
                          className={cn(
                            "text-xs font-bold animate-pulse",
                            activeTab === "daily"
                              ? "bg-amber-600 hover:bg-amber-700"
                              : "bg-purple-600 hover:bg-purple-700"
                          )}
                        >
                          🎁 보상 수령
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sortedQuests.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            등록된 퀘스트가 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
