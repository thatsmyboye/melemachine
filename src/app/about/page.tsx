import { RATINGS, type RatingGroup } from "@/lib/ratings";
import { RUN_ENVIRONMENTS } from "@/lib/engine";

export const metadata = { title: "How the Engine Works — Mele Machine" };

const GROUPS: { key: RatingGroup; label: string }[] = [
  { key: "hitting", label: "Hitting" },
  { key: "pitching", label: "Pitching" },
  { key: "baserunning", label: "Baserunning" },
  { key: "fielding", label: "Fielding" },
];

function biasLabel(reBias: number): { text: string; color: string } {
  if (reBias > 1.1) return { text: "↑ in high RE", color: "#e3b341" };
  if (reBias < 0.9) return { text: "↑ in low RE", color: "#5ad1e6" };
  return { text: "RE-neutral", color: "#8a8f98" };
}

export default function AboutPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">How the Rating Intelligence Engine works</h1>
        <p className="text-gray-400 text-sm mt-2 leading-relaxed">
          Every card carries OOTP&apos;s full rating set on a ~1–250 scale. The
          engine normalizes each rating to 0–100, weights it by how much it
          actually drives run scoring, then <strong>re-weights everything for
          the run environment (RE)</strong> you&apos;re playing in. The same card
          is worth different amounts in a pitcher&apos;s duel versus a slugfest —
          that&apos;s the core insight tools like cwhitstats and beanecounter
          under-exploit, and where this engine aims to win.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Run environments</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.values(RUN_ENVIRONMENTS).map((e) => (
            <div key={e.key} className="rounded-xl border border-edge bg-panel p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{e.label}</h3>
                <span className="text-xs text-gray-500">~{e.runsPerGame} R/G</span>
              </div>
              <p className="text-sm text-gray-400 mt-1 leading-snug">
                {e.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">What each rating does</h2>
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const items = RATINGS.filter((r) => r.group === g.key);
            if (!items.length) return null;
            return (
              <div key={g.key}>
                <h3 className="text-sm uppercase tracking-wide text-gray-400 mb-2">
                  {g.label}
                </h3>
                <div className="rounded-xl border border-edge overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((r) => {
                        const b = biasLabel(r.reBias);
                        return (
                          <tr key={r.key} className="border-b border-edge/60 last:border-0">
                            <td className="px-3 py-2.5 align-top w-36">
                              <div className="font-semibold text-gray-100">
                                {r.label}
                              </div>
                              <div
                                className="text-[10px] font-bold mt-0.5"
                                style={{ color: b.color }}
                              >
                                {b.text}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <div className="text-gray-300">{r.what}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                Drives: {r.drives}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-panel p-4">
        <h2 className="text-lg font-semibold mb-2">Scoring formula</h2>
        <ol className="text-sm text-gray-300 space-y-1.5 list-decimal pl-5 leading-relaxed">
          <li>Normalize each rating: <code className="text-accent">value / 250 × 100</code>.</li>
          <li>
            Multiply base weights by an RE factor (Power &amp; HR-suppression
            scale up as runs/game rise; Avoid-K, Speed &amp; Defense scale up as
            they fall), then renormalize so weights sum to 1.
          </li>
          <li>
            Hitters: <code className="text-accent">offense × off-share + baserunning × br-share + defense × def-share</code>,
            where defense and baserunning shares grow in low RE, and defense is
            multiplied by position scarcity (C/SS/CF premium).
          </li>
          <li>
            Pitchers: weighted run-prevention score blended with stamina
            (starters weighted for stamina, relievers largely not).
          </li>
          <li>
            Value efficiency = <code className="text-accent">score / price × 1000</code> — the
            best points-per-PP buys.
          </li>
        </ol>
        <p className="text-xs text-gray-500 mt-3">
          Weights are fully exposed in the Card Explorer so you can calibrate
          against real PT results. Defaults reflect modern run-value research
          (on-base skills weighted slightly above raw average; power the single
          biggest hitting lever).
        </p>
      </section>
    </div>
  );
}
