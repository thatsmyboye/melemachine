"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

interface PlayerResult {
  id: number;
  name: string;
  position: string;
  isPitcher: boolean;
  birthYear: number | null;
  active: boolean;
}
interface Season {
  year: number;
  team: string;
  gamesPlayed: number;
  hasHitting: boolean;
  hasPitching: boolean;
  pitchIP: number;
}

interface HitterRatings {
  contact: number; gap: number; power: number; eye: number;
  avoidK: number; babip: number; speed: number; stealing: number;
  baserunning: number; sacBunt: number; buntForHit: number;
  ifRange: number; ifError: number; ifArm: number; turnDP: number;
  ofRange: number; ofError: number; ofArm: number;
  cAbility: number; cFraming: number; cArm: number;
}
interface PitcherRatings {
  stuff: number; movement: number; control: number;
  pHR: number; pBABIP: number; stamina: number; hold: number;
}
interface ProjectedCard {
  ovr: number; tier: string; isPitcher: boolean; isStarter: boolean;
  hitter?: HitterRatings;
  hitterVL?: Partial<HitterRatings>;
  hitterVR?: Partial<HitterRatings>;
  pitcher?: PitcherRatings;
  pitcherVL?: Partial<PitcherRatings>;
  pitcherVR?: Partial<PitcherRatings>;
  leagueContextAvailable: boolean;
}
interface Comparable {
  id: number; name: string; year: number; team: string;
  ovr: number; tier: string; cardTypeName: string;
}
interface ProjectResult {
  year: number; isPitcher: boolean; position: string; playerName: string;
  card: ProjectedCard; comparables: Comparable[];
  alreadyInGame: Comparable[];
}

interface ReverseResult {
  name: string; team: string; year: number; position: string;
  projOvr: number; tier: string;
  keyStats: Record<string, string | number>;
  topRatings: Record<string, number>;
}

// ── Color helpers ─────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  Iron: "#8a8f98", Bronze: "#b87333", Silver: "#c0c5ce",
  Gold: "#e3b341", Diamond: "#5ad1e6", Perfect: "#c084fc",
};

function ratingColor(v: number): string {
  if (v >= 185) return "#4ade80";
  if (v >= 155) return "#22c55e";
  if (v >= 125) return "#84cc16";
  if (v >= 100) return "#a3e635";
  if (v >= 75) return "#eab308";
  if (v >= 55) return "#f97316";
  return "#ef4444";
}

// ── Rating bar components ─────────────────────────────────────────────────

function RatingCell({ value, dim }: { value: number | undefined; dim?: boolean }) {
  if (value === undefined) return <div className="flex items-center gap-1.5 opacity-30"><span className="text-xs w-7 text-right tabular-nums text-gray-500">—</span><div className="flex-1 h-2 bg-panel2 rounded-full" /></div>;
  const color = ratingColor(value);
  const pct = Math.min(100, (value / 250) * 100);
  return (
    <div className={`flex items-center gap-1.5 ${dim ? "opacity-60" : ""}`}>
      <span className="text-xs font-bold tabular-nums w-7 text-right" style={{ color }}>
        {value}
      </span>
      <div className="flex-1 h-2 bg-panel2 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function RatingRow({
  label, overall, vL, vR,
}: {
  label: string;
  overall: number | undefined;
  vL?: number;
  vR?: number;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr_1fr_1fr] gap-x-3 gap-y-0.5 items-center py-0.5">
      <span className="text-[11px] text-gray-400 text-right leading-tight">{label}</span>
      <RatingCell value={overall} />
      <RatingCell value={vL} dim={vL === overall} />
      <RatingCell value={vR} dim={vR === overall} />
    </div>
  );
}

// ── Tier badge ────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const c = TIER_COLORS[tier] ?? "#8a8f98";
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: c, border: `1px solid ${c}55`, background: `${c}1a` }}
    >
      {tier}
    </span>
  );
}

// ── OVR display ───────────────────────────────────────────────────────────

function OvrBox({ ovr, tier }: { ovr: number; tier: string }) {
  const c = TIER_COLORS[tier] ?? "#e3b341";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-400 uppercase tracking-wide">Overall</span>
      <span
        className="text-2xl font-black tabular-nums px-3 py-0.5 rounded"
        style={{ color: c, background: "#0b0e14", border: `1px solid ${c}33` }}
      >
        {ovr}
      </span>
      <TierBadge tier={tier} />
    </div>
  );
}

