import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ROOKIE_SCOUT_COST, TEAM_EMBLEMS } from "@shared/teamConstants";
import { ConditionBadge, FatigueBar, GradeTag, RaceTag } from "@/components/team/PlayerBadges";

export default function Team() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const teamQuery = trpc.team.get.useQuery();
  const scoutQuery = trpc.team.scoutList.useQuery();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [emblem, setEmblem] = useState("🛡️");
  const [releaseTarget, setReleaseTarget] = useState<{ id: number; name: string } | null>(null);

  const refresh = () => {
    utils.team.get.invalidate();
    utils.team.scoutList.invalidate();
    utils.player.get.invalidate();
  };

  const renameMutation = trpc.team.rename.useMutation({
    onSuccess: () => { toast.success("팀 정보가 변경되었습니다"); setEditing(false); refresh(); },
    onError: e => toast.error(e.message),
  });
  const recruitMutation = trpc.team.recruit.useMutation({
    onSuccess: r => { toast.success(`🤝 ${r.name} 선수 영입 완료! (-${r.price.toLocaleString()}G)`); refresh(); },
    onError: e => toast.error(e.message),
  });
  const rookieMutation = trpc.team.scoutRookie.useMutation({
    onSuccess: r => { toast.success(`🌱 신인 ${r.name} 선수 발굴! (능력치 합계 ${r.totalStats.toLocaleString()})`); refresh(); },
    onError: e => toast.error(e.message),
  });
  const releaseMutation = trpc.team.release.useMutation({
    onSuccess: r => { toast.success(`${r.name} 선수를 방출했습니다`); refresh(); },
    onError: e => toast.error(e.message),
  });
  const restMutation = trpc.team.rest.useMutation({
    onSuccess: r => { toast.success(`😴 ${r.playerName} 선수 휴식 완료 (피로도 ${r.fatigue}, 컨디션 ${r.condition}%)`); refresh(); },
    onError: e => toast.error(e.message),
  });

  if (teamQuery.isLoading || !teamQuery.data) {
    return <div className="p-8 text-gray-400">팀 정보를 불러오는 중...</div>;
  }
  const { team, roster, gold, maxRoster } = teamQuery.data;
  const rosterFull = roster.length >= maxRoster;
  const teamPower = roster.length ? Math.round(roster.reduce((s, p) => s + p.totalStats, 0) / roster.length) : 0;
  const teamWins = roster.reduce((s, p) => s + p.wins, 0);
  const teamLosses = roster.reduce((s, p) => s + p.losses, 0);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      {/* 팀 헤더 */}
      <Card className="py-0 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border-indigo-800/60">
        <CardContent className="p-5">
          {editing ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {TEAM_EMBLEMS.map(e => (
                  <button
                    key={e}
                    onClick={() => setEmblem(e)}
                    className={cn("w-10 h-10 text-2xl rounded-lg border", emblem === e ? "border-amber-400 bg-amber-900/30" : "border-slate-700 bg-slate-800")}
                  >{e}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="팀 이름" className="max-w-xs" />
                <Button onClick={() => renameMutation.mutate({ name, emblem })} disabled={!name.trim() || renameMutation.isPending}>저장</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>취소</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-5xl">{team.emblem}</div>
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl md:text-3xl font-black text-white">{team.name}</h1>
                  <button className="text-xs text-gray-400 hover:text-white" onClick={() => { setName(team.name); setEmblem(team.emblem); setEditing(true); }}>✏️ 수정</button>
                </div>
                <p className="text-sm text-gray-400">프로게임단 · 감독 모드</p>
              </div>
              <div className="w-full md:w-auto grid grid-cols-4 gap-2 md:gap-3 text-center">
                <Stat label="선수단" value={`${roster.length}/${maxRoster}`} />
                <Stat label="평균 능력치" value={teamPower.toLocaleString()} />
                <Stat label="팀 통산" value={`${teamWins}승 ${teamLosses}패`} />
                <Stat label="운영 자금" value={`${gold.toLocaleString()}G`} accent />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 선수단 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-amber-400">👥 선수단</h2>
          <Button size="sm" variant="outline" onClick={() => navigate("/training")}>🏋️ 훈련장으로</Button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {roster.map(p => (
            <Card key={p.id} className={cn("py-0 bg-slate-900 border-2", p.isMain ? "border-amber-600/70" : "border-slate-700")}>
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white truncate">{p.name}</span>
                      {p.isMain && <span className="text-[10px] bg-amber-600 text-white px-1.5 rounded">에이스</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <RaceTag race={p.race} />
                      <span className="text-xs text-gray-500">Lv.{p.level}</span>
                      <span className="text-xs text-gray-500">{p.wins}승 {p.losses}패</span>
                    </div>
                  </div>
                  <GradeTag grade={p.grade} />
                </div>
                <div className="flex items-center justify-between">
                  <ConditionBadge condition={p.condition} />
                  <span className="text-xs text-gray-400">능력치 <b className="text-white font-mono">{p.totalStats.toLocaleString()}</b></span>
                </div>
                <FatigueBar fatigue={p.fatigue} />
                <div className="flex gap-1.5 pt-1">
                  <Button size="sm" className="flex-1 h-8 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate(`/training?player=${p.id}`)}>🏋️ 훈련</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs"
                    disabled={p.rested || restMutation.isPending}
                    onClick={() => restMutation.mutate({ playerId: p.id })}
                  >{p.rested ? "휴식 완료" : "😴 휴식"}</Button>
                  {!p.isMain && (
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-red-400 hover:text-red-300" onClick={() => setReleaseTarget({ id: p.id, name: p.name })}>방출</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 선수 영입 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-emerald-400">🤝 선수 영입</h2>
            <p className="text-xs text-gray-400">자유계약 선수 명단은 매일 자정에 바뀝니다. 신인 발굴은 재능이 무작위입니다.</p>
          </div>
          <Button
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-600"
            disabled={rosterFull || rookieMutation.isPending || gold < ROOKIE_SCOUT_COST}
            onClick={() => rookieMutation.mutate()}
          >🌱 신인 발굴 ({ROOKIE_SCOUT_COST}G)</Button>
        </div>
        {rosterFull && <p className="text-sm text-amber-300">선수단이 가득 찼습니다. 영입하려면 먼저 선수를 방출하세요.</p>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(scoutQuery.data ?? []).map(p => (
            <Card key={p.id} className="py-0 bg-slate-900/70 border-slate-700">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-white">{p.name.replace(/^AI_/, "")}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <RaceTag race={p.race} />
                      <span className="text-xs text-gray-500">Lv.{p.level}</span>
                      <span className="text-xs text-gray-500">{p.wins}승 {p.losses}패</span>
                    </div>
                  </div>
                  <GradeTag grade={p.grade} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">능력치 <b className="text-white font-mono">{p.totalStats.toLocaleString()}</b></span>
                  <span className="text-yellow-400 font-bold">{p.price.toLocaleString()}G</span>
                </div>
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  disabled={rosterFull || gold < p.price || recruitMutation.isPending}
                  onClick={() => recruitMutation.mutate({ playerId: p.id })}
                >{gold < p.price ? "자금 부족" : "영입하기"}</Button>
              </CardContent>
            </Card>
          ))}
          {scoutQuery.isLoading && <p className="text-gray-500 text-sm">영입 후보를 찾는 중...</p>}
        </div>
      </section>

      <AlertDialog open={!!releaseTarget} onOpenChange={open => !open && setReleaseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{releaseTarget?.name} 선수를 방출할까요?</AlertDialogTitle>
            <AlertDialogDescription>방출된 선수는 자유계약 AI 선수가 되며, 영입 비용은 돌려받지 못합니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (releaseTarget) releaseMutation.mutate({ playerId: releaseTarget.id }); setReleaseTarget(null); }}
            >방출</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-slate-900/60 rounded-lg px-1.5 md:px-3 py-2 border border-slate-700/60">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className={cn("font-bold text-xs md:text-sm", accent ? "text-yellow-400" : "text-white")}>{value}</div>
    </div>
  );
}
