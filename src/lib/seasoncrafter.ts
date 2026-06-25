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

/** Convert a z-score to OOTP 1-250 rating. League average → 125. */
function zr(z: number): number {
  return Math.max(20, Math.min(250, Math.round(125 + z * 33)));
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
    sbPct: ms(d.map((x) => x.sbPct).filter((x) => x > 0), 0.05),
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
  league: HitLeague
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
  const stealingZ = z(league.sbPct, d.sbPct);
  const baserunZ = 0.6 * speedZ + 0.4 * stealingZ;

  // Fielding: rough proxy from speed + generic average
  // Specific defensive metrics (UZR/DRS) are not available from this API;
  // fielding ratings are marked accordingly in the UI.
  const fieldBase = Math.max(20, Math.min(250, Math.round(125 + speedZ * 15)));

  return {
    contact: zr(contactZ),
    gap: zr(gapZ),
    power: zr(powerZ),
    eye: zr(eyeZ),
    avoidK: zr(avoidKZ),
    babip: zr(babipZ),
    speed: zr(speedZ),
    stealing: zr(stealingZ),
    baserunning: zr(baserunZ),
    sacBunt: 100,
    buntForHit: Math.max(20, Math.min(250, Math.round(125 + speedZ * 20))),
    ifRange: fieldBase,
    ifError: fieldBase,
    ifArm: 100,
    turnDP: 100,
    ofRange: fieldBase,
    ofError: fieldBase,
    ofArm: 100,
    cAbility: 100,
    cFraming: 100,
    cArm: 100,
  };
}

export function projectHitterSplitRatings(
  split: HitSplitLine,
  league: HitLeague
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
  const r = projectHitterRatings(s, league);
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
  league: PitchLeague
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
    stuff: zr(stuffZ),
    movement: zr(movementZ),
    control: zr(controlZ),
    pHR: zr(pHRZ),
    pBABIP: zr(pBABIPZ),
    stamina: zr(staminaZ),
    hold: zr(controlZ * 0.6), // proxy
  };
}

export function projectPitcherSplitRatings(
  split: PitchSplitLine,
  league: PitchLeague
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
  const r = projectPitcherRatings(s, league);
  return {
    stuff: r.stuff,
    movement: r.movement,
    control: r.control,
    pHR: r.pHR,
    pBABIP: r.pBABIP,
  };
}

// ── OVR estimation ────────────────────────────────────────────────────────

function norm(v: number) {
  return Math.max(0, Math.min(100, (v / 250) * 100));
}

export function estimateHitterOvr(ratings: HitterRatings, position: string): number {
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

  const total = offense * 0.72 + baserunning * 0.08 + defense * 0.20;
  // Map engine 0-100 → OVR 60-105
  return Math.max(60, Math.min(105, Math.round(48 + total * 0.58)));
}

export function estimatePitcherOvr(
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
  const total = rp * (1 - staminaW) + norm(ratings.stamina) * staminaW;
  return Math.max(60, Math.min(105, Math.round(48 + total * 0.58)));
}

// ── Public projection entry points ────────────────────────────────────────

export function buildHitterCard(
  stats: SeasonHitStats,
  leaguePlayers: LeagueHitter[],
  splits: { vsLeft: HitSplitLine | null; vsRight: HitSplitLine | null },
  position: string
): ProjectedCard {
  const league = computeHitLeague(leaguePlayers);
  const hitter = projectHitterRatings(stats, league);
  const ovr = estimateHitterOvr(hitter, position);

  return {
    ovr,
    tier: tierFromOvr(ovr),
    isPitcher: false,
    isStarter: false,
    hitter,
    hitterVL: splits.vsLeft
      ? projectHitterSplitRatings(splits.vsLeft, league)
      : undefined,
    hitterVR: splits.vsRight
      ? projectHitterSplitRatings(splits.vsRight, league)
      : undefined,
    leagueContextAvailable: leaguePlayers.length >= 20,
  };
}

export function buildPitcherCard(
  stats: SeasonPitchStats,
  leaguePitchers: LeaguePitcher[],
  splits: { vsLeft: PitchSplitLine | null; vsRight: PitchSplitLine | null }
): ProjectedCard {
  const league = computePitchLeague(leaguePitchers);
  const pitcher = projectPitcherRatings(stats, league);
  const isStarter = stats.gamesStarted >= stats.gamesPlayed * 0.5;
  const ovr = estimatePitcherOvr(pitcher, isStarter);

  return {
    ovr,
    tier: tierFromOvr(ovr),
    isPitcher: true,
    isStarter,
    pitcher,
    pitcherVL: splits.vsLeft
      ? projectPitcherSplitRatings(splits.vsLeft, league)
      : undefined,
    pitcherVR: splits.vsRight
      ? projectPitcherSplitRatings(splits.vsRight, league)
      : undefined,
    leagueContextAvailable: leaguePitchers.length >= 20,
  };
}
