import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const ITEMS_PER_PAGE = 20;

export default function Admin() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
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

  // Dialog가 열릴 때 DB 데이터 자동 로드
  useEffect(() => {
    if (getPlayerInfoQuery.data) {
      setEditData({
        gold: getPlayerInfoQuery.data.gold,
        level: getPlayerInfoQuery.data.level,
        exp: getPlayerInfoQuery.data.exp,
        statPoints: getPlayerInfoQuery.data.statPoints,
        fatigue: getPlayerInfoQuery.data.fatigue,
      });
    }
  }, [getPlayerInfoQuery.data]);

  // 검색 필터링
  const filteredUsers = useMemo(() => {
    if (!usersQuery.data) return [];
    return usersQuery.data.filter((user) => {
      const query = searchQuery.toLowerCase();
      return (
        (user.name?.toLowerCase() || "").includes(query) ||
        (user.email?.toLowerCase() || "").includes(query)
      );
    });
  }, [usersQuery.data, searchQuery]);

  // 페이지네이션
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

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

  const handleManageUser = (userId: number) => {
    // userId를 playerId로 변환하기 위해 사용자 정보에서 선수 ID 찾기
    const user = usersQuery.data?.find(u => u.id === userId);
    if (user && user.playerId) {
      setSelectedPlayerId(user.playerId);
      setSelectedUserId(userId);
    } else {
      setSelectedPlayerId(null);
      setSelectedUserId(userId);
    }
  };

  if (usersQuery.isLoading) return <div className="p-8">로딩 중...</div>;
  if (usersQuery.error) return (
    <div className="p-8 space-y-4">
      <h1 className="text-3xl font-bold text-red-400">오류 발생</h1>
      <p className="text-gray-400">사용자 정보를 불러올 수 없습니다: {usersQuery.error.message}</p>
      <Button onClick={() => usersQuery.refetch()} className="bg-amber-600 hover:bg-amber-700">
        다시 시도
      </Button>
    </div>
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-amber-400 mb-2">관리자 패널</h1>
        <p className="text-gray-400">사용자 정보 관리 및 게임 설정</p>
      </div>

      {/* 검색 바 */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
        <Input
          placeholder="사용자 이름 또는 이메일로 검색..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-10 bg-slate-800 border-amber-600 text-white"
        />
      </div>

      {/* 사용자 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedUsers.map((user) => (
          <Card key={user.id} className="bg-slate-900 border-amber-600 hover:border-amber-500 transition">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-white truncate">{user.name || "이름 없음"}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  {user.playerName && (
                    <p className="text-xs text-amber-400 truncate">선수: {user.playerName}</p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2 py-1 bg-amber-900 text-amber-300 rounded">
                    {user.role === "admin" ? "관리자" : "일반"}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${user.playerId ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                    {user.playerId ? `선수 ID: ${user.playerId}` : "선수 없음"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
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
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-xs"
                        onClick={() => handleManageUser(user.id)}
                      >
                        관리
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-amber-600 max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-amber-400">선수 정보 수정</DialogTitle>
                      </DialogHeader>
                      {!selectedPlayerId ? (
                        <div className="text-center py-4 text-gray-400">이 사용자는 아직 선수를 생성하지 않았습니다</div>
                      ) : getPlayerInfoQuery.isLoading ? (
                        <div className="text-center py-4">로딩 중...</div>
                      ) : getPlayerInfoQuery.error ? (
                        <div className="text-center py-4 text-red-400">선수 정보 로딩 실패: {getPlayerInfoQuery.error.message}</div>
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
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            className="border-amber-600 text-amber-400 hover:bg-amber-900"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-gray-400">
            페이지 {currentPage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
            className="border-amber-600 text-amber-400 hover:bg-amber-900"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* 검색 결과 없음 */}
      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">검색 결과가 없습니다</p>
        </div>
      )}
    </div>
  );
}
