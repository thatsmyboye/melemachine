"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, Tier } from "@/lib/types";
import type { CardScore, EngineWeights, RunEnv } from "@/lib/engine";
import { TierBadge, ScoreBar, fmtPrice, Panel } from "./ui";
import { CardDetail } from "./CardDetail";

interface Meta {
  cards: number;
  collection: number;
  tiers: Tier[];
  positions: string[];
  cardTypes: { id: number; name: string }[];
  runEnvironments: RunEnv[];
  defaultWeights: EngineWeights;
}

interface Row {
  card: Card;
  score: CardScore;
}

const HIT_KEYS: { k: keyof EngineWeights["hitter"]; label: string }[] = [
  { k: "contact", label: "Contact" },
  { k: "gap", label: "Gap" },
  { k: "power", label: "Power" },
  { k: "eye", label: "Eye" },
  { k: "avoidK", label: "Avoid K" },
  { k: "babip", label: "BABIP" },
];
const PIT_KEYS: { k: keyof EngineWeights["pitcher"]; label: string }[] = [
  { k: "stuff", label: "Stuff" },
  { k: "movement", label: "Movement" },
  { k: "control", label: "Control" },
  { k: "pHR", label: "HR Supp" },
  { k: "pBABIP", label: "pBABIP" },
];

