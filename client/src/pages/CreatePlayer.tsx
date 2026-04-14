import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, Sword, User, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const RACES = [
  {
    id: "terran" as const,
    label: "테란",
    desc: "인류의 수호자. 강력한 기계 병기와 전술로 전장을 지배한다.",
    color: "#4A9EFF",
    bgColor: "rgba(74, 158, 255, 0.08)",
    borderColor: "rgba(74, 158, 255, 0.4)",
    emoji: "🚀",
  },
  {
    id: "zerg" as const,
    label: "저그",
    desc: "군집의 지배자. 압도적인 물량과 생체 유닛으로 적을 압도한다.",
    color: "#B44FD8",
    bgColor: "rgba(180, 79, 216, 0.08)",
    borderColor: "rgba(180, 79, 216, 0.4)",
    emoji: "🦂",
  },
  {
    id: "protoss" as const,
    label: "프로토스",
    desc: "고대의 전사. 첨단 기술과 사이오닉 능력으로 전장을 제압한다.",
    color: "#F1C40F",
    bgColor: "rgba(241, 196, 15, 0.08)",
    borderColor: "rgba(241, 196, 15, 0.4)",
    emoji: "💎",
  },
];

export default function CreatePlayer() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [race, setRace] = useState<"terran" | "zerg" | "protoss" | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState("image/jpeg");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: existingPlayer, isLoading: playerLoading } = trpc.player.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createMutation = trpc.player.create.useMutation({
    onSuccess: async ({ playerId }) => {
      // 사진 업로드
      if (photoBase64) {
        try {
          await uploadPhotoMutation.mutateAsync({ base64: photoBase64, mimeType: photoMime });
        } catch {
          // 사진 업로드 실패해도 계속 진행
        }
      }
      await utils.player.get.invalidate();
      toast.success("선수가 생성되었습니다!");
      navigate("/profile");
    },
    onError: (err) => {
      toast.error(err.message ?? "선수 생성에 실패했습니다");
    },
  });

  const uploadPhotoMutation = trpc.player.uploadPhoto.useMutation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isAuthenticated]);

  useEffect(() => {
    if (!loading && !playerLoading && existingPlayer) {
      navigate("/profile");
    }
  }, [loading, playerLoading, existingPlayer]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("파일 크기는 5MB 이하여야 합니다");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPhotoPreview(result);
      // base64 추출 (data:image/xxx;base64, 제거)
      const base64 = result.split(",")[1] ?? "";
      setPhotoBase64(base64);
      setPhotoMime(file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = () => {
    if (!name.trim()) { toast.error("선수 이름을 입력해주세요"); return; }
    if (!race) { toast.error("종족을 선택해주세요"); return; }
    createMutation.mutate({ name: name.trim(), race });
  };

  if (loading || playerLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedRace = RACES.find((r) => r.id === race);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* 배경 */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: "linear-gradient(oklch(0.25 0.02 240 / 0.3) 1px, transparent 1px), linear-gradient(90deg, oklch(0.25 0.02 240 / 0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }}
      />
      {selectedRace && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-3xl pointer-events-none transition-all duration-700"
          style={{ background: `${selectedRace.color}08` }}
        />
      )}

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
        {/* 헤더 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-full px-4 py-1.5 text-xs font-medium text-primary mb-4">
            <Sword className="w-3 h-3" />
            선수 생성
          </div>
          <h1 className="text-3xl font-black text-foreground">나만의 선수를 만들어라</h1>
          <p className="text-muted-foreground mt-2 text-sm">종족을 선택하고 선수 정보를 입력하세요</p>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="flex items-center gap-3 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                step > s ? "bg-primary text-primary-foreground" :
                step === s ? "bg-primary/20 border-2 border-primary text-primary" :
                "bg-muted text-muted-foreground"
              )}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={cn("w-12 h-0.5 transition-all", step > s ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>

        <div className="w-full max-w-2xl">
          {/* 스텝 1: 종족 선택 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-foreground text-center mb-6">종족을 선택하세요</h2>
              <div className="grid grid-cols-1 gap-4">
                {RACES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRace(r.id)}
                    className={cn(
                      "relative flex items-center gap-5 p-5 rounded-xl border-2 text-left transition-all card-hover",
                      race === r.id
                        ? "border-2"
                        : "border-border bg-card hover:border-border/80"
                    )}
                    style={race === r.id ? {
                      borderColor: r.color,
                      backgroundColor: r.bgColor,
                      boxShadow: `0 0 20px ${r.color}20`
                    } : {}}
                  >
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
                      style={{ backgroundColor: r.bgColor, border: `1px solid ${r.borderColor}` }}
                    >
                      {r.emoji}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg" style={{ color: race === r.id ? r.color : undefined }}>
                          {r.label}
                        </span>
                        {race === r.id && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: r.bgColor, color: r.color, border: `1px solid ${r.borderColor}` }}>
                            선택됨
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{r.desc}</p>
                    </div>
                    {race === r.id && (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: r.color }}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <Button
                className="w-full mt-6 py-6 font-bold"
                disabled={!race}
                onClick={() => setStep(2)}
              >
                다음 단계 <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* 스텝 2: 이름 입력 */}
          {step === 2 && (
            <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
              <h2 className="text-lg font-bold text-foreground text-center">선수 이름을 입력하세요</h2>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-foreground">
                  선수 이름 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="선수 이름 (최대 20자)"
                  maxLength={20}
                  className="bg-input border-border text-foreground placeholder:text-muted-foreground h-12 text-base"
                  onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep(3)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-right">{name.length}/20</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 py-6" onClick={() => setStep(1)}>
                  이전
                </Button>
                <Button
                  className="flex-1 py-6 font-bold"
                  disabled={!name.trim()}
                  onClick={() => setStep(3)}
                >
                  다음 단계 <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* 스텝 3: 사진 업로드 + 최종 확인 */}
          {step === 3 && (
            <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
              <h2 className="text-lg font-bold text-foreground text-center">선수 사진 등록 (선택)</h2>

              {/* 사진 업로드 */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-32 h-32 rounded-full overflow-hidden border-2 cursor-pointer relative group"
                  style={{ borderColor: selectedRace?.color ?? "#4A9EFF" }}
                  onClick={() => fileRef.current?.click()}
                >
                  {photoPreview ? (
                    <>
                      <img src={photoPreview} alt="미리보기" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera className="w-6 h-6 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full bg-muted flex flex-col items-center justify-center gap-2 group-hover:bg-accent transition-colors">
                      <Camera className="w-8 h-8 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">사진 추가</span>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <p className="text-xs text-muted-foreground">JPG, PNG, GIF · 최대 5MB</p>
              </div>

              {/* 요약 카드 */}
              <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">선수 정보 확인</h3>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border shrink-0"
                    style={{ borderColor: selectedRace?.color }}>
                    {photoPreview ? (
                      <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{name}</p>
                    <p className="text-sm font-medium" style={{ color: selectedRace?.color }}>
                      {selectedRace?.emoji} {selectedRace?.label}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 py-6" onClick={() => setStep(2)}>
                  이전
                </Button>
                <Button
                  className="flex-1 py-6 font-bold glow-blue"
                  onClick={handleCreate}
                  disabled={createMutation.isPending || uploadPhotoMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <Sword className="w-4 h-4 mr-2" />
                  )}
                  선수 생성 완료
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
