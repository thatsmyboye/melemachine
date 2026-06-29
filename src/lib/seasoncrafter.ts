// ─────────────────────────────────────────────────────────────────────────
// Season Crafter — converts real MLB season statistics into projected
// OOTP Perfect Team card ratings using era-adjusted percentile ranking.
//
// Methodology:
//   1. Fetch the target player's season stats from the MLB Stats API.
//   2. Fetch all qualified players' stats for that season (league context).
//   3. Compute each key rate stat as a z-score vs. the era's distribution.
//   4. Map z-scores to the OOTP 1-250 rating scale (average = 125).
//   5. Estimate OVR using the same engine weights used in CardExplorer.
// ─────────────────────────────────────────────────────────────────────────

import type { Tier } from "./types";
import type {
  SeasonHitStats,
  SeasonPitchStats,
  HitSplitLine,
  PitchSplitLine,
  LeagueHitter,
  LeaguePitcher,
} from "./mlbhistory";
import { tierFromOvr } from "./encodings";

// ── Card-pool calibration contexts ───────────────────────────────────────────
// Each entry is [mean, std] of that rating across the current card pool.
// When absent, projection falls back to the fixed z-score baseline (center=125,
// spread=33). Route handlers supply these from carddist.ts.

export interface HitCardDist {
  contact:     [number, number];
  gap:         [number, number];
  power:       [number, number];
  eye:         [number, number];
  avoidK:      [number, number];
  babip:       [number, number];
  speed:       [number, number];
  stealing:    [number, number];
  baserunning: [number, number];
  sacBunt:     [number, number];
  buntForHit:  [number, number];
  ifRange:     [number, number];
  ifError:     [number, number];
  ifArm:       [number, number];
  turnDP:      [number, number];
  ofRange:     [number, number];
  ofError:     [number, number];
  ofArm:       [number, number];
  cAbility:    [number, number];
  cFraming:    [number, number];
  cArm:        [number, number];
}

export interface PitchCardDist {
  stuff:    [number, number];
  movement: [number, number];
  control:  [number, number];
  pHR:      [number, number];
  pBABIP:   [number, number];
  stamina:  [number, number];
  hold:     [number, number];
}

// ── OOTP-scale ratings, 1-250 ─────────────────────────────────────────────

export interface HitterRatings {
  contact: number;
  gap: number;
  power: number;
  eye: number;
  avoidK: number;
  babip: number;
  speed: number;
  stealing: number;
  baserunning: number;
  sacBunt: number;
  buntForHit: number;
  ifRange: number;
  ifError: number;
  ifArm: number;
  turnDP: number;
  ofRange: number;
  ofError: number;
  ofArm: number;
  cAbility: number;
  cFraming: number;
  cArm: number;
}

export interface PitcherRatings {
  stuff: number;
  movement: number;
  control: number;
  pHR: number;
  pBABIP: number;
  stamina: number;
  hold: number;
}

export interface ProjectedCard {
  ovr: number;
  tier: Tier;
  isPitcher: boolean;
  isStarter: boolean;
  hitter?: HitterRatings;
  hitterVL?: Partial<HitterRatings>;
  hitterVR?: Partial<HitterRatings>;
  pitcher?: PitcherRatings;
  pitcherVL?: Partial<PitcherRatings>;
  pitcherVR?: Partial<PitcherRatings>;
  /** True when league context was derived from actual season data. */
  leagueContextAvailable: boolean;
}

// ── Statistical helpers ───────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 1;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v) || 1;
}

/** Convert a z-score to OOTP 1-250 rating using fixed baseline (center=125, spread=33). */
function zr(z: number): number {
  return Math.max(20, Math.min(250, Math.round(125 + z * 33)));
}

/**
 * Convert a z-score to OOTP 1-250 using the card pool's [mean, std] for this
 * rating dimension.  Automatically tracks power creep; falls back to the fixed
 * baseline when no distribution is supplied.
 */
function zrCal(dist: [number, number] | undefined, z: number): number {
  const [m, s] = dist ?? [125, 33];
  return Math.max(20, Math.min(250, Math.round(m + z * s)));
}

/** Reverse a rating on the standard 1-250 scale back to a z-score. */
function ratingToZ(r: number): number {
  return (r - 125) / 33;
}

function babip(hits: number, hr: number, ab: number, so: number): number {
  const d = ab - so - hr;
  return d > 0 ? (hits - hr) / d : 0.29;
}

