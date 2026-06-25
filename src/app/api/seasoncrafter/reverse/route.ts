import { NextResponse } from "next/server";
import { getLeagueHitters, getLeaguePitchers } from "@/lib/mlbhistory";
import {
  computeHitLeague,
  computePitchLeague,
  projectHitterRatings,
  projectPitcherRatings,
  estimateHitterOvr,
  estimatePitcherOvr,
} from "@/lib/seasoncrafter";
import { tierFromOvr } from "@/lib/encodings";
import { getAllCards } from "@/lib/data";
import type { Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIER_OVR: Record<string, [number, number]> = {
  Iron: [0, 59],
  Bronze: [60, 69],
  Silver: [70, 79],
  Gold: [80, 89],
  Diamond: [90, 99],
  Perfect: [100, 999],
};

function normName(n: string) {
  return n
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PITCHER_POSITIONS = new Set(["P", "SP", "RP"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const position = (searchParams.get("position") ?? "").toUpperCase();
  const tier = (searchParams.get("tier") ?? "") as Tier;
  const year = Number(searchParams.get("year") ?? 0);
  const isPitcher = PITCHER_POSITIONS.has(position);

  if (!position || !tier || !year) {
    return NextResponse.json({ error: "Missing position, tier, or year" }, { status: 400 });
  }

  const [ovrMin, ovrMax] = TIER_OVR[tier] ?? [60, 999];

  // Build a set of player+year combos already in the card pool
  const existing = new Set<string>();
  for (const c of getAllCards()) {
    const key = normName(`${c.firstName} ${c.lastName}`) + "|" + c.year;
    existing.add(key);
  }

  try {
    if (isPitcher) {
      const pitchers = await getLeaguePitchers(year);
      const league = computePitchLeague(pitchers);

      const results = pitchers
        .filter((p) => p.ip >= 40)
        .map((p) => {
          const ratings = projectPitcherRatings(p, league);
          const isStarter = p.gamesStarted >= p.gamesPlayed * 0.5;
          const ovr = estimatePitcherOvr(ratings, isStarter);
          const projTier = tierFromOvr(ovr);
          const key = normName(p.name) + "|" + year;
          return { p, ratings, ovr, tier: projTier, isStarter, inGame: existing.has(key) };
        })
        .filter((r) => r.tier === tier && r.ovr >= ovrMin && r.ovr <= ovrMax && !r.inGame)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 30)
        .map(({ p, ratings, ovr, tier: projTier, isStarter }) => ({
          name: p.name,
          team: p.team,
          year,
          position: isStarter ? "SP" : "RP",
          projOvr: ovr,
          tier: projTier,
          keyStats: {
            era: p.era.toFixed(2),
            whip: p.whip.toFixed(2),
            k9: ((p.so / (p.ip || 1)) * 9).toFixed(1),
            ip: Math.round(p.ip),
            gs: p.gamesStarted,
          },
          topRatings: {
            stuff: ratings.stuff,
            movement: ratings.movement,
            control: ratings.control,
            pHR: ratings.pHR,
            stamina: ratings.stamina,
          },
        }));

      return NextResponse.json({ year, position, tier, results, isPitcher: true });
    } else {
      const hitters = await getLeagueHitters(year);
      const league = computeHitLeague(hitters);

      // Filter by position: position field in the API data
      // The MLB API position field may be the primary position code
      const posFilter = (pos: string) => {
        const p = pos.toUpperCase();
        if (position === "OF") return ["LF", "CF", "RF", "OF"].includes(p);
        if (position === "MI") return ["2B", "SS"].includes(p);
        if (position === "CI") return ["1B", "3B"].includes(p);
        return p === position;
      };

      const candidates = position === "ALL" ? hitters : hitters.filter((h) => posFilter(h.position));

      const results = candidates
        .filter((p) => p.pa >= 150)
        .map((p) => {
          const s = { ...p, rbi: 0, hbp: p.hbp ?? 0, gamesPlayed: p.gamesPlayed };
          const ratings = projectHitterRatings(s, league);
          const ovr = estimateHitterOvr(ratings, p.position || position);
          const projTier = tierFromOvr(ovr);
          const key = normName(p.name) + "|" + year;
          return { p, ratings, ovr, tier: projTier, inGame: existing.has(key) };
        })
        .filter((r) => r.tier === tier && r.ovr >= ovrMin && r.ovr <= ovrMax && !r.inGame)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 30)
        .map(({ p, ratings, ovr, tier: projTier }) => ({
          name: p.name,
          team: p.team,
          year,
          position: p.position || position,
          projOvr: ovr,
          tier: projTier,
          keyStats: {
            avg: p.avg.toFixed(3),
            obp: p.obp.toFixed(3),
            slg: p.slg.toFixed(3),
            hr: p.hr,
            sb: p.sb,
          },
          topRatings: {
            contact: ratings.contact,
            power: ratings.power,
            eye: ratings.eye,
            gap: ratings.gap,
            avoidK: ratings.avoidK,
          },
        }));

      return NextResponse.json({ year, position, tier, results, isPitcher: false });
    }
  } catch (e) {
    return NextResponse.json(
      { error: "Reverse search failed", detail: String(e) },
      { status: 500 }
    );
  }
}
