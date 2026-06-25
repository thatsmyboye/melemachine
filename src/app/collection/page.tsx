"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtPrice } from "@/components/ui";

interface ColCard {
  name: string;
  position: string;
  bats: string;
  throws: string;
  cType: string;
  ovr: number;
  isLive: boolean;
  active: boolean;
  tourEligible: boolean;
  prices: { buy: number | null; sell: number | null; last10: number | null };
}

export default function CollectionPage() {
  const [cards, setCards] = useState<ColCard[]>([]);
  const [byType, setByType] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "live" | "active" | "tour">("all");
  const [sort, setSort] = useState<"ovr" | "name" | "value">("ovr");

  useEffect(() => {
    fetch("/api/collection")
      .then((r) => r.json())
      .then((res) => {
        setCards(res.cards);
        setByType(res.byType);
      });
  }, []);

  const rows = useMemo(() => {
    let out = cards;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (filter === "live") out = out.filter((c) => c.isLive);
    if (filter === "active") out = out.filter((c) => c.active);
    if (filter === "tour") out = out.filter((c) => c.tourEligible);
    out = [...out].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "value")
        return (b.prices.last10 ?? 0) - (a.prices.last10 ?? 0);
      return b.ovr - a.ovr;
    });
    return out;
  }, [cards, search, filter, sort]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">My Collection</h1>
        <p className="text-sm text-gray-400">
          {cards.length.toLocaleString()} cards ·{" "}
          {Object.entries(byType)
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => `${t} ${n}`)
            .join(" · ")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player…"
          className="rounded-md border border-edge bg-ink px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <div className="flex gap-1">
          {(["all", "live", "active", "tour"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm border ${
                filter === f
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-edge text-gray-300 hover:bg-panel2"
              }`}
            >
              {f === "all"
                ? "All"
                : f === "live"
                ? "Live"
                : f === "active"
                ? "Active"
                : "Tour-eligible"}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-md border border-edge bg-ink px-2 py-1.5 text-sm ml-auto"
        >
          <option value="ovr">Sort: OVR</option>
          <option value="value">Sort: Value</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      <div className="text-sm text-gray-500">{rows.length.toLocaleString()} shown</div>

      <div className="rounded-xl border border-edge overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-panel2 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Player</th>
              <th className="text-left px-2 py-2 font-medium">Pos</th>
              <th className="text-left px-2 py-2 font-medium">Type</th>
              <th className="text-right px-2 py-2 font-medium">OVR</th>
              <th className="text-left px-2 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Last 10</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((c, i) => (
              <tr key={`${c.name}-${i}`} className="border-t border-edge hover:bg-panel2/50">
                <td className="px-3 py-2 text-gray-100">{c.name}</td>
                <td className="px-2 py-2 text-gray-300">{c.position}</td>
                <td className="px-2 py-2 text-gray-400 text-xs">{c.cType}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-300">
                  {c.ovr}
                </td>
                <td className="px-2 py-2 text-xs">
                  {c.active ? (
                    <span className="text-green-400">Active</span>
                  ) : (
                    <span className="text-gray-500">Reserve</span>
                  )}
                  {c.tourEligible && (
                    <span className="ml-1.5 text-tier-gold">Tour</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                  {fmtPrice(c.prices.last10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 500 && (
        <p className="text-xs text-gray-500">
          Showing first 500 of {rows.length.toLocaleString()} — refine with search/filters.
        </p>
      )}
    </div>
  );
}
