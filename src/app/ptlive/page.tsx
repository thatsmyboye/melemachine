"use client";
import { useEffect, useState } from "react";

interface Game {
  matchup: string;
  status: string;
  awayProbable: string | null;
  homeProbable: string | null;
}
interface ActualRec {
  name: string;
  position: string;
  ovr: number;
  active: boolean;
  isPitcher: boolean;
  pointsToday: number | null;
  played: boolean;
}
interface ProjRec {
  name: string;
  cardPos: string;
  ovr: number;
  active: boolean;
  role: "hitter" | "starter" | "reliever";
  opponent: string;
  projectedPP: number | null;
  confidence: "high" | "medium" | "low" | null;
  detail: string;
  matchupMult: number | null;
  startsToday: boolean;
  flag: "rp-start" | null;
}

type Mode = "projected" | "actual" | "roster";

// ── Roster types ──────────────────────────────────────────────────────────────

interface RosterSlot {
  key: string;
  label: string;
  type: "hitter" | "starter" | "reliever";
  pos: string | null; // required position, null = any
  card: ProjRec | null;
}

interface RosterConfig {
  hasDH: boolean;
  maxP: number;
  maxD: number;
  maxG: number;
}

const DEFAULT_ROSTER_CONFIG: RosterConfig = { hasDH: true, maxP: 2, maxD: 3, maxG: 4 };

function byPP(a: ProjRec, b: ProjRec): number {
  return (b.projectedPP ?? -Infinity) - (a.projectedPP ?? -Infinity);
}

function buildRoster(players: ProjRec[], cfg: RosterConfig): RosterSlot[] {
  const slots: RosterSlot[] = [
    { key: "C", label: "C", type: "hitter", pos: "C", card: null },
    { key: "1B", label: "1B", type: "hitter", pos: "1B", card: null },
    { key: "2B", label: "2B", type: "hitter", pos: "2B", card: null },
    { key: "3B", label: "3B", type: "hitter", pos: "3B", card: null },
    { key: "SS", label: "SS", type: "hitter", pos: "SS", card: null },
    { key: "LF", label: "LF", type: "hitter", pos: "LF", card: null },
    { key: "CF", label: "CF", type: "hitter", pos: "CF", card: null },
    { key: "RF", label: "RF", type: "hitter", pos: "RF", card: null },
    ...(cfg.hasDH
      ? [{ key: "DH", label: "DH", type: "hitter" as const, pos: null, card: null }]
      : []),
    { key: "UTIL1", label: "UTIL", type: "hitter", pos: null, card: null },
    { key: "UTIL2", label: "UTIL", type: "hitter", pos: null, card: null },
    { key: "SP1", label: "SP", type: "starter", pos: null, card: null },
    { key: "SP2", label: "SP", type: "starter", pos: null, card: null },
    { key: "RP1", label: "RP", type: "reliever", pos: null, card: null },
    { key: "RP2", label: "RP", type: "reliever", pos: null, card: null },
  ];

  const used = new Set<string>();

  const hitters = [...players].filter((p) => p.role === "hitter").sort(byPP);
  const starters = [...players].filter((p) => p.role === "starter").sort(byPP);
  const relievers = [...players].filter((p) => p.role === "reliever").sort(byPP);

  // 1. Fill required positional slots
  for (const slot of slots) {
    if (slot.type !== "hitter" || slot.pos === null) continue;
    const best = hitters.find(
      (h) => !used.has(h.name) && (h.cardPos === slot.pos || (slot.pos === "DH" && h.cardPos === "DH"))
    );
    if (best) {
      slot.card = best;
      used.add(best.name);
    }
  }

  // 2. Fill DH + UTIL with best remaining hitters
  for (const slot of slots) {
    if (slot.type !== "hitter" || slot.pos !== null || slot.card !== null) continue;
    const best = hitters.find((h) => !used.has(h.name));
    if (best) {
      slot.card = best;
      used.add(best.name);
    }
  }

  // 3. Fill SP slots
  for (const slot of slots) {
    if (slot.type !== "starter") continue;
    const best = starters.find((s) => !used.has(s.name));
    if (best) {
      slot.card = best;
      used.add(best.name);
    }
  }

  // 4. Fill RP slots
  for (const slot of slots) {
    if (slot.type !== "reliever") continue;
    const best = relievers.find((r) => !used.has(r.name));
    if (best) {
      slot.card = best;
      used.add(best.name);
    }
  }

  return slots;
}