// ── Column headers ────────────────────────────────────────────────────────

function SplitHeaders({ hasVL, hasVR }: { hasVL: boolean; hasVR: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr_1fr_1fr] gap-x-3 mb-1">
      <span />
      <span className="text-[10px] uppercase tracking-wide text-gray-500 pl-9">Overall</span>
      <span className={`text-[10px] uppercase tracking-wide pl-9 ${hasVL ? "text-gray-500" : "text-gray-700"}`}>
        vs. LHP
      </span>
      <span className={`text-[10px] uppercase tracking-wide pl-9 ${hasVR ? "text-gray-500" : "text-gray-700"}`}>
        vs. RHP
      </span>
    </div>
  );
}

// ── Hitter profile ────────────────────────────────────────────────────────

function HitterProfile({ card, position }: { card: ProjectedCard; position: string }) {
  const h = card.hitter!;
  const vL = card.hitterVL;
  const vR = card.hitterVR;
  const hasVL = !!(vL && Object.keys(vL).length > 0);
  const hasVR = !!(vR && Object.keys(vR).length > 0);

  const g = (k: keyof HitterRatings) => h[k];
  const l = (k: keyof HitterRatings) => (hasVL ? vL?.[k] : undefined);
  const r = (k: keyof HitterRatings) => (hasVR ? vR?.[k] : undefined);

  const isIF = ["1B","2B","3B","SS"].includes(position.toUpperCase());
  const isOF = ["LF","CF","RF"].includes(position.toUpperCase());
  const isC = position.toUpperCase() === "C";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Panel 1 — Hitting */}
      <div className="rounded-xl border border-edge bg-panel p-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">
          Basic Batting Ratings
        </div>
        <SplitHeaders hasVL={hasVL} hasVR={hasVR} />
        <RatingRow label="Avoid K's" overall={g("avoidK")} vL={l("avoidK")} vR={r("avoidK")} />
        <RatingRow label="BABIP" overall={g("babip")} vL={l("babip")} vR={r("babip")} />
        <RatingRow label="Gap Power" overall={g("gap")} vL={l("gap")} vR={r("gap")} />
        <RatingRow label="Power" overall={g("power")} vL={l("power")} vR={r("power")} />
        <RatingRow label="Eye" overall={g("eye")} vL={l("eye")} vR={r("eye")} />
        <RatingRow label="Contact" overall={g("contact")} vL={l("contact")} vR={r("contact")} />
      </div>

      {/* Panel 2 — Summary */}
      <div className="rounded-xl border border-edge bg-panel p-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">
          Summary
        </div>
        <OvrBox ovr={card.ovr} tier={card.tier} />
        <div className="mt-3 space-y-0.5">
          <RatingRow label="Speed" overall={g("speed")} />
          <RatingRow label="Steal Tendency" overall={g("baserunning")} />
          <RatingRow label="Stealing Ability" overall={g("stealing")} />
          <RatingRow label="Baserunning" overall={g("baserunning")} />
          <RatingRow label="Sac Bunt" overall={g("sacBunt")} />
          <RatingRow label="Bunt for Hit" overall={g("buntForHit")} />
        </div>
      </div>

      {/* Panel 3 — Fielding */}
      <div className="rounded-xl border border-edge bg-panel p-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">
          Defensive Ratings
          <span className="ml-1.5 text-gray-700 normal-case tracking-normal text-[9px]">(estimated)</span>
        </div>
        <div className="space-y-0.5">
          {isC && <>
            <RatingRow label="Catch Ability" overall={g("cAbility")} />
            <RatingRow label="Catch Framing" overall={g("cFraming")} />
            <RatingRow label="Catcher Arm" overall={g("cArm")} />
          </>}
          {isIF && <>
            <RatingRow label="Infield Range" overall={g("ifRange")} />
            <RatingRow label="Infield Error" overall={g("ifError")} />
            <RatingRow label="Infield Arm" overall={g("ifArm")} />
            <RatingRow label="Turn DP" overall={g("turnDP")} />
          </>}
          {isOF && <>
            <RatingRow label="Outfield Range" overall={g("ofRange")} />
            <RatingRow label="Outfield Error" overall={g("ofError")} />
            <RatingRow label="Outfield Arm" overall={g("ofArm")} />
          </>}
          {!isC && !isIF && !isOF && <>
            <RatingRow label="IF Range" overall={g("ifRange")} />
            <RatingRow label="IF Error" overall={g("ifError")} />
            <RatingRow label="OF Range" overall={g("ofRange")} />
            <RatingRow label="OF Error" overall={g("ofError")} />
          </>}
        </div>
        <p className="text-[10px] text-gray-700 mt-3 leading-tight">
          Defensive ratings are approximated from speed and available fielding stats.
          Specific metrics (UZR/DRS) are not available via this data source.
        </p>
      </div>
    </div>
  );
}

