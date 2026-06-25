"use client";
import { useEffect, useState } from "react";
import type { Card } from "@/lib/types";
import type { CardScore } from "@/lib/engine";
import { TierBadge, fmtPrice } from "./ui";

interface DetailResponse {
  card: Card;
  score: CardScore;
  byEnv: Record<string, CardScore>;
}

export function CardDetail({
  id,
  re,
  split,
  onClose,
}: {
  id: number;
  re: string;
  split: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/card/${id}?re=${re}&split=${split}`)
      .then((r) => r.json())
      .then(setData);
  }, [id, re, split]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-edge rounded-2xl w-full max-w-2xl my-8 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {!data ? (
          <div className="text-gray-400 py-8 text-center">Loading…</div>
        ) : (
          <DetailBody data={data} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function DetailBody({
  data,
  onClose,
}: {
  data: DetailResponse;
  onClose: () => void;
}) {
  const { card, score, byEnv } = data;
  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">
              {card.firstName} {card.lastName}
            </h2>
            <TierBadge tier={card.tier} />
            {card.isLE && (
              <span className="text-[10px] text-tier-perfect font-bold border border-tier-perfect/40 rounded px-1.5 py-0.5">
                LE · {card.limitQty}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {card.cardTypeName} · {card.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {card.team} · {card.year} ·{" "}
            {card.isPitcher ? card.pitcherRole : card.position} · B:{card.bats}/T:
            {card.throws} · OVR {card.ovr}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Stat label="Engine Score" value={score.total} accent />
        {score.isPitcher ? (
          <>
            <Stat label="Run Prevent" value={score.runPrevention} />
            <Stat label="Stamina" value={score.stamina} />
          </>
        ) : (
          <>
            <Stat label="Offense" value={score.offense} />
            <Stat label="Defense" value={score.defense} />
            <Stat label="Baserun" value={score.baserunning} />
          </>
        )}
      </div>

      <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
        Score breakdown (current context)
      </h3>
      <div className="rounded-lg border border-edge overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-panel2 text-gray-500 text-xs">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Rating</th>
              <th className="text-right px-2 py-1.5 font-medium">Raw</th>
              <th className="text-right px-2 py-1.5 font-medium">Norm</th>
              <th className="text-right px-2 py-1.5 font-medium">Weight</th>
              <th className="text-right px-3 py-1.5 font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {score.breakdown.map((b) => (
              <tr key={b.label} className="border-t border-edge">
                <td className="px-3 py-1.5 text-gray-200">{b.label}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">
                  {b.raw}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">
                  {b.normalized}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">
                  {(b.weight * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-accent">
                  {b.contribution}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
        Run-environment sensitivity
      </h3>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {Object.entries(byEnv).map(([k, s]) => (
          <div
            key={k}
            className="rounded-lg border border-edge bg-ink px-2 py-2 text-center"
          >
            <div className="text-[10px] uppercase text-gray-500">{k}</div>
            <div className="text-lg font-bold tabular-nums">{s.total}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <PriceStat label="Buy High" value={card.prices.buyHigh} />
        <PriceStat label="Sell Low" value={card.prices.sellLow} />
        <PriceStat label="Last 10" value={card.prices.last10} />
      </div>
      {score.efficiency != null && (
        <p className="text-xs text-gray-500 mt-3">
          Value efficiency: <span className="text-accent">{score.efficiency}</span>{" "}
          score per 1,000 PP cost
        </p>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-edge bg-ink px-3 py-2">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div
        className={`text-lg font-bold tabular-nums ${accent ? "text-accent" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function PriceStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-edge bg-ink px-3 py-2">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="text-base font-semibold tabular-nums text-gray-200">
        {fmtPrice(value)}
      </div>
    </div>
  );
}
