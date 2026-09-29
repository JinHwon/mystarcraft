"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RACE_COLORS, RACE_LABELS, DIFFICULTY_RANGES, GAME_REWARDS, FATIGUE_COST, FATIGUE_MIN_TO_PLAY, GAME_MAX_RESOURCES, calcFatigueStatPenalty } from "@shared/gameConstants";
import { Loader2, X, ArrowLeft, User } from "lucide-react";
import { STAT_LABELS } from "@shared/gameConstants";
import { ConditionBadge } from "@/components/team/PlayerBadges";
import { toast } from "sonner";

type GamePhase = "difficulty" | "map" | "opponent" | "playing" | "result";

interface GameState {
  difficulty?: "beginner" | "intermediate" | "advanced";
  mapId?: number;
  gameId?: number;
  opponentName?: string;
  opponentRace?: string;
  opponentGrade?: string;
  playerCondition?: number;
  opponentCondition?: number;
  opponentStats?: Record<string, number>;
  isAiOpponent?: boolean;
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
  playerStats?: Record<string, number>;
  playerEffectiveStats?: Record<string, number>;
  playerFatigue?: number;
  playerFatiguePenalty?: number;
}

type PlayerSnapshot = {
  race: string;
  plan: string;
  population: number;
  supplyCap: number;
  workers: number;
  armySupply: number;
  minerals: number;
  gas: number;
  incomePerMin: number;
  bases: number;
  army: string;
};

function formatGameTime(sec?: number) {
  const t = Math.max(0, Math.floor(sec ?? 0));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** 경기 중 선수 현황 카드: 인구수·일꾼·기지·채취량·보유 자원·병력 구성 */
function PlayerStatusCard({ name, tone, snap, armySupply, mined, maxResources }: {
  name: string;
  tone: "blue" | "purple";
  snap?: PlayerSnapshot;
  armySupply: number;
  mined: number;
  maxResources: number;
}) {
  const border = tone === "blue" ? "border-blue-700/50" : "border-purple-700/50";
  const title = tone === "blue" ? "text-blue-300" : "text-purple-300";
  const stat = (label: string, value: string | number) => (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100 font-semibold tabular-nums">{value}</span>
    </div>
  );
  return (
    <Card className={`bg-slate-800 ${border}`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm md:text-base ${title}`}>{name}</CardTitle>
        {snap && (
          <CardDescription className="text-[10px] md:text-xs">
            {RACE_LABELS[snap.race as keyof typeof RACE_LABELS] ?? snap.race} · {snap.plan}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-[11px] md:text-xs">
        {snap && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {stat("👥 인구", `${snap.population}/${snap.supplyCap}`)}
            {stat("⛏️ 일꾼", snap.workers)}
            {stat("🏠 기지", snap.bases)}
            {stat("📈 분당 채취", snap.incomePerMin.toLocaleString())}
            {stat("💎 미네랄", snap.minerals.toLocaleString())}
            {stat("🟢 가스", snap.gas.toLocaleString())}
          </div>
        )}
        <div>
          <div className="flex justify-between mb-0.5 text-slate-400">
            <span>⚔️ 병력 (인구)</span>
            <span className="text-cyan-400 font-bold">{armySupply}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div className="bg-cyan-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min((armySupply / 200) * 100, 100)}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-0.5 text-slate-400">
            <span>💰 누적 채취 자원</span>
            <span className="text-yellow-400 font-bold">{mined.toLocaleString()}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div className="bg-yellow-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min((mined / maxResources) * 100, 100)}%` }} />
          </div>
        </div>
        {snap && <p className="text-slate-300 leading-snug">{snap.army}</p>}
      </CardContent>
    </Card>
  );
}