// ── Pitcher profile ───────────────────────────────────────────────────────

function PitcherProfile({ card }: { card: ProjectedCard }) {
  const p = card.pitcher!;
  const vL = card.pitcherVL;
  const vR = card.pitcherVR;
  const hasVL = !!(vL && Object.keys(vL).length > 0);
  const hasVR = !!(vR && Object.keys(vR).length > 0);

  const g = (k: keyof PitcherRatings) => p[k];
  const l = (k: keyof PitcherRatings) => (hasVL ? vL?.[k] : undefined);
  const r = (k: keyof PitcherRatings) => (hasVR ? vR?.[k] : undefined);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Panel 1 — Pitching ratings */}
      <div className="rounded-xl border border-edge bg-panel p-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">
          Basic Pitching Ratings
        </div>
        <SplitHeaders hasVL={hasVL} hasVR={hasVR} />
        <RatingRow label="Stuff" overall={g("stuff")} vL={l("stuff")} vR={r("stuff")} />
        <RatingRow label="PBABIP" overall={g("pBABIP")} vL={l("pBABIP")} vR={r("pBABIP")} />
        <RatingRow label="HR Allowed" overall={g("pHR")} vL={l("pHR")} vR={r("pHR")} />
        <RatingRow label="Control" overall={g("control")} vL={l("control")} vR={r("control")} />
        <RatingRow label="Movement" overall={g("movement")} vL={l("movement")} vR={r("movement")} />
      </div>

      {/* Panel 2 — Summary */}
      <div className="rounded-xl border border-edge bg-panel p-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">
          Summary
        </div>
        <OvrBox ovr={card.ovr} tier={card.tier} />
        <div className="mt-3 text-[10px] uppercase tracking-widest text-gray-500 mb-1 font-semibold">
          Other Pitching Ratings
        </div>
        <div className="space-y-0.5">
          <RatingRow label="Stamina" overall={g("stamina")} />
          <RatingRow label="Hold Runners" overall={g("hold")} />
        </div>
        <div className="mt-3 space-y-1 text-[11px]">
          <div className="flex justify-between text-gray-400">
            <span>Suggested Role</span>
            <span className="text-gray-200 font-medium">
              {card.isStarter ? "Starter" : "Reliever"}
            </span>
          </div>
        </div>
      </div>

      {/* Panel 3 — Position */}
      <div className="rounded-xl border border-edge bg-panel p-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 font-semibold">
          Position Ratings
        </div>
        <RatingRow label="Pitcher" overall={g("pBABIP")} />
      </div>
    </div>
  );
}

// ── Comparables table ─────────────────────────────────────────────────────

