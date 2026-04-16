"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RACE_COLORS, RACE_LABELS, DIFFICULTY_RANGES, GAME_REWARDS, FATIGUE_COST, FATIGUE_MIN_TO_PLAY } from "@shared/gameConstants";
import { Loader2, X, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STAT_LABELS } from "@shared/gameConstants";

type GamePhase = "difficulty" | "map" | "opponent" | "playing" | "result";

interface GameState {
  difficulty?: "beginner" | "intermediate" | "advanced";
  mapId?: number;
  gameId?: number;
  opponentName?: string;
  opponentRace?: string;
  opponentGrade?: string;
  winProbability?: number;
  isWinner?: boolean;
  expGained?: number;
  goldGained?: number;
  fatigueUsed?: number;
  turns?: any[];
  finalScore?: number;
  playerName?: string;
  playerRace?: string;
  statChanges?: Record<string, number>;
  showStatDetailModal?: boolean;
}

export default function PracticePage() {
  const [phase, setPhase] = useState<GamePhase>("difficulty");
  const [gameState, setGameState] = useState<GameState>({});
  const [currentCommentaryIndex, setCurrentCommentaryIndex] = useState(0);
  const [showResultConfirm, setShowResultConfirm] = useState(false);
  const [gameSpeed, setGameSpeed] = useState<1 | 2 | 5>(1);
  const autoPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const mapsQuery = trpc.practice.getMaps.useQuery();
  const findOpponentMutation = trpc.practice.findOpponent.useMutation();
  const playGameMutation = trpc.practice.playGame.useMutation();
  const userQuery = trpc.auth.me.useQuery();
  const playerQuery = trpc.player.get.useQuery();

  const player1Name = playerQuery.data?.name || "플레이어 1";
  const player2Name = gameState.opponentName || "플레이어 2";

  const handleSelectDifficulty = (difficulty: "beginner" | "intermediate" | "advanced") => {
    setGameState({ difficulty });
    setPhase("map");
  };

  const handleSelectMap = async (mapId: number) => {
    setGameState(prev => ({ ...prev, mapId }));
    setPhase("opponent");

    try {
      const result = await findOpponentMutation.mutateAsync({
        difficulty: gameState.difficulty!,
        mapId,
      });
      setGameState(prev => ({
        ...prev,
        gameId: result.gameId,
        playerName: playerQuery.data?.name,
        playerRace: (playerQuery.data as any)?.race,
        opponentName: result.opponent.name,
        opponentRace: result.opponent.race,
        opponentGrade: result.opponentGrade,
        winProbability: result.winProbability,
      }));
    } catch (error) {
      console.error("상대 찾기 실패:", error);
    }
  };

  const handleStartGame = async () => {
    if (!gameState.gameId) return;

    try {
      const result = await playGameMutation.mutateAsync({
        gameId: gameState.gameId,
      });
      
      const raceCommentaries: Record<string, string> = {
        terran: "테란 선수가 선택되었습니다. 테란은 기계적 우월성과 다양한 전술로 유명합니다.",
        zerg: "저그 선수가 선택되었습니다. 저그는 빠른 확장과 공격성으로 유명합니다.",
        protoss: "프로토스 선수가 선택되었습니다. 프로토스는 고급 기술과 강력한 유닛으로 유명합니다.",
      };
      
      const turns = result.turns || [];
      if (turns.length > 0 && turns[0]?.commentaries) {
        const initialCommentary = raceCommentaries[gameState.playerRace as string] || "게임이 시작되었습니다.";
        turns[0].commentaries.unshift(initialCommentary);
      }
      
      setGameState(prev => ({
        ...prev,
        turns,
        isWinner: result.isWinner,
        expGained: result.expGained,
        goldGained: result.goldGained,
        fatigueUsed: result.fatigueUsed,
        finalScore: result.finalScore,
        statChanges: result.statChanges,
      }));
      
      setPhase("playing");
      setCurrentCommentaryIndex(0);
      setCurrentTurnIndex(0);
      setShowResultConfirm(false);
    } catch (error) {
      console.error("게임 시작 실패:", error);
    }
  };

  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  
  useEffect(() => {
    if (phase === "playing" && gameState.turns && gameState.turns.length > 0) {
      if (currentTurnIndex < gameState.turns.length) {
        const interval = 800 / gameSpeed;
        autoPlayIntervalRef.current = setTimeout(() => {
          setCurrentTurnIndex(prev => prev + 1);
        }, interval);
      } else {
        setShowResultConfirm(true);
      }

      return () => {
        if (autoPlayIntervalRef.current) clearTimeout(autoPlayIntervalRef.current);
      };
    }
  }, [phase, currentTurnIndex, gameState.turns, gameSpeed]);

  const difficultyLabels: Record<string, string> = {
    beginner: "초보",
    intermediate: "중수",
    advanced: "고수",
  };

  if (phase === "difficulty") {
    const currentFatigue = playerQuery.data?.fatigue ?? 0;
    const isFatigueTooLow = currentFatigue <= FATIGUE_MIN_TO_PLAY;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6 md:mb-12">
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-1 md:mb-2">연습게임</h1>
            <p className="text-xs md:text-base text-slate-400">난이도를 선택하세요</p>
            <p className="text-xs md:text-sm text-slate-400 mt-1">현재 피로도: <span className={isFatigueTooLow ? "text-red-400 font-bold" : "text-blue-400 font-bold"}>{currentFatigue}</span></p>
            {isFatigueTooLow && (
              <p className="text-xs md:text-sm text-red-400 mt-1">⚠️ 피로도가 {FATIGUE_MIN_TO_PLAY} 이하이면 게임을 할 수 없습니다.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {Object.entries(GAME_REWARDS).map(([key, rewards]) => {
              const cost = FATIGUE_COST[key as keyof typeof FATIGUE_COST];
              const canPlay = !isFatigueTooLow && currentFatigue >= cost;
              return (
                <Card
                  key={key}
                  className={`bg-slate-800 border-slate-700 transition-all ${canPlay ? 'hover:border-blue-500 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={() => canPlay && handleSelectDifficulty(key as any)}
                >
                  <CardHeader>
                    <CardTitle className="text-sm md:text-base text-white">{difficultyLabels[key]}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 md:space-y-2 text-xs md:text-sm text-slate-300">
                      <p>승리 경험치: {rewards.expWin}</p>
                      <p>패배 경험치: {rewards.expLose}</p>
                      <p>승리 골드: {rewards.goldWin}</p>
                      <p>패배 골드: {rewards.goldLose}</p>
                      <p className="text-yellow-400">피로도 소모: {cost}</p>
                      {!canPlay && <p className="text-red-400 text-xs">피로도 부족</p>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "map") {
    const maps = mapsQuery.data || [];

    const getRushDistanceLabel = (value: number) => {
      if (value <= 30) return "가까움";
      if (value <= 50) return "보통";
      return "멀음";
    };
    const getResourcesLabel = (value: number) => {
      if (value <= 40) return "적음";
      if (value <= 55) return "보통";
      return "풍부";
    };
    const getComplexityLabel = (value: number) => {
      if (value <= 40) return "단순";
      if (value <= 55) return "보통";
      return "복잡";
    };

    const parseRaceAdvantage = (raw: any): Record<string, number> => {
      if (!raw) return { terran: 50, zerg: 50, protoss: 50 };
      if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return { terran: 50, zerg: 50, protoss: 50 }; }
      }
      return raw as Record<string, number>;
    };

    const getMatchupText = (adv: Record<string, number>, raceA: string, raceB: string) => {
      const a = adv[raceA] ?? 50;
      const b = adv[raceB] ?? 50;
      const total = a + b;
      const pctA = Math.round((a / total) * 100);
      const pctB = 100 - pctA;
      return `${pctA} : ${pctB}`;
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-4">
            <Button
              onClick={() => { setPhase("difficulty"); setGameState({}); }}
              variant="ghost"
              className="text-slate-400 hover:text-white"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> 뒤로가기
            </Button>
          </div>
          <div className="text-center mb-6 md:mb-12">
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-1 md:mb-2">맵 선택</h1>
            <p className="text-xs md:text-base text-slate-400">플레이할 맵을 선택하세요</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {maps.map(map => {
              const adv = parseRaceAdvantage(map.raceAdvantage);
              return (
                <Card
                  key={map.id}
                  className="bg-slate-800 border-slate-700 hover:border-blue-500 cursor-pointer transition-all"
                  onClick={() => handleSelectMap(map.id)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm md:text-base text-white">{map.name}</CardTitle>
                    <CardDescription className="text-xs md:text-sm text-slate-400">{map.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* 종족별 유불리 */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-400 mb-1">종족 유불리</p>
                      <div className="grid grid-cols-1 gap-0.5 text-xs">
                        <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-700/50">
                          <span className="text-blue-400 font-medium">테란</span>
                          <span className="text-slate-300">{getMatchupText(adv, "terran", "zerg")}</span>
                          <span className="text-purple-400 font-medium">저그</span>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-700/50">
                          <span className="text-blue-400 font-medium">테란</span>
                          <span className="text-slate-300">{getMatchupText(adv, "terran", "protoss")}</span>
                          <span className="text-yellow-400 font-medium">프로토스</span>
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-700/50">
                          <span className="text-purple-400 font-medium">저그</span>
                          <span className="text-slate-300">{getMatchupText(adv, "zerg", "protoss")}</span>
                          <span className="text-yellow-400 font-medium">프로토스</span>
                        </div>
                      </div>
                    </div>

                    {/* 지형 특징 */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-400 mb-1">지형 특징</p>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div className="flex flex-col items-center p-1.5 rounded bg-slate-700/50">
                          <span className="text-slate-400">러쉬거리</span>
                          <span className="text-white font-medium">{getRushDistanceLabel(map.rushDistance)}</span>
                        </div>
                        <div className="flex flex-col items-center p-1.5 rounded bg-slate-700/50">
                          <span className="text-slate-400">자원</span>
                          <span className="text-white font-medium">{getResourcesLabel(map.resources)}</span>
                        </div>
                        <div className="flex flex-col items-center p-1.5 rounded bg-slate-700/50">
                          <span className="text-slate-400">복잡도</span>
                          <span className="text-white font-medium">{getComplexityLabel(map.complexity)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "opponent") {
    const hasError = findOpponentMutation.isError;
    const errorMessage = findOpponentMutation.error?.message || "상대를 찾을 수 없습니다";

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-4">
            <Button
              onClick={() => { setPhase("difficulty"); setGameState({}); findOpponentMutation.reset(); }}
              variant="ghost"
              className="text-slate-400 hover:text-white"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> 뒤로가기
            </Button>
          </div>
          <div className="text-center mb-6 md:mb-12">
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-1 md:mb-2">상대 선수</h1>
            <p className="text-xs md:text-base text-slate-400">상대와의 승률을 확인하세요</p>
          </div>

          {hasError ? (
            <Card className="bg-slate-800 border-slate-700 mb-4 md:mb-6">
              <CardContent className="pt-6 text-center space-y-4">
                <p className="text-red-400 text-sm md:text-base">⚠️ {errorMessage}</p>
                <p className="text-slate-400 text-xs md:text-sm">해당 난이도에 맞는 상대가 없습니다.</p>
                <Button 
                  onClick={() => { setPhase("difficulty"); setGameState({}); findOpponentMutation.reset(); }}
                  className="bg-slate-600 hover:bg-slate-700 text-sm md:text-base"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> 난이도 선택으로 돌아가기
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-800 border-slate-700 mb-4 md:mb-6">
              <CardHeader>
                <CardTitle className="text-sm md:text-base text-white">{gameState.opponentName || "상대 검색 중..."}</CardTitle>
                {gameState.opponentRace && (
                  <CardDescription className="text-xs md:text-sm">{RACE_LABELS[gameState.opponentRace as keyof typeof RACE_LABELS]}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3 md:space-y-4">
                {gameState.opponentGrade && (
                  <div className="p-2 md:p-3 bg-slate-700 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-xs md:text-sm text-slate-300">등급</span>
                      <span className="font-bold text-base md:text-lg text-yellow-400">{gameState.opponentGrade}</span>
                    </div>
                  </div>
                )}
                {gameState.winProbability !== undefined && (
                  <div>
                    <div className="flex justify-between text-xs md:text-sm text-slate-300 mb-1 md:mb-2">
                      <span>승률</span>
                      <span className="font-bold text-blue-400">{gameState.winProbability}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2 md:h-3">
                      <div
                        className="bg-blue-500 h-2 md:h-3 rounded-full"
                        style={{ width: `${gameState.winProbability}%` }}
                      />
                    </div>
                  </div>
                )}
                <Button 
                  onClick={handleStartGame} 
                  disabled={playGameMutation.isPending || findOpponentMutation.isPending || !gameState.gameId}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
                >
                  {findOpponentMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      상대 선수 로드 중...
                    </>
                  ) : playGameMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      게임 시작 중...
                    </>
                  ) : (
                    "게임 시작"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (phase === "playing") {
    const turns = gameState.turns || [];
    const currentTurn = turns[Math.min(currentTurnIndex, turns.length - 1)];
    const isLoading = playGameMutation.isPending;

    const displayedCommentaries: string[] = [];
    for (let i = 0; i <= Math.min(currentTurnIndex, turns.length - 1); i++) {
      const turnCommentaries = turns[i]?.commentaries || [];
      displayedCommentaries.push(...turnCommentaries);
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-4 md:mb-8">
            <h1 className="text-xl md:text-3xl font-bold text-white">게임 진행 중...</h1>
          </div>

          {isLoading && (
            <Card className="bg-slate-800 border-slate-700 mb-4 md:mb-6">
              <CardContent className="p-4 md:p-6 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  <p className="text-xs md:text-base text-slate-300">게임 시뮬레이션 중...</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6 mb-4 md:mb-6">
            {/* 왼쪽: 누적 해설 */}
            <div className="lg:col-span-1 flex flex-col">
              <Card className="bg-slate-800 border-slate-700 flex-1 flex flex-col" style={{ maxHeight: '600px' }}>
                <CardHeader>
                  <CardTitle className="text-sm md:text-base text-white">게임 해설</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: '500px' }} ref={(el) => {
                    if (el) {
                      // 자동으로 맨 아래로 스크롤 (새 해설이 추가될 때)
                      setTimeout(() => {
                        el.scrollTop = el.scrollHeight;
                      }, 0);
                    }
                  }}>
                  <div className="space-y-1 md:space-y-2">
                    {displayedCommentaries.map((commentary: string, idx: number) => {
                      let textColor = "text-slate-300";
                      let borderColor = "border-slate-500";
                      let bgColor = "bg-slate-700/30";
                      let label = "";

                      if (commentary.includes("[중립]")) {
                        textColor = "text-white";
                        borderColor = "border-slate-400";
                        bgColor = "bg-slate-700/50";
                        label = "중립";
                      } else {
                        const p1Index = commentary.indexOf(player1Name);
                        const p2Index = commentary.indexOf(player2Name);
                        const hasP1 = p1Index >= 0;
                        const hasP2 = p2Index >= 0;

                        if (hasP1 && hasP2) {
                          if (p1Index < p2Index) {
                            label = "Player1";
                            textColor = "text-cyan-300";
                            borderColor = "border-cyan-500";
                            bgColor = "bg-cyan-500/10";
                          } else {
                            label = "Player2";
                            textColor = "text-red-300";
                            borderColor = "border-red-500";
                            bgColor = "bg-red-500/10";
                          }
                        } else if (hasP1) {
                          label = "Player1";
                          textColor = "text-cyan-300";
                          borderColor = "border-cyan-500";
                          bgColor = "bg-cyan-500/10";
                        } else if (hasP2) {
                          label = "Player2";
                          textColor = "text-red-300";
                          borderColor = "border-red-500";
                          bgColor = "bg-red-500/10";
                        }
                      }

                      return (
                        <div
                          key={idx}
                          className={`p-2 md:p-3 rounded text-xs md:text-sm border-l-4 ${borderColor} ${bgColor}`}
                        >
                          <div className="flex items-start gap-1 md:gap-2 mb-1">
                            <span className={`text-xs font-bold px-1.5 md:px-2 py-0.5 rounded ${label === 'Player1' ? 'bg-blue-600 text-blue-100' : label === 'Player2' ? 'bg-red-600 text-red-100' : 'bg-slate-600 text-slate-100'}`}>
                              {label}
                            </span>
                          </div>
                          <p className={`whitespace-pre-wrap ${textColor}`}>
                            {commentary}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              {/* 속도 조절 버튼 */}
              <div className="flex justify-center gap-1 md:gap-2 pt-3 md:pt-4 pb-2">
                <Button
                  onClick={() => setGameSpeed(1)}
                  variant={gameSpeed === 1 ? "default" : "outline"}
                  className={gameSpeed === 1 ? "bg-blue-600" : ""}
                  size="xs"
                >
                  1배속
                </Button>
                <Button
                  onClick={() => setGameSpeed(2)}
                  variant={gameSpeed === 2 ? "default" : "outline"}
                  className={gameSpeed === 2 ? "bg-blue-600" : ""}
                  size="xs"
                >
                  2배속
                </Button>
                <Button
                  onClick={() => setGameSpeed(5)}
                  variant={gameSpeed === 5 ? "default" : "outline"}
                  className={gameSpeed === 5 ? "bg-blue-600" : ""}
                  size="xs"
                >
                  5배속
                </Button>
              </div>
            </div>

            {/* 오른쪽: 게임 상태 */}
            <div className="lg:col-span-2 space-y-3 md:space-y-4">
              {/* 플레이어 1 상태 */}
              <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-cyan-400">
                <CardHeader>
                  <CardTitle className="text-sm md:text-base text-cyan-300">{player1Name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 md:space-y-3">
                  <div>
                    <div className="flex justify-between text-xs md:text-sm text-slate-300 mb-1 md:mb-2">
                      <span className="font-semibold">병력</span>
                      <span className="font-bold text-cyan-300 text-base md:text-lg">{currentTurn?.player1Supply || 0}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-3 md:h-4">
                      <div
                        className="bg-cyan-500 h-3 md:h-4 rounded-full transition-all duration-500 shadow-lg shadow-cyan-500/50"
                        style={{ width: `${Math.min(100, (currentTurn?.player1Supply || 0) / 2)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 md:mt-1">최대: 200</div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs md:text-sm text-slate-300 mb-1 md:mb-2">
                      <span className="font-semibold">자원</span>
                      <span className="font-bold text-cyan-300 text-base md:text-lg">{currentTurn?.player1Resources || 0}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-3 md:h-4">
                      <div
                        className="bg-cyan-400 h-3 md:h-4 rounded-full transition-all duration-500 shadow-lg shadow-cyan-400/50"
                        style={{ width: `${Math.min(100, (currentTurn?.player1Resources || 0) / 200)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 md:mt-1">최대: 20,000</div>
                  </div>
                </CardContent>
              </Card>

              {/* 플레이어 2 상태 */}
              <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-red-500">
                <CardHeader>
                  <CardTitle className="text-sm md:text-base text-red-300">{player2Name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 md:space-y-3">
                  <div>
                    <div className="flex justify-between text-xs md:text-sm text-slate-300 mb-1 md:mb-2">
                      <span className="font-semibold">병력</span>
                      <span className="font-bold text-red-300 text-base md:text-lg">{currentTurn?.player2Supply || 0}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-3 md:h-4">
                      <div
                        className="bg-red-500 h-3 md:h-4 rounded-full transition-all duration-500 shadow-lg shadow-red-500/50"
                        style={{ width: `${Math.min(100, (currentTurn?.player2Supply || 0) / 2)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 md:mt-1">최대: 200</div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs md:text-sm text-slate-300 mb-1 md:mb-2">
                      <span className="font-semibold">자원</span>
                      <span className="font-bold text-red-300 text-base md:text-lg">{currentTurn?.player2Resources || 0}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-3 md:h-4">
                      <div
                        className="bg-red-400 h-3 md:h-4 rounded-full transition-all duration-500 shadow-lg shadow-red-400/50"
                        style={{ width: `${Math.min(100, (currentTurn?.player2Resources || 0) / 200)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 md:mt-1">최대: 20,000</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {showResultConfirm && (
            <div className="text-center">
              <Button 
                onClick={() => setPhase("result")}
                className="bg-green-600 hover:bg-green-700 text-sm md:text-base"
              >
                경기 결과 보기
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "result") {
    const isWinner = gameState.isWinner;
    const expGained = gameState.expGained || 0;
    const goldGained = gameState.goldGained || 0;
    const statChanges = gameState.statChanges || {};

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
        <div className="max-w-2xl mx-auto">
          <div className={`text-center mb-6 md:mb-8 ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
            <h1 className="text-2xl md:text-4xl font-bold mb-2">{isWinner ? '승리!' : '패배'}</h1>
            <p className="text-xs md:text-base">{isWinner ? '축하합니다!' : '다시 도전하세요'}</p>
          </div>

          <Card className="bg-slate-800 border-slate-700 mb-4 md:mb-6">
            <CardHeader>
              <CardTitle className="text-sm md:text-base text-white">경기 보상</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-4">
              <div className="flex justify-between items-center p-3 md:p-4 bg-slate-700 rounded-lg">
                <span className="text-xs md:text-sm text-slate-300">경험치</span>
                <span className="font-bold text-base md:text-lg text-yellow-400">+{expGained}</span>
              </div>
              <div className="flex justify-between items-center p-3 md:p-4 bg-slate-700 rounded-lg">
                <span className="text-xs md:text-sm text-slate-300">골드</span>
                <span className="font-bold text-base md:text-lg text-yellow-400">+{goldGained}</span>
              </div>
            </CardContent>
          </Card>

          {/* 능력치 변동 */}
          {Object.keys(statChanges).length > 0 && (
            <Card className="bg-slate-800 border-slate-700 mb-4 md:mb-6">
              <CardHeader>
                <CardTitle className="text-sm md:text-base text-white">능력치 변동</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                  {Object.entries(statChanges).map(([stat, change]: [string, any]) => (
                    <div key={stat} className="p-2 md:p-3 bg-slate-700 rounded-lg">
                      <div className="text-xs md:text-sm text-slate-300 mb-1">
                        {STAT_LABELS[stat as keyof typeof STAT_LABELS] || stat}
                      </div>
                      <div className={`font-bold text-base md:text-lg ${
                        change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {change > 0 ? '+' : ''}{change}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Button 
            onClick={() => {
              setPhase("difficulty");
              setGameState({});
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-sm md:text-base"
          >
            다시 시작
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
