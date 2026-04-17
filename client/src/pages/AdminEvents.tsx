'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Play, Pause, Calendar, Edit2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const EVENT_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  exp_double: { label: '경험치 2배', icon: '⭐', color: 'text-blue-400' },
  fatigue_unlimited: { label: '무제한 피로도', icon: '⚡', color: 'text-green-400' },
  gold_double: { label: '골드 2배', icon: '💰', color: 'text-yellow-400' },
  stat_boost: { label: '능력치 부스트', icon: '💪', color: 'text-purple-400' },
};

export default function AdminEvents() {
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [newEvent, setNewEvent] = useState({
    type: 'exp_double' as 'exp_double' | 'fatigue_unlimited' | 'gold_double' | 'stat_boost',
    name: '',
    description: '',
    startTime: '',
    endTime: '',
  });

  const eventsQuery = trpc.event.listAll.useQuery();
  const createEventMutation = trpc.event.create.useMutation();
  const updateEventMutation = trpc.event.update.useMutation();
  const deleteEventMutation = trpc.event.delete.useMutation();

  // 활성 이벤트와 비활성 이벤트 분리
  const { activeEvents, inactiveEvents } = useMemo(() => {
    const events = eventsQuery.data ?? [];
    return {
      activeEvents: events.filter((e) => e.isActive === 1),
      inactiveEvents: events.filter((e) => e.isActive !== 1),
    };
  }, [eventsQuery.data]);

  const handleCreateEvent = async () => {
    if (!newEvent.name.trim()) {
      toast.error('이벤트 이름을 입력하세요');
      return;
    }
    try {
      await createEventMutation.mutateAsync({
        type: newEvent.type,
        name: newEvent.name,
        description: newEvent.description || undefined,
        isActive: false,
      });
      toast.success('이벤트가 생성되었습니다');
      setShowCreateEvent(false);
      setNewEvent({ type: 'exp_double', name: '', description: '', startTime: '', endTime: '' });
      eventsQuery.refetch();
    } catch (error) {
      toast.error('이벤트 생성 실패');
    }
  };

  const handleToggleEvent = async (eventId: number, currentActive: number) => {
    try {
      await updateEventMutation.mutateAsync({
        eventId,
        isActive: currentActive !== 1,
      });
      toast.success(currentActive === 1 ? '이벤트가 종료되었습니다' : '이벤트가 시작되었습니다');
      eventsQuery.refetch();
    } catch (error) {
      toast.error('이벤트 상태 변경 실패');
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await deleteEventMutation.mutateAsync({ eventId });
      toast.success('이벤트가 삭제되었습니다');
      eventsQuery.refetch();
    } catch (error) {
      toast.error('이벤트 삭제 실패');
    }
  };

  const EventCard = ({ event, isActive }: { event: any; isActive: boolean }) => {
    const typeInfo = EVENT_TYPE_LABELS[event.type] ?? { label: event.type, icon: '📋', color: 'text-gray-400' };

    return (
      <Card
        className={cn(
          'transition-all border-2',
          isActive
            ? 'bg-gradient-to-br from-green-950/30 to-slate-900 border-green-500 shadow-lg shadow-green-500/20'
            : 'bg-slate-900 border-slate-700 hover:border-slate-600'
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('text-3xl p-2 rounded-lg', isActive ? 'bg-green-900/30' : 'bg-slate-800')}>
                {typeInfo.icon}
              </div>
              <div className="flex-1">
                <CardTitle className="text-base text-white">{event.name}</CardTitle>
                <p className={cn('text-xs font-semibold mt-1', typeInfo.color)}>{typeInfo.label}</p>
              </div>
            </div>
            <div className="text-right">
              <span
                className={cn(
                  'text-xs px-3 py-1 rounded-full font-bold inline-block',
                  isActive
                    ? 'bg-green-500/20 text-green-300 animate-pulse border border-green-500/50'
                    : 'bg-slate-800 text-gray-500 border border-slate-700'
                )}
              >
                {isActive ? '🔴 진행 중' : '⚫ 대기'}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {event.description && <p className="text-sm text-gray-300">{event.description}</p>}

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              <span>{event.createdAt ? new Date(event.createdAt).toLocaleDateString('ko-KR') : '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3" />
              <span>{event.createdAt ? new Date(event.createdAt).toLocaleTimeString('ko-KR') : '-'}</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              className={cn(
                'flex-1 text-xs font-bold',
                isActive ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'
              )}
              onClick={() => handleToggleEvent(event.id, event.isActive)}
              disabled={updateEventMutation.isPending}
            >
              {isActive ? (
                <>
                  <Pause className="w-3 h-3 mr-1" />
                  이벤트 종료
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  이벤트 시작
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
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-amber-400 mb-2">📅 이벤트 관리</h1>
          <p className="text-gray-400">게임 이벤트를 생성하고 관리하세요</p>
        </div>
        <Button
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
          onClick={() => setShowCreateEvent(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          새 이벤트 생성
        </Button>
      </div>

      {/* 이벤트 생성 다이얼로그 */}
      <Dialog open={showCreateEvent} onOpenChange={setShowCreateEvent}>
        <DialogContent className="bg-slate-900 border-2 border-amber-600">
          <DialogHeader>
            <DialogTitle className="text-2xl text-amber-400">새 이벤트 만들기</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 block mb-2 font-semibold">이벤트 유형</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(EVENT_TYPE_LABELS).map(([key, { label, icon, color }]) => (
                  <button
                    key={key}
                    onClick={() => setNewEvent({ ...newEvent, type: key as any })}
                    className={cn(
                      'p-3 rounded-lg border-2 text-left transition-all',
                      newEvent.type === key
                        ? 'border-amber-500 bg-amber-900/30 shadow-lg shadow-amber-500/20'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    )}
                  >
                    <span className="text-2xl block mb-1">{icon}</span>
                    <p className={cn('text-xs font-semibold', color)}>{label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-300 block mb-1 font-semibold">이벤트 이름</label>
              <Input
                placeholder="예: 주말 경험치 2배 이벤트"
                value={newEvent.name}
                onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                className="bg-slate-800 border-amber-600 text-white placeholder-gray-500"
              />
            </div>

            <div>
              <label className="text-sm text-gray-300 block mb-1 font-semibold">설명 (선택)</label>
              <Input
                placeholder="이벤트 설명을 입력하세요"
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                className="bg-slate-800 border-amber-600 text-white placeholder-gray-500"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700 font-bold"
                onClick={handleCreateEvent}
                disabled={createEventMutation.isPending}
              >
                {createEventMutation.isPending ? '생성 중...' : '이벤트 생성'}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-slate-600 text-gray-400 hover:bg-slate-800"
                onClick={() => setShowCreateEvent(false)}
              >
                취소
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 활성 이벤트 섹션 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 bg-green-500 rounded"></div>
          <h2 className="text-2xl font-bold text-green-400">진행 중인 이벤트</h2>
          <span className="text-sm text-green-400 bg-green-900/30 px-2 py-1 rounded">
            {activeEvents.length}개
          </span>
        </div>

        {activeEvents.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-700 border-dashed">
            <CardContent className="p-8 text-center">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400">진행 중인 이벤트가 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeEvents.map((event) => (
              <EventCard key={event.id} event={event} isActive={true} />
            ))}
          </div>
        )}
      </div>

      {/* 대기 중인 이벤트 섹션 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 bg-slate-600 rounded"></div>
          <h2 className="text-2xl font-bold text-slate-400">대기 중인 이벤트</h2>
          <span className="text-sm text-slate-400 bg-slate-800 px-2 py-1 rounded">{inactiveEvents.length}개</span>
        </div>

        {inactiveEvents.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-700 border-dashed">
            <CardContent className="p-8 text-center">
              <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400">대기 중인 이벤트가 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactiveEvents.map((event) => (
              <EventCard key={event.id} event={event} isActive={false} />
            ))}
          </div>
        )}
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4 pt-4">
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">총 이벤트</p>
              <p className="text-3xl font-bold text-amber-400">{(eventsQuery.data ?? []).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-green-700">
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">진행 중</p>
              <p className="text-3xl font-bold text-green-400">{activeEvents.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">대기 중</p>
              <p className="text-3xl font-bold text-slate-400">{inactiveEvents.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
