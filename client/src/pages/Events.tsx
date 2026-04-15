import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

const EVENT_TYPES = {
  exp_double: { label: "경험치 2배", icon: "⭐", color: "text-yellow-400" },
  fatigue_unlimited: { label: "피로도 무제한", icon: "⚡", color: "text-blue-400" },
  gold_double: { label: "골드 2배", icon: "💰", color: "text-green-400" },
  stat_boost: { label: "능력치 상승", icon: "📈", color: "text-purple-400" },
};

export default function Events() {
  const { user } = useAuth();
  const [newEvent, setNewEvent] = useState({ type: "exp_double", name: "", description: "" });

  const allEventsQuery = trpc.event.listAll.useQuery(undefined, { enabled: user?.role === "admin" });
  const activeEventsQuery = trpc.event.listActive.useQuery();
  const createEventMutation = trpc.event.create.useMutation();
  const updateEventMutation = trpc.event.update.useMutation();
  const deleteEventMutation = trpc.event.delete.useMutation();

  const handleCreateEvent = async () => {
    if (!newEvent.name) {
      toast.error("이벤트 이름을 입력해주세요");
      return;
    }
    try {
      await createEventMutation.mutateAsync({
        type: newEvent.type as any,
        name: newEvent.name,
        description: newEvent.description,
        isActive: false,
      });
      setNewEvent({ type: "exp_double", name: "", description: "" });
      toast.success("이벤트가 생성되었습니다");
      allEventsQuery.refetch();
    } catch (error) {
      toast.error("이벤트 생성 실패");
    }
  };

  const handleToggleEvent = async (eventId: number, isActive: boolean) => {
    try {
      await updateEventMutation.mutateAsync({
        eventId,
        isActive: !isActive,
      });
      toast.success(isActive ? "이벤트가 종료되었습니다" : "이벤트가 시작되었습니다");
      allEventsQuery.refetch();
      activeEventsQuery.refetch();
    } catch (error) {
      toast.error("이벤트 업데이트 실패");
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    try {
      await deleteEventMutation.mutateAsync({ eventId });
      toast.success("이벤트가 삭제되었습니다");
      allEventsQuery.refetch();
      activeEventsQuery.refetch();
    } catch (error) {
      toast.error("이벤트 삭제 실패");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-amber-400 mb-2">이벤트 관리</h1>
        <p className="text-gray-400">게임 이벤트를 생성하고 관리합니다</p>
      </div>

      {/* 활성 이벤트 표시 */}
      {activeEventsQuery.data && activeEventsQuery.data.length > 0 && (
        <Card className="bg-gradient-to-r from-amber-900 to-orange-900 border-amber-500">
          <CardHeader>
            <CardTitle className="text-amber-300">🎉 진행 중인 이벤트</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeEventsQuery.data.map((event) => {
                const eventType = EVENT_TYPES[event.type as keyof typeof EVENT_TYPES];
                return (
                  <div key={event.id} className="p-4 bg-slate-900 rounded border-2 border-amber-500">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{eventType.icon}</span>
                      <h3 className="font-bold text-amber-300">{event.name}</h3>
                    </div>
                    <p className="text-sm text-gray-300">{eventType.label}</p>
                    {event.description && <p className="text-xs text-gray-400 mt-2">{event.description}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 관리자 전용: 이벤트 생성 */}
      {user?.role === "admin" && (
        <Card className="bg-slate-900 border-amber-600">
          <CardHeader>
            <CardTitle className="text-amber-400">새 이벤트 생성</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300">이벤트 타입</label>
                <select
                  value={newEvent.type}
                  onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}
                  className="w-full p-2 bg-slate-800 border border-amber-600 text-white rounded"
                >
                  {Object.entries(EVENT_TYPES).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val.icon} {val.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-300">이벤트 이름</label>
                <Input
                  value={newEvent.name}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                  placeholder="예: 주말 특별 이벤트"
                  className="bg-slate-800 border-amber-600 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">설명 (선택사항)</label>
                <Input
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="이벤트 설명"
                  className="bg-slate-800 border-amber-600 text-white"
                />
              </div>
              <Button
                onClick={handleCreateEvent}
                className="w-full bg-amber-600 hover:bg-amber-700"
                disabled={createEventMutation.isPending}
              >
                {createEventMutation.isPending ? "생성 중..." : "이벤트 생성"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 모든 이벤트 목록 (관리자만) */}
      {user?.role === "admin" && (
        <Card className="bg-slate-900 border-amber-600">
          <CardHeader>
            <CardTitle className="text-amber-400">모든 이벤트</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allEventsQuery.data?.map((event) => {
                const eventType = EVENT_TYPES[event.type as keyof typeof EVENT_TYPES];
                return (
                  <div
                    key={event.id}
                    className={`p-4 rounded border-2 flex items-center justify-between ${
                      event.isActive ? "bg-green-900 border-green-500" : "bg-slate-800 border-amber-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{eventType.icon}</span>
                        <h3 className="font-semibold text-white">{event.name}</h3>
                        {event.isActive && <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">진행 중</span>}
                      </div>
                      <p className="text-sm text-gray-300">{eventType.label}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleToggleEvent(event.id, event.isActive)}
                        className={event.isActive ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
                        disabled={updateEventMutation.isPending}
                      >
                        {event.isActive ? "종료" : "시작"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteEvent(event.id)}
                        className="border-red-600 text-red-400 hover:bg-red-900"
                        disabled={deleteEventMutation.isPending}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
