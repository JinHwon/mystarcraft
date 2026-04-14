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
  const [currentCommentaryIndex, setCurrentCommentaryIndex] = useState(0);
  const [showResultConfirm, setShowResultConfirm] = useState(false);
  const [gameSpeed, setGameSpeed] = useState<1 | 2 | 5>(1); // 1배속, 2배속, 5배속
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
      setCurrentCommentaryIndex(0);
      setShowResultConfirm(false);
    } catch (error) {
      console.error("게임 시작 실패:", error);
    }
  };

  // 해설과 턴을 동시에 진행
  useEffect(() => {
    if (phase === "playing" && gameState.turns && gameState.turns.length > 0) {
      const allCommentaries = gameState.turns[gameState.turns.length - 1]?.allCommentaries || [];
      
      if (currentCommentaryIndex < allCommentaries.length) {
        // 속도에 따라 인터벌 계산 (1배속=1000ms, 2배속=500ms, 5배속=200ms)
        const interval = 1000 / gameSpeed;
        autoPlayIntervalRef.current = setTimeout(() => {
          setCurrentCommentaryIndex(prev => prev + 1);
        }, interval);
      } else if (currentCommentaryIndex >= allCommentaries.length && allCommentaries.length > 0) {
        // 모든 해설이 나왔으면 결과 확인 버튼 표시
        setShowResultConfirm(true);
      }

      return () => {
        if (autoPlayIntervalRef.current) clearTimeout(autoPlayIntervalRef.current);
      };
    }
  }, [phase, currentCommentaryIndex, gameState.turns, gameSpeed]);

  // 해설 자동 스크롤
  useEffect(() => {
    if (commentaryEndRef.current) {
      commentaryEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentCommentaryIndex, gameState.turns]);

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
                <CardContent>
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>승리 경험치: {rewards.expWin}</p>
                    <p>패배 경험치: {rewards.expLose}</p>
                    <p>승리 골드: {rewards.goldWin}</p>
                    <p>패배 골드: {rewards.goldLose}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "map") {
    const maps = mapsQuery.data || [];
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">맵 선택</h1>
            <p className="text-slate-400">플레이할 맵을 선택하세요</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {maps.map(map => (
              <Card
                key={map.id}
                className="bg-slate-800 border-slate-700 hover:border-blue-500 cursor-pointer transition-all"
                onClick={() => handleSelectMap(map.id)}
              >
                <CardHeader>
                  <CardTitle className="text-white">{map.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-300 text-sm">{map.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "opponent") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">상대 선수</h1>
            <p className="text-slate-400">상대와의 승률을 확인하세요</p>
          </div>

          <Card className="bg-slate-800 border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">{gameState.opponentName}</CardTitle>
              <CardDescription>{RACE_LABELS[gameState.opponentRace as keyof typeof RACE_LABELS]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-slate-300 mb-2">
                  <span>승률</span>
                  <span className="font-bold text-blue-400">{gameState.winProbability}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full"
                    style={{ width: `${gameState.winProbability}%` }}
                  />
                </div>
              </div>
              <Button onClick={handleStartGame} className="w-full bg-blue-600 hover:bg-blue-700">
                게임 시작
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (phase === "playing") {
    const turns = gameState.turns || [];
    const currentTurn = turns[turns.length - 1];
    const allCommentaries = currentTurn?.allCommentaries || [];
    const isLoading = playGameMutation.isPending;

    // 현재까지의 해설 표시
    const displayedCommentaries = allCommentaries.slice(0, currentCommentaryIndex + 1);
    
    // 현재 턴 계산 (해설 개수 기반)
    const currentTurnNum = Math.ceil((currentCommentaryIndex + 1) / 3) || 1;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">게임 진행 중...</h1>
            <p className="text-slate-400 mt-2">턴 {currentTurnNum} / {Math.ceil(allCommentaries.length / 3)}</p>
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
                    {displayedCommentaries.map((commentary: string, idx: number) => {
                      let textColor = "text-slate-300";
                      let borderColor = "border-slate-500";
                      let bgColor = "bg-slate-700/30";

                      if (commentary.includes(player1Name)) {
                        textColor = "text-cyan-200";
                        borderColor = "border-cyan-400";
                        bgColor = "bg-cyan-950/30";
                      } else if (commentary.includes(player2Name)) {
                        textColor = "text-red-200";
                        borderColor = "border-red-500";
                        bgColor = "bg-red-950/30";
                      } else if (commentary.includes("[중립]")) {
                        textColor = "text-white";
                        borderColor = "border-slate-400";
                        bgColor = "bg-slate-700/50";
                      }

                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded text-sm border-l-4 ${borderColor} ${bgColor}`}
                        >
                          <p className={`whitespace-pre-wrap ${textColor}`}>
                            {commentary.replace("[중립] ", "")}
                          </p>
                        </div>
                      );
                    })}
                    <div ref={commentaryEndRef} />
                  </div>
                  {/* 속도 조절 버튼 */}
                  <div className="flex justify-center gap-2 mt-4 pt-4 border-t border-slate-600">
                    <Button
                      onClick={() => setGameSpeed(1)}
                      variant={gameSpeed === 1 ? "default" : "outline"}
                      className={gameSpeed === 1 ? "bg-blue-600" : ""}
                      size="sm"
                    >
                      1배속
                    </Button>
                    <Button
                      onClick={() => setGameSpeed(2)}
                      variant={gameSpeed === 2 ? "default" : "outline"}
                      className={gameSpeed === 2 ? "bg-blue-600" : ""}
                      size="sm"
                    >
                      2배속
                    </Button>
                    <Button
                      onClick={() => setGameSpeed(5)}
                      variant={gameSpeed === 5 ? "default" : "outline"}
                      className={gameSpeed === 5 ? "bg-blue-600" : ""}
                      size="sm"
                    >
                      5배속
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 오른쪽: 게임 상태 */}
            <div className="lg:col-span-2 space-y-4">
              {/* 플레이어 1 상태 */}
              <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-cyan-400">
                <CardHeader>
                  <CardTitle className="text-cyan-300">{player1Name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm text-slate-300 mb-1">
                      <span>병력</span>
                      <span className="font-bold">{currentTurn?.player1Supply || 0}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-cyan-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (currentTurn?.player1Supply || 0) / 2)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-slate-300 mb-1">
                      <span>자원</span>
                      <span className="font-bold">{currentTurn?.player1Resources || 0}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (currentTurn?.player1Resources || 0) / 5)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 플레이어 2 상태 */}
              <Card className="bg-slate-800 border-slate-700 border-l-4 border-l-red-500">
                <CardHeader>
                  <CardTitle className="text-red-300">{player2Name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm text-slate-300 mb-1">
                      <span>병력</span>
                      <span className="font-bold">{currentTurn?.player2Supply || 0}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (currentTurn?.player2Supply || 0) / 2)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-slate-300 mb-1">
                      <span>자원</span>
                      <span className="font-bold">{currentTurn?.player2Resources || 0}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (currentTurn?.player2Resources || 0) / 5)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {showResultConfirm && (
            <div className="flex justify-center">
              <Button
                onClick={() => setPhase("result")}
                className="bg-green-600 hover:bg-green-700 px-8 py-2"
              >
                결과 확인
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "result") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-2">게임 결과</h1>
          </div>

          <Card className={`border-slate-700 mb-6 ${gameState.isWinner ? "bg-green-950" : "bg-red-950"}`}>
            <CardHeader>
              <CardTitle className={gameState.isWinner ? "text-green-400" : "text-red-400"}>
                {gameState.isWinner ? "승리!" : "패배"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-slate-400 text-sm">경험치</p>
                  <p className="text-2xl font-bold text-blue-400">+{gameState.expGained}</p>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-sm">골드</p>
                  <p className="text-2xl font-bold text-yellow-400">+{gameState.goldGained}</p>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-sm">피로도</p>
                  <p className="text-2xl font-bold text-red-400">-{gameState.fatigueUsed}</p>
                </div>
              </div>
              <Button
                onClick={() => {
                  setPhase("difficulty");
                  setGameState({});
                  setCurrentCommentaryIndex(0);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                다시 플레이
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}