function ComparablesTable({ rows, alreadyInGame }: {
  rows: Comparable[];
  alreadyInGame: Comparable[];
}) {
  return (
    <div className="rounded-xl border border-edge overflow-hidden">
      <div className="bg-panel2/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 border-b border-edge">
        Closest existing cards by rating profile
      </div>
      {alreadyInGame.length > 0 && (
        <div className="px-3 py-2 bg-accent/10 border-b border-accent/20 text-[11px] text-accent">
          This player+year already exists in the card pool:{" "}
          {alreadyInGame.map((c) => `${c.name} (${c.cardTypeName}, OVR ${c.ovr})`).join(", ")}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-panel2 text-gray-400 text-xs uppercase">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Card</th>
            <th className="text-left px-2 py-2 font-medium">Type</th>
            <th className="text-right px-2 py-2 font-medium">OVR</th>
            <th className="text-left px-3 py-2 font-medium">Tier</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i} className="border-t border-edge hover:bg-panel2/50">
              <td className="px-3 py-2 text-gray-100">
                {c.name}{" "}
                <span className="text-gray-600 text-xs">{c.year} · {c.team}</span>
              </td>
              <td className="px-2 py-2 text-gray-500 text-xs">{c.cardTypeName}</td>
              <td className="px-2 py-2 text-right tabular-nums text-gray-300">{c.ovr}</td>
              <td className="px-3 py-2">
                <TierBadge tier={c.tier} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Reverse search results ────────────────────────────────────────────────

const POSITIONS = ["C","1B","2B","3B","SS","LF","CF","RF","DH","SP","RP"];
const TIERS = ["Perfect","Diamond","Gold","Silver","Bronze","Iron"] as const;

function ReverseSearch() {
  const [position, setPosition] = useState("SS");
  const [tier, setTier] = useState("Gold");
  const [year, setYear] = useState("1975");
  const [results, setResults] = useState<ReverseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    setLoading(true);
    setErr(null);
    setSearched(true);
    try {
      const res = await fetch(
        `/api/seasoncrafter/reverse?position=${position}&tier=${tier}&year=${year}`
      );
      const data = await res.json();
      if (data.error) { setErr(data.error); setResults([]); }
      else setResults(data.results ?? []);
    } catch {
      setErr("Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-edge bg-panel p-4">
        <p className="text-sm text-gray-400 mb-4">
          Find historical player seasons that project to a target tier but aren't yet in the
          Perfect Team card pool. Good for surfacing card ideas.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Position</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="rounded-md border border-edge bg-ink px-2 py-1.5 text-sm"
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Target tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="rounded-md border border-edge bg-ink px-2 py-1.5 text-sm"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Season year</label>
            <input
              type="number"
              min="1900"
              max="2025"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-md border border-edge bg-ink px-2 py-1.5 text-sm w-24"
            />
          </div>
          <button
            onClick={search}
            disabled={loading}
            className="rounded-md border border-accent bg-accent/15 text-accent px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {loading ? "Searching…" : "Find candidates"}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {err}
        </div>
      )}

      {searched && !loading && results.length === 0 && !err && (
        <div className="text-gray-500 py-4">No qualifying seasons found for {tier} {position} in {year} not already in the card pool.</div>
      )}

      {results.length > 0 && (
        <div className="rounded-xl border border-edge overflow-hidden">
          <div className="bg-panel2/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 border-b border-edge">
            {results.length} candidates · {tier} {position} · {year}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-panel2 text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2 font-medium">#</th>
                <th className="text-left px-3 py-2 font-medium">Player</th>
                <th className="text-left px-2 py-2 font-medium">Pos</th>
                <th className="text-right px-2 py-2 font-medium">Proj OVR</th>
                <th className="text-left px-2 py-2 font-medium">Tier</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Key Stats</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const tierColor = TIER_COLORS[r.tier] ?? "#8a8f98";
                const statsStr = Object.entries(r.keyStats)
                  .map(([k, v]) => `${k.toUpperCase()} ${v}`)
                  .join(" · ");
                return (
                  <tr key={i} className="border-t border-edge hover:bg-panel2/50">
                    <td className="px-3 py-2 text-gray-500 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="text-gray-100 font-medium">{r.name}</div>
                      <div className="text-[11px] text-gray-500">{r.team}</div>
                    </td>
                    <td className="px-2 py-2 text-gray-400 text-xs">{r.position}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: tierColor }}>
                      {r.projOvr}
                    </td>
                    <td className="px-2 py-2">
                      <TierBadge tier={r.tier} />
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-[11px] text-gray-500">
                      {statsStr}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Forward search ────────────────────────────────────────────────────────

function ForwardSearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlayerResult[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [inGameYears, setInGameYears] = useState<Set<number>>(new Set());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // null = use player's primary position; "pitcher" / "hitter" = explicit override
  const [roleOverride, setRoleOverride] = useState<"pitcher" | "hitter" | null>(null);
  const [result, setResult] = useState<ProjectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [projecting, setProjecting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchPlayers = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/seasoncrafter?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(data.players ?? []);
      setShowSugg(true);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => searchPlayers(query), 300);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [query, searchPlayers]);

  const selectPlayer = async (p: PlayerResult) => {
    setSelectedPlayer(p);
    setQuery(p.name);
    setShowSugg(false);
    setSuggestions([]);
    setSeasons([]);
    setInGameYears(new Set());
    setSelectedYear(null);
    setRoleOverride(null);
    setResult(null);
    setErr(null);

    setLoadingSeasons(true);
    try {
      const url = `/api/seasoncrafter/seasons?playerId=${p.id}&name=${encodeURIComponent(p.name)}`;
      const res = await fetch(url);
      const data = await res.json();
      setSeasons(data.seasons ?? []);
      setInGameYears(new Set<number>(data.inGameYears ?? []));
    } catch { setErr("Could not load seasons"); }
    finally { setLoadingSeasons(false); }
  };

  const seasonForYear = seasons.find((s) => s.year === selectedYear);

  // Determine effective pitcher flag: explicit override > player's primary position
  const effectiveIsPitcher =
    roleOverride === "pitcher" ? true
    : roleOverride === "hitter" ? false
    : selectedPlayer?.isPitcher ?? false;

  // A season is "two-way" when it has both meaningful hitting and meaningful pitching.
  const isTwoWaySeason =
    seasonForYear != null &&
    seasonForYear.hasHitting &&
    seasonForYear.hasPitching &&
    seasonForYear.pitchIP >= 10;

  const project = async () => {
    if (!selectedPlayer || !selectedYear) return;
    setProjecting(true);
    setResult(null);
    setErr(null);
    try {
      const params = new URLSearchParams({
        playerId: String(selectedPlayer.id),
        year: String(selectedYear),
        isPitcher: effectiveIsPitcher ? "1" : "0",
        position: selectedPlayer.position,
        name: selectedPlayer.name,
      });
      const res = await fetch(`/api/seasoncrafter/project?${params}`);
      const data = await res.json();
      if (data.error) setErr(data.error);
      else setResult(data);
    } catch { setErr("Projection failed"); }
    finally { setProjecting(false); }
  };

  return (
    <div className="space-y-5">
      {/* Search input */}
      <div className="rounded-xl border border-edge bg-panel p-4 space-y-3">
        <p className="text-sm text-gray-400">
          Enter any MLB player name to project what their card ratings would look like for a
          chosen season, based on their real-life stats relative to their era.
        </p>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (selectedPlayer) { setSelectedPlayer(null); setSeasons([]); setRoleOverride(null); setResult(null); } }}
            onFocus={() => suggestions.length > 0 && setShowSugg(true)}
            onBlur={() => setTimeout(() => setShowSugg(false), 150)}
            placeholder="Search player name… (e.g. Babe Ruth, Mike Trout)"
            className="w-full rounded-md border border-edge bg-ink px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {loading && (
            <span className="absolute right-3 top-2.5 text-[11px] text-gray-500">Searching…</span>
          )}
          {showSugg && suggestions.length > 0 && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-lg border border-edge bg-panel shadow-xl max-h-64 overflow-y-auto">
              {suggestions.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={() => selectPlayer(p)}
                  className="w-full text-left px-3 py-2 hover:bg-panel2 flex items-center gap-3"
                >
                  <span className="text-sm text-gray-100">{p.name}</span>
                  <span className="text-xs text-gray-500">
                    {p.position}
                    {p.birthYear ? ` · b.${p.birthYear}` : ""}
                    {p.active ? " · Active" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Season picker */}
        {selectedPlayer && (
          <div>
            {loadingSeasons ? (
              <span className="text-sm text-gray-500">Loading seasons…</span>
            ) : seasons.length > 0 ? (
              <div className="space-y-2">
                <label className="block text-xs text-gray-500 uppercase tracking-wide">
                  Select season
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {seasons.map((s) => {
                    const inGame = inGameYears.has(s.year);
                    return (
                    <button
                      key={s.year}
                      onClick={() => {
                        setSelectedYear(s.year);
                        setResult(null);
                        // Auto-default non-pitchers to pitcher mode when they have a
                        // substantial pitching workload that season (starter-level IP).
                        if (!selectedPlayer?.isPitcher && s.pitchIP >= 100) {
                          setRoleOverride("pitcher");
                        } else {
                          setRoleOverride(null);
                        }
                      }}
                      title={inGame
                        ? `${s.team} · ${s.gamesPlayed}G · Already in card pool`
                        : `${s.team} · ${s.gamesPlayed}G${s.pitchIP >= 10 ? ` · ${s.pitchIP.toFixed(1)} IP` : ""}`}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                        selectedYear === s.year
                          ? "border-accent bg-accent/15 text-accent"
                          : inGame
                          ? "border-edge/40 text-gray-600 cursor-default"
                          : "border-edge text-gray-400 hover:bg-panel2"
                      }`}
                    >
                      {s.year}
                      {inGame && <span className="ml-1 opacity-60">✓</span>}
                    </button>
                    );
                  })}
                </div>
                {seasonForYear && (
                  <p className="text-[11px] text-gray-500">
                    {seasonForYear.team} · {seasonForYear.gamesPlayed} games
                    {seasonForYear.pitchIP >= 10 && (
                      <> · {seasonForYear.pitchIP.toFixed(1)} IP</>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-600">No seasons found for this player.</p>
            )}
          </div>
        )}

        {/* Two-way player role toggle */}
        {isTwoWaySeason && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Project as:</span>
            <div className="inline-flex rounded-md border border-edge overflow-hidden text-xs">
              <button
                onClick={() => setRoleOverride("pitcher")}
                className={`px-3 py-1 transition-colors ${
                  effectiveIsPitcher
                    ? "bg-accent/15 text-accent border-r border-edge"
                    : "text-gray-400 hover:bg-panel2 border-r border-edge"
                }`}
              >
                Pitcher
              </button>
              <button
                onClick={() => setRoleOverride("hitter")}
                className={`px-3 py-1 transition-colors ${
                  !effectiveIsPitcher
                    ? "bg-accent/15 text-accent"
                    : "text-gray-400 hover:bg-panel2"
                }`}
              >
                Hitter
              </button>
            </div>
          </div>
        )}

        {selectedPlayer && selectedYear && (
          <button
            onClick={project}
            disabled={projecting}
            className="rounded-md border border-accent bg-accent/15 text-accent px-5 py-1.5 text-sm disabled:opacity-50"
          >
            {projecting ? "Projecting…" : "Project ratings"}
          </button>
        )}
      </div>

      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {err}
        </div>
      )}

      {/* Result profile */}
      {result && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-100">
                {result.playerName}
              </h2>
              <p className="text-sm text-gray-500">
                {result.year} season · {result.position}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {!result.card.leagueContextAvailable && (
                <span className="text-[10px] text-yellow-500 border border-yellow-500/30 bg-yellow-500/10 rounded px-2 py-0.5">
                  Limited era context — using modern benchmarks
                </span>
              )}
              <span className="text-[10px] text-gray-600 border border-gray-700 rounded px-2 py-0.5">
                Approximate projection
              </span>
            </div>
          </div>

          {/* Rating profile */}
          {result.isPitcher ? (
            <PitcherProfile card={result.card} />
          ) : (
            <HitterProfile card={result.card} position={result.position} />
          )}

          {/* Comparables */}
          {result.comparables.length > 0 && (
            <ComparablesTable
              rows={result.comparables}
              alreadyInGame={result.alreadyInGame}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────

type Mode = "forward" | "reverse";

export default function SeasonCrafterPage() {
  const [mode, setMode] = useState<Mode>("forward");

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Season Crafter</h1>
          <p className="text-sm text-gray-400">
            Project any real MLB player season into OOTP card ratings, or reverse-search for
            overlooked seasons that would make a great card.
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-edge overflow-hidden text-sm">
        <button
          onClick={() => setMode("forward")}
          className={`px-4 py-1.5 ${
            mode === "forward"
              ? "bg-accent/15 text-accent"
              : "text-gray-400 hover:bg-panel2"
          }`}
        >
          Player lookup
        </button>
        <button
          onClick={() => setMode("reverse")}
          className={`px-4 py-1.5 border-l border-edge ${
            mode === "reverse"
              ? "bg-accent/15 text-accent"
              : "text-gray-400 hover:bg-panel2"
          }`}
        >
          Reverse search
        </button>
      </div>

      {mode === "forward" ? <ForwardSearch /> : <ReverseSearch />}
    </div>
  );
}
