import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingBag, Package, Coins, Zap, Check, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STAT_LABELS,
  RARITY_COLORS,
  RARITY_LABELS,
} from "../../../shared/gameConstants";
import type { StatKey } from "../../../shared/gameConstants";

type StatBoosts = Partial<Record<StatKey, number>>;

interface ItemData {
  id: number;
  name: string;
  description: string | null;
  price: number;
  rarity: "common" | "rare" | "epic" | "legendary";
  statBoosts: unknown;
  iconEmoji: string;
  fatigueRecover?: number;
}

interface PlayerItemData {
  playerItemId: number;
  equipped: number;
  purchasedAt: string;
  usageCount: number;
  item: ItemData;
}

function ItemCard({
  item,
  owned,
  equipped,
  playerItemId,
  playerGold,
  playerFatigue,
  onBuy,
  onEquip,
  onUnequip,
  isBuying,
  isEquipping,
  usageCount,
  playerItems,
  onUse,
  onBuyMore,
}: {
  item: ItemData;
  owned: boolean;
  equipped: number;
  playerItemId?: number;
  playerGold: number;
  playerFatigue?: number;
  onBuy: () => void;
  onEquip: () => void;
  onUnequip: () => void;
  isBuying: boolean;
  isEquipping: boolean;
  usageCount?: number;
  playerItems?: PlayerItemData[];
  onUse?: () => void;
  onBuyMore?: () => void;
}) {
  const rarityColor = RARITY_COLORS[item.rarity] ?? "#9CA3AF";
  const rarityLabel = RARITY_LABELS[item.rarity] ?? "일반";
  const rawBoosts = item.statBoosts;
  const statBoosts: StatBoosts = (typeof rawBoosts === 'string' ? (() => { try { return JSON.parse(rawBoosts); } catch { return {}; } })() : rawBoosts as StatBoosts) ?? {};
  const canAfford = playerGold >= item.price;
  const isFatigueItem = item.fatigueRecover && item.fatigueRecover > 0;

  return (
    <div
      className={cn(
        "bg-card border rounded-xl p-4 flex flex-col gap-3 transition-all card-hover",
        equipped === 1
          ? "border-2"
          : "border-border"
      )}
      style={equipped === 1 ? { borderColor: rarityColor, boxShadow: `0 0 15px ${rarityColor}20` } : {}}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{ backgroundColor: `${rarityColor}15`, border: `1px solid ${rarityColor}40` }}
          >
            {item.iconEmoji}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-foreground">{item.name}</span>
              {equipped === 1 && (
                <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: `${rarityColor}20`, color: rarityColor }}>
                  착용 중
                </span>
              )}
            </div>
            <span
              className="text-xs font-semibold"
              style={{ color: rarityColor }}
            >
              {rarityLabel}
            </span>
          </div>
        </div>
      </div>

      {/* 설명 */}
      {item.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
      )}

      {/* 피로도 회복 */}
      {item.fatigueRecover && item.fatigueRecover > 0 && (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium bg-green-500/10 text-green-600 border border-green-500/20">
          <Zap className="w-2.5 h-2.5" />
          피로도 +{item.fatigueRecover}
        </span>
      )}

      {/* 능력치 보너스 */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(statBoosts).filter(([, val]) => val && val !== 0).map(([key, val]) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium bg-primary/10 text-primary border border-primary/20"
          >
            <Zap className="w-2.5 h-2.5" />
            {STAT_LABELS[key as StatKey] ?? key} +{val}
          </span>
        ))}
      </div>

      {/* 남은 사용 횟수 (보유 아이템인 경우만 표시) */}
      {owned && (
        <div className="text-xs text-muted-foreground text-center">
          남은 사용 횟수: <span className="font-bold text-foreground">{playerItemId !== undefined ? (playerItems?.find(pi => pi.playerItemId === playerItemId)?.usageCount ?? 0) : 0}/{isFatigueItem ? 1 : 20}</span>
        </div>
      )}

      {/* 하단: 가격 + 버튼 */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5 text-yellow-400" />
          <span className="font-bold text-sm text-yellow-400">{item.price.toLocaleString()} G</span>
        </div>

        {owned ? (
          <div className="flex gap-2">
            {isFatigueItem ? (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs font-bold"
                  style={{ backgroundColor: rarityColor, color: "white" }}
                  onClick={onUse}
                  disabled={isEquipping || (usageCount ?? 0) <= 0}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  사용
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs font-bold"
                  disabled={!canAfford || isBuying}
                  onClick={onBuyMore ?? onBuy}
                  variant={canAfford ? "default" : "outline"}
                >
                  {isBuying ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-1" />
                  ) : (
                    <ShoppingBag className="w-3 h-3 mr-1" />
                  )}
                  구매
                </Button>
              </div>
            ) : equipped === 1 ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs"
                onClick={onUnequip}
                disabled={isEquipping}
              >
                <Shield className="w-3 h-3 mr-1" />
                해제
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 px-3 text-xs font-bold"
                style={{ backgroundColor: rarityColor, color: "white" }}
                onClick={onEquip}
                disabled={isEquipping}
              >
                <Check className="w-3 h-3 mr-1" />
                착용
              </Button>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            className="h-7 px-3 text-xs font-bold"
            disabled={!canAfford || isBuying}
            onClick={onBuy}
            variant={canAfford ? "default" : "outline"}
          >
            {isBuying ? (
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-1" />
            ) : (
              <ShoppingBag className="w-3 h-3 mr-1" />
            )}
            {canAfford ? "구매" : "골드 부족"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Shop() {
  const utils = trpc.useUtils();
  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [equippingId, setEquippingId] = useState<number | null>(null);

  const { data: allItems = [], isLoading: itemsLoading } = trpc.shop.listItems.useQuery();
  const { data: playerItems = [], isLoading: playerItemsLoading } = trpc.shop.getPlayerItems.useQuery();
  const { data: playerData } = trpc.player.get.useQuery();

  const buyMutation = trpc.shop.buyItem.useMutation({
    onMutate: ({ itemId }) => setBuyingId(itemId),
    onSuccess: (item) => {
      utils.player.get.invalidate();
      utils.shop.getPlayerItems.invalidate();
      toast.success(`${item.name} 구매 완료!`);
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setBuyingId(null),
  });

  const equipMutation = trpc.shop.equipItem.useMutation({
    onMutate: ({ playerItemId }) => setEquippingId(playerItemId),
    onSuccess: (_, { equip }) => {
      utils.shop.getPlayerItems.invalidate();
      toast.success(equip ? "아이템을 착용했습니다" : "아이템을 해제했습니다");
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setEquippingId(null),
  });

  const useMutation = trpc.shop.useItem.useMutation({
    onMutate: ({ playerItemId }) => setEquippingId(playerItemId),
    onSuccess: (result, { playerItemId }) => {
      utils.player.get.invalidate();
      utils.shop.getPlayerItems.invalidate();
      const item = playerItems.find(pi => pi.playerItemId === playerItemId)?.item;
      toast.success(`${item?.name} 사용 완료!`);
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setEquippingId(null),
  });

  const playerGold = playerData?.gold ?? 0;

  // 보유 아이템 맵 (itemId -> playerItem)
  const ownedMap = new Map<number, PlayerItemData>(
    playerItems.map((pi) => [pi.item.id, pi as PlayerItemData])
  );

  // 착용 중인 아이템들의 능력치 합산
  const equippedBoosts: Partial<Record<StatKey, number>> = {};
  playerItems.forEach((pi) => {
    if (pi.equipped !== 1) return;
    const boosts = (pi.item.statBoosts as StatBoosts) ?? {};
    Object.entries(boosts).forEach(([k, v]) => {
      const key = k as StatKey;
      equippedBoosts[key] = (equippedBoosts[key] ?? 0) + (v ?? 0);
    });
  });

  const hasEquippedBoosts = Object.keys(equippedBoosts).length > 0;

  if (itemsLoading || playerItemsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">아이템 상점</h1>
          <p className="text-sm text-muted-foreground mt-0.5">아이템을 구매하여 선수 능력치를 강화하세요</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2">
          <Coins className="w-4 h-4 text-yellow-400" />
          <span className="font-bold text-yellow-400">{playerGold.toLocaleString()} G</span>
        </div>
      </div>

      {/* 착용 중 능력치 보너스 */}
      {hasEquippedBoosts && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary">착용 아이템 능력치 보너스</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(equippedBoosts).map(([key, val]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-semibold bg-primary/20 text-primary border border-primary/30"
              >
                {STAT_LABELS[key as StatKey]} +{val}
              </span>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="all">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="all" className="text-xs">전체 아이템</TabsTrigger>
          <TabsTrigger value="owned" className="text-xs">
            보유 아이템
            {playerItems.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{playerItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="equipped" className="text-xs">착용 중</TabsTrigger>
        </TabsList>

        {/* 전체 아이템 */}
        <TabsContent value="all" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...allItems]
              .sort((a, b) => {
                // 피로도 아이템을 먼저, 그 안에서 가격 오름차순
                const aFatigue = (a as any).fatigueRecover && (a as any).fatigueRecover > 0 ? 1 : 0;
                const bFatigue = (b as any).fatigueRecover && (b as any).fatigueRecover > 0 ? 1 : 0;
                if (aFatigue !== bFatigue) return bFatigue - aFatigue;
                return a.price - b.price;
              })
              .map((item) => {
              const owned = ownedMap.has(item.id);
              const playerItem = ownedMap.get(item.id);
              return (
                <ItemCard
                  key={item.id}
                  item={item as ItemData}
                  owned={owned}
                  equipped={playerItem?.equipped ?? 0}
                  playerItemId={playerItem?.playerItemId}
                  playerGold={playerGold}
                  playerFatigue={playerData?.fatigue}
                  onBuy={() => buyMutation.mutate({ itemId: item.id })}
                  onBuyMore={() => buyMutation.mutate({ itemId: item.id })}
                  onEquip={() => playerItem && equipMutation.mutate({ playerItemId: playerItem.playerItemId, equip: true })}
                  onUnequip={() => playerItem && equipMutation.mutate({ playerItemId: playerItem.playerItemId, equip: false })}
                  onUse={() => playerItem && useMutation.mutate({ playerItemId: playerItem.playerItemId })}
                  isBuying={buyingId === item.id}
                  isEquipping={equippingId === playerItem?.playerItemId}
                  usageCount={playerItem?.usageCount}
                  playerItems={playerItems}
                />
              );
            })}
          </div>
        </TabsContent>

        {/* 보유 아이템 */}
        <TabsContent value="owned" className="mt-4">
          {playerItems.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">보유한 아이템이 없습니다</p>
              <p className="text-xs mt-1">상점에서 아이템을 구매하세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {playerItems.map((pi) => (
                <ItemCard
                  key={pi.playerItemId}
                  item={pi.item as ItemData}
                  owned={true}
                  equipped={pi.equipped ?? 0}
                  playerItemId={pi.playerItemId}
                  playerGold={playerGold}
                  playerFatigue={playerData?.fatigue}
                  onBuy={() => {}}
                  onBuyMore={() => buyMutation.mutate({ itemId: pi.item.id })}
                  onEquip={() => equipMutation.mutate({ playerItemId: pi.playerItemId, equip: true })}
                  onUnequip={() => equipMutation.mutate({ playerItemId: pi.playerItemId, equip: false })}
                  onUse={() => useMutation.mutate({ playerItemId: pi.playerItemId })}
                  isBuying={buyingId === pi.item.id}
                  isEquipping={equippingId === pi.playerItemId}
                  usageCount={pi.usageCount}
                  playerItems={playerItems}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* 착용 중 */}
        <TabsContent value="equipped" className="mt-4">
          {playerItems.filter((pi) => pi.equipped === 1).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">착용 중인 아이템이 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {playerItems.filter((pi) => pi.equipped).map((pi) => (
                <ItemCard
                  key={pi.playerItemId}
                  item={pi.item as ItemData}
                  owned={true}
                  equipped={1}
                  playerItemId={pi.playerItemId}
                  playerGold={playerGold}
                  onBuy={() => {}}
                  onEquip={() => {}}
                  onUnequip={() => equipMutation.mutate({ playerItemId: pi.playerItemId, equip: false })}
                  onUse={() => useMutation.mutate({ playerItemId: pi.playerItemId })}
                  isBuying={false}
                  isEquipping={equippingId === pi.playerItemId}
                  usageCount={pi.usageCount}
                  playerItems={playerItems}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