function countTiers(slots: RosterSlot[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of slots) {
    if (!s.card) continue;
    const t = tierFromOvr(s.card.ovr);
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

function tierViolations(slots: RosterSlot[], cfg: RosterConfig): string[] {
  const t = countTiers(slots);
  const p = t["Perfect"] ?? 0;
  const d = t["Diamond"] ?? 0;
  const g = t["Gold"] ?? 0;
  const msgs: string[] = [];
  if (p > cfg.maxP) msgs.push(`${p} Perfect cards (max ${cfg.maxP})`);
  if (p + d > cfg.maxP + cfg.maxD) msgs.push(`${p + d} Perfect+Diamond (max ${cfg.maxP + cfg.maxD})`);
  if (p + d + g > cfg.maxP + cfg.maxD + cfg.maxG)
    msgs.push(`${p + d + g} Perfect+Diamond+Gold (max ${cfg.maxP + cfg.maxD + cfg.maxG})`);
  return msgs;
}

const CONF_COLOR: Record<string, string> = {
  high: "#4ade80",
  medium: "#e3b341",
  low: "#8a8f98",
};

const TIER_COLORS: Record<string, string> = {
  Iron: "#8a8f98",
  Bronze: "#b87333",
  Silver: "#c0c5ce",
  Gold: "#e3b341",
  Diamond: "#5ad1e6",
  Perfect: "#c084fc",
};

function tierFromOvr(ovr: number): string {
  if (ovr >= 100) return "Perfect";
  if (ovr >= 90) return "Diamond";
  if (ovr >= 80) return "Gold";
  if (ovr >= 70) return "Silver";
  if (ovr >= 60) return "Bronze";
  return "Iron";
}

function tierColor(ovr: number): string {
  return TIER_COLORS[tierFromOvr(ovr)] ?? "#e5e7eb";
}

export default function PTLivePage() {
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<Mode>("projected");
  const [games, setGames] = useState<Game[]>([]);
  const [actual, setActual] = useState<ActualRec[]>([]);
  const [proj, setProj] = useState<ProjRec[]>([]);
  const [projNote, setProjNote] = useState("");
  const [liveCount, setLiveCount] = useState(0);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingTable, setLoadingTable] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rosterCfg, setRosterCfg] = useState<RosterConfig>(DEFAULT_ROSTER_CONFIG);

  const loadGames = (d?: string) => {
    setLoadingGames(true);
    const q = d ? `?date=${d}&stats=0` : "?stats=0";
    fetch(`/api/ptlive${q}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) setErr(res.error);
        setGames(res.games || []);
        setLiveCount(res.liveCardCount || 0);
        setDate(res.date);
      })
      .finally(() => setLoadingGames(false));
  };

  const loadTable = (m: Mode, d: string) => {
    setLoadingTable(true);
    setErr(null);
    if (m === "actual") {
      fetch(`/api/ptlive?date=${d}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.error) setErr(res.error);
          setActual(res.recommendations || []);
        })
        .finally(() => setLoadingTable(false));
    } else {
      fetch(`/api/ptlive/projections?date=${d}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.error) setErr(res.error);
          setProj(res.recommendations || []);
          setProjNote(res.note || "");
        })
        .finally(() => setLoadingTable(false));
    }
  };

  // initial: resolve today's date via games endpoint, then load table.
  useEffect(() => {
    setLoadingGames(true);
    fetch(`/api/ptlive?stats=0`)
      .then((r) => r.json())
      .then((res) => {
        setGames(res.games || []);
        setLiveCount(res.liveCardCount || 0);
        setDate(res.date);
        loadTable("projected", res.date);
      })
      .finally(() => setLoadingGames(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => {
    if (!date) return;
    loadGames(date);
    loadTable(mode, date);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    if (date) loadTable(m, date);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">PT Live</h1>
          <p className="text-sm text-gray-400">
            Your Live cards ranked for real MLB action. Projections use each
            player&apos;s 2026 season form adjusted for today&apos;s matchup.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-edge bg-ink px-2 py-1.5 text-sm"
          />
          <button
            onClick={reload}
            className="rounded-md border border-accent bg-accent/15 text-accent px-3 py-1.5 text-sm"
          >
            Load
          </button>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-edge overflow-hidden text-sm">
        <button
          onClick={() => switchMode("projected")}
          className={`px-4 py-1.5 ${
            mode === "projected"
              ? "bg-accent/15 text-accent"
              : "text-gray-400 hover:bg-panel2"
          }`}
        >
          Projected (pre-game)
        </button>
        <button
          onClick={() => switchMode("actual")}
          className={`px-4 py-1.5 border-l border-edge ${
            mode === "actual"
              ? "bg-accent/15 text-accent"
              : "text-gray-400 hover:bg-panel2"
          }`}
        >
          Actual PP
        </button>
        <button
          onClick={() => {
            setMode("roster");
            if (date && proj.length === 0) loadTable("projected", date);
          }}
          className={`px-4 py-1.5 border-l border-edge ${
            mode === "roster"
              ? "bg-accent/15 text-accent"
              : "text-gray-400 hover:bg-panel2"
          }`}
        >
          Roster Builder
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {err}
        </div>
      )}

      {mode === "projected" && projNote && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-xs text-gray-300">
          {projNote}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        <div>
          <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-2">
            {mode === "projected"
              ? "Projected starts"
              : mode === "roster"
                ? "Optimal roster"
                : "Results"}{" "}
            · {liveCount} Live cards owned
          </h2>

          {mode === "roster" ? (
            loadingTable ? (
              <div className="text-gray-400 py-8">
                Building projections for roster assembly…
              </div>
            ) : (
              <RosterBuilder
                proj={proj}
                cfg={rosterCfg}
                setCfg={setRosterCfg}
              />
            )
          ) : loadingTable ? (
            <div className="text-gray-400 py-8">
              {mode === "projected"
                ? "Building projections (matching rosters, pulling season stats)…"
                : "Loading results…"}
            </div>
          ) : mode === "projected" ? (
            <ProjTable rows={proj} />
          ) : (
            <ActualTable rows={actual} />
          )}
        </div>

        <div>
          <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-2">
            Today&apos;s games
          </h2>
          {loadingGames ? (
            <div className="text-gray-500 text-sm">Loading slate…</div>
          ) : (
            <div className="space-y-1.5">
              {games.length === 0 && (
                <div className="text-gray-500 text-sm">
                  No games scheduled for {date}.
                </div>
              )}
              {games.map((g, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-edge bg-panel px-3 py-2 text-sm"
                >
                  <div className="flex justify-between">
                    <span className="text-gray-100">{g.matchup}</span>
                    <span className="text-[11px] text-gray-500">{g.status}</span>
                  </div>
                  {(g.awayProbable || g.homeProbable) && (
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      SP: {g.awayProbable ?? "TBD"} vs {g.homeProbable ?? "TBD"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Roster Builder ────────────────────────────────────────────────────────────

function RosterBuilder({
  proj,
  cfg,
  setCfg,
}: {
  proj: ProjRec[];
  cfg: RosterConfig;
  setCfg: (c: RosterConfig) => void;
}) {
  const slots = buildRoster(proj, cfg);
  const violations = tierViolations(slots, cfg);
  const tiers = countTiers(slots);
  const projTotal = slots.reduce((s, sl) => s + (sl.card?.projectedPP ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Config bar */}
      <div className="rounded-lg border border-edge bg-panel px-4 py-3 flex flex-wrap gap-4 items-center text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-[11px] uppercase tracking-wide">DH</span>
          <button
            onClick={() => setCfg({ ...cfg, hasDH: !cfg.hasDH })}
            className={`px-2 py-0.5 rounded text-xs border ${
              cfg.hasDH ? "border-accent text-accent" : "border-edge text-gray-400"
            }`}
          >
            {cfg.hasDH ? "Yes" : "No DH"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-[11px]">Max tier slots:</span>
          {(["maxP", "maxD", "maxG"] as const).map((k, i) => (
            <label key={k} className="flex items-center gap-1 text-[11px]">
              <span className="text-gray-500">{["P", "D", "G"][i]}</span>
              <input
                type="number"
                min={0}
                max={15}
                value={cfg[k]}
                onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })}
                className="w-10 rounded border border-edge bg-ink px-1 py-0.5 text-center text-xs"
              />
            </label>
          ))}
        </div>
        <div className="ml-auto text-xs text-gray-400">
          Proj total:{" "}
          <span className="font-bold text-accent tabular-nums">
            {projTotal.toFixed(1)} PP
          </span>
        </div>
      </div>

      {violations.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 space-y-0.5">
          <div className="font-semibold mb-1">Tier limit violations:</div>
          {violations.map((v) => (
            <div key={v}>• {v}</div>
          ))}
        </div>
      )}

      {/* Tier usage summary */}
      <div className="flex gap-3 text-[11px] text-gray-400 flex-wrap">
        {(["Perfect", "Diamond", "Gold", "Silver", "Bronze", "Iron"] as const).map((t) => {
          const count = tiers[t] ?? 0;
          if (count === 0) return null;
          return (
            <span key={t} style={{ color: TIER_COLORS[t] }}>
              {count} {t}
            </span>
          );
        })}
      </div>

      {/* Roster grid */}
      <div className="space-y-1.5">
        {slots.map((slot) => (
          <RosterSlotRow key={slot.key} slot={slot} />
        ))}
      </div>

      <p className="text-[11px] text-gray-500">
        Algorithm: fills each positional slot with the highest projected-PP Live card at that position, then fills UTIL/DH/SP/RP with the remaining top scorers. Cards without a matchup today (PP = —) are deprioritized. Ohtani (SP card eligible at DH/UTIL) may need manual swap.
      </p>
    </div>
  );
}

function RosterSlotRow({ slot }: { slot: RosterSlot }) {
  const isEmpty = slot.card === null;
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
        isEmpty ? "border-edge/50 bg-panel/40" : "border-edge bg-panel"
      }`}
    >
      <span className="w-10 shrink-0 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
        {slot.label}
      </span>
      {isEmpty ? (
        <span className="text-gray-600 text-[11px]">— no eligible card</span>
      ) : (
        <>
          <span
            style={{ color: tierColor(slot.card!.ovr) }}
            className="font-medium flex-1 leading-tight"
          >
            {slot.card!.name}
          </span>
          <span className="text-[10px] text-gray-500 hidden sm:block">
            {slot.card!.cardPos}
          </span>
          <span className="text-[11px] tabular-nums">
            {slot.card!.projectedPP != null ? (
              <span
                style={{
                  color: CONF_COLOR[slot.card!.confidence || "low"],
                }}
                className="font-bold"
              >
                {slot.card!.projectedPP} PP
              </span>
            ) : (
              <span className="text-gray-600">— PP</span>
            )}
          </span>
          {slot.card!.active && (
            <span className="text-[9px] text-green-400 font-bold shrink-0">
              ACTIVE
            </span>
          )}
        </>
      )}
    </div>
  );
}

