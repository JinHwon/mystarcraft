import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STAT_LABELS, RACE_LABELS, GRADE_COLORS } from "@shared/gameConstants";
import type { StatKey } from "@shared/gameConstants";
import { ChevronLeft, ChevronRight, Trophy, Medal, Award } from "lucide-react";

const ITEMS_PER_PAGE = 20;

const GRADE_STYLE_CLASSES: Record<string, string> = {
  SSS: "text-pink-400 border-pink-500 bg-pink-500/10",
  SS: "text-red-400 border-red-500 bg-red-500/10",
  S: "text-orange-400 border-orange-500 bg-orange-500/10",
  A: "text-yellow-400 border-yellow-500 bg-yellow-500/10",
  B: "text-pink-400 border-pink-500 bg-pink-500/10",
  C: "text-purple-400 border-purple-500 bg-purple-500/10",
  D: "text-blue-400 border-blue-500 bg-blue-500/10",
  E: "text-green-400 border-green-500 bg-green-500/10",
  F: "text-slate-400 border-slate-500 bg-slate-500/10",
};

const RACE_BADGE_COLORS: Record<string, string> = {
  terran: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  zerg: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  protoss: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
};

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/40">
        <Trophy className="w-5 h-5 text-yellow-400" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-300/20 border border-slate-300/40">
        <Medal className="w-5 h-5 text-slate-300" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-700/20 border border-amber-700/40">
        <Award className="w-5 h-5 text-amber-600" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-700/50">
      <span className="text-sm font-bold text-slate-400">{rank}</span>
    </div>
  );
}

