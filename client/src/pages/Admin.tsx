import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, Play, Pause, Calendar } from "lucide-react";

const ITEMS_PER_PAGE = 20;

const EVENT_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  exp_double: { label: "경험치 2배", icon: "⭐", color: "text-blue-400" },
  fatigue_unlimited: { label: "무제한 피로도", icon: "⚡", color: "text-green-400" },
  gold_double: { label: "골드 2배", icon: "💰", color: "text-yellow-400" },
  stat_boost: { label: "능력치 부스트", icon: "💪", color: "text-purple-400" },
};

type AdminTab = "users" | "events";

export default function Admin() {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ gold: 0, level: 1, exp: 0, statPoints: 0, fatigue: 100 });
  const [userRole, setUserRole] = useState<"admin" | "user">("user");

  // 이벤트 관련 상태
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    type: "exp_double" as "exp_double" | "fatigue_unlimited" | "gold_double" | "stat_boost",
    name: "",
    description: "",
  });

  const usersQuery = trpc.admin.listUsers.useQuery();
  const updatePlayerMutation = trpc.admin.updatePlayer.useMutation();
  const resetStatsMutation = trpc.admin.resetPlayerStats.useMutation();
  const resetProgressMutation = trpc.admin.resetPlayerProgress.useMutation();
  const updateUserRoleMutation = trpc.admin.updateUserRole.useMutation();
  const getPlayerInfoQuery = trpc.admin.getPlayerInfo.useQuery(
    { playerId: selectedPlayerId ?? 0 },
    { enabled: !!selectedPlayerId }
  );

  // 이벤트 쿼리
  const eventsQuery = trpc.event.listAll.useQuery();
  const createEventMutation = trpc.event.create.useMutation();
  const updateEventMutation = trpc.event.update.useMutation();
  const deleteEventMutation = trpc.event.delete.useMutation();

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

  // 검색 필터링 (선수가 있는 계정만 표시)
  const filteredUsers = useMemo(() => {
    if (!usersQuery.data) return [];
    return usersQuery.data
      .filter((user) => user.playerId !== null)
      .filter((user) => {
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
    const user = usersQuery.data?.find(u => u.id === userId);
    if (user && user.playerId) {
      setSelectedPlayerId(user.playerId);
      setSelectedUserId(userId);
    } else {
      setSelectedPlayerId(null);
      setSelectedUserId(userId);
    }
  };

  // 이벤트 핸들러
  const handleCreateEvent = async () => {
    if (!newEvent.name.trim()) {
      toast.error("이벤트 이름을 입력하세요");
      return;
    }
    try {
      await createEventMutation.mutateAsync({
        type: newEvent.type,
        name: newEvent.name,
        description: newEvent.description || undefined,
        isActive: false,
      });
      toast.success("이벤트가 생성되었습니다");
      setShowCreateEvent(false);
      setNewEvent({ type: "exp_double", name: "", description: "" });
      eventsQuery.refetch();
    } catch (error) {
      toast.error("이벤트 생성 실패");
    }
  };

  const handleToggleEvent = async (eventId: number, currentActive: number) => {
    try {
      await updateEventMutation.mutateAsync({
        eventId,
        isActive: currentActive !== 1,
      });
      toast.success(currentActive === 1 ? "이벤트가 종료되었습니다" : "이벤트가 시작되었습니다");
      eventsQuery.refetch();
    } catch (error) {
      toast.error("이벤트 상태 변경 실패");
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    try {
      await deleteEventMutation.mutateAsync({ eventId });
      toast.success("이벤트가 삭제되었습니다");
      eventsQuery.refetch();
    } catch (error) {
      toast.error("이벤트 삭제 실패");
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

      {/* 탭 전환 */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("users")}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all border-2 ${
            activeTab === "users"
              ? "bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/20"
              : "bg-slate-800 border-slate-700 text-gray-400 hover:border-slate-600 hover:text-gray-300"
          }`}
        >
          👥 사용자 관리
        </button>
        <button
          onClick={() => setActiveTab("events")}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition-all border-2 ${
            activeTab === "events"
              ? "bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-600/20"
              : "bg-slate-800 border-slate-700 text-gray-400 hover:border-slate-600 hover:text-gray-300"
          }`}
        >
          🎉 이벤트 관리
        </button>
      </div>

      {/* 사용자 관리 탭 */}
      {activeTab === "users" && (
        <>
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

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">검색 결과가 없습니다</p>
            </div>
          )}
        </>
      )}

      {/* 이벤트 관리 탭 */}
      {activeTab === "events" && (
        <div className="space-y-6">
          {/* 이벤트 생성 버튼 */}
          <div className="flex justify-end">
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => setShowCreateEvent(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              새 이벤트 만들기
            </Button>
          </div>

          {/* 이벤트 생성 다이얼로그 */}
          <Dialog open={showCreateEvent} onOpenChange={setShowCreateEvent}>
            <DialogContent className="bg-slate-900 border-amber-600">
              <DialogHeader>
                <DialogTitle className="text-amber-400">새 이벤트 만들기</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-300 block mb-1">이벤트 유형</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(EVENT_TYPE_LABELS).map(([key, { label, icon, color }]) => (
                      <button
                        key={key}
                        onClick={() => setNewEvent({ ...newEvent, type: key as any })}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          newEvent.type === key
                            ? "border-amber-500 bg-amber-900/30"
                            : "border-slate-700 bg-slate-800 hover:border-slate-600"
                        }`}
                      >
                        <span className="text-lg">{icon}</span>
                        <p className={`text-sm font-semibold mt-1 ${color}`}>{label}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">이벤트 이름</label>
                  <Input
                    placeholder="예: 주말 경험치 2배 이벤트"
                    value={newEvent.name}
                    onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                    className="bg-slate-800 border-amber-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">설명 (선택)</label>
                  <Input
                    placeholder="이벤트 설명을 입력하세요"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    className="bg-slate-800 border-amber-600 text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                    onClick={handleCreateEvent}
                    disabled={createEventMutation.isPending}
                  >
                    {createEventMutation.isPending ? "생성 중..." : "이벤트 생성"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-slate-600 text-gray-400 hover:bg-slate-800"
                    onClick={() => setShowCreateEvent(false)}
                  >
                    취소
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* 이벤트 목록 */}
          {eventsQuery.isLoading ? (
            <div className="text-center py-12 text-gray-400">이벤트 로딩 중...</div>
          ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
            <div className="text-center py-16">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400">등록된 이벤트가 없습니다</p>
              <p className="text-xs text-gray-500 mt-1">새 이벤트를 만들어 게임을 활성화하세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {eventsQuery.data.map((event) => {
                const typeInfo = EVENT_TYPE_LABELS[event.type] ?? { label: event.type, icon: "📋", color: "text-gray-400" };
                const isActive = event.isActive === 1;
                return (
                  <Card
                    key={event.id}
                    className={`transition-all ${
                      isActive
                        ? "bg-slate-900 border-2 border-green-500 shadow-lg shadow-green-500/10"
                        : "bg-slate-900 border-slate-700"
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{typeInfo.icon}</span>
                          <div>
                            <CardTitle className="text-sm text-white">{event.name}</CardTitle>
                            <p className={`text-xs font-medium ${typeInfo.color}`}>{typeInfo.label}</p>
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-semibold ${
                            isActive
                              ? "bg-green-900 text-green-300 animate-pulse"
                              : "bg-slate-800 text-gray-500"
                          }`}
                        >
                          {isActive ? "진행 중" : "대기"}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {event.description && (
                        <p className="text-xs text-gray-400">{event.description}</p>
                      )}
                      <div className="text-xs text-gray-500">
                        생성일: {event.createdAt ? new Date(event.createdAt).toLocaleDateString("ko-KR") : "-"}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className={`flex-1 text-xs ${
                            isActive
                              ? "bg-orange-600 hover:bg-orange-700"
                              : "bg-green-600 hover:bg-green-700"
                          }`}
                          onClick={() => handleToggleEvent(event.id, event.isActive)}
                          disabled={updateEventMutation.isPending}
                        >
                          {isActive ? (
                            <>
                              <Pause className="w-3 h-3 mr-1" />
                              종료
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 mr-1" />
                              시작
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-600 text-red-400 hover:bg-red-900/30 text-xs"
                          onClick={() => handleDeleteEvent(event.id)}
                          disabled={deleteEventMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