// ── Derived rate stats ────────────────────────────────────────────────────

interface HitRates {
  avg: number;
  kPct: number;
  bbPct: number;
  hrPerAb: number;
  iso: number;
  xbhPerAb: number;
  triplesPerAb: number;
  babip: number;
  sbPerGame: number;
  sbPct: number;
  sbAttempts: number;
}

function hitRates(s: {
  pa: number; ab: number; hits: number; doubles: number; triples: number;
  hr: number; bb: number; so: number; sb: number; cs: number;
  gamesPlayed: number; avg: number; slg: number;
}): HitRates {
  const pa = s.pa || 1;
  const ab = s.ab || 1;
  const g = s.gamesPlayed || 1;
  const avg = s.avg || s.hits / ab;
  const iso = Math.max(0, s.slg - avg);
  const attempts = s.sb + s.cs;
  return {
    avg,
    kPct: s.so / pa,
    bbPct: s.bb / pa,
    hrPerAb: s.hr / ab,
    iso,
    xbhPerAb: (s.doubles + s.triples) / ab,
    triplesPerAb: s.triples / ab,
    babip: babip(s.hits, s.hr, ab, s.so),
    sbPerGame: s.sb / g,
    sbPct: attempts >= 5 ? s.sb / attempts : 0.70,
    sbAttempts: attempts,
  };
}

interface PitchRates {
  k9: number;
  bb9: number;
  hr9: number;
  era: number;
  whip: number;
  ipPerGs: number;
  babipAgainst: number;
}

function pitchRates(s: {
  ip: number; gamesStarted: number; hits: number; er: number;
  bb: number; so: number; hr: number; era: number; whip?: number;
}): PitchRates {
  const ip = s.ip || 1;
  const bf = Math.round(ip * 3) + s.hits + s.bb;
  return {
    k9: (s.so / ip) * 9,
    bb9: (s.bb / ip) * 9,
    hr9: (s.hr / ip) * 9,
    era: s.era,
    whip: s.whip ?? (s.hits + s.bb) / ip,
    ipPerGs: s.gamesStarted > 0 ? s.ip / s.gamesStarted : 0,
    babipAgainst: babip(s.hits, s.hr, Math.round(s.ip * 3) + s.hits, s.so),
  };
}

// ── League context ────────────────────────────────────────────────────────

export interface HitLeague {
  avg: [number, number]; // [mean, std]
  kPct: [number, number];
  bbPct: [number, number];
  hrPerAb: [number, number];
  iso: [number, number];
  xbhPerAb: [number, number];
  triplesPerAb: [number, number];
  babip: [number, number];
  sbPerGame: [number, number];
  sbPct: [number, number];
}

export interface PitchLeague {
  k9: [number, number];
  bb9: [number, number];
  hr9: [number, number];
  era: [number, number];
  whip: [number, number];
  ipPerGs: [number, number];
  babipAgainst: [number, number];
}

function ms(arr: number[], minStd = 0.001): [number, number] {
  return [mean(arr), Math.max(minStd, std(arr))];
}

/** Modern fallback benchmarks (post-2010 averages) used when API data is unavailable. */
const MODERN_HIT_LEAGUE: HitLeague = {
  avg: [0.252, 0.028],
  kPct: [0.225, 0.060],
  bbPct: [0.085, 0.025],
  hrPerAb: [0.036, 0.026],
  iso: [0.158, 0.062],
  xbhPerAb: [0.098, 0.030],
  triplesPerAb: [0.004, 0.004],
  babip: [0.297, 0.024],
  sbPerGame: [0.090, 0.110],
  sbPct: [0.720, 0.120],
};

const MODERN_PITCH_LEAGUE: PitchLeague = {
  k9: [8.6, 2.0],
  bb9: [3.3, 1.2],
  hr9: [1.25, 0.50],
  era: [4.20, 1.0],
  whip: [1.31, 0.20],
  ipPerGs: [5.5, 1.2],
  babipAgainst: [0.295, 0.025],
};

