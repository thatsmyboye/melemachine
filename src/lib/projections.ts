// ─────────────────────────────────────────────────────────────────────────
// Pre-game PT Live projections.
//
// PT Live Perfect Points are earned from a player's REAL-LIFE performance, so
// projections are built from each player's current-season rate stats — NOT
// their OOTP card ratings — then adjusted for the day's matchup:
//
//   • Hitters  → scaled by the opposing probable starter's run-prevention and
//                by expected plate appearances (batting-order slot when the
//                lineup is posted, otherwise season PA/game).
//   • Starters → projected per-start from season rates, scaled by the opposing
//                offense, with probabilistic Win / Quality-Start / 10+K bonuses.
//   • Relievers→ season PP-per-appearance × appearance probability (low conf).
//
// An SP card only projects on days its pitcher is the probable starter.
// ─────────────────────────────────────────────────────────────────────────
import type { HitSeason, PitchSeason } from "./mlb";
import { PP_SCORING } from "./ptlive";

export const LEAGUE_ERA = 4.2;
export const LEAGUE_RPG = 4.5;

// Expected plate appearances by batting-order slot.
const PA_BY_SLOT = [0, 4.65, 4.55, 4.45, 4.35, 4.2, 4.05, 3.95, 3.8, 3.7];

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Poisson P(X >= k) for mean lambda — used for the 10+K bonus EV. */
function poissonUpperTail(lambda: number, k: number): number {
  if (lambda <= 0) return 0;
  // P(X < k) = sum_{i=0}^{k-1} e^-l l^i / i!
  let term = Math.exp(-lambda);
  let cdf = term;
  for (let i = 1; i < k; i++) {
    term *= lambda / i;
    cdf += term;
  }
  return clamp(1 - cdf, 0, 1);
}

export interface Projection {
  pp: number;
  confidence: "high" | "medium" | "low";
  detail: string;
  components: Record<string, number>;
}

/** Hitter matchup multiplier vs the opposing probable starter (ERA-based). */
export function hitterMatchupMult(oppStarterEra: number | null): number {
  if (oppStarterEra == null || oppStarterEra <= 0) return 1;
  // Tough starter (low ERA) suppresses the ~60% of the game they pitch.
  const vsSp = clamp(oppStarterEra / LEAGUE_ERA, 0.7, 1.35);
  return round3(0.6 * vsSp + 0.4 * 1.0);
}

/** Pitcher matchup multiplier vs the opposing offense (runs/game-based). */
export function pitcherMatchupMult(oppRpg: number | null): number {
  if (oppRpg == null || oppRpg <= 0) return 1;
  return clamp(LEAGUE_RPG / oppRpg, 0.8, 1.25);
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function projectHitter(
  s: HitSeason,
  opts: { expectedPA: number; matchupMult: number; starting: boolean }
): Projection | null {
  if (s.pa <= 0 || s.games <= 0) return null;
  const rate = (x: number) => (x / s.pa) * opts.expectedPA;
  const singles = Math.max(0, s.h - s.doubles - s.triples - s.hr);
  const H = PP_SCORING.hitter;
  const c = {
    singles: rate(singles) * H.single,
    doubles: rate(s.doubles) * H.double,
    triples: rate(s.triples) * H.triple,
    hr: rate(s.hr) * H.hr,
    runs: rate(s.r) * H.run,
    rbi: rate(s.rbi) * H.rbi,
    bbHbp: (rate(s.bb) + rate(s.hbp)) * H.bbHbp,
    sb: rate(s.sb) * H.sb,
    cs: rate(s.cs) * H.cs,
  };
  const base = Object.values(c).reduce((a, b) => a + b, 0);
  const pp = base * opts.matchupMult;
  return {
    pp: round1(pp),
    confidence: opts.starting ? "high" : "medium",
    detail: opts.starting
      ? `Projected over ${opts.expectedPA.toFixed(1)} PA`
      : `Lineup not posted — using ${opts.expectedPA.toFixed(1)} season PA/G`,
    components: Object.fromEntries(
      Object.entries(c).map(([k, v]) => [k, round1(v * opts.matchupMult)])
    ),
  };
}

export function projectStarter(
  s: PitchSeason,
  opts: { matchupMult: number }
): Projection | null {
  if (s.gamesStarted <= 0 || s.ip <= 0) return null;
  const gs = s.gamesStarted;
  const m = opts.matchupMult;
  // Guard against small-sample / opener distortions (no real start exceeds ~8 IP).
  const ipPerStart = clamp(s.ip / gs, 2.5, 7.5);
  const kPerStart = s.so / gs;
  const erPerStart = (s.er / gs) * m; // strong offense (m<1) -> more ER
  const bbPerStart = (s.bb + s.hbp) / gs;

  const P = PP_SCORING.startingPitcher;
  const ipPts = ipPerStart * P.ipPerInning;
  const kPts = kPerStart * P.k;
  const erPts = erPerStart * P.er;
  const bbPts = bbPerStart * P.bbHbp;

  const winProb = clamp((s.wins / gs) * (1 / m), 0.05, 0.6);
  const winPts = winProb * P.win;
  const qsProb = clamp(0.4 + (ipPerStart - 6) * 0.45 - (erPerStart - 3) * 0.25, 0, 0.85);
  const qsPts = qsProb * (P.qualityStart ?? 0);
  const k10Prob = poissonUpperTail(kPerStart, 10);
  const k10Pts = k10Prob * (P.tenPlusKBonus ?? 0);
  const cgProb = clamp((ipPerStart - 7.3) * 0.25, 0, 0.12);
  const cgPts = cgProb * (P.completeGame ?? 0);

  const pp = ipPts + kPts + erPts + bbPts + winPts + qsPts + k10Pts + cgPts;
  return {
    pp: round1(pp),
    confidence: "high",
    detail: `Projected start: ${ipPerStart.toFixed(1)} IP, ${kPerStart.toFixed(1)} K, ${erPerStart.toFixed(1)} ER`,
    components: {
      ip: round1(ipPts),
      k: round1(kPts),
      er: round1(erPts),
      bbHbp: round1(bbPts),
      win: round1(winPts),
      qs: round1(qsPts),
      tenK: round1(k10Pts),
      cg: round1(cgPts),
    },
  };
}

export function projectReliever(
  s: PitchSeason,
  opts: { appearanceProb?: number } = {}
): Projection | null {
  if (s.games <= 0 || s.ip <= 0) return null;
  const appProb = opts.appearanceProb ?? 0.45;
  const g = s.games;
  const R = PP_SCORING.reliefPitcher;
  const perApp =
    (s.ip / g) * R.ipPerInning +
    (s.so / g) * R.k +
    (s.er / g) * R.er +
    ((s.bb + s.hbp) / g) * R.bbHbp +
    (s.wins / g) * R.win +
    (s.saves / g) * (R.save ?? 0) +
    (s.holds / g) * (R.hold ?? 0);
  return {
    pp: round1(perApp * appProb),
    confidence: "low",
    detail: `~${round1(perApp)} PP/appearance × ${(appProb * 100).toFixed(0)}% chance to pitch`,
    components: { perAppearance: round1(perApp), appearanceProb: appProb },
  };
}
