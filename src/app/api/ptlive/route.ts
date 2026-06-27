import { NextResponse } from "next/server";
import { getCollection } from "@/lib/data";
import { getSchedule, getDayStats, type HitterLine, type PitcherLine } from "@/lib/mlb";
import { scoreHitterLine, scorePitcherLine, PP_SCORING } from "@/lib/ptlive";

export const dynamic = "force-dynamic";

function todayET(): string {
  // MLB schedule keys on US calendar date.
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return d.toISOString().slice(0, 10);
}

function normName(n: string): string {
  return n
    .toLowerCase()
    .normalize("NFD") // decompose accents so the strip below removes the marks
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayET();
  const withStats = searchParams.get("stats") !== "0";

  const collection = getCollection();
  // De-dupe: keep the highest-OVR live card per player name.
  const liveByName = new Map<string, typeof collection[0]>();
  for (const c of collection) {
    if (!c.isLive) continue;
    const key = normName(c.name);
    const existing = liveByName.get(key);
    if (!existing || c.ovr > existing.ovr) liveByName.set(key, c);
  }
  const liveCards = [...liveByName.values()];

  let games;
  try {
    games = await getSchedule(date);
  } catch (e) {
    return NextResponse.json(
      { error: "MLB schedule fetch failed", detail: String(e), date },
      { status: 502 }
    );
  }

  // Teams playing today (by MLB full name).
  const teamsPlaying = new Set<string>();
  for (const g of games) {
    teamsPlaying.add(g.home);
    teamsPlaying.add(g.away);
  }

  // Keep raw stat lines so each card can be scored with its own SP/RP table.
  const hitterLines = new Map<string, HitterLine>();
  const pitcherLines = new Map<string, PitcherLine>();
  if (withStats) {
    try {
      const dayStats = await getDayStats(date);
      for (const h of dayStats.hitters) hitterLines.set(normName(h.name), h);
      for (const p of dayStats.pitchers) pitcherLines.set(normName(p.name), p);
    } catch {
      /* stats optional */
    }
  }

  const recommendations = liveCards
    .map((c) => {
      const key = normName(c.name);
      const isPitcher = ["SP", "RP", "CL"].includes(c.position);
      let pp: number | null = null;
      if (isPitcher) {
        const line = pitcherLines.get(key);
        if (line) pp = scorePitcherLine(line, c.position === "SP" ? "SP" : "RP");
      } else {
        const line = hitterLines.get(key);
        if (line) pp = scoreHitterLine(line);
      }
      return {
        name: c.name,
        position: c.position,
        ovr: c.ovr,
        active: c.active,
        isPitcher,
        pointsToday: pp,
        // Until we have a projection model, rank by card quality; live PP
        // overrides ordering once games are in.
        rank: pp ?? c.ovr / 10,
        played: pp != null,
      };
    })
    .sort((a, b) => b.rank - a.rank);

  return NextResponse.json({
    date,
    scoringConfirmed: PP_SCORING.confirmed,
    games: games.map((g) => ({
      matchup: `${g.away} @ ${g.home}`,
      status: g.status,
      awayProbable: g.awayProbable?.fullName ?? null,
      homeProbable: g.homeProbable?.fullName ?? null,
    })),
    liveCardCount: liveCards.length,
    recommendations: recommendations.slice(0, 100),
  });
}
