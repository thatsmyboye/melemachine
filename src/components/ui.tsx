"use client";
import { TIER_COLORS } from "@/lib/encodings";
import type { Tier } from "@/lib/types";

export function TierBadge({ tier }: { tier: Tier }) {
  const c = TIER_COLORS[tier];
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ color: c, border: `1px solid ${c}55`, background: `${c}1a` }}
    >
      {tier}
    </span>
  );
}

export function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const hue = 200 + (pct / 100) * 60; // cyan-ish to violet
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded bg-panel2 overflow-hidden">
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, background: `hsl(${hue} 80% 60%)` }}
        />
      </div>
      <span className="tabular-nums text-xs text-gray-300 w-9 text-right">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "—";
  if (p === 0) return "0";
  return p.toLocaleString("en-US");
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-edge bg-panel p-4 ${className}`}
    >
      {children}
    </div>
  );
}