export function computeHitLeague(players: LeagueHitter[]): HitLeague {
  const q = players.filter((p) => p.pa >= 150);
  if (q.length < 20) return MODERN_HIT_LEAGUE;
  const d = q.map((p) =>
    hitRates({ ...p, avg: p.avg, slg: p.slg, gamesPlayed: p.gamesPlayed })
  );
  return {
    avg: ms(d.map((x) => x.avg), 0.005),
    kPct: ms(d.map((x) => x.kPct), 0.01),
    bbPct: ms(d.map((x) => x.bbPct), 0.005),
    hrPerAb: ms(d.map((x) => x.hrPerAb), 0.005),
    iso: ms(d.map((x) => x.iso), 0.010),
    xbhPerAb: ms(d.map((x) => x.xbhPerAb), 0.005),
    triplesPerAb: ms(d.map((x) => x.triplesPerAb), 0.001),
    babip: ms(d.map((x) => x.babip), 0.010),
    sbPerGame: ms(d.map((x) => x.sbPerGame), 0.010),
    sbPct: ms(d.filter((x) => x.sbAttempts >= 5).map((x) => x.sbPct), 0.05),
  };
}

export function computePitchLeague(pitchers: LeaguePitcher[]): PitchLeague {
  const q = pitchers.filter((p) => p.ip >= 40);
  if (q.length < 20) return MODERN_PITCH_LEAGUE;
  const d = q.map((p) => pitchRates(p));
  return {
    k9: ms(d.map((x) => x.k9), 0.5),
    bb9: ms(d.map((x) => x.bb9), 0.3),
    hr9: ms(d.map((x) => x.hr9), 0.2),
    era: ms(d.map((x) => x.era).filter((v) => v > 0 && v < 20), 0.5),
    whip: ms(d.map((x) => x.whip).filter((v) => v > 0 && v < 5), 0.1),
    ipPerGs: ms(
      d.filter((x) => x.ipPerGs > 0).map((x) => x.ipPerGs),
      0.5
    ),
    babipAgainst: ms(d.map((x) => x.babipAgainst), 0.01),
  };
}

// ── Core projection functions ─────────────────────────────────────────────

function z([m, s]: [number, number], val: number) {
  return (val - m) / s;
}

export function projectHitterRatings(
  stats: SeasonHitStats,
  league: HitLeague,
  fielding?: { fr?: number; ferr?: number; farm?: number },
  cd?: HitCardDist | null
): HitterRatings {
  const d = hitRates(stats);

  const contactZ =
    0.6 * z(league.avg, d.avg) - 0.4 * z(league.kPct, d.kPct);
  const gapZ = z(league.xbhPerAb, d.xbhPerAb);
  const powerZ =
    0.55 * z(league.hrPerAb, d.hrPerAb) + 0.45 * z(league.iso, d.iso);
  const eyeZ = z(league.bbPct, d.bbPct);
  const avoidKZ = -z(league.kPct, d.kPct); // lower K% = higher avoid-K rating
  const babipZ = z(league.babip, d.babip);
  const speedZ =
    0.55 * z(league.sbPerGame, d.sbPerGame) +
    0.45 * z(league.triplesPerAb, d.triplesPerAb);
  // For players with fewer than 5 steal attempts the sbPct value is a default
  // (not a real measurement), so use sbPerGame as a proxy instead to avoid
  // inflating stealing ratings for non-stealers.
  const stealingZ = d.sbAttempts >= 5
    ? z(league.sbPct, d.sbPct)
    : z(league.sbPerGame, d.sbPerGame);
  const baserunZ = 0.6 * speedZ + 0.4 * stealingZ;

  // Fielding z-scores: Lahman-derived fr/ferr/farm are on the standard
  // 1-250 scale (center 125, spread 33). Convert back to z before re-mapping
  // through the card-pool distribution so calibration applies uniformly.
  const fieldRangeZ = fielding?.fr   !== undefined
    ? ratingToZ(fielding.fr)
    : speedZ * 0.3; // speed is a weak proxy when no fielding data
  const fieldErrorZ = fielding?.ferr !== undefined
    ? ratingToZ(fielding.ferr)
    : speedZ * 0.3;
  const fieldArmZ   = fielding?.farm !== undefined
    ? ratingToZ(fielding.farm)
    : 0; // neutral when arm data is absent

  return {
    contact:     zrCal(cd?.contact,     contactZ),
    gap:         zrCal(cd?.gap,         gapZ),
    power:       zrCal(cd?.power,       powerZ),
    eye:         zrCal(cd?.eye,         eyeZ),
    avoidK:      zrCal(cd?.avoidK,      avoidKZ),
    babip:       zrCal(cd?.babip,       babipZ),
    speed:       zrCal(cd?.speed,       speedZ),
    stealing:    zrCal(cd?.stealing,    stealingZ),
    baserunning: zrCal(cd?.baserunning, baserunZ),
    // No per-player bunt metric exists; use card-pool mean (or fixed neutral).
    sacBunt:     cd ? Math.round(cd.sacBunt[0]) : 100,
    buntForHit:  zrCal(cd?.buntForHit, speedZ * 0.6),
    ifRange:     zrCal(cd?.ifRange,    fieldRangeZ),
    ifError:     zrCal(cd?.ifError,    fieldErrorZ),
    ifArm:       zrCal(cd?.ifArm,      fieldArmZ),
    turnDP:      cd ? Math.round(cd.turnDP[0]) : 100,
    ofRange:     zrCal(cd?.ofRange,    fieldRangeZ),
    ofError:     zrCal(cd?.ofError,    fieldErrorZ),
    ofArm:       zrCal(cd?.ofArm,      fieldArmZ),
    cAbility:    zrCal(cd?.cAbility,   fieldRangeZ),
    cFraming:    cd ? Math.round(cd.cFraming[0]) : 100,
    cArm:        zrCal(cd?.cArm,       fieldArmZ),
  };
}

