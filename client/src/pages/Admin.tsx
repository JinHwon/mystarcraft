import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function Admin() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ gold: 0, level: 1, exp: 0, statPoints: 0, fatigue: 100 });
  const [userRole, setUserRole] = useState<"admin" | "user">("user");

  const usersQuery = trpc.admin.listUsers.useQuery();
  const updatePlayerMutation = trpc.admin.updatePlayer.useMutation();
  const resetStatsMutation = trpc.admin.resetPlayerStats.useMutation();
  const resetProgressMutation = trpc.admin.resetPlayerProgress.useMutation();
  const updateUserRoleMutation = trpc.admin.updateUserRole.useMutation();
  const getPlayerInfoQuery = trpc.admin.getPlayerInfo.useQuery(
    { playerId: selectedPlayerId ?? 0 },
    { enabled: !!selectedPlayerId }
  );

  const handleUpdatePlayer = async () => {
    if (!selectedPlayerId) return;
    try {
      await updatePlayerMutation.mutateAsync({
        playerId: selectedPlayerId,
        gold: editData.gold || undefined,
        level: editData.level || undefined,
        exp: editData.exp || undefined,
        statPoints: editData.statPoints || undefined,
        fatigue: editData.fatigue || undefined,
      });
      toast.success("선수 정보가 업데이트되었습니다");
      usersQuery.refetch();
    } catch (error) {
      toast.error("업데이트 실패");
    }
  };

  const handleResetStats = async (playerId: number) => {
    try {
      await resetStatsMutation.mutateAsync({ playerId });
      toast.success("능력치가 초기화되었습니다");
      usersQuery.refetch();
    } catch (error) {
      toast.error("초기화 실패");
    }
  };

  const handleResetProgress = async (playerId: number) => {
    try {
      await resetProgressMutation.mutateAsync({ playerId });
      toast.success("전적이 초기화되었습니다");
      usersQuery.refetch();
    } catch (error) {
      toast.error("초기화 실패");
    }
  };

  const handleUpdateUserRole = async () => {
    if (!selectedUserId) return;
    try {
      await updateUserRoleMutation.mutateAsync({ userId: selectedUserId, role: userRole });
      toast.success("사용자 역할이 변경되었습니다");
      usersQuery.refetch();
    } catch (error) {
      toast.error("역할 변경 실패");
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
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          setSelectedUserId(user.id);
                          setUserRole(user.role);
                        }}
                      >
                        역할 변경
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-amber-600">
                      <DialogHeader>
                        <DialogTitle className="text-amber-400">사용자 역할 변경</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm text-gray-300">현재 역할: {userRole === "admin" ? "관리자" : "일반 사용자"}</label>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              className={userRole === "admin" ? "bg-amber-600" : "bg-slate-700"}
                              onClick={() => setUserRole("admin")}
                            >
                              관리자
                            </Button>
                            <Button
                              size="sm"
                              className={userRole === "user" ? "bg-amber-600" : "bg-slate-700"}
                              onClick={() => setUserRole("user")}
                            >
                              일반 사용자
                            </Button>
                          </div>
                        </div>
                        <Button
                          className="w-full bg-amber-600 hover:bg-amber-700"
                          onClick={handleUpdateUserRole}
                        >
                          변경 완료
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700"
                        onClick={() => setSelectedPlayerId(user.id)}
                      >
                        관리
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-amber-600 max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-amber-400">선수 정보 수정</DialogTitle>
                      </DialogHeader>
                      {getPlayerInfoQuery.isLoading ? (
                        <div className="text-center py-4">로딩 중...</div>
                      ) : getPlayerInfoQuery.data ? (
                        <div className="space-y-4">
                          <div className="text-sm text-gray-300 bg-slate-800 p-2 rounded">
                            <p>선수: {getPlayerInfoQuery.data.userName}</p>
                            <p>역할: {getPlayerInfoQuery.data.userRole === "admin" ? "관리자" : "일반 사용자"}</p>
                          </div>
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
                              onChange={(e) => setEditData({ ...editData, fatigue: parseInt(e.target.value) || 100 })}
                              className="bg-slate-800 border-amber-600 text-white"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 bg-amber-600 hover:bg-amber-700"
                              onClick={handleUpdatePlayer}
                            >
                              업데이트
                            </Button>
                            <Button
                              className="flex-1 bg-red-600 hover:bg-red-700"
                              onClick={() => handleResetStats(selectedPlayerId!)}
                            >
                              능력치 초기화
                            </Button>
                            <Button
                              className="flex-1 bg-red-600 hover:bg-red-700"
                              onClick={() => handleResetProgress(selectedPlayerId!)}
                            >
                              전적 초기화
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-gray-400">선수 정보를 불러올 수 없습니다</div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