export function CardExplorer() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [re, setRe] = useState("medium");
  const [split, setSplit] = useState<"overall" | "vL" | "vR">("overall");
  const [weights, setWeights] = useState<EngineWeights | null>(null);
  const [search, setSearch] = useState("");
  const [tiers, setTiers] = useState<Set<string>>(new Set());
  const [positions, setPositions] = useState<Set<string>>(new Set());
  const [type, setType] = useState<number | "">("");
  const [toggles, setToggles] = useState({
    hitters: false,
    pitchers: false,
    le: false,
    owned: false,
    live: false,
  });
  const [sort, setSort] = useState("score");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const pageSize = 50;

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => {
        setMeta(m);
        setWeights(m.defaultWeights);
      });
  }, []);

  const reInfo = meta?.runEnvironments.find((e) => e.key === re);

  const fetchCards = useCallback(() => {
    if (!weights) return;
    setLoading(true);
    const p = new URLSearchParams();
    p.set("re", re);
    p.set("split", split);
    p.set("weights", JSON.stringify(weights));
    if (search) p.set("q", search);
    if (tiers.size) p.set("tiers", [...tiers].join(","));
    if (positions.size) p.set("pos", [...positions].join(","));
    if (type !== "") p.set("types", String(type));
    if (toggles.hitters) p.set("hitters", "1");
    if (toggles.pitchers) p.set("pitchers", "1");
    if (toggles.le) p.set("le", "1");
    if (toggles.owned) p.set("owned", "1");
    if (toggles.live) p.set("live", "1");
    p.set("sort", sort);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    fetch(`/api/cards?${p.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [weights, re, split, search, tiers, positions, type, toggles, sort, page]);

  // Debounce
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fetchCards, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fetchCards]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [re, split, search, tiers, positions, type, toggles, sort, weights]);

  const toggleSet = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(val)) n.delete(val);
    else n.add(val);
    setter(n);
  };

  const setWeight = (group: "hitter" | "pitcher", key: string, val: number) => {
    setWeights((w) =>
      w ? { ...w, [group]: { ...w[group], [key]: val } } : w
    );
  };

  const resetWeights = () => meta && setWeights(meta.defaultWeights);

  const totalPages = Math.ceil(total / pageSize);

  if (!meta || !weights) return <div className="text-gray-400">Loading engine…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
      {/* ── Control panel ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <Panel>
          <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
            Run Environment
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {meta.runEnvironments.map((e) => (
              <button
                key={e.key}
                onClick={() => setRe(e.key)}
                className={`rounded-md px-2 py-1.5 text-xs font-medium border transition-colors ${
                  re === e.key
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-edge text-gray-300 hover:bg-panel2"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
          {reInfo && (
            <p className="mt-2 text-[11px] leading-snug text-gray-400">
              ~{reInfo.runsPerGame} R/G. {reInfo.description}
            </p>
          )}
          <div className="mt-3">
            <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-1.5">
              Platoon split
            </h3>
            <div className="flex gap-1.5">
              {(["overall", "vL", "vR"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSplit(s)}
                  className={`flex-1 rounded-md px-2 py-1 text-xs border ${
                    split === s
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-edge text-gray-300 hover:bg-panel2"
                  }`}
                >
                  {s === "overall" ? "Overall" : s === "vL" ? "vs LHP" : "vs RHP"}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wide text-gray-400">
              Weights
            </h3>
            <button
              onClick={resetWeights}
              className="text-[11px] text-accent hover:underline"
            >
              reset
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mb-2">
            Hitting weights (auto-renormalized & RE-adjusted by the engine)
          </p>
          {HIT_KEYS.map(({ k, label }) => (
            <WeightSlider
              key={k}
              label={label}
              value={weights.hitter[k]}
              onChange={(v) => setWeight("hitter", k, v)}
            />
          ))}
          <p className="text-[10px] text-gray-500 mt-3 mb-2">Pitching weights</p>
          {PIT_KEYS.map(({ k, label }) => (
            <WeightSlider
              key={k}
              label={label}
              value={weights.pitcher[k]}
              onChange={(v) => setWeight("pitcher", k, v)}
            />
          ))}
        </Panel>

        <Panel>
          <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
            Filters
          </h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / team…"
            className="w-full rounded-md border border-edge bg-ink px-2.5 py-1.5 text-sm mb-3 outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-1 mb-3">
            {meta.tiers.map((t) => (
              <button
                key={t}
                onClick={() => toggleSet(tiers, t, setTiers)}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  tiers.has(t)
                    ? "border-accent text-accent"
                    : "border-edge text-gray-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 mb-3">
            {meta.positions.map((pos) => (
              <button
                key={pos}
                onClick={() => toggleSet(positions, pos, setPositions)}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  positions.has(pos)
                    ? "border-accent text-accent"
                    : "border-edge text-gray-400"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full rounded-md border border-edge bg-ink px-2 py-1.5 text-sm mb-3"
          >
            <option value="">All card types</option>
            {meta.cardTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {(
              [
                ["hitters", "Hitters"],
                ["pitchers", "Pitchers"],
                ["le", "LE only"],
                ["owned", "Owned"],
                ["live", "Live cards"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={toggles[k]}
                  onChange={(e) =>
                    setToggles((t) => ({ ...t, [k]: e.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Results ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-400">
            {loading ? "Scoring…" : `${total.toLocaleString()} cards`}{" "}
            <span className="text-gray-600">
              · {reInfo?.label} · {split === "overall" ? "overall" : split}
            </span>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-md border border-edge bg-ink px-2 py-1.5 text-sm"
          >
            <option value="score">Sort: Engine Score</option>
            <option value="efficiency">Sort: Value Efficiency</option>
            <option value="ovr">Sort: OVR</option>
            <option value="price">Sort: Price</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>

        <div className="rounded-xl border border-edge overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-panel2 text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2 font-medium">#</th>
                <th className="text-left px-3 py-2 font-medium">Card</th>
                <th className="text-left px-2 py-2 font-medium">Tier</th>
                <th className="text-left px-2 py-2 font-medium">Pos</th>
                <th className="text-right px-2 py-2 font-medium">OVR</th>
                <th className="text-left px-2 py-2 font-medium">Score</th>
                <th className="text-left px-2 py-2 font-medium hidden md:table-cell">
                  Breakdown
                </th>
                <th className="text-right px-2 py-2 font-medium">Price</th>
                <th className="text-right px-3 py-2 font-medium">Eff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.card.id}
                  onClick={() => setSelected(r.card.id)}
                  className="border-t border-edge hover:bg-panel2/60 cursor-pointer"
                >
                  <td className="px-3 py-2 text-gray-500 tabular-nums">
                    {page * pageSize + i + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-100 leading-tight">
                      {r.card.firstName} {r.card.lastName}
                      {r.card.isLE && (
                        <span className="ml-1.5 text-[9px] text-tier-perfect font-bold">
                          LE
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {r.card.cardTypeName} · {r.card.team || "—"} · {r.card.year}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <TierBadge tier={r.card.tier} />
                  </td>
                  <td className="px-2 py-2 text-gray-300">
                    {r.card.isPitcher ? r.card.pitcherRole : r.card.position}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-300">
                    {r.card.ovr}
                  </td>
                  <td className="px-2 py-2">
                    <ScoreBar value={r.score.total} />
                  </td>
                  <td className="px-2 py-2 hidden md:table-cell text-[11px] text-gray-400 tabular-nums">
                    {r.score.isPitcher
                      ? `RP ${r.score.runPrevention} · STM ${r.score.stamina}`
                      : `OFF ${r.score.offense} · DEF ${r.score.defense} · BR ${r.score.baserunning}`}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-300">
                    {fmtPrice(r.card.prices.last10 ?? r.card.prices.sellLow)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-accent">
                    {r.score.efficiency ?? "—"}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                    No cards match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 text-sm">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-3 py-1 rounded border border-edge disabled:opacity-40 hover:bg-panel2"
            >
              ← Prev
            </button>
            <span className="text-gray-400">
              Page {page + 1} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="px-3 py-1 rounded border border-edge disabled:opacity-40 hover:bg-panel2"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {selected != null && (
        <CardDetail
          id={selected}
          re={re}
          split={split}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[11px] text-gray-400">
        <span>{label}</span>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={0.5}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
