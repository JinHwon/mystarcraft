import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STAT_LABELS, RACE_LABELS } from "@shared/gameConstants";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export default function GameResultsPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const itemsPerPage = 20;

  // API 호출
  const { data: gameHistory = [] } = trpc.practice.getGameHistory.useQuery();

  // 검색 필터링
  const filteredResults = gameHistory.filter(result =>
    result.opponentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    result.opponentRace?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 페이지네이션
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedResults = filteredResults.slice(startIndex, startIndex + itemsPerPage);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePageJump = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">경기 결과</h1>
          <p className="text-slate-400">총 {filteredResults.length}개의 경기 기록</p>
        </div>

        {/* 검색 바 */}
        <div className="mb-6 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="상대 선수명 또는 종족으로 검색..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* 결과 목록 */}
        <div className="space-y-4 mb-8">
          {paginatedResults.length > 0 ? (
            paginatedResults.map((result, index) => (
              <Card key={`${result.gameId}-${startIndex + index}`} className="border-slate-700 bg-slate-800/50">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* 결과 요약 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">결과</span>
                        <Badge className={result.isWinner ? "bg-green-600" : "bg-red-600"}>
                          {result.isWinner ? "승리" : "패배"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">상대</span>
                        <span className="text-white font-medium">{result.opponentName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">종족</span>
                        <span className="text-white">{RACE_LABELS[result.opponentRace as keyof typeof RACE_LABELS] || result.opponentRace}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">날짜</span>
                        <span className="text-slate-300 text-sm">
                          {result.completedAt || new Date(result.createdAt).toISOString().split('T')[0]}
                        </span>
                      </div>
                    </div>

                    {/* 보상 정보 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">경험치</span>
                        <span className="text-blue-400 font-semibold">+{result.expGained}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">골드</span>
                        <span className="text-yellow-400 font-semibold">+{result.goldGained}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">피로도</span>
                        <span className="text-red-400 font-semibold">-{result.fatigueUsed}</span>
                      </div>
                    </div>

                    {/* 능력치 변동 */}
                    <div className="space-y-2">
                      <p className="text-slate-400 font-semibold text-sm">능력치 변동</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {result.statChanges && Object.entries(result.statChanges).map(([stat, change]: [string, any]) => (
                          <div key={stat} className="flex justify-between">
                            <span className="text-slate-400">
                              {STAT_LABELS[stat as keyof typeof STAT_LABELS] || stat}
                            </span>
                            <span className={change >= 0 ? "text-green-400" : change < 0 ? "text-red-400" : "text-slate-400"}>
                              {change >= 0 ? "+" : ""}{change}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="border-slate-700 bg-slate-800/50">
              <CardContent className="pt-6 text-center">
                <p className="text-slate-400">경기 기록이 없습니다.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            <Button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              variant="outline"
              size="sm"
              className="border-slate-600 hover:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* 페이지 번호 버튼 */}
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
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
              onClick={handleNextPage}
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
