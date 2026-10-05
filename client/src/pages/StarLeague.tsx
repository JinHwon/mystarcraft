/**
 * 마이스타리그 (원작 화면 방식): PC방 예선 → 듀얼 토너먼트 → 조 지명식 → 32강 → 16강 → 8강 → 4강 → 결승
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { INDIV_SHORT, stageWeek, type CareerState, type CPlayer, type MslGroup, type MslSeries, type MslStage, type MslState } from "@shared/career/rules";
import { LeagueLogo } from "@/components/legacy/match/msl";
import { useCareer } from "@/lib/career";
import { LegacyFrame, LegacyImg, PlayerPhoto } from "@/components/legacy/Legacy";

const R = { terran: "T", zerg: "Z", protoss: "P" } as const;
type Tab = "pc" | "dual" | "nom" | "group" | "ro16" | "ro8" | "ro4" | "final";
const TABS: Array<[Tab, string]> = [["pc", "PC방"], ["dual", "듀얼"], ["nom", "지명식"], ["group", "32강"], ["ro16", "16강"], ["ro8", "8강"], ["ro4", "4강"], ["final", "결승"]];
const ORDER: MslStage[] = ["pc", "dual", "nom", "group", "ro16", "ro8", "ro4", "final", "done"];
const GAME_LABELS = ["< 1 경기 >", "< 2 경기 >", "< 승자전 >", "< 패자전 >", "< 최종전 >"];

/** 단계가 끝났는지 */
const passed = (m: MslState, st: MslStage) => ORDER.indexOf(m.stage) > ORDER.indexOf(st);

function Title({ children, logo }: { children: string; logo?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 my-2">
      {logo && <LegacyImg dir="로고" name={logo} className="max-h-12 object-contain" fallback={null} />}
      <div className="text-[15px] text-neutral-100 text-center tracking-[0.35em]">{children}</div>
    </div>
  );
}

function Status({ m, st, week }: { m: MslState; st: MslStage; week?: number }) {
  const text = passed(m, st) ? "종료되었습니다" : m.stage === st ? `진행되지 않았습니다${week ? ` (${week}주차 진행)` : ""}` : "진행되지 않았습니다";
  return <div className={cn("text-center text-[12px] mb-2", passed(m, st) ? "text-[#bff5c6]" : "text-neutral-400")}>{text}</div>;
}

function Name({ s, id, strong, dim }: { s: CareerState; id: number; strong?: boolean; dim?: boolean }) {
  const p: CPlayer | undefined = s.players[id];
  if (!p) return <span className="text-neutral-500">미 정</span>;
  const mine = p.team === s.myTeam;
  return (
    <span className={cn("whitespace-nowrap", dim && "text-neutral-500", strong && "text-[#ffe45c]", mine && !dim && "underline decoration-[#8fd0ff] underline-offset-2")}>
      {p.name} ({R[p.race]})<span className="text-[9px] text-neutral-500 ml-0.5">{s.teams[p.team]?.short}</span>
    </span>
  );
}

function SeriesRow({ s, x, label }: { s: CareerState; x: MslSeries; label?: string }) {
  const done = x.winner >= 0;
  return (
    <div className="grid grid-cols-[62px_1fr_34px_1fr] items-center gap-1 text-[11.5px] py-[3px]">
      <span className="text-[10px] text-neutral-400">{label}</span>
      <span className="text-right truncate"><Name s={s} id={x.a} strong={done && x.winner === x.a} dim={done && x.winner !== x.a} /></span>
      <span className="text-center font-mono text-neutral-200">{done ? `${x.sa}:${x.sb}` : "vs"}</span>
      <span className="truncate"><Name s={s} id={x.b} strong={done && x.winner === x.b} dim={done && x.winner !== x.b} /></span>
    </div>
  );
}

/** 듀얼 방식 4인 조 */
function GroupBox({ s, g, prefix }: { s: CareerState; g: MslGroup; prefix: string }) {
  return (
    <div className="border border-neutral-600 p-2">
      <div className="text-[13px] text-[#ffe45c] mb-1">{prefix} {g.name}조</div>
      <div className="grid grid-cols-2 gap-x-2 text-[11.5px] mb-1">
        {g.players.map(id => (
          <div key={id} className="truncate"><Name s={s} id={id} strong={g.qualified.includes(id)} /></div>
        ))}
      </div>
      {g.games.map((x, i) => <SeriesRow key={i} s={s} x={x} label={GAME_LABELS[i]} />)}
      {!g.games.length && <div className="text-[11px] text-neutral-500">진행되지 않았습니다</div>}
    </div>
  );
}

