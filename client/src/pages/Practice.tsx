"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RACE_COLORS, RACE_LABELS, DIFFICULTY_RANGES, GAME_REWARDS } from "@shared/gameConstants";
import { Loader2 } from "lucide-react";

type GamePhase = "difficulty" | "map" | "opponent" | "playing" | "result";

interface GameState {
  difficulty?: "beginner" | "intermediate" | "advanced";
  mapId?: number;
  gameId?: number;
  opponentName?: string;
  opponentRace?: string;
  winProbability?: number;
  isWinner?: boolean;
  expGained?: number;
  goldGained?: number;
  fatigueUsed?: number;
  turns?: any[];
  finalScore?: number;
  playerName?: string;
  playerRace?: string;
}

export default function PracticePage() {
  const [phase, setPhase] = useState<GamePhase>("difficulty");
  const [gameState, setGameState] = useState<GameState>({});
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [showResultConfirm, setShowResultConfirm] = useState(false);
  const autoPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const commentaryEndRef = useRef<HTMLDivElement>(null);

  // API 호출
  const mapsQuery = trpc.practice.getMaps.useQuery();
  const findOpponentMutation = trpc.practice.findOpponent.useMutation();
  const playGameMutation = trpc.practice.playGame.useMutation();
  const userQuery = trpc.auth.me.useQuery();

  const handleSelectDifficulty = (difficulty: "beginner" | "intermediate" | "advanced") => {
    setGameState({ difficulty });
    setPhase("map");
  };

  const handleSelectMap = async (mapId: number) => {
    setGameState(prev => ({ ...prev, mapId }));
    setPhase("opponent");

    // 상대 찾기
    try {
      const result = await findOpponentMutation.mutateAsync({
        difficulty: gameState.difficulty!,
        mapId,
      });
      setGameState(prev => ({
        ...prev,
        gameId: result.gameId,
        opponentName: result.opponent.name,
        opponentRace: result.opponent.race,
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
      
      setGameState(prev => ({
        ...prev,
        turns: result.turns || [],
        isWinner: result.isWinner,
        expGained: result.expGained,
        goldGained: result.goldGained,
        fatigueUsed: result.fatigueUsed,
        finalScore: result.finalScore,
      }));
      
      setPhase("playing");
      setCurrentTurnIndex(0);
      setShowResultConfirm(false);
    } catch (error) {
      console.error("게임 시작 실패:", error);
    }
  };

  // 자동 턴 진행
  useEffect(() => {
    if (phase === "playing" && gameState.turns && gameState.turns.length > 0) {
      const turns = gameState.turns;
      
      if (currentTurnIndex < turns.length - 1) {
        autoPlayIntervalRef.current = setTimeout(() => {
          setCurrentTurnIndex(prev => prev + 1);
        }, 1000);
      } else {
        // 마지막 턴에 도달하면 결과 확인 버튼 표시
        setShowResultConfirm(true);
      }

      return () => {
        if (autoPlayIntervalRef.current) clearTimeout(autoPlayIntervalRef.current);
      };
    }
  }, [phase, currentTurnIndex, gameState.turns]);

  // 해설 자동 스크롤
  useEffect(() => {
    if (commentaryEndRef.current) {
      commentaryEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentTurnIndex, gameState.turns]);

  // 플레이어 이름 추출
  const player1Name = userQuery.data?.name || "플레이어 1";
  const player2Name = gameState.opponentName || "플레이어 2";

  // 난이도 선택 화면
  const difficultyLabels: Record<string, string> = {
    beginner: "초보",
    intermediate: "중수",
    advanced: "고수",
  };

  if (phase === "difficulty") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">연습게임</h1>
            <p className="text-slate-400">난이도를 선택하세요</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(GAME_REWARDS).map(([key, rewards]) => (
              <Card
                key={key}
                className="bg-slate-800 border-slate-700 hover:border-blue-500 cursor-pointer transition-all"
                onClick={() => handleSelectDifficulty(key as any)}
              >
                <CardHeader>
                  <CardTitle className="text-white">{difficultyLabels[key]}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <p className="text-slate-400 text-sm">경험치</p>
                    <p className="text-green-400 font-bold">승: +{rewards.expWin} / 패: +{rewards.expLose}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">골드</p>
                    <p className="text-yellow-400 font-bold">승: +{rewards.goldWin} / 패: +{rewards.goldLose}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 맵 선택 화면
  if (phase === "map") {
    const maps = mapsQuery.data || [];
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">맵 선택</h1>
            <p className="text-slate-400">게임을 진행할 맵을 선택하세요</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {maps.map(map => (
              <Card
                key={map.id}
                className="bg-slate-800 border-slate-700 hover:border-blue-500 cursor-pointer transition-all"
                onClick={() => handleSelectMap(map.id)}
              >
                <CardHeader>
                  <CardTitle className="text-white">{map.iconEmoji} {map.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-400 text-sm">{map.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 상대 선택 화면
  if (phase === "opponent") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">상대 선수</h1>
            <p className="text-slate-400">매칭된 상대 선수와 게임을 시작하세요</p>
          </div>

          <Card className="bg-slate-800 border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">{gameState.opponentName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-slate-400 text-sm">종족</p>
                <Badge className={RACE_COLORS[gameState.opponentRace as any] || "bg-slate-600"}>
                  {RACE_LABELS[gameState.opponentRace as any] || gameState.opponentRace}
                </Badge>
              </div>
              <div>
                <p className="text-slate-400 text-sm">승률</p>
                <p className="text-white font-bold">{gameState.winProbability?.toFixed(1)}%</p>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-6"
            onClick={handleStartGame}
            disabled={playGameMutation.isPending}
          >
            {playGameMutation.isPending ? "게임 시작 중..." : "게임 시작"}
          </Button>
        </div>
      </div>
    );
  }

  // 게임 진행 중
  if (phase === "playing") {
    const turns = gameState.turns || [];
    const currentTurn = turns?.[currentTurnIndex];
    const isLoading = playGameMutation.isPending;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">게임 진행 중...</h1>
            <p className="text-slate-400 mt-2">턴 {currentTurnIndex + 1} / {turns.length}</p>
          </div>

          {isLoading && (
            <Card className="bg-slate-800 border-slate-700 mb-6">
              <CardContent className="p-6 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  <p className="text-slate-300">게임 시뮬레이션 중...</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* 왼쪽: 누적 해설 */}
            <div className="lg:col-span-1">
              <Card className="bg-slate-800 border-slate-700 h-full flex flex-col">
                <CardHeader>
                  <CardTitle className="text-white">게임 해설</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto max-h-96">
                  <div className="space-y-2">
                    {/* 플레이어 1 해설 */}
                    {currentTurn?.player1Commentary?.map((commentary: string, idx: number) => (
                      <div
                        key={`p1-${idx}`}
                        className="p-2 rounded text-sm border-l-4 border-cyan-400 bg-cyan-950/30"
                      >
                        <p className="whitespace-pre-wrap text-cyan-200">{commentary}</p>
                      </div>
                    ))}
                    
                    {/* 플레이어 2 해설 */}
                    {currentTurn?.player2Commentary?.map((commentary: string, idx: number) => (
                      <div
                        key={`p2-${idx}`}
                        className="p-2 rounded text-sm border-l-4 border-red-500 bg-red-950/30"
                      >
                        <p className="whitespace-pre-wrap text-red-200">{commentary}</p>
                      </div>
                    ))}
                    
                    {/* 중립 해설 */}
                    {currentTurn?.allCommentaries?.filter((c: string) => c.includes("[중립]")).map((commentary: string, idx: number) => (
                      <div
                        key={`neutral-${idx}`}
                        className="p-2 rounded text-sm border-l-4 border-slate-400 bg-slate-900/50"
                      >
                        <p className="whitespace-pre-wrap text-slate-100">{commentary}</p>
                      </div>
                    ))}
                    <div ref={commentaryEndRef} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 오른쪽: 게임 상태 */}
            <div className="lg:col-span-2 space-y-6">
              {currentTurn && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 플레이어 1 상태 */}
                  <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-cyan-400">
                    <CardHeader>
                      <CardTitle className="text-cyan-400">{player1Name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-slate-400 text-sm">병력</p>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold w-12 text-right">{currentTurn.player1Supply}</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-3">
                            <div
                              className="bg-cyan-500 h-3 rounded-full transition-all"
                              style={{ width: `${Math.min(currentTurn.player1Supply / 200 * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">자원</p>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold w-12 text-right">{currentTurn.player1Resources}</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-3">
                            <div
                              className="bg-yellow-500 h-3 rounded-full transition-all"
                              style={{ width: `${Math.min(currentTurn.player1Resources / 500 * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 플레이어 2 상태 */}
                  <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-red-500">
                    <CardHeader>
                      <CardTitle className="text-red-500">{player2Name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-slate-400 text-sm">병력</p>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold w-12 text-right">{currentTurn.player2Supply}</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-3">
                            <div
                              className="bg-red-500 h-3 rounded-full transition-all"
                              style={{ width: `${Math.min(currentTurn.player2Supply / 200 * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">자원</p>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold w-12 text-right">{currentTurn.player2Resources}</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-3">
                            <div
                              className="bg-yellow-500 h-3 rounded-full transition-all"
                              style={{ width: `${Math.min(currentTurn.player2Resources / 500 * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* 게임 종료 확인 버튼 */}
              {showResultConfirm && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardContent className="p-6 text-center">
                    <p className="text-white mb-4">게임이 종료되었습니다!</p>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      onClick={() => setPhase("result")}
                    >
                      결과 확인
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 게임 결과 화면
  if (phase === "result") {
    const isWinner = gameState.isWinner;
    const expGained = gameState.expGained || 0;
    const goldGained = gameState.goldGained || 0;
    const fatigueUsed = gameState.fatigueUsed || 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h1 className={`text-4xl font-bold mb-2 ${isWinner ? "text-green-400" : "text-red-400"}`}>
              {isWinner ? "승리!" : "패배!"}
            </h1>
            <p className="text-slate-400">게임이 종료되었습니다</p>
          </div>

          <Card className="bg-slate-800 border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">게임 결과</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-slate-400 text-sm">경험치</p>
                  <p className={`text-lg font-bold ${expGained > 0 ? "text-green-400" : "text-red-400"}`}>
                    {expGained > 0 ? "+" : ""}{expGained}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-sm">골드</p>
                  <p className={`text-lg font-bold ${goldGained > 0 ? "text-yellow-400" : "text-red-400"}`}>
                    {goldGained > 0 ? "+" : ""}{goldGained}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-sm">피로도</p>
                  <p className="text-lg font-bold text-orange-400">-{fatigueUsed}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-6"
            onClick={() => {
              setPhase("difficulty");
              setGameState({});
              setCurrentTurnIndex(0);
              setShowResultConfirm(false);
            }}
          >
            다시 게임하기
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
