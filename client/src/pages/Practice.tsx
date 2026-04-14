import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RACE_COLORS, RACE_LABELS, DIFFICULTY_RANGES } from "@shared/gameConstants";
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
  const autoPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    setPhase("playing");
    setCurrentTurnIndex(0);

    try {
      const result = await playGameMutation.mutateAsync({
        gameId: gameState.gameId,
      });
      setGameState(prev => ({
        ...prev,
        isWinner: result.isWinner,
        expGained: result.expGained,
        goldGained: result.goldGained,
        fatigueUsed: result.fatigueUsed,
        turns: result.turns || [],
        finalScore: result.finalScore,
      }));
    } catch (error) {
      console.error("게임 실행 실패:", error);
      setPhase("opponent");
    }
  };

  const handlePlayAgain = () => {
    setGameState({});
    setPhase("difficulty");
    setCurrentTurnIndex(0);
    if (autoPlayIntervalRef.current) {
      clearInterval(autoPlayIntervalRef.current);
      autoPlayIntervalRef.current = null;
    }
  };

  // 자동 턴 진행
  useEffect(() => {
    if (phase !== "playing" || playGameMutation.isPending) {
      if (autoPlayIntervalRef.current) {
        clearInterval(autoPlayIntervalRef.current);
        autoPlayIntervalRef.current = null;
      }
      return;
    }

    const turns = gameState.turns || [];
    if (currentTurnIndex >= turns.length - 1) {
      // 게임 종료 - 자동으로 결과 화면으로 이동
      setTimeout(() => setPhase("result"), 1000);
      return;
    }

    autoPlayIntervalRef.current = setInterval(() => {
      setCurrentTurnIndex(prev => {
        if (prev >= turns.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      if (autoPlayIntervalRef.current) {
        clearInterval(autoPlayIntervalRef.current);
        autoPlayIntervalRef.current = null;
      }
    };
  }, [phase, gameState.turns, currentTurnIndex, playGameMutation.isPending]);

  // 난이도 선택 화면
  if (phase === "difficulty") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">연습게임</h1>
            <p className="text-slate-400">난이도를 선택하여 게임을 시작하세요</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 초보방 */}
            <Card className="bg-slate-800 border-slate-700 hover:border-blue-500 cursor-pointer transition-all" onClick={() => handleSelectDifficulty("beginner")}>
              <CardHeader>
                <CardTitle className="text-blue-400">초보방</CardTitle>
                <CardDescription className="text-slate-400">F ~ D 등급</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>• 경험치: 50 (승) / 20 (패)</p>
                  <p>• 골드: 100 (승) / 30 (패)</p>
                  <p>• 피로도: 10 소모</p>
                </div>
              </CardContent>
            </Card>

            {/* 중수방 */}
            <Card className="bg-slate-800 border-slate-700 hover:border-yellow-500 cursor-pointer transition-all" onClick={() => handleSelectDifficulty("intermediate")}>
              <CardHeader>
                <CardTitle className="text-yellow-400">중수방</CardTitle>
                <CardDescription className="text-slate-400">D ~ B 등급</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>• 경험치: 100 (승) / 50 (패)</p>
                  <p>• 골드: 200 (승) / 80 (패)</p>
                  <p>• 피로도: 15 소모</p>
                </div>
              </CardContent>
            </Card>

            {/* 고수방 */}
            <Card className="bg-slate-800 border-slate-700 hover:border-red-500 cursor-pointer transition-all" onClick={() => handleSelectDifficulty("advanced")}>
              <CardHeader>
                <CardTitle className="text-red-400">고수방</CardTitle>
                <CardDescription className="text-slate-400">B ~ A 등급</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>• 경험치: 200 (승) / 100 (패)</p>
                  <p>• 골드: 400 (승) / 150 (패)</p>
                  <p>• 피로도: 20 소모</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // 맵 선택 화면
  if (phase === "map") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">맵 선택</h1>
            <p className="text-slate-400">게임을 진행할 맵을 선택하세요</p>
          </div>

          {mapsQuery.isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto" />
              <p className="text-slate-400 mt-4">맵 목록을 불러오는 중...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {mapsQuery.data?.map((map) => (
                <Card
                  key={map.id}
                  className="bg-slate-800 border-slate-700 hover:border-amber-500 cursor-pointer transition-all"
                  onClick={() => handleSelectMap(map.id)}
                >
                  <CardHeader>
                    <CardTitle className="text-white">{map.name}</CardTitle>
                    <CardDescription className="text-slate-400">{map.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-slate-300">
                      <p>• 종족 유불리: 테란 {map.raceAdvantage?.terran || 50}%</p>
                      <p>• 저그 {map.raceAdvantage?.zerg || 50}%</p>
                      <p>• 프로토스 {map.raceAdvantage?.protoss || 50}%</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
            <h1 className="text-4xl font-bold text-white mb-2">상대 정보</h1>
            <p className="text-slate-400">게임을 시작하시겠습니까?</p>
          </div>

          {findOpponentMutation.isPending ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
                <p className="text-slate-300">상대를 찾는 중...</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">{gameState.opponentName}</CardTitle>
                <CardDescription className="text-slate-400">
                  <Badge className={`${RACE_COLORS[gameState.opponentRace as "terran" | "zerg" | "protoss"]} text-white`}>
                    {RACE_LABELS[gameState.opponentRace as "terran" | "zerg" | "protoss"]}
                  </Badge>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-slate-900 p-4 rounded-lg">
                  <p className="text-slate-400 text-sm mb-2">승률</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="bg-slate-700 rounded-full h-3">
                        <div
                          className="bg-blue-500 h-3 rounded-full"
                          style={{ width: `${gameState.winProbability}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-white font-bold text-lg">{gameState.winProbability}%</span>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button
                    className="flex-1 bg-slate-700 hover:bg-slate-600"
                    onClick={() => setPhase("map")}
                  >
                    맵 다시 선택
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={handleStartGame}
                  >
                    게임 시작
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
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
              <Card className="bg-slate-800 border-slate-700 h-full">
                <CardHeader>
                  <CardTitle className="text-white">게임 해설</CardTitle>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                  <div className="space-y-3">
                    {currentTurn?.allCommentaries?.map((commentary, idx) => (
                      <div key={idx} className="p-3 bg-slate-900 rounded text-sm text-slate-300 border-l-2 border-blue-500">
                        <p className="whitespace-pre-wrap">{commentary}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 오른쪽: 게임 상태 */}
            <div className="lg:col-span-2 space-y-6">
              {currentTurn && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 플레이어 1 상태 */}
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-blue-400">{userQuery.data?.name || "플레이어 1"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-slate-400 text-sm">병력</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(currentTurn.player1Supply / 200 * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-white font-bold w-12">{currentTurn.player1Supply}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">자원</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-yellow-500 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(currentTurn.player1Resources / 500 * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-white font-bold w-12">{currentTurn.player1Resources}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">체력</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${currentTurn.player1Health}%` }}
                            />
                          </div>
                          <span className="text-white font-bold w-12">{currentTurn.player1Health}%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 플레이어 2 상태 */}
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-red-400">{gameState.opponentName || "플레이어 2"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-slate-400 text-sm">병력</p>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold w-12 text-right">{currentTurn.player2Supply}</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-red-500 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(currentTurn.player2Supply / 200 * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">자원</p>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold w-12 text-right">{currentTurn.player2Resources}</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-orange-500 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(currentTurn.player2Resources / 500 * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">체력</p>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold w-12 text-right">{currentTurn.player2Health}%</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-pink-500 h-2 rounded-full transition-all"
                              style={{ width: `${currentTurn.player2Health}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
          
          {/* 게임 종료 확인 버튼 */}
          {currentTurnIndex === turns.length - 1 && (
            <div className="text-center mt-8">
              <p className="text-slate-400 mb-4">게임이 종료되었습니다.</p>
              <Button
                className="bg-green-600 hover:bg-green-700 text-lg px-8 py-6"
                onClick={() => setPhase("result")}
              >
                결과 확인
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 게임 결과 화면
  if (phase === "result") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h1 className={`text-4xl font-bold mb-2 ${gameState.isWinner ? "text-green-400" : "text-red-400"}`}>
              {gameState.isWinner ? "승리!" : "패배!"}
            </h1>
            <p className="text-slate-400">최종 점수: {gameState.finalScore}</p>
          </div>

          <Card className="bg-slate-800 border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">보상</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-900 rounded">
                <span className="text-slate-300">경험치</span>
                <span className={`font-bold ${gameState.isWinner ? "text-green-400" : "text-orange-400"}`}>
                  {gameState.isWinner ? "+" : ""}{gameState.expGained}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-900 rounded">
                <span className="text-slate-300">골드</span>
                <span className={`font-bold ${gameState.isWinner ? "text-yellow-400" : "text-orange-400"}`}>
                  {gameState.isWinner ? "+" : ""}{gameState.goldGained}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-900 rounded">
                <span className="text-slate-300">피로도</span>
                <span className="font-bold text-red-400">-{gameState.fatigueUsed}</span>
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-lg py-6"
            onClick={handlePlayAgain}
          >
            다시 플레이
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