function Knockout({ s, m, round, size }: { s: CareerState; m: MslState; round: "ro16" | "ro8" | "ro4" | "final"; size: number }) {
  const stage = m.bracket.find(b => b.round === round);
  const rows: Array<MslSeries | null> = stage ? stage.series : Array.from({ length: size }, () => null);
  const bo = { ro16: 3, ro8: 3, ro4: 5, final: 5 }[round];
  return (
    <div className="space-y-1">
      <div className="text-center text-[11px] text-neutral-400 mb-1">{bo}전 {Math.ceil(bo / 2)}선승</div>
      {rows.map((x, i) => x
        ? <div key={i} className="border border-neutral-700 px-2"><SeriesRow s={s} x={x} label={`< ${i + 1} 경기 >`} /></div>
        : <div key={i} className="border border-neutral-700 px-2 py-1.5 text-[11.5px] text-neutral-500 grid grid-cols-[62px_1fr]"><span className="text-[10px]">{`< ${i + 1} 경기 >`}</span><span>미 정</span></div>)}
    </div>
  );
}

function PcTab({ s, m }: { s: CareerState; m: MslState }) {
  const dualIds = new Set(m.duals.flatMap(g => g.players));
  const mine = s.players.filter(p => p.team === s.myTeam);
  const status = (id: number) =>
    m.seeds.includes(id) ? "시드" : m.pcQualifiers.includes(id) ? "예선 통과" : dualIds.has(id) ? "듀얼 직행" : passed(m, "pc") ? "예선 탈락" : "예선 참가";
  return (
    <>
      <Title logo={m.league && m.league !== "mysl" ? undefined : "PC방"}>{m.league && m.league !== "mysl" ? `${INDIV_SHORT[m.league]} 예선 토너먼트` : "PC방 예선 토너먼트"}</Title>
      <Status m={m} st="pc" week={stageWeek(m, "pc")} />
      {passed(m, "pc") && (
        <>
          <div className="text-center text-[12px] text-neutral-300 mb-1">참가 {m.pcEntrants}명 · 단판 토너먼트</div>
          <div className="border border-neutral-600 p-2 mb-2">
            <div className="text-[13px] text-[#ffe45c] mb-1">예선 통과자 명단</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[12px]">{m.pcQualifiers.map(id => <Name key={id} s={s} id={id} />)}</div>
          </div>
        </>
      )}
      <div className="border border-neutral-600 p-2">
        <div className="text-[13px] text-[#ffe45c] mb-1">우리팀 참가 현황</div>
        {mine.map(p => (
          <div key={p.id} className="flex justify-between text-[12px] py-[1px]">
            <Name s={s} id={p.id} /><span className={cn(status(p.id) === "예선 탈락" ? "text-neutral-500" : "text-[#bff5c6]")}>{status(p.id)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function StarLeagueScreen({ s }: { s: CareerState }) {
  const [, navigate] = useLocation();
  // 이번 시즌 개인리그: 마이스타리그 + (18주 시즌이면) MSL 또는 OSL
  const second = s.msl2?.season === s.season ? s.msl2 : undefined;
  const [which, setWhich] = useState<"mysl" | "second">(() => (new URLSearchParams(window.location.search).get("league") === "second" && second ? "second" : "mysl"));
  const m = which === "second" && second ? second : s.msl;
  const league = m?.league ?? "mysl";
  const NAME = INDIV_SHORT[league];
  const LOGO = league === "mysl" ? "MySL" : undefined;
  const wk = (st: Exclude<MslStage, "done">) => (m ? stageWeek(m, st) : undefined);
  const defaultTab = (): Tab => {
    if (!m) return "pc";
    const map: Record<MslStage, Tab> = { pc: "pc", dual: "dual", nom: "nom", group: "group", ro16: "ro16", ro8: "ro8", ro4: "ro4", final: "final", done: "final" };
    return map[m.stage];
  };
  const [tab, setTab] = useState<Tab>(defaultTab);
  const i = TABS.findIndex(([k]) => k === tab);
  const next = () => setTab(TABS[(i + 1) % TABS.length][0]);

  let body: ReactNode = null;
  if (!m) {
    body = <div className="text-center text-[13px] text-neutral-400 mt-10">이번 시즌 {NAME}는 곧 시작합니다.</div>;
  } else if (tab === "pc") body = <PcTab s={s} m={m} />;
  else if (tab === "dual") {
    body = (
      <>
        <Title logo="DT">듀얼 토너먼트</Title>
        <Status m={m} st="dual" week={wk("dual")} />
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2">{m.duals.map(g => <GroupBox key={g.name} s={s} g={g} prefix="듀얼" />)}</div>
        {!m.duals.length && <div className="text-center text-[12px] text-neutral-500">PC방 예선이 끝나면 조가 편성됩니다</div>}
      </>
    );
  } else if (tab === "nom") {
    body = (
      <>
        <Title>{league === "mysl" ? `${NAME} 조 지명식` : `${NAME} 32강 조 추첨`}</Title>
        <Status m={m} st="nom" week={league === "mysl" ? wk("nom") : wk("group")} />
        <div className="border border-neutral-600 p-2 mb-2">
          <div className="text-[13px] text-[#ffe45c] mb-1">시드 선수 →</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[12px]">{m.seeds.map(id => <Name key={id} s={s} id={id} />)}</div>
        </div>
        {m.nominations.length > 0 && (
          <div className="border border-neutral-600 p-2 mb-2 space-y-0.5">
            <div className="text-[13px] text-[#ffe45c] mb-1">지명을 시작합니다</div>
            {m.nominations.map((n, k) => (
              <div key={k} className="text-[12px]"><Name s={s} id={n.by} /> <span className="text-neutral-400">선수의 지명 →</span> <Name s={s} id={n.pick} /> <span className="text-neutral-500">({n.group}조)</span></div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {m.groups.map(g => (
            <div key={g.name} className="border border-neutral-600 p-2 text-[12px]">
              <div className="text-[#ffe45c] mb-0.5">32강 {g.name}조</div>
              {g.players.map(id => <div key={id} className="truncate"><Name s={s} id={id} /></div>)}
            </div>
          ))}
        </div>
      </>
    );
  } else if (tab === "group") {
    body = (
      <>
        <Title logo={LOGO}>{`${NAME} 32강`}</Title>
        <Status m={m} st="group" week={wk("group")} />
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2">{m.groups.map(g => <GroupBox key={g.name} s={s} g={g} prefix="32강" />)}</div>
        {!m.groups.length && <div className="text-center text-[12px] text-neutral-500">{league === "mysl" ? "조 지명식 후 편성됩니다" : "듀얼 토너먼트가 끝나면 추첨으로 편성됩니다"}</div>}
      </>
    );
  } else {
    const round = tab as "ro16" | "ro8" | "ro4" | "final";
    const size = { ro16: 8, ro8: 4, ro4: 2, final: 1 }[round];
    const title = `${NAME} ${{ ro16: "16강", ro8: "8강", ro4: "4강", final: "결승" }[round]}`;
    body = (
      <>
        <Title logo={LOGO}>{title}</Title>
        <Status m={m} st={round} week={wk(round)} />
        <Knockout s={s} m={m} round={round} size={size} />
        {round === "final" && m.champion !== undefined && (
          <div className="flex flex-col items-center mt-4 gap-1">
            <LegacyImg dir="기타" name="금배지" className="max-h-10" fallback={null} />
            <PlayerPhoto id={s.players[m.champion].photoOf ?? m.champion} name={s.players[m.champion].name} titles={s.players[m.champion].titles} size={72} />
            <div className="text-[15px] text-[#ffe45c]">{s.players[m.champion].name}</div>
            <div className="text-[14px] tracking-[0.2em]">우승을 축하합니다</div>
            <div className="text-[11px] text-neutral-400">준우승 {s.players[m.runnerUp!]?.name}</div>
          </div>
        )}
      </>
    );
  }

  return (
    <LegacyFrame season={s.season} onBack={() => navigate("/league")} onNext={next} nextLabel="Next ▷▷">
      <div className="px-3 pt-2 pb-4">
        {second && (
          <div className="grid grid-cols-2 gap-1 mb-2">
            {([["mysl", s.msl], ["second", second]] as const).map(([k, x]) => (
              <button key={k} onClick={() => setWhich(k)} className={cn("border py-1 flex items-center justify-center gap-1.5", which === k ? "border-[#ffe45c] bg-neutral-900" : "border-neutral-700 opacity-70")}>
                <LeagueLogo league={x?.league ?? "mysl"} className="h-6 object-contain" />
                {k === "mysl" && <span className="text-[12px]">마이스타리그</span>}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1 mb-2">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn("text-[12px] py-1 border", tab === k ? "bg-white text-black border-white" : "text-neutral-200 border-neutral-600")}
              style={tab === k ? { background: "linear-gradient(#ffffff,#cfcfcf)" } : undefined}>
              {k === "nom" && league !== "mysl" ? "조 추첨" : label}
            </button>
          ))}
        </div>
        {body}
      </div>
    </LegacyFrame>
  );
}

export default function StarLeague() {
  const { state: s, loading } = useCareer();
  const [, navigate] = useLocation();
  if (loading) return <div className="p-6 text-muted-foreground">불러오는 중...</div>;
  if (!s) { navigate("/lobby"); return null; }
  return <StarLeagueScreen s={s} />;
}