export function projectHitterSplitRatings(
  split: HitSplitLine,
  league: HitLeague,
  cd?: HitCardDist | null
): Partial<HitterRatings> {
  if (split.pa < 25) return {};
  const s: SeasonHitStats = {
    gamesPlayed: 50,
    pa: split.pa,
    ab: split.ab,
    hits: split.hits,
    doubles: split.doubles,
    triples: split.triples,
    hr: split.hr,
    rbi: 0,
    bb: split.bb,
    hbp: split.hbp,
    so: split.so,
    sb: split.sb,
    cs: split.cs,
    avg: split.avg,
    obp: split.obp,
    slg: split.slg,
  };
  const r = projectHitterRatings(s, league, undefined, cd);
  return {
    contact: r.contact,
    gap: r.gap,
    power: r.power,
    eye: r.eye,
    avoidK: r.avoidK,
    babip: r.babip,
  };
}

export function projectPitcherRatings(
  stats: SeasonPitchStats,
  league: PitchLeague,
  cd?: PitchCardDist | null
): PitcherRatings {
  const d = pitchRates(stats);
  const isStarter = stats.gamesStarted >= stats.gamesPlayed * 0.5;

  const stuffZ = z(league.k9, d.k9);
  // Movement: suppressing hits-on-BIP and HR (both lower-is-better → invert)
  const movementZ =
    0.5 * (-z(league.babipAgainst, d.babipAgainst)) +
    0.5 * (-z(league.hr9, d.hr9));
  const controlZ = -z(league.bb9, d.bb9);
  const pHRZ = -z(league.hr9, d.hr9);
  const pBABIPZ = -z(league.babipAgainst, d.babipAgainst);
  const staminaZ = isStarter
    ? z(league.ipPerGs, d.ipPerGs)
    : -1.5; // relievers intentionally low stamina

  return {
    stuff:    zrCal(cd?.stuff,    stuffZ),
    movement: zrCal(cd?.movement, movementZ),
    control:  zrCal(cd?.control,  controlZ),
    pHR:      zrCal(cd?.pHR,      pHRZ),
    pBABIP:   zrCal(cd?.pBABIP,   pBABIPZ),
    stamina:  zrCal(cd?.stamina,  staminaZ),
    hold:     zrCal(cd?.hold,     controlZ * 0.6), // proxy
  };
}

export function projectPitcherSplitRatings(
  split: PitchSplitLine,
  league: PitchLeague,
  cd?: PitchCardDist | null
): Partial<PitcherRatings> {
  if (split.ip < 10) return {};
  const s: SeasonPitchStats = {
    gamesPlayed: 20,
    gamesStarted: 5,
    ip: split.ip,
    hits: split.hits,
    er: split.er,
    bb: split.bb,
    hbp: 0,
    so: split.so,
    hr: split.hr,
    era: split.era,
    whip: split.whip,
  };
  const r = projectPitcherRatings(s, league, cd);
  return {
    stuff:    r.stuff,
    movement: r.movement,
    control:  r.control,
    pHR:      r.pHR,
    pBABIP:   r.pBABIP,
  };
}

// ── OVR estimation ────────────────────────────────────────────────────────

function norm(v: number) {
  return Math.max(0, Math.min(100, (v / 250) * 100));
}

