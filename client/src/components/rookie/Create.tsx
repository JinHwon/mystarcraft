/**
 * 선수 만들기: 사진 · 이름 · 종족 · 컨셉 · 능력치 주사위
 */
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { STAT_KEYS, STAT_LABELS } from "@shared/gameConstants";
import { CONCEPTS, RACE_NAMES, rollStats, sumStats, type Concept } from "@shared/rookie/model";
import type { Race } from "@shared/career/rules";
import { LegacyRadar, PlayerPhoto } from "@/components/legacy/Legacy";
import { useRookieSync } from "@/lib/rookie";

/** 올린 사진을 96×100 으로 줄여 data URL 로 */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 96; c.height = 100;
      const g = c.getContext("2d")!;
      const r = Math.max(96 / img.width, 100 / img.height);
      const w = img.width * r, h = img.height * r;
      g.drawImage(img, (96 - w) / 2, (100 - h) / 2, w, h);
      resolve(c.toDataURL("image/jpeg", 0.82));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function RookieCreate({ replace, onCancel }: { replace?: boolean; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [race, setRace] = useState<Race>("terran");
  const [concept, setConcept] = useState<Concept>("balance");
  const [stats, setStats] = useState(() => rollStats("balance"));
  const [rolls, setRolls] = useState(0);
  const [photo, setPhoto] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const sync = useRookieSync();
  const create = trpc.rookie.create.useMutation(sync);
  const roll = (c = concept) => { setStats(rollStats(c)); setRolls(n => n + 1); };
  const total = sumStats(stats);
  return (
    <div className="p-4 space-y-3 max-w-lg mx-auto">
      <div className="text-center">
        <div className="text-xl font-black text-foreground">🎮 선수 키우기</div>
        <div className="text-xs text-muted-foreground">아마추어에서 시작해 커리지 매치 · 드래프트를 거쳐 프로게이머가 되어 보세요</div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-3.5 flex gap-3 items-center">
        <button onClick={() => fileRef.current?.click()} className="shrink-0" title="사진 올리기">
          <PlayerPhoto id={-1} name={name || "선수"} size={72} src={photo} />
          <div className="text-[10px] text-primary mt-0.5">사진 올리기</div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) setPhoto(await shrink(f)); }} />
        <div className="flex-1 space-y-1.5">
          <input value={name} onChange={e => setName(e.target.value.slice(0, 10))} placeholder="선수 이름 (2~10자)"
            className="w-full rounded-xl bg-muted border border-border px-3 py-2 text-sm text-foreground" />
          <div className="grid grid-cols-3 gap-1">
            {(["terran", "zerg", "protoss"] as Race[]).map(r => (
              <button key={r} onClick={() => setRace(r)} className={cn("rounded-lg py-1.5 text-xs font-bold border", race === r ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border text-foreground")}>{RACE_NAMES[r]}</button>
            ))}
          </div>
          {photo && <button onClick={() => setPhoto(undefined)} className="text-[10px] text-muted-foreground underline">사진 지우기</button>}
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-3.5 space-y-2">
        <div className="text-sm font-bold text-foreground">플레이 스타일</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(CONCEPTS) as Concept[]).map(c => (
            <button key={c} onClick={() => { setConcept(c); roll(c); }} className={cn("rounded-xl px-1.5 py-2 text-left border", concept === c ? "bg-primary/20 border-primary" : "bg-muted/40 border-border")}>
              <div className="text-xs font-black text-foreground">{CONCEPTS[c].name}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{CONCEPTS[c].desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-black border border-neutral-700 p-3 text-white">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">능력치 <span className="text-xs text-neutral-400">합 {total.toLocaleString()}</span></span>
          <button onClick={() => roll()} className="rounded-xl bg-amber-500 text-black font-black text-sm px-3 py-1.5 active:scale-95">🎲 주사위 ({rolls})</button>
        </div>
        <div className="flex items-center gap-2">
          <LegacyRadar stats={stats} level={1} size={150} />
          <div className="flex-1 grid grid-cols-1 gap-y-0.5 text-[12px]">
            {STAT_KEYS.map(k => (
              <div key={k} className="flex justify-between border-b border-neutral-800 py-0.5"><span className="text-neutral-400">{STAT_LABELS[k]}</span><b>{stats[k]}</b></div>
            ))}
          </div>
        </div>
        <div className="text-[10.5px] text-neutral-500">주사위는 몇 번이든 굴릴 수 있습니다. 컨셉에 맞는 능력치가 조금 더 높게 나옵니다</div>
      </div>

      <button disabled={create.isPending || name.trim().length < 2} onClick={() => create.mutate({ name, race, concept, stats, photo, replace })}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black disabled:opacity-50">
        {create.isPending ? "만드는 중..." : "이 선수로 시작하기"}
      </button>
      {onCancel && <button onClick={onCancel} className="w-full py-2 text-sm text-muted-foreground">취소</button>}
    </div>
  );
}
