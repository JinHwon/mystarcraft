import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sword, Shield, Zap, Star } from "lucide-react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  // 로그인되어 있으면 바로 감독실로
  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/lobby");
  }, [loading, isAuthenticated]);

  if (loading || isAuthenticated) {
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
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] md:w-[600px] h-[200px] md:h-[400px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* 헤더 */}
        <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6 border-b border-border/50">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 md:w-9 h-8 md:h-9 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center glow-blue">
              <Sword className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-foreground tracking-wider text-sm md:text-base">마이스타크래프트</span>
          </div>
        </header>

        {/* 히어로 섹션 */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-4 text-center py-8 md:py-0">
          {/* 메인 타이틀 */}
          <div className="mb-6 md:mb-8 space-y-3 md:space-y-4">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-3 md:px-4 py-1 md:py-1.5 text-xs font-medium text-primary mb-3 md:mb-4">
              <Star className="w-3 h-3" />
              <span className="text-xs md:text-sm">2010 프로리그 감독이 되어라</span>
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-7xl font-black text-foreground leading-tight tracking-tight">
              마이
              <span className="text-primary"> 스타크래프트</span>
            </h1>
            <p className="text-sm md:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              12개 프로게임단 중 하나를 맡아<br />
              230명의 선수를 키우고 프로리그 우승에 도전하라
            </p>
          </div>

          {/* 특징 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 max-w-3xl w-full mb-8 md:mb-10">
            {[
              {
                icon: Sword,
                title: "팀 운영",
                desc: "12개 팀 · 선수 230명 · 영입과 방출",
                color: "#4A9EFF",
              },
              {
                icon: Shield,
                title: "마이프로리그",
                desc: "엔트리 편성 · 에이스 결정전 · 포스트시즌",
                color: "#F1C40F",
              },
              {
                icon: Zap,
                title: "선수 행동",
                desc: "행동력으로 훈련·휴식·이벤트",
                color: "#B44FD8",
              },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="bg-card border border-border rounded-lg md:rounded-xl p-4 md:p-5 text-left card-hover"
              >
                <div
                  className="w-8 md:w-10 h-8 md:h-10 rounded-lg flex items-center justify-center mb-2 md:mb-3"
                  style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}
                >
                  <Icon className="w-4 md:w-5 h-4 md:h-5" style={{ color }} />
                </div>
                <h3 className="font-semibold text-foreground mb-1 text-sm md:text-base">{title}</h3>
                <p className="text-xs md:text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          {/* CTA 버튼 */}
          <div className="flex flex-col items-center gap-3 md:gap-4 w-full max-w-sm">
            <Button
              size="lg"
              className="w-full px-6 md:px-10 py-5 md:py-6 text-sm md:text-base font-bold glow-blue"
              onClick={() => window.location.href = getLoginUrl()}
            >
              <Sword className="w-4 md:w-5 h-4 md:h-5 mr-2" />
              지금 시작하기
            </Button>
            <p className="text-xs text-muted-foreground">
              {getLoginUrl() === "/login" ? "아이디로 로그인하거나 회원가입하여 시작하세요" : "Manus 계정으로 로그인하여 시작하세요"}
            </p>
          </div>
        </div>

        {/* 종족 배너 */}
        <div className="border-t border-border/50 py-4 md:py-6 px-4">
          <div className="flex items-center justify-center gap-4 md:gap-8 lg:gap-16 flex-wrap">
            {[
              { name: "테란", color: "#4A9EFF", desc: "인류의 수호자" },
              { name: "저그", color: "#B44FD8", desc: "군집의 지배자" },
              { name: "프로토스", color: "#F1C40F", desc: "고대의 전사" },
            ].map(({ name, color, desc }) => (
              <div key={name} className="text-center">
                <div className="text-base md:text-lg font-bold" style={{ color }}>{name}</div>
                <div className="text-xs md:text-sm text-muted-foreground">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