/**
 * Continuous 0-100 composite of a hitter's value (offense + baserunning +
 * position-appropriate defense).  This is the raw, pre-rounding quantity behind
 * estimateHitterOvr; reverse search ranks candidates by it so the calibration
 * step (calibrateToPool) has a tie-light, monotonic ordering to work with.
 */
export function hitterCompositeScore(ratings: HitterRatings, position: string): number {
  const offense =
    norm(ratings.contact) * 0.16 +
    norm(ratings.gap) * 0.14 +
    norm(ratings.power) * 0.26 +
    norm(ratings.eye) * 0.20 +
    norm(ratings.avoidK) * 0.10 +
    norm(ratings.babip) * 0.14;

  const baserunning =
    norm(ratings.speed) * 0.5 +
    norm(ratings.baserunning) * 0.3 +
    norm(ratings.stealing) * 0.2;

  const pos = position.toUpperCase();
  let defense: number;
  if (pos === "C") {
    defense =
      norm(ratings.cAbility) * 0.4 +
      norm(ratings.cFraming) * 0.4 +
      norm(ratings.cArm) * 0.2;
  } else if (["1B", "2B", "3B", "SS"].includes(pos)) {
    defense =
      norm(ratings.ifRange) * 0.55 +
      norm(ratings.ifArm) * 0.2 +
      norm(ratings.ifError) * 0.15 +
      norm(ratings.turnDP) * 0.1;
  } else if (["LF", "CF", "RF"].includes(pos)) {
    defense =
      norm(ratings.ofRange) * 0.6 +
      norm(ratings.ofArm) * 0.25 +
      norm(ratings.ofError) * 0.15;
  } else {
    defense = 40; // DH
  }

  return offense * 0.72 + baserunning * 0.08 + defense * 0.20;
}

export function estimateHitterOvr(ratings: HitterRatings, position: string): number {
  // OVR is derived from norm(rating) values, which are already anchored to the
  // card pool when cd was supplied.  The formula below maps the 0-100 total to
  // an OVR range that is implicitly calibrated through those ratings.
  const total = hitterCompositeScore(ratings, position);
  return Math.max(60, Math.min(105, Math.round(48 + total * 0.58)));
}

/** Continuous 0-100 composite of a pitcher's value; see hitterCompositeScore. */
export function pitcherCompositeScore(
  ratings: PitcherRatings,
  isStarter: boolean
): number {
  const rp =
    norm(ratings.stuff) * 0.26 +
    norm(ratings.movement) * 0.22 +
    norm(ratings.control) * 0.20 +
    norm(ratings.pHR) * 0.20 +
    norm(ratings.pBABIP) * 0.12;

  const staminaW = isStarter ? 0.15 : 0.04;
  return rp * (1 - staminaW) + norm(ratings.stamina) * staminaW;
}

export function estimatePitcherOvr(
  ratings: PitcherRatings,
  isStarter: boolean
): number {
  const total = pitcherCompositeScore(ratings, isStarter);
  return Math.max(60, Math.min(105, Math.round(48 + total * 0.58)));
}

// ── Pool-calibrated tier assignment (reverse search) ──────────────────────
//
// The absolute OVR formula above compresses the entire historical population
// into a narrow Silver-centered band that never reaches Diamond/Perfect, so
// tier-targeted reverse search returns little outside one tier.  Instead, we
// rank a candidate population by composite score and map each rank to a tier
// (and a calibrated OVR) so the population's tier proportions MIRROR the live
// Perfect Team card pool.  Because the pool distribution is read fresh on every
// request, the mapping tracks the small weekly drift as new cards are added.

const TIER_ORDER: Tier[] = [
  "Iron", "Bronze", "Silver", "Gold", "Diamond", "Perfect",
];

/** Display OVR range for each tier (used to spread calibrated OVRs within a tier). */
const TIER_OVR_RANGE: Record<Tier, [number, number]> = {
  Iron:    [40, 59],
  Bronze:  [60, 69],
  Silver:  [70, 79],
  Gold:    [80, 89],
  Diamond: [90, 99],
  Perfect: [100, 105],
};

/** One tier's slice of the cumulative-from-bottom distribution, in [0,1]. */
export interface TierBand {
  tier: Tier;
  lo: number; // cumulative fraction below this tier
  hi: number; // cumulative fraction at the top of this tier
}

/**
 * Convert per-tier card counts into cumulative bands ordered low→high.
 * Returns null when the pool is too small to mirror reliably (caller should
 * fall back to DEFAULT_TIER_BANDS).
 */