function RoleTag({ role }: { role: string }) {
  const label = role === "starter" ? "SP" : role === "reliever" ? "RP" : "HIT";
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border border-edge text-gray-400">
      {label}
    </span>
  );
}

// Highlights a bullpen-labeled card that is actually today's probable starter
// — a guaranteed appearance, so higher floor than its role suggests.
function StartsBadge() {
  return (
    <span
      className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
      style={{ color: "#0b0e14", background: "#e3b341" }}
      title="Bullpen card listed as today's probable starter — guaranteed appearance"
    >
      ▲ Starting
    </span>
  );
}

function ProjTable({ rows }: { rows: ProjRec[] }) {
  if (!rows.length)
    return <div className="text-gray-500 py-8">No projections available.</div>;

  const hitters = rows.filter((r) => r.role === "hitter");
  const pitchers = rows.filter((r) => r.role !== "hitter");

  const thead = (
    <thead className="bg-panel2 text-gray-400 text-xs uppercase">
      <tr>
        <th className="text-left px-3 py-2 font-medium">#</th>
        <th className="text-left px-3 py-2 font-medium">Player</th>
        <th className="text-left px-2 py-2 font-medium">Role</th>
        <th className="text-left px-2 py-2 font-medium hidden md:table-cell">
          Matchup
        </th>
        <th className="text-right px-2 py-2 font-medium">Proj PP</th>
        <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">
          Basis
        </th>
      </tr>
    </thead>
  );

  const renderRows = (group: ProjRec[], offset: number) =>
    group.map((x, i) => (
      <tr key={`${x.name}-${i}`} className="border-t border-edge hover:bg-panel2/50">
        <td className="px-3 py-2 text-gray-500 tabular-nums">{offset + i + 1}</td>
        <td className="px-3 py-2">
          <span style={{ color: tierColor(x.ovr) }} className="font-medium">
            {x.name}
          </span>
          {x.flag === "rp-start" && <StartsBadge />}
          {x.active && (
            <span className="ml-2 text-[9px] text-green-400 font-bold">
              ACTIVE
            </span>
          )}
        </td>
        <td className="px-2 py-2">
          <RoleTag role={x.role} />
        </td>
        <td className="px-2 py-2 hidden md:table-cell text-[11px] text-gray-400">
          vs {x.opponent}
          {x.matchupMult != null && (
            <span
              className={`ml-1.5 ${
                x.matchupMult > 1.03
                  ? "text-green-400"
                  : x.matchupMult < 0.97
                    ? "text-red-400"
                    : "text-gray-500"
              }`}
            >
              ×{x.matchupMult}
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums font-bold">
          {x.projectedPP == null ? (
            <span className="text-gray-600">—</span>
          ) : (
            <span style={{ color: CONF_COLOR[x.confidence || "low"] }}>
              {x.projectedPP}
            </span>
          )}
        </td>
        <td className="px-3 py-2 hidden lg:table-cell text-[11px] text-gray-500">
          {x.detail}
        </td>
      </tr>
    ));

  return (
    <div className="space-y-4">
      {hitters.length > 0 && (
        <div className="rounded-xl border border-edge overflow-hidden">
          <div className="bg-panel2/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 border-b border-edge">
            Hitters
          </div>
          <table className="w-full text-sm">
            {thead}
            <tbody>{renderRows(hitters, 0)}</tbody>
          </table>
        </div>
      )}

      {pitchers.length > 0 && (
        <div className="rounded-xl border border-edge overflow-hidden">
          <div className="bg-panel2/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 border-b border-edge">
            Pitchers
          </div>
          <table className="w-full text-sm">
            {thead}
            <tbody>{renderRows(pitchers, 0)}</tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-edge bg-panel2/40 px-3 py-2 text-[11px] text-gray-500 flex flex-wrap gap-4">
        <span>
          <span style={{ color: CONF_COLOR.high }}>●</span> high
        </span>
        <span>
          <span style={{ color: CONF_COLOR.medium }}>●</span> medium (lineup not
          posted)
        </span>
        <span>
          <span style={{ color: CONF_COLOR.low }}>●</span> low (reliever)
        </span>
        <span className="text-gray-400">
          <span style={{ color: "#e3b341" }}>▲ Starting</span> = bullpen card
          starting today (guaranteed appearance)
        </span>
      </div>
    </div>
  );
}

function ActualTable({ rows }: { rows: ActualRec[] }) {
  const hitters = rows.filter((r) => !r.isPitcher);
  const pitchers = rows.filter((r) => r.isPitcher);

  const thead = (
    <thead className="bg-panel2 text-gray-400 text-xs uppercase">
      <tr>
        <th className="text-left px-3 py-2 font-medium">#</th>
        <th className="text-left px-3 py-2 font-medium">Player</th>
        <th className="text-left px-2 py-2 font-medium">Pos</th>
        <th className="text-right px-2 py-2 font-medium">OVR</th>
        <th className="text-right px-3 py-2 font-medium">PP today</th>
      </tr>
    </thead>
  );

  const renderRows = (group: ActualRec[]) =>
    group.map((r, i) => (
      <tr key={`${r.name}-${i}`} className="border-t border-edge hover:bg-panel2/50">
        <td className="px-3 py-2 text-gray-500 tabular-nums">{i + 1}</td>
        <td className="px-3 py-2">
          <span style={{ color: tierColor(r.ovr) }} className="font-medium">
            {r.name}
          </span>
          {r.active && (
            <span className="ml-2 text-[9px] text-green-400 font-bold">
              ACTIVE
            </span>
          )}
        </td>
        <td className="px-2 py-2 text-gray-300">{r.position}</td>
        <td className="px-2 py-2 text-right tabular-nums text-gray-300">
          {r.ovr}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {r.played ? (
            <span className="text-accent font-bold">{r.pointsToday}</span>
          ) : (
            <span className="text-gray-600">—</span>
          )}
        </td>
      </tr>
    ));

  if (!hitters.length && !pitchers.length)
    return <div className="text-gray-500 py-8">No results available.</div>;

  return (
    <div className="space-y-4">
      {hitters.length > 0 && (
        <div className="rounded-xl border border-edge overflow-hidden">
          <div className="bg-panel2/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 border-b border-edge">
            Hitters
          </div>
          <table className="w-full text-sm">
            {thead}
            <tbody>{renderRows(hitters)}</tbody>
          </table>
        </div>
      )}
      {pitchers.length > 0 && (
        <div className="rounded-xl border border-edge overflow-hidden">
          <div className="bg-panel2/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 border-b border-edge">
            Pitchers
          </div>
          <table className="w-full text-sm">
            {thead}
            <tbody>{renderRows(pitchers)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
