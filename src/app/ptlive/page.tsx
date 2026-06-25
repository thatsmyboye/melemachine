"use client";
import { useEffect, useState } from "react";

interface Game {
  matchup: string;
  status: string;
  awayProbable: string | null;
  homeProbable: string | null;
}
interface Rec {
  name: string;
  position: string;
  ovr: number;
  active: boolean;
  isPitcher: boolean;
  pointsToday: number | null;
  played: boolean;
}
interface PTLiveResponse {
  date: string;
  scoringConfirmed: boolean;
  games: Game[];
  liveCardCount: number;
  recommendations: Rec[];
  error?: string;
}

export default function PTLivePage() {
  const [date, setDate] = useState("");
  const [data, setData] = useState<PTLiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (d?: string) => {
    setLoading(true);
    setErr(null);
    const q = d ? `?date=${d}` : "";
    fetch(`/api/ptlive${q}`)
      .then((r) => r.json())
      .then((res: PTLiveResponse) => {
        if (res.error) setErr(res.error);
        setData(res);
        setDate(res.date);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">PT Live</h1>
          <p className="text-sm text-gray-400">
            Your Live cards ranked for today&apos;s real MLB action. Data via the
            MLB Stats API.
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
            onClick={() => load(date)}
            className="rounded-md border border-accent bg-accent/15 text-accent px-3 py-1.5 text-sm"
          >
            Load
          </button>
        </div>
      </div>

      {!data?.scoringConfirmed && (
        <div className="rounded-lg border border-tier-gold/40 bg-tier-gold/10 px-4 py-2.5 text-sm text-tier-gold">
          ⚠ PT Live point values are provisional (a placeholder fantasy model).
          Send the beanecounter scoring table and rankings will reflect exact
          Perfect Points.
        </div>
      )}

      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {err}
        </div>
      )}

      {loading && <div className="text-gray-400">Loading today&apos;s slate…</div>}

      {data && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <div>
            <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-2">
              Recommended starts · {data.liveCardCount} Live cards owned
            </h2>
            <div className="rounded-xl border border-edge overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-panel2 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Player</th>
                    <th className="text-left px-2 py-2 font-medium">Pos</th>
                    <th className="text-right px-2 py-2 font-medium">OVR</th>
                    <th className="text-right px-3 py-2 font-medium">
                      PP today
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.recommendations.map((r, i) => (
                    <tr
                      key={`${r.name}-${i}`}
                      className="border-t border-edge hover:bg-panel2/50"
                    >
                      <td className="px-3 py-2 text-gray-500 tabular-nums">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 text-gray-100">
                        {r.name}
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
                          <span className="text-accent font-bold">
                            {r.pointsToday}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Players whose teams haven&apos;t played yet show &ldquo;—&rdquo;
              and are ranked by card quality until a projection model is added.
            </p>
          </div>

          <div>
            <h2 className="text-sm uppercase tracking-wide text-gray-400 mb-2">
              Today&apos;s games
            </h2>
            <div className="space-y-1.5">
              {data.games.length === 0 && (
                <div className="text-gray-500 text-sm">
                  No games scheduled for {data.date}.
                </div>
              )}
              {data.games.map((g, i) => (
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
          </div>
        </div>
      )}
    </div>
  );
}