export default function RankingPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOpponent, setSelectedOpponent] = useState<number | null>(null);
  const { data: rankings = [], isLoading } = trpc.ranking.list.useQuery();
  const { data: currentPlayer } = trpc.player.get.useQuery();
  const { data: headToHead } = trpc.ranking.headToHead.useQuery(
    { opponentPlayerId: selectedOpponent ?? 0 },
    { enabled: !!selectedOpponent && !!currentPlayer }
  );

  const totalPages = Math.ceil(rankings.length / ITEMS_PER_PAGE);
  const paginatedRankings = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return rankings.slice(start, start + ITEMS_PER_PAGE);
  }, [rankings, currentPage]);

  const handlePageJump = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">랭킹 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-1 md:mb-2 flex items-center gap-3">
            <Trophy className="w-7 h-7 md:w-9 md:h-9 text-yellow-400" />
            랭킹
          </h1>
          <p className="text-xs md:text-base text-slate-400">총 {rankings.length}명의 선수</p>
        </div>

        {/* 테이블 헤더 - 데스크톱 */}
        <div className="hidden lg:block mb-3">
          <div className="grid grid-cols-[60px_1fr_80px_60px_90px_repeat(8,64px)_100px] gap-2 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>순위</span>
            <span>선수명</span>
            <span>종족</span>
            <span>등급</span>
            <span className="text-center">전적</span>
            {(Object.values(STAT_LABELS) as string[]).map((label) => (
              <span key={label} className="text-center">{label}</span>
            ))}
            <span className="text-center">마지막 접속</span>
          </div>
        </div>

        {/* 랭킹 목록 */}
        <div className="space-y-2">
          {paginatedRankings.length > 0 ? (
            paginatedRankings.map((player, index) => {
              const rank = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
              const isTop3 = rank <= 3;
              const calculatedGrade = player.grade;
              const gradeColor = GRADE_COLORS[calculatedGrade as keyof typeof GRADE_COLORS] ?? "#9CA3AF";
              const gradeClasses = GRADE_STYLE_CLASSES[calculatedGrade] ?? GRADE_STYLE_CLASSES["F"];

              return (
                <Card
                  key={player.playerId}
                  className={`border-slate-700 transition-all ${
                    isTop3
                      ? "bg-slate-800/80 border-yellow-500/30 shadow-lg shadow-yellow-500/5"
                      : "bg-slate-800/50 hover:bg-slate-800/70"
                  }`}
                >
                  <CardContent className="p-3 md:p-4">
                    {/* 데스크톱 레이아웃 */}
                    <div className="hidden lg:grid grid-cols-[60px_1fr_80px_60px_90px_repeat(8,64px)_100px] gap-2 items-center">
                      <RankBadge rank={rank} />
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate text-sm">
                          {player.name}
                          {player.isBot && <Badge className="ml-1.5 bg-purple-600 text-purple-100 text-[10px] px-1 py-0">AI</Badge>}
                        </p>
                        <p className="text-xs text-slate-500">Lv.{player.level}</p>
                      </div>
                      <Badge className={`text-xs border ${RACE_BADGE_COLORS[player.race] ?? "bg-slate-500/20 text-slate-300"}`}>
                        {RACE_LABELS[player.race] ?? player.race}
                      </Badge>
                      <span
                        className={`text-center font-black text-lg px-1.5 py-0.5 rounded-md border ${gradeClasses}`}
                        style={{ textShadow: `0 0 8px ${gradeColor}60` }}
                      >
                        {calculatedGrade}
                      </span>
                      <span className="text-center text-xs text-slate-300">
                        <span className="text-green-400">{player.wins ?? 0}승</span>
                        {' '}
                        <span className="text-red-400">{player.losses ?? 0}패</span>
                      </span>
                      {/* 센스 + 상대전적 표시 */}
                      <div className="text-center flex flex-col items-center gap-1">
                        <span className="text-sm text-slate-300">{player.sense}</span>
                        {currentPlayer && currentPlayer.id !== player.playerId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOpponent(selectedOpponent === player.playerId ? null : player.playerId);
                            }}
                            className="text-xs px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                            title="상대전적 보기"
                          >
                            {selectedOpponent === player.playerId && headToHead
                              ? `${headToHead.wins}승 ${headToHead.losses}패`
                              : "⚔️ 상대전적"}
                          </button>
                        )}
                      </div>
                      <span className="text-center text-sm text-slate-300">{player.control}</span>
                      <span className="text-center text-sm text-slate-300">{player.attack}</span>
                      <span className="text-center text-sm text-slate-300">{player.harass}</span>
                      <span className="text-center text-sm text-slate-300">{player.strategy}</span>
                      <span className="text-center text-sm text-slate-300">{player.supply}</span>
                      <span className="text-center text-sm text-slate-300">{player.defense}</span>
                      <span className="text-center text-sm text-slate-300">{player.scout}</span>
                      <span className="text-center text-xs text-slate-500">
                        {player.lastSignedIn
                          ? new Date(player.lastSignedIn).toLocaleDateString("ko-KR")
                          : "-"}
                      </span>
                    </div>

                    {/* 모바일 레이아웃 */}
                    <div className="lg:hidden space-y-3">
                      <div className="flex items-center gap-3">
                        <RankBadge rank={rank} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white truncate text-sm">{player.name}</p>
                            {player.isBot && <Badge className="bg-purple-600 text-purple-100 text-[10px] px-1 py-0">AI</Badge>}
                            <Badge className={`text-xs border ${RACE_BADGE_COLORS[player.race] ?? ""}`}>
                              {RACE_LABELS[player.race] ?? player.race}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`font-black text-sm px-1.5 py-0.5 rounded-md border ${gradeClasses}`}
                              style={{ textShadow: `0 0 8px ${gradeColor}60` }}
                            >
                              {calculatedGrade}
                            </span>
                            <span className="text-xs text-slate-500">Lv.{player.level}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">총 능력치</p>
                          <p className="text-sm font-bold text-blue-400">{player.totalStats}</p>
                          <p className="text-xs mt-0.5">
                            <span className="text-green-400">{player.wins ?? 0}승</span>
                            {' '}
                            <span className="text-red-400">{player.losses ?? 0}패</span>
                          </p>
                          {/* 모바일 상대전적 */}
                          {currentPlayer && currentPlayer.id !== player.playerId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOpponent(selectedOpponent === player.playerId ? null : player.playerId);
                              }}
                              className="text-xs mt-0.5 px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                            >
                              {selectedOpponent === player.playerId && headToHead
                                ? `상대전적: ${headToHead.wins}승 ${headToHead.losses}패`
                                : "⚔️ 상대전적"}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        {(Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>).map((key) => (
                          <div key={key} className="bg-slate-700/50 rounded px-2 py-1.5 text-center">
                            <p className="text-slate-500">{STAT_LABELS[key]}</p>
                            <p className="text-slate-300 font-semibold">{player[key]}</p>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 text-right">
                        마지막 접속: {player.lastSignedIn ? new Date(player.lastSignedIn).toLocaleDateString("ko-KR") : "-"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="border-slate-700 bg-slate-800/50">
              <CardContent className="pt-6 text-center">
                <p className="text-slate-400">등록된 선수가 없습니다.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6 md:mt-8">
            <Button
              onClick={() => handlePageJump(currentPage - 1)}
              disabled={currentPage === 1}
              variant="outline"
              size="sm"
              className="border-slate-600 hover:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    onClick={() => handlePageJump(pageNum)}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    className={currentPage === pageNum ? "bg-blue-600 hover:bg-blue-700" : "border-slate-600 hover:bg-slate-700"}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              onClick={() => handlePageJump(currentPage + 1)}
              disabled={currentPage === totalPages}
              variant="outline"
              size="sm"
              className="border-slate-600 hover:bg-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <span className="text-slate-400 text-sm ml-4">
              {currentPage} / {totalPages}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
