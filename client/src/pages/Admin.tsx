import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function Admin() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ gold: 0, level: 1, exp: 0, statPoints: 0, fatigue: 100 });

  const usersQuery = trpc.admin.listUsers.useQuery();
  const updatePlayerMutation = trpc.admin.updatePlayer.useMutation();
  const resetStatsMutation = trpc.admin.resetPlayerStats.useMutation();
  const resetProgressMutation = trpc.admin.resetPlayerProgress.useMutation();

  const handleUpdatePlayer = async () => {
    if (!selectedUserId) return;
    try {
      await updatePlayerMutation.mutateAsync({
        playerId: selectedUserId,
        gold: editData.gold || undefined,
        level: editData.level || undefined,
        exp: editData.exp || undefined,
        statPoints: editData.statPoints || undefined,
        fatigue: editData.fatigue || undefined,
      });
      toast.success("선수 정보가 업데이트되었습니다");
    } catch (error) {
      toast.error("업데이트 실패");
    }
  };

  const handleResetStats = async (playerId: number) => {
    try {
      await resetStatsMutation.mutateAsync({ playerId });
      toast.success("능력치가 초기화되었습니다");
    } catch (error) {
      toast.error("초기화 실패");
    }
  };

  const handleResetProgress = async (playerId: number) => {
    try {
      await resetProgressMutation.mutateAsync({ playerId });
      toast.success("전적이 초기화되었습니다");
    } catch (error) {
      toast.error("초기화 실패");
    }
  };

  if (usersQuery.isLoading) return <div className="p-8">로딩 중...</div>;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-amber-400 mb-2">관리자 패널</h1>
        <p className="text-gray-400">사용자 정보 관리 및 게임 설정</p>
      </div>

      <Card className="bg-slate-900 border-amber-600">
        <CardHeader>
          <CardTitle className="text-amber-400">사용자 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {usersQuery.data?.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-slate-800 rounded border border-amber-700">
                <div>
                  <p className="font-semibold text-white">{user.name || "이름 없음"}</p>
                  <p className="text-sm text-gray-400">{user.email}</p>
                  <p className="text-xs text-amber-400">{user.role === "admin" ? "관리자" : "일반 사용자"}</p>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700"
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      관리
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-slate-900 border-amber-600">
                    <DialogHeader>
                      <DialogTitle className="text-amber-400">선수 정보 수정</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm text-gray-300">골드</label>
                        <Input
                          type="number"
                          value={editData.gold}
                          onChange={(e) => setEditData({ ...editData, gold: parseInt(e.target.value) || 0 })}
                          className="bg-slate-800 border-amber-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300">레벨</label>
                        <Input
                          type="number"
                          value={editData.level}
                          onChange={(e) => setEditData({ ...editData, level: parseInt(e.target.value) || 1 })}
                          className="bg-slate-800 border-amber-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300">경험치</label>
                        <Input
                          type="number"
                          value={editData.exp}
                          onChange={(e) => setEditData({ ...editData, exp: parseInt(e.target.value) || 0 })}
                          className="bg-slate-800 border-amber-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300">능력치 포인트</label>
                        <Input
                          type="number"
                          value={editData.statPoints}
                          onChange={(e) => setEditData({ ...editData, statPoints: parseInt(e.target.value) || 0 })}
                          className="bg-slate-800 border-amber-600 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300">피로도</label>
                        <Input
                          type="number"
                          value={editData.fatigue}
                          min="0"
                          max="100"
                          onChange={(e) => setEditData({ ...editData, fatigue: parseInt(e.target.value) || 100 })}
                          className="bg-slate-800 border-amber-600 text-white"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleUpdatePlayer}
                          className="bg-amber-600 hover:bg-amber-700 flex-1"
                          disabled={updatePlayerMutation.isPending}
                        >
                          {updatePlayerMutation.isPending ? "업데이트 중..." : "업데이트"}
                        </Button>
                        <Button
                          onClick={() => handleResetStats(user.id)}
                          variant="outline"
                          className="border-red-600 text-red-400 hover:bg-red-900 flex-1"
                          disabled={resetStatsMutation.isPending}
                        >
                          능력치 초기화
                        </Button>
                        <Button
                          onClick={() => handleResetProgress(user.id)}
                          variant="outline"
                          className="border-red-600 text-red-400 hover:bg-red-900 flex-1"
                          disabled={resetProgressMutation.isPending}
                        >
                          전적 초기화
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
