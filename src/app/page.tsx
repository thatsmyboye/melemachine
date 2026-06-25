import Link from "next/link";
import { getAllCards, getCollection, getDatasetMeta } from "@/lib/data";
import { scoreCard } from "@/lib/engine";
import { TIER_ORDER, TIER_COLORS } from "@/lib/encodings";
import type { Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const cards = getAllCards();
  const collection = getCollection();
  const meta = getDatasetMeta();

  const tierCounts: Record<Tier, number> = {
    Iron: 0,
    Bronze: 0,
    Silver: 0,
    Gold: 0,
    Diamond: 0,
    Perfect: 0,
  };
  let leCount = 0;
  for (const c of cards) {
    tierCounts[c.tier]++;
    if (c.isLE) leCount++;
  }

  const topMedium = [...cards]
    .map((c) => ({ c, s: scoreCard(c, { runEnv: "medium", split: "overall" }) }))
    .sort((a, b) => b.s.total - a.s.total)
    .slice(0, 8);

  const liveOwned = collection.filter((c) => c.isLive).length;
  const tourEligible = collection.filter((c) => c.tourEligible).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mele Machine</h1>
        <p className="text-gray-400 text-sm mt-1">
          OOTP Perfect Team companion · {meta.cards.toLocaleString()} cards in the
          pool · {meta.collection.toLocaleString()} in your collection
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Cards in pool" value={meta.cards.toLocaleString()} />
        <StatCard label="Limited Edition" value={leCount.toString()} />
        <StatCard label="Live cards owned" value={liveOwned.toString()} />
        <StatCard label="Tournament-eligible" value={tourEligible.toString()} />
      </div>

      <div className="rounded-xl border border-edge bg-panel p-4">
        <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-3">
          Card pool by tier
        </h2>
        <div className="flex gap-2 flex-wrap">
          {TIER_ORDER.map((t) => (
            <div
              key={t}
              className="flex-1 min-w-[110px] rounded-lg border border-edge bg-ink px-3 py-2"
            >
              <div
                className="text-xs font-bold uppercase"
                style={{ color: TIER_COLORS[t] }}
              >
                {t}
              </div>
              <div className="text-xl font-bold tabular-nums">
                {tierCounts[t].toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-wide text-gray-400">
              Top cards · Medium RE
            </h2>
            <Link href="/cards" className="text-xs text-accent hover:underline">
              open explorer →
            </Link>
          </div>
          <ol className="space-y-1.5">
            {topMedium.map(({ c, s }, i) => (
              <li
                key={c.id}
                className="flex items-center gap-3 text-sm border-b border-edge/50 pb-1.5 last:border-0"
              >
                <span className="text-gray-600 w-4 tabular-nums">{i + 1}</span>
                <span className="flex-1 text-gray-100">
                  {c.firstName} {c.lastName}
                  <span className="text-gray-500 text-xs ml-2">
                    {c.cardTypeName}
                  </span>
                </span>
                <span
                  className="text-xs font-bold"
                  style={{ color: TIER_COLORS[c.tier] }}
                >
                  {c.tier}
                </span>
                <span className="text-accent font-bold tabular-nums w-12 text-right">
                  {s.total}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl border border-edge bg-panel p-4">
          <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-3">
            Jump in
          </h2>
          <div className="space-y-2">
            <NavCard
              href="/cards"
              title="Card Explorer"
              desc="Score & rank the entire pool with the Rating Intelligence Engine. Tune weights, switch run environments, compare platoon splits."
            />
            <NavCard
              href="/ptlive"
              title="PT Live"
              desc="Today's games, probable pitchers, and which of your Live cards to start — powered by the MLB Stats API."
            />
            <NavCard
              href="/collection"
              title="My Collection"
              desc="Your 2,900+ cards, scored and sorted. Find your best lineup for any environment."
            />
            <NavCard
              href="/about"
              title="How the Engine Works"
              desc="What every rating does, how run environment shifts value, and how scores are computed."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function NavCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-edge bg-ink px-3 py-2.5 hover:border-accent/50 transition-colors"
    >
      <div className="font-semibold text-gray-100">{title}</div>
      <div className="text-xs text-gray-400 leading-snug mt-0.5">{desc}</div>
    </Link>
  );
}