export function buildTierBands(counts: Partial<Record<Tier, number>>): TierBand[] | null {
  const total = TIER_ORDER.reduce((s, t) => s + (counts[t] ?? 0), 0);
  if (total < 50) return null;
  const bands: TierBand[] = [];
  let cum = 0;
  for (const tier of TIER_ORDER) {
    const frac = (counts[tier] ?? 0) / total;
    bands.push({ tier, lo: cum, hi: cum + frac });
    cum += frac;
  }
  bands[bands.length - 1].hi = 1; // guard against float drift
  return bands;
}

/** Reasonable spread used only when the card pool is unavailable (e.g. dev without generated data). */
export const DEFAULT_TIER_BANDS: TierBand[] = buildTierBands({
  Iron: 2, Bronze: 30, Silver: 33, Gold: 20, Diamond: 12, Perfect: 3,
})!;

function bandAt(bands: TierBand[], cf: number): TierBand {
  for (const b of bands) if (cf < b.hi) return b;
  return bands[bands.length - 1];
}

/**
 * Rank a candidate population by `scores` and assign each member a tier plus a
 * calibrated OVR such that the population's tier proportions match `bands`.
 * Tied scores receive identical tier+OVR.  Returns results aligned to the input
 * order.  Ranking is peer-relative, so "Diamond" means "elite within this
 * search's population (position + season)", which is the intent of reverse
 * search — surfacing the standout seasons for a given slot.
 */
export function calibrateToPool(
  scores: number[],
  bands: TierBand[]
): { ovr: number; tier: Tier }[] {
  const n = scores.length;
  const out = new Array<{ ovr: number; tier: Tier }>(n);
  if (n === 0) return out;

  const order = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s - b.s);

  let k = 0;
  while (k < n) {
    let j = k;
    while (j < n && order[j].s === order[k].s) j++; // [k,j) share a score
    const cf = ((k + j) / 2) / n; // group midpoint as cumulative fraction
    const band = bandAt(bands, cf);
    const w = band.hi > band.lo ? (cf - band.lo) / (band.hi - band.lo) : 0.5;
    const [ovrLo, ovrHi] = TIER_OVR_RANGE[band.tier];
    const ovr = Math.round(ovrLo + w * (ovrHi - ovrLo));
    for (let m = k; m < j; m++) out[order[m].i] = { ovr, tier: band.tier };
    k = j;
  }
  return out;
}

// ── Public projection entry points ────────────────────────────────────────

export function buildHitterCard(
  stats: SeasonHitStats,
  leaguePlayers: LeagueHitter[],
  splits: { vsLeft: HitSplitLine | null; vsRight: HitSplitLine | null },
  position: string,
  cd?: HitCardDist | null
): ProjectedCard {
  const league = computeHitLeague(leaguePlayers);
  const hitter = projectHitterRatings(stats, league, undefined, cd);
  const ovr = estimateHitterOvr(hitter, position);

  return {
    ovr,
    tier: tierFromOvr(ovr),
    isPitcher: false,
    isStarter: false,
    hitter,
    hitterVL: splits.vsLeft
      ? projectHitterSplitRatings(splits.vsLeft, league, cd)
      : undefined,
    hitterVR: splits.vsRight
      ? projectHitterSplitRatings(splits.vsRight, league, cd)
      : undefined,
    leagueContextAvailable: leaguePlayers.length >= 20,
  };
}

export function buildPitcherCard(
  stats: SeasonPitchStats,
  leaguePitchers: LeaguePitcher[],
  splits: { vsLeft: PitchSplitLine | null; vsRight: PitchSplitLine | null },
  cd?: PitchCardDist | null
): ProjectedCard {
  const league = computePitchLeague(leaguePitchers);
  const pitcher = projectPitcherRatings(stats, league, cd);
  const isStarter = stats.gamesStarted >= stats.gamesPlayed * 0.5;
  const ovr = estimatePitcherOvr(pitcher, isStarter);

  return {
    ovr,
    tier: tierFromOvr(ovr),
    isPitcher: true,
    isStarter,
    pitcher,
    pitcherVL: splits.vsLeft
      ? projectPitcherSplitRatings(splits.vsLeft, league, cd)
      : undefined,
    pitcherVR: splits.vsRight
      ? projectPitcherSplitRatings(splits.vsRight, league, cd)
      : undefined,
    leagueContextAvailable: leaguePitchers.length >= 20,
  };
}
