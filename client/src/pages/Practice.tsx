import { useState } from "react";
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
}

export default function PracticePage() {
  const [phase, setPhase] = useState<GamePhase>("difficulty");
  const [gameState, setGameState] = useState<GameState>({});
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);

  // API 호출
  const mapsQuery = trpc.practice.getMaps.useQuery();
  const findOpponentMutation = trpc.practice.findOpponent.useMutation();
  const playGameMutation = trpc.practice.playGame.useMutation();

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
      setPhase("map");
    }
  };

  const handleStartGame = async () => {
    if (!gameState.gameId) return;
    setPhase("playing");

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
      setCurrentTurnIndex(0);
      setPhase("result");
    } catch (error) {
      console.error("게임 실행 실패:", error);
      setPhase("opponent");
    }
  };

  const handlePlayAgain = () => {
    setGameState({});
    setPhase("difficulty");
    setCurrentTurnIndex(0);
  };

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
                <CardDescription className="text-slate-400">B ~ S 등급</CardDescription>
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
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-white">맵 선택</h1>
            <Button variant="outline" onClick={() => setPhase("difficulty")}>
              뒤로가기
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {mapsQuery.data?.map((map) => (
              <Card 
                key={map.id} 
                className="bg-slate-800 border-slate-700 hover:border-cyan-500 cursor-pointer transition-all"
                onClick={() => handleSelectMap(map.id)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white">{map.name}</CardTitle>
                      <CardDescription className="text-slate-400">{map.description}</CardDescription>
                    </div>
                    <span className="text-3xl">{map.iconEmoji}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-slate-700 p-2 rounded">
                        <p className="text-slate-400">러쉬거리</p>
                        <p className="text-white font-bold">{map.rushDistance}</p>
                      </div>
                      <div className="bg-slate-700 p-2 rounded">
                        <p className="text-slate-400">자원</p>
                        <p className="text-white font-bold">{map.resources}</p>
                      </div>
                      <div className="bg-slate-700 p-2 rounded">
                        <p className="text-slate-400">복잡도</p>
                        <p className="text-white font-bold">{map.complexity}</p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">
                      <p>종족 유불리: 테란 {typeof map.raceAdvantage === 'string' ? JSON.parse(map.raceAdvantage).terran : map.raceAdvantage.terran}% / 저그 {typeof map.raceAdvantage === 'string' ? JSON.parse(map.raceAdvantage).zerg : map.raceAdvantage.zerg}% / 프로토스 {typeof map.raceAdvantage === 'string' ? JSON.parse(map.raceAdvantage).protoss : map.raceAdvantage.protoss}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 상대 정보 및 게임 시작
  if (phase === "opponent") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-white">상대 정보</h1>
            <Button variant="outline" onClick={() => setPhase("map")}>
              맵 다시 선택
            </Button>
          </div>

          <Card className="bg-slate-800 border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">매칭된 상대</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">상대 선수</p>
                  <p className="text-white text-xl font-bold">{gameState.opponentName}</p>
                </div>
                <div className="text-right">
                  <Badge style={{ backgroundColor: RACE_COLORS[gameState.opponentRace || "terran"] }}>
                    {RACE_LABELS[gameState.opponentRace || "terran"]}
                  </Badge>
                </div>
              </div>

              <div className="bg-slate-700 p-4 rounded">
                <p className="text-slate-400 text-sm mb-2">승률 예측</p>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="bg-slate-600 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${gameState.winProbability || 50}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-white font-bold w-12 text-right">{gameState.winProbability || 50}%</span>
                </div>
              </div>

              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg"
                onClick={handleStartGame}
                disabled={playGameMutation.isPending}
              >
                {playGameMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    게임 진행 중...
                  </>
                ) : (
                  "게임 시작"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // 게임 진� 중
  if (phase === "playing") {
    const turns = gameState.turns || [];
    const currentTurn = turns?.[currentTurnIndex];
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">게임 진� 중...</h1>
            <p className="text-slate-400 mt-2">턴 {currentTurnIndex + 1} / {turns.length}</p>
          </div>

          {currentTurn && (
            <Card className="bg-slate-800 border-slate-700 mb-6">
              <CardHeader>
                <CardTitle className="text-white">해설</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-200">{currentTurn.commentary}</p>
              </CardContent>
            </Card>
          )}

          {currentTurn && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* 플레이어 1 상태 */}
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-blue-400">플레이어 1</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-slate-400 text-sm">병력</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full"
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
                          className="bg-yellow-500 h-2 rounded-full"
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
                          className="bg-green-500 h-2 rounded-full"
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
                  <CardTitle className="text-purple-400">플레이어 2</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-slate-400 text-sm">병력</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-purple-500 h-2 rounded-full"
                          style={{ width: `${Math.min(currentTurn.player2Supply / 200 * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-white font-bold w-12">{currentTurn.player2Supply}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">자원</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-orange-500 h-2 rounded-full"
                          style={{ width: `${Math.min(currentTurn.player2Resources / 500 * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-white font-bold w-12">{currentTurn.player2Resources}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">체력</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-red-500 h-2 rounded-full"
                          style={{ width: `${currentTurn.player2Health}%` }}
                        />
                      </div>
                      <span className="text-white font-bold w-12">{currentTurn.player2Health}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex gap-4">
            <Button 
              className="flex-1 bg-slate-700 hover:bg-slate-600"
              onClick={() => setCurrentTurnIndex(Math.max(0, currentTurnIndex - 1))}
              disabled={currentTurnIndex === 0}
            >
              이전 턴
            </Button>
            <Button 
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={() => setCurrentTurnIndex(Math.min(turns.length - 1, currentTurnIndex + 1))}
              disabled={currentTurnIndex === turns.length - 1}
            >
              다음 턴
            </Button>
            <Button 
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => setPhase("result")}
            >
              결과 보기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 게임 결과
  if (phase === "result") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className={`text-4xl font-bold mb-2 ${gameState.isWinner ? "text-green-400" : "text-red-400"}`}>
              {gameState.isWinner ? "승리!" : "패배"}
            </h1>
            <p className="text-slate-400">게임이 종료되었습니다</p>
          </div>

          <Card className="bg-slate-800 border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">게임 결과</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700 p-4 rounded">
                  <p className="text-slate-400 text-sm">경험치</p>
                  <p className="text-white text-2xl font-bold">+{gameState.expGained}</p>
                </div>
                <div className="bg-slate-700 p-4 rounded">
                  <p className="text-slate-400 text-sm">골드</p>
                  <p className="text-white text-2xl font-bold">+{gameState.goldGained}</p>
                </div>
              </div>
              <div className="bg-slate-700 p-4 rounded">
                <p className="text-slate-400 text-sm">피로도 소모</p>
                <p className="text-white text-2xl font-bold">-{gameState.fatigueUsed}</p>
              </div>
              <div className="bg-slate-700 p-4 rounded">
                <p className="text-slate-400 text-sm">최종 점수</p>
                <p className="text-white text-2xl font-bold">{gameState.finalScore}</p>
              </div>
            </CardContent>
          </Card>

          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg"
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