export default function PracticePage() {
  const [phase, setPhase] = useState<GamePhase>("difficulty");
  const [gameState, setGameState] = useState<GameState>({});
  const [currentCommentaryIndex, setCurrentCommentaryIndex] = useState(0);
  const [showResultConfirm, setShowResultConfirm] = useState(false);
  const [gameSpeed, setGameSpeed] = useState<1 | 2 | 5>(1);
  const autoPlayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const utils = trpc.useUtils();
  const mapsQuery = trpc.practice.getMaps.useQuery();
  const findOpponentMutation = trpc.practice.findOpponent.useMutation();
  const playGameMutation = trpc.practice.playGame.useMutation();
  const userQuery = trpc.auth.me.useQuery();
  const playerQuery = trpc.player.get.useQuery();

  const player1Name = playerQuery.data?.name || "플레이어 1";
  const player2Name = gameState.opponentName || "플레이어 2";

  // 플레이어 능력치 계산 (아이템 부스트 + 피로 페널티 포함)
  const calculatePlayerEffectiveStats = () => {
    if (!playerQuery.data?.stats) return null;
    
    const baseStats = playerQuery.data.stats as unknown as Record<string, number>;
    const fatigue = playerQuery.data.fatigue ?? 0;
    
    // 착용 아이템 보너스 계산
    let itemBoosts: Record<string, number> = {};
    if ((playerQuery.data as any)?.playerItems) {
      (playerQuery.data as any).playerItems.forEach((pi: any) => {
        if (!pi.equipped) return;
        const boosts = (pi.item?.statBoosts ?? {}) as Record<string, number>;
        Object.entries(boosts).forEach(([k, v]) => {
          itemBoosts[k] = (itemBoosts[k] ?? 0) + (v ?? 0);
        });
      });
    }
    
    // 기본 능력치 + 아이템 부스트
    const boostedStats: Record<string, number> = {};
    Object.entries(baseStats).forEach(([key, value]) => {
      boostedStats[key] = Math.min((value ?? 0) + (itemBoosts[key] ?? 0), 1200);
    });
    
    // 피로 페널티 적용
    const penalty = calcFatigueStatPenalty(fatigue);
    const effectiveStats: Record<string, number> = {};
    Object.entries(boostedStats).forEach(([key, value]) => {
      effectiveStats[key] = Math.floor(value * (1 - penalty));
    });
    
    return { baseStats, itemBoosts, boostedStats, effectiveStats, fatigue, penalty };
  };

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
      
      // 플레이어 능력치 계산
      const playerStatsCalc = calculatePlayerEffectiveStats();
      
      setGameState(prev => ({
        ...prev,
        gameId: result.gameId,
        playerName: playerQuery.data?.name,
        playerRace: (playerQuery.data as any)?.race,
        playerStats: playerStatsCalc?.baseStats,
        playerEffectiveStats: playerStatsCalc?.effectiveStats,
        playerFatigue: playerStatsCalc?.fatigue,
        playerFatiguePenalty: playerStatsCalc?.penalty,
        opponentName: result.opponent.name,
        opponentRace: result.opponent.race,
        opponentGrade: result.opponentGrade,
        playerCondition: result.playerCondition,
        opponentCondition: result.opponentCondition,
        opponentStats: result.opponentStats,
        isAiOpponent: result.isAiOpponent,
        winProbability: result.winProbability,
      }));
    } catch (error) {
      console.error("상대 찾기 실패:", error);
    }
  };

  const useItemMutation = trpc.shop.useItem.useMutation({
    onSuccess: (result) => {
      utils.player.get.invalidate();
      utils.practice.estimateWinRate.invalidate();
      setGameState(prev => ({
        ...prev,
        playerFatigue: result.newFatigue,
        playerFatiguePenalty: calcFatigueStatPenalty(result.newFatigue),
      }));
      toast.success(`피로도 회복! (${result.newFatigue}/100)`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 실제 승률 (게임 엔진 반복 시뮬레이션 기반)
  const winRateQuery = trpc.practice.estimateWinRate.useQuery(
    { gameId: gameState.gameId ?? 0 },
    { enabled: phase === "opponent" && !!gameState.gameId, staleTime: Infinity, refetchOnWindowFocus: false }
  );

  const handleUseRecoveryItem = (playerItem: any) => {
    if (!playerItem || !playerItem.item?.fatigueRecover) return;
    useItemMutation.mutate({ playerItemId: playerItem.playerItemId });
  };

  const handleStartGame = async () => {
    if (!gameState.gameId) return;

    try {
      // AI 상대도 DB 에 저장된 선수이므로 gameId 만 전달
      const playGameInput: any = {
        gameId: gameState.gameId,
      };
      
      const result = await playGameMutation.mutateAsync(playGameInput);
      
      // 해설(시간 표시 포함)은 서버 엔진이 생성
      const turns = result.turns || [];

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
      
      // 게임 완료 후 플레이어 정보 및 아이템 목록 갱신 (사용횟수 0 아이템 제거 반영)
      utils.player.get.invalidate();
      utils.shop.getPlayerItems.invalidate();
      
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
                  <CardHeader>
                    <CardTitle className="text-sm md:text-base text-white">{map.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* 종족 상성 */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-400 mb-1">종족 상성</p>
                      <div className="space-y-0.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">테란 vs 저그</span>
                          <span className="text-slate-200">{getMatchupText(adv, 'terran', 'zerg')}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">테란 vs 프로토스</span>
                          <span className="text-slate-200">{getMatchupText(adv, 'terran', 'protoss')}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">저그 vs 프로토스</span>
                          <span className="text-slate-200">{getMatchupText(adv, 'zerg', 'protoss')}</span>
                        </div>
                      </div>
                    </div>

                    {/* 각 종족 유리도 */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-400 mb-1">유리도</p>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div className="flex flex-col items-center p-1.5 rounded bg-slate-700/50">
                          <span className="text-slate-400">테란</span>
                          <span className="text-cyan-400 font-medium">{adv.terran ?? 50}</span>
                        </div>
                        <div className="flex flex-col items-center p-1.5 rounded bg-slate-700/50">
                          <span className="text-slate-400">저그</span>
                          <span className="text-purple-400 font-medium">{adv.zerg ?? 50}</span>
                        </div>
                        <div className="flex flex-col items-center p-1.5 rounded bg-slate-700/50">
                          <span className="text-slate-400">프로토스</span>
                          <span className="text-yellow-400 font-medium">{adv.protoss ?? 50}</span>
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
        <div className="max-w-3xl mx-auto">
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
            <>
              {/* 플레이어 vs 상대 능력치 비교 */}
              {gameState.playerEffectiveStats && gameState.opponentStats && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
                  {/* 플레이어 능력치 */}
                  <Card className="bg-blue-900/20 border-blue-700/50">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-400" />
                        <CardTitle className="text-sm md:text-base text-blue-300">내 능력치</CardTitle>
                        {gameState.playerCondition !== undefined && <ConditionBadge condition={gameState.playerCondition} className="ml-auto" />}
                      </div>
                      {gameState.playerFatigue !== undefined && gameState.playerFatigue < 90 && (
                        <CardDescription className="text-red-400 text-xs">
                          피로도 페널티: -{Math.round((gameState.playerFatiguePenalty ?? 0) * 100)}%
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-1.5 text-xs">
                        {Object.entries(STAT_LABELS).map(([key, label]) => (
                          <div key={key} className="bg-blue-900/50 rounded px-2 py-2 text-center">
                            <p className="text-blue-300 text-[10px] font-semibold">{label}</p>
                            <p className="text-blue-100 font-bold">{gameState.playerEffectiveStats?.[key] ?? 0}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 상대 능력치 */}
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm md:text-base text-slate-200">{gameState.opponentName}</CardTitle>
                        {gameState.isAiOpponent && (
                          <Badge className="bg-purple-600 text-purple-100 text-xs">AI</Badge>
                        )}
                        {gameState.opponentCondition !== undefined && <ConditionBadge condition={gameState.opponentCondition} className="ml-auto" />}
                      </div>
                      {gameState.opponentRace && (
                        <CardDescription className="text-xs md:text-sm">{RACE_LABELS[gameState.opponentRace as keyof typeof RACE_LABELS]}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-1.5 text-xs">
                        {Object.entries(STAT_LABELS).map(([key, label]) => (
                          <div key={key} className="bg-slate-700/50 rounded px-2 py-2 text-center">
                            <p className="text-slate-400 text-[10px] font-semibold">{label}</p>
                            <p className="text-slate-200 font-bold">{gameState.opponentStats?.[key] ?? 0}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* 능력치 비교 그래프 (내 능력치 vs 상대 능력치) */}
              {gameState.opponentStats && (() => {
                const myStats = calculatePlayerEffectiveStats()?.effectiveStats ?? gameState.playerEffectiveStats;
                if (!myStats) return null;
                const statKeys = Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[];
                const scaleMax = Math.max(
                  ...statKeys.map(k => Math.max(myStats[k] ?? 0, gameState.opponentStats?.[k] ?? 0)),
                  1
                );
                const myTotal = statKeys.reduce((sum, k) => sum + (myStats[k] ?? 0), 0);
                const oppTotal = statKeys.reduce((sum, k) => sum + (gameState.opponentStats?.[k] ?? 0), 0);
                return (
                  <Card className="bg-slate-800 border-slate-700 mb-4 md:mb-6">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm md:text-base text-white">능력치 비교</CardTitle>
                      <div className="flex gap-4 text-[10px] md:text-xs">
                        <span className="text-blue-400">● 나 (합계 {myTotal})</span>
                        <span className="text-red-400">● {gameState.opponentName} (합계 {oppTotal})</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {statKeys.map(key => {
                        const mine = myStats[key] ?? 0;
                        const theirs = gameState.opponentStats?.[key] ?? 0;
                        const diff = mine - theirs;
                        return (
                          <div key={key} className="grid grid-cols-[3.5rem_1fr_3rem] md:grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 text-[10px] md:text-xs">
                            <span className="text-slate-300 font-semibold">{STAT_LABELS[key]}</span>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1">
                                <div className="flex-1 bg-slate-700 rounded-full h-1.5 md:h-2">
                                  <div className="bg-blue-500 h-1.5 md:h-2 rounded-full transition-all" style={{ width: `${(mine / scaleMax) * 100}%` }} />
                                </div>
                                <span className="w-8 text-right text-blue-300">{mine}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className="flex-1 bg-slate-700 rounded-full h-1.5 md:h-2">
                                  <div className="bg-red-500 h-1.5 md:h-2 rounded-full transition-all" style={{ width: `${(theirs / scaleMax) * 100}%` }} />
                                </div>
                                <span className="w-8 text-right text-red-300">{theirs}</span>
                              </div>
                            </div>
                            <span className={`text-right font-bold ${diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-slate-400"}`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* 상대 정보 및 승률 */}
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm md:text-base text-white">{gameState.opponentName || "상대 검색 중..."}</CardTitle>
                    {gameState.isAiOpponent && (
                      <Badge className="bg-purple-600 text-purple-100 text-xs">AI</Badge>
                    )}
                  </div>
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
                  
                  {gameState.gameId && (
                    <div>
                      <div className="flex justify-between text-xs md:text-sm text-slate-300 mb-1 md:mb-2">
                        <span>실제 승률</span>
                        {winRateQuery.isFetching ? (
                          <span className="flex items-center text-slate-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" />계산 중...</span>
                        ) : winRateQuery.data ? (
                          <span className="font-bold text-blue-400">약 {Math.round(winRateQuery.data.winRate)}%</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2 md:h-3">
                        <div
                          className="bg-blue-500 h-2 md:h-3 rounded-full transition-all"
                          style={{ width: `${winRateQuery.data?.winRate ?? 0}%` }}
                        />
                      </div>
                      {winRateQuery.data && (
                        <p className="text-[10px] md:text-xs text-slate-500 mt-1">
                          현재 피로도·컨디션·착용 아이템·맵·종족 조건으로 경기를 {winRateQuery.data.runs}회 시뮬레이션한 결과입니다 (계산 중에도 바로 게임을 시작할 수 있습니다)
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* 피로도 회복 아이템 사용 */}
                  {playerQuery.data?.playerItems && playerQuery.data.playerItems.length > 0 && (
                    <div className="p-2 md:p-3 bg-slate-700 rounded-lg">
                      <p className="text-xs md:text-sm text-slate-300 mb-2">피로도 회복 아이템</p>
                      <div className="flex flex-wrap gap-2">
                        {playerQuery.data.playerItems
                          .filter((pi: any) => pi.item?.fatigueRecover && pi.item.fatigueRecover > 0)
                          .map((pi: any) => (
                            <Button
                              key={pi.playerItemId}
                              onClick={() => handleUseRecoveryItem(pi)}
                              disabled={playGameMutation.isPending || findOpponentMutation.isPending}
                              className="text-xs md:text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50"
                              size="sm"
                            >
                              {pi.item.iconEmoji} {pi.item.name} ({pi.usageCount})
                            </Button>
                          ))}
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
            </>
          )}
        </div>
      </div>
    );
  }

  if (phase === "playing") {
    const turns = gameState.turns || [];
    const currentTurn = turns[Math.min(currentTurnIndex, turns.length - 1)];
    
    // 현재 턴까지의 모든 해설을 누적
    const allCommentaries: { text: string; turnIndex: number }[] = [];
    for (let i = 0; i <= Math.min(currentTurnIndex, turns.length - 1); i++) {
      const turnCommentaries = turns[i]?.commentaries || [];
      turnCommentaries.forEach((c: string) => {
        allCommentaries.push({ text: c, turnIndex: i });
      });
    }

    // 현재까지의 턴 데이터 (그래프용)
    const displayedTurns = turns.slice(0, currentTurnIndex + 1);

    // 유불리 수치
    const p1Advantage = currentTurn?.player1Advantage ?? 50;
    const p2Advantage = 100 - p1Advantage;

    // 병력/자원 최대값 (그래프 스케일링용)
    const maxSupply = Math.max(
      ...displayedTurns.map((t: any) => Math.max(t.player1Supply ?? 0, t.player2Supply ?? 0)),
      1
    );
    const maxResources = GAME_MAX_RESOURCES;
    const mapName = mapsQuery.data?.find((m: any) => m.id === gameState.mapId)?.name;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-4 flex justify-between items-center">
            <Button
              onClick={() => { setPhase("opponent"); }}
              variant="ghost"
              className="text-slate-400 hover:text-white"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> 뒤로가기
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={() => setGameSpeed(1)}
                variant={gameSpeed === 1 ? "default" : "outline"}
                size="sm"
                className="text-xs"
              >
                1x
              </Button>
              <Button
                onClick={() => setGameSpeed(2)}
                variant={gameSpeed === 2 ? "default" : "outline"}
                size="sm"
                className="text-xs"
              >
                2x
              </Button>
              <Button
                onClick={() => setGameSpeed(5)}
                variant={gameSpeed === 5 ? "default" : "outline"}
                size="sm"
                className="text-xs"
              >
                5x
              </Button>
            </div>
          </div>

          {/* 방송 스코어보드: 맵·경기 시간·선수·빌드·유불리 */}
          <div className="mb-3 rounded-xl overflow-hidden border border-slate-700 bg-gradient-to-r from-blue-950 via-slate-900 to-purple-950 shadow-lg">
            <div className="flex items-center justify-between px-3 md:px-4 py-1.5 bg-black/40 text-[10px] md:text-xs">
              <span className="flex items-center gap-1.5 font-bold text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE
              </span>
              <span className="text-slate-300 truncate px-2">🗺️ {mapName ?? "연습경기"} · {difficultyLabels[gameState.difficulty ?? ""] ?? ""}</span>
              <span className="text-slate-400">문자중계</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 md:px-5 py-3">
              <div className="min-w-0">
                <p className="text-base md:text-xl font-black text-blue-300 truncate">{player1Name}</p>
                <p className="text-[10px] md:text-xs text-slate-400 truncate">
                  {RACE_LABELS[(currentTurn?.p1?.race ?? gameState.playerRace) as keyof typeof RACE_LABELS] ?? ""}{currentTurn?.p1?.plan ? ` · ${currentTurn.p1.plan}` : ""}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xl md:text-3xl font-black text-white tabular-nums tracking-wider">{formatGameTime(currentTurn?.time)}</p>
                <p className="text-[10px] text-slate-500">VS</p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-base md:text-xl font-black text-purple-300 truncate">{player2Name}</p>
                <p className="text-[10px] md:text-xs text-slate-400 truncate">
                  {RACE_LABELS[(currentTurn?.p2?.race ?? gameState.opponentRace) as keyof typeof RACE_LABELS] ?? ""}{currentTurn?.p2?.plan ? ` · ${currentTurn.p2.plan}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 md:px-5 pb-3">
              <span className="text-blue-300 font-bold text-xs md:text-sm w-10 text-right tabular-nums">{Math.round(p1Advantage)}%</span>
              <div className="flex-1 h-3 md:h-4 bg-slate-800 rounded-full overflow-hidden relative">
                <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300" style={{ width: `${p1Advantage}%` }} />
                <div className="absolute top-0 right-0 h-full bg-gradient-to-l from-purple-600 to-purple-400 transition-all duration-300" style={{ width: `${p2Advantage}%` }} />
                <div className="absolute top-0 left-1/2 w-px h-full bg-white/40" />
              </div>
              <span className="text-purple-300 font-bold text-xs md:text-sm w-10 tabular-nums">{Math.round(p2Advantage)}%</span>
            </div>
          </div>

          {/* 문자중계: 시간 · 해설, 교전·GG 등 주요 장면 강조 */}
          <Card className="bg-slate-900/80 border-slate-700 mb-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm md:text-base text-white flex items-center justify-between">
                <span>📺 문자중계</span>
                <span className="text-[10px] md:text-xs font-normal text-slate-500">{allCommentaries.length}개 중계</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0.5 max-h-72 md:max-h-96 overflow-y-auto pr-1" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                {allCommentaries.length === 0 ? (
                  <p className="text-xs text-slate-400">경기 시작 전입니다.</p>
                ) : (
                  allCommentaries.map((item, idx) => {
                    const m = item.text.match(/^\[(\d{2}:\d{2})\] (.*)$/);
                    const time = m ? m[1] : "";
                    const body = m ? m[2] : item.text;
                    // 한 선수만 언급하면 그 선수 색, 두 선수 모두 또는 아무도 언급하지 않으면 중립(흰색)
                    const mentions1 = body.includes(player1Name);
                    const mentions2 = body.includes(player2Name);
                    let textColor = "text-white";
                    if (mentions1 && !mentions2) textColor = "text-blue-300";
                    else if (mentions2 && !mentions1) textColor = "text-purple-300";
                    const isGG = /GG|판정승|무너졌습니다/.test(body);
                    const isBattle = /공격!|교전 승리|무너집니다|타이밍/.test(body);
                    const isStatus = body.startsWith("현황");
                    const rowStyle = isGG
                      ? "bg-red-950/60 border-l-4 border-red-500 font-bold"
                      : isBattle
                        ? "bg-amber-950/40 border-l-4 border-amber-500 font-semibold"
                        : isStatus
                          ? "bg-slate-800/80 border-l-4 border-slate-500 text-[11px]"
                          : "border-l-4 border-transparent";
                    return (
                      <div key={idx} className={`flex gap-2 px-2 py-1 rounded-r ${rowStyle}`}>
                        <span className="shrink-0 w-10 text-[10px] md:text-xs text-slate-500 font-mono pt-px">{time}</span>
                        <p className={`text-xs md:text-sm leading-snug ${isGG ? "text-red-200" : textColor}`}>{body}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* 플레이어 정보 (병력/자원 수치 + 바 그래프) */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {/* 플레이어 1 정보 */}
            <PlayerStatusCard name={player1Name} tone="blue" snap={currentTurn?.p1} armySupply={currentTurn?.player1Supply ?? 0} mined={currentTurn?.player1Resources ?? 0} maxResources={maxResources} />
            {/* 플레이어 2 정보 */}
            <PlayerStatusCard name={player2Name} tone="purple" snap={currentTurn?.p2} armySupply={currentTurn?.player2Supply ?? 0} mined={currentTurn?.player2Resources ?? 0} maxResources={maxResources} />
          </div>

          {/* 병력 추이 그래프 */}
          <Card className="bg-slate-800 border-slate-700 mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-slate-400">⚔️ 병력 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-24 md:h-32">
                <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[9px] text-slate-500 w-8">
                  <span>{maxSupply}</span>
                  <span>{Math.round(maxSupply / 2)}</span>
                  <span>0</span>
                </div>
                <div className="ml-9 h-full relative overflow-hidden">
                  <svg className="w-full h-full" viewBox={`0 0 ${Math.max(displayedTurns.length, 2)} ${maxSupply}`} preserveAspectRatio="none">
                    <polyline fill="none" stroke="#60A5FA" strokeWidth={maxSupply * 0.02} points={displayedTurns.map((t: any, i: number) => `${i},${maxSupply - (t.player1Supply ?? 0)}`).join(' ')} />
                    <polyline fill="none" stroke="#A78BFA" strokeWidth={maxSupply * 0.02} points={displayedTurns.map((t: any, i: number) => `${i},${maxSupply - (t.player2Supply ?? 0)}`).join(' ')} />
                  </svg>
                  <div className="absolute top-1 right-1 flex gap-3 text-[10px]">
                    <span className="text-blue-400">● {player1Name}</span>
                    <span className="text-purple-400">● {player2Name}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 유불리 추이 그래프 */}
          <Card className="bg-slate-800 border-slate-700 mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-slate-400">📊 유불리 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-24 md:h-32">
                <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[9px] text-slate-500 w-8">
                  <span className="text-blue-400">P1</span>
                  <span>50</span>
                  <span className="text-purple-400">P2</span>
                </div>
                <div className="ml-9 h-full relative overflow-hidden">
                  <svg className="w-full h-full" viewBox={`0 0 ${Math.max(displayedTurns.length, 2)} 100`} preserveAspectRatio="none">
                    <line x1="0" y1="50" x2={displayedTurns.length} y2="50" stroke="#475569" strokeWidth="0.5" strokeDasharray="2,2" />
                    <polyline fill="none" stroke="#60A5FA" strokeWidth="1.5" points={displayedTurns.map((t: any, i: number) => `${i},${100 - (t.player1Advantage ?? 50)}`).join(' ')} />
                  </svg>
                  <div className="absolute top-1 right-1 flex gap-3 text-[10px]">
                    <span className="text-blue-400">↑ {player1Name} 유리</span>
                    <span className="text-purple-400">↓ {player2Name} 유리</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 게임 완료 시 결과 보기 버튼 (하단 인라인) */}
          {showResultConfirm && (
            <div className="mt-4">
              <Button 
                onClick={() => setPhase("result")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-base font-bold py-3"
              >
                🏆 결과 보기
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "result") {
    const isWinner = gameState.isWinner;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 md:p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6 md:mb-12">
            <h1 className={`text-3xl md:text-5xl font-bold mb-2 ${isWinner ? 'text-green-400' : 'text-red-400'}`}>
              {isWinner ? '승리!' : '패배'}
            </h1>
            <p className="text-xs md:text-base text-slate-400">게임이 종료되었습니다</p>
          </div>

          <Card className="bg-slate-800 border-slate-700 mb-4">
            <CardHeader>
              <CardTitle className="text-sm md:text-base text-white">보상</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-slate-300">경험치</span>
                <span className={`font-bold ${(gameState.expGained ?? 0) > 0 ? 'text-green-400' : 'text-slate-300'}`}>
                  +{gameState.expGained ?? 0}
                </span>
              </div>
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-slate-300">골드</span>
                <span className={`font-bold ${(gameState.goldGained ?? 0) > 0 ? 'text-yellow-400' : 'text-slate-300'}`}>
                  +{gameState.goldGained ?? 0}
                </span>
              </div>
              <div className="flex justify-between text-xs md:text-sm">
                <span className="text-slate-300">피로도 소모</span>
                <span className="font-bold text-red-400">-{gameState.fatigueUsed ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          {gameState.statChanges && Object.keys(gameState.statChanges).length > 0 && (
            <Card className="bg-slate-800 border-slate-700 mb-4">
              <CardHeader>
                <CardTitle className="text-sm md:text-base text-white">능력치 변화</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(gameState.statChanges).map(([stat, change]: [string, any]) => {
                    const numChange = Number(change) || 0;
                    return (
                      <div key={stat} className="flex justify-between text-xs">
                        <span className="text-slate-400">
                          {STAT_LABELS[stat as keyof typeof STAT_LABELS] || stat}
                        </span>
                        <span className={numChange > 0 ? "text-green-400" : numChange < 0 ? "text-red-400" : "text-slate-400"}>
                          {numChange > 0 ? "+" : ""}{numChange}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={() => { setPhase("difficulty"); setGameState({}); }}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              다시 플레이
            </Button>
            <Button 
              onClick={() => { setPhase("difficulty"); setGameState({}); }}
              variant="outline"
              className="flex-1"
            >
              홈으로
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
