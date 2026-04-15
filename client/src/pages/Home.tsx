import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getOAuthLoginUrl, OAUTH_PROVIDERS } from "@/const";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sword, Shield, Zap, Star, ChevronDown } from "lucide-react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [showOAuthMenu, setShowOAuthMenu] = useState(false);

  const { data: player, isLoading: playerLoading } = trpc.player.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!loading && isAuthenticated && !playerLoading) {
      if (player) {
        navigate("/profile");
      } else if (player === null) {
        navigate("/create-player");
      }
    }
  }, [loading, isAuthenticated, playerLoading, player]);

  if (loading || (isAuthenticated && playerLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* 배경 그리드 패턴 */}
      <div className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: "linear-gradient(oklch(0.25 0.02 240 / 0.3) 1px, transparent 1px), linear-gradient(90deg, oklch(0.25 0.02 240 / 0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }}
      />

      {/* 배경 글로우 */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* 헤더 */}
        <header className="flex items-center justify-between px-8 py-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center glow-blue">
              <Sword className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-foreground tracking-wider">마이스타크래프트</span>
          </div>
        </header>

        {/* 히어로 섹션 */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          {/* 메인 타이틀 */}
          <div className="mb-8 space-y-4">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 text-xs font-medium text-primary mb-4">
              <Star className="w-3 h-3" />
              나만의 스타크래프트 선수를 육성하라
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-foreground leading-tight tracking-tight">
              마이
              <span className="text-primary"> 스타크래프트</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              테란, 저그, 프로토스 중 하나를 선택하고<br />
              나만의 선수를 육성하여 최강의 프로게이머가 되어라
            </p>
          </div>

          {/* 특징 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl w-full mb-10">
            {[
              {
                icon: Sword,
                title: "선수 육성",
                desc: "8가지 능력치를 레벨업으로 강화",
                color: "#4A9EFF",
              },
              {
                icon: Shield,
                title: "등급 시스템",
                desc: "F부터 SSS까지 9단계 등급",
                color: "#F1C40F",
              },
              {
                icon: Zap,
                title: "아이템 상점",
                desc: "아이템 구매로 능력치 강화",
                color: "#B44FD8",
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="bg-card border border-border rounded-xl p-5 text-left card-hover"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}
                >
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* CTA 버튼 */}
          <div className="flex flex-col items-center gap-4">
            <Button
              size="lg"
              className="px-10 py-6 text-base font-bold glow-blue"
              onClick={() => window.location.href = getOAuthLoginUrl("manus")}
            >
              <Sword className="w-5 h-5 mr-2" />
              지금 시작하기
            </Button>
            
            {/* 다른 로그인 옵션 */}
            <div className="relative">
              <button
                onClick={() => setShowOAuthMenu(!showOAuthMenu)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                다른 계정으로 로그인
                <ChevronDown className="w-3 h-3" />
              </button>
              
              {/* 드롭다운 메뉴 */}
              {showOAuthMenu && (
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-card border border-border rounded-lg shadow-lg z-50 whitespace-nowrap">
                  {OAUTH_PROVIDERS.filter(p => p.id !== "manus").map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => {
                        window.location.href = getOAuthLoginUrl(provider.id as any);
                        setShowOAuthMenu(false);
                      }}
                      className="w-full px-4 py-2 text-sm text-foreground hover:bg-primary/10 first:rounded-t-lg last:rounded-b-lg transition-colors flex items-center gap-2"
                    >
                      <span>{provider.icon}</span>
                      <span>{provider.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 종족 배너 */}
        <div className="border-t border-border/50 py-6">
          <div className="flex items-center justify-center gap-8 md:gap-16">
            {[
              { name: "테란", color: "#4A9EFF", desc: "인류의 수호자" },
              { name: "저그", color: "#B44FD8", desc: "군집의 지배자" },
              { name: "프로토스", color: "#F1C40F", desc: "고대의 전사" },
            ].map(({ name, color, desc }) => (
              <div key={name} className="text-center">
                <div className="text-lg font-bold" style={{ color }}>{name}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
