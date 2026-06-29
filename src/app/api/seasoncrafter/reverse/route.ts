import { NextResponse } from "next/server";
import { getLeagueHitters, getLeaguePitchers } from "@/lib/mlbhistory";
import {
  getStaticLeagueHitters,
  getStaticLeaguePitchers,
  isStaticHistoryAvailable,
} from "@/lib/historicaldata";
import {
  computeHitLeague,
  computePitchLeague,
  projectHitterRatings,
  projectPitcherRatings,
  hitterCompositeScore,
  pitcherCompositeScore,
  buildTierBands,
  calibrateToPool,
  DEFAULT_TIER_BANDS,
} from "@/lib/seasoncrafter";
import { getAllCards } from "@/lib/data";
import type { Tier } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Tier proportions of the live card pool (split by pitcher/hitter, since their
 * OVR distributions differ).  Read fresh per request so the calibration tracks
 * the weekly drift as new cards enter the pool.
 */
function poolTierCounts(isPitcher: boolean): Partial<Record<Tier, number>> {
  const counts: Partial<Record<Tier, number>> = {};
  for (const c of getAllCards()) {
    if (c.isPitcher !== isPitcher) continue;
    counts[c.tier] = (counts[c.tier] ?? 0) + 1;
  }
  return counts;
}

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

  // Mirror the live card pool's tier distribution so calibrated tiers match the
  // language of the existing pool; fall back to a fixed spread if unavailable.
  const bands = buildTierBands(poolTierCounts(isPitcher)) ?? DEFAULT_TIER_BANDS;

  // Build a set of player+year combos already in the card pool
  const existing = new Set<string>();
  for (const c of getAllCards()) {
    const key = normName(`${c.firstName} ${c.lastName}`) + "|" + c.year;
    existing.add(key);
  }

  // Use pre-compiled Lahman data when available; fall back to the MLB Stats API.
  // The static dataset covers 1871–present with complete coverage;
  // the API covers recent seasons well but has gaps in pre-1950 data.
  const useStatic = isStaticHistoryAvailable();

  try {
    if (isPitcher) {
      const pitchers = useStatic
        ? getStaticLeaguePitchers(year)
        : await getLeaguePitchers(year);
      const league = computePitchLeague(pitchers);

      // Project every eligible pitcher in this position group, then assign tiers
      // by ranking them and mirroring the live card pool's tier proportions
      // (see calibrateToPool).  Ranking the fixed-baseline projections — rather
      // than reusing the absolute OVR formula — is what lets the upper tiers
      // populate instead of collapsing into a single band.
      const eligible = pitchers.filter((p) => {
        if (p.ip < 25) return false;
        const isStarter = p.gamesStarted >= p.gamesPlayed * 0.5;
        if (position === "SP") return isStarter;
        if (position === "RP") return !isStarter;
        return true; // "P" — include both
      });

      const projected = eligible.map((p) => {
        const ratings = projectPitcherRatings(p, league, null);
        const isStarter = p.gamesStarted >= p.gamesPlayed * 0.5;
        const score = pitcherCompositeScore(ratings, isStarter);
        const key = normName(p.name) + "|" + year;
        return { p, ratings, isStarter, score, inGame: existing.has(key) };
      });

      const calib = calibrateToPool(projected.map((x) => x.score), bands);

      const results = projected
        .map((x, i) => ({ ...x, ovr: calib[i].ovr, tier: calib[i].tier }))
        .filter((r) => r.tier === tier && !r.inGame)
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

      return NextResponse.json({ year, position, tier, results, isPitcher: true, source: useStatic ? "static" : "api" });
    } else {
      const hitters = useStatic
        ? getStaticLeagueHitters(year)
        : await getLeagueHitters(year);
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

      // Rank the position group and mirror the live card pool's tier proportions
      // (see calibrateToPool / pitcher note above).
      const eligible = candidates.filter((p) => p.pa >= 50);

      const projected = eligible.map((p) => {
        const s = { ...p, rbi: 0, hbp: p.hbp ?? 0, gamesPlayed: p.gamesPlayed };
        const ratings = projectHitterRatings(s, league, { fr: p.fr, ferr: p.ferr, farm: p.farm }, null);
        const score = hitterCompositeScore(ratings, p.position || position);
        const key = normName(p.name) + "|" + year;
        return { p, ratings, score, inGame: existing.has(key) };
      });

      const calib = calibrateToPool(projected.map((x) => x.score), bands);

      const results = projected
        .map((x, i) => ({ ...x, ovr: calib[i].ovr, tier: calib[i].tier }))
        .filter((r) => r.tier === tier && !r.inGame)
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

      return NextResponse.json({ year, position, tier, results, isPitcher: false, source: useStatic ? "static" : "api" });
    }
  } catch (e) {
    return NextResponse.json(
      { error: "Reverse search failed", detail: String(e) },
      { status: 500 }
    );
  }
}
