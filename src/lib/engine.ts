// ─────────────────────────────────────────────────────────────────────────
// The Rating Intelligence Engine.
//
// Turns a card's raw OOTP ratings into context-aware value scores. The core
// idea: the *same* card is worth different amounts depending on the run
// environment (RE) and the matchup. Power plays up in a high-RE tournament;
// contact, OBP, speed and defense play up in a low-RE pitcher's park.
//
// All weights are transparent and tunable — the UI exposes them so you can
// calibrate against real PT results and out-tune cwhitstats / beanecounter.
// ─────────────────────────────────────────────────────────────────────────
import type { Card, PositionCode } from "./types";
import { RATING_BY_KEY, RATING_SCALE_MAX } from "./ratings";

// ── Run environment ────────────────────────────────────────────────────────
export type RunEnvKey = "low" | "medium" | "high" | "extreme";

export interface RunEnv {
  key: RunEnvKey;
  label: string;
  /** Approx runs per game per team this RE represents. */
  runsPerGame: number;
  description: string;
}

export const RUN_ENVIRONMENTS: Record<RunEnvKey, RunEnv> = {
  low: {
    key: "low",
    label: "Low RE",
    runsPerGame: 3.5,
    description:
      "Pitcher-friendly. Contact, on-base skills, speed and defense win games. Power is muted.",
  },
  medium: {
    key: "medium",
    label: "Medium RE",
    runsPerGame: 4.5,
    description:
      "Balanced, modern-MLB-like environment. On-base and slugging both matter.",
  },
  high: {
    key: "high",
    label: "High RE",
    runsPerGame: 6.0,
    description:
      "Hitter-friendly. Power and HR-suppression dominate; defense and speed fade.",
  },
  extreme: {
    key: "extreme",
    label: "Extreme RE",
    runsPerGame: 8.0,
    description:
      "Slugfest / coors-on-steroids. Home runs decide everything; play your biggest bats and HR-limiting arms.",
  },
};

/**
 * Converts a rating's run-environment bias into an actual multiplier for the
 * given environment. reBias > 1 ratings (Power, pHR) get boosted in high RE
 * and suppressed in low RE; reBias < 1 ratings (Avoid K, Speed) do the
 * opposite. Centered at the "medium" environment.
 */
function reMultiplier(reBias: number, env: RunEnv): number {
  const medium = RUN_ENVIRONMENTS.medium.runsPerGame;
  // -1 .. +1 over a realistic RPG span around medium.
  const t = (env.runsPerGame - medium) / 3.5;
  // tilt magnitude scales with how far reBias is from neutral.
  return 1 + (reBias - 1) * t * 2;
}

// ── Weights ──────────────────────────────────────────────────────────────
export type HitterWeights = {
  contact: number;
  gap: number;
  power: number;
  eye: number;
  avoidK: number;
  babip: number;
};

export type PitcherWeights = {
  stuff: number;
  movement: number;
  control: number;
  pHR: number;
  pBABIP: number;
};

export interface EngineWeights {
  hitter: HitterWeights;
  pitcher: PitcherWeights;
  /** Relative contribution of each component to a position player's total. */
  hitterComposition: { offense: number; baserunning: number; defense: number };
  /** Relative contribution for pitchers. */
  pitcherComposition: { run_prevention: number; stamina: number };
}

// Baseline weights reflect modern run-value research: OBP skills are weighted
// a touch above raw average; power is the highest single hitting lever.
export const DEFAULT_WEIGHTS: EngineWeights = {
  hitter: {
    contact: 0.16,
    gap: 0.14,
    power: 0.26,
    eye: 0.2,
    avoidK: 0.1,
    babip: 0.14,
  },
  pitcher: {
    stuff: 0.26,
    movement: 0.22,
    control: 0.2,
    pHR: 0.2,
    pBABIP: 0.12,
  },
  hitterComposition: { offense: 0.72, baserunning: 0.08, defense: 0.2 },
  pitcherComposition: { run_prevention: 0.85, stamina: 0.15 },
};

// Positional scarcity — up-the-middle defense is premium. Multiplies the
// defensive component, so a great defensive SS is worth more than a great
// defensive 1B at equal fielding ratings.
export const POSITION_SCARCITY: Record<PositionCode, number> = {
  C: 1.35,
  SS: 1.3,
  CF: 1.25,
  "2B": 1.15,
  "3B": 1.05,
  RF: 1.0,
  LF: 0.95,
  "1B": 0.85,
  DH: 0.6,
  P: 1.0,
};

export type Split = "overall" | "vL" | "vR";

export interface ScoreContext {
  runEnv: RunEnvKey;
  split: Split;
  weights?: EngineWeights;
}

export interface ScoreBreakdown {
  label: string;
  raw: number;
  normalized: number; // 0-100
  weight: number; // RE-adjusted weight actually used
  contribution: number; // points added to the component score
}

export interface CardScore {
  cardId: number;
  total: number; // 0-100ish context value
  offense: number;
  baserunning: number;
  defense: number;
  runPrevention: number;
  stamina: number;
  isPitcher: boolean;
  breakdown: ScoreBreakdown[];
  /** value-for-money: total per 1k market cost (null if no price). */
  efficiency: number | null;
}

function norm(raw: number): number {
  return Math.max(0, Math.min(100, (raw / RATING_SCALE_MAX) * 100));
}

/** Apply RE bias to a weight set and renormalize so weights still sum to 1. */
function adjustWeights(
  weights: Record<string, number>,
  env: RunEnv
): Record<string, number> {
  const adjusted: Record<string, number> = {};
  let sum = 0;
  for (const [k, w] of Object.entries(weights)) {
    const def = RATING_BY_KEY[k];
    const m = def ? reMultiplier(def.reBias, env) : 1;
    const v = Math.max(0, w * m);
    adjusted[k] = v;
    sum += v;
  }
  if (sum > 0) for (const k of Object.keys(adjusted)) adjusted[k] /= sum;
  return adjusted;
}

function hitRatings(card: Card, split: Split) {
  return card.hit[split];
}
function pitchRatings(card: Card, split: Split) {
  return card.pitch[split];
}

function scoreOffense(
  card: Card,
  ctx: ScoreContext,
  env: RunEnv,
  weights: EngineWeights
): { score: number; breakdown: ScoreBreakdown[] } {
  const w = adjustWeights(weights.hitter, env);
  const r = hitRatings(card, ctx.split);
  const parts: Array<[keyof HitterWeights, number]> = [
    ["contact", r.contact],
    ["gap", r.gap],
    ["power", r.power],
    ["eye", r.eye],
    ["avoidK", r.avoidK],
    ["babip", r.babip],
  ];
  const breakdown: ScoreBreakdown[] = [];
  let score = 0;
  for (const [k, raw] of parts) {
    const n = norm(raw);
    const contribution = n * w[k];
    score += contribution;
    breakdown.push({
      label: RATING_BY_KEY[k]?.label ?? k,
      raw,
      normalized: round1(n),
      weight: round3(w[k]),
      contribution: round1(contribution),
    });
  }
  return { score, breakdown };
}

function scoreBaserunning(card: Card): number {
  const { speed, stealing, baserunning } = card.baserun;
  return norm(speed) * 0.5 + norm(baserunning) * 0.3 + norm(stealing) * 0.2;
}

function scoreDefense(card: Card): number {
  const f = card.field;
  switch (card.position) {
    case "C":
      return norm(f.cAbility) * 0.4 + norm(f.cFraming) * 0.4 + norm(f.cArm) * 0.2;
    case "1B":
    case "2B":
    case "3B":
    case "SS":
      return norm(f.ifRange) * 0.55 + norm(f.ifArm) * 0.2 + norm(f.ifError) * 0.15 + norm(f.turnDP) * 0.1;
    case "LF":
    case "CF":
    case "RF":
      return norm(f.ofRange) * 0.6 + norm(f.ofArm) * 0.25 + norm(f.ofError) * 0.15;
    default:
      return 0;
  }
}

function scorePitching(
  card: Card,
  ctx: ScoreContext,
  env: RunEnv,
  weights: EngineWeights
): { score: number; breakdown: ScoreBreakdown[] } {
  const w = adjustWeights(weights.pitcher, env);
  const r = pitchRatings(card, ctx.split);
  const parts: Array<[keyof PitcherWeights, number]> = [
    ["stuff", r.stuff],
    ["movement", r.movement],
    ["control", r.control],
    ["pHR", r.pHR],
    ["pBABIP", r.pBABIP],
  ];
  const breakdown: ScoreBreakdown[] = [];
  let score = 0;
  for (const [k, raw] of parts) {
    const n = norm(raw);
    const contribution = n * w[k];
    score += contribution;
    breakdown.push({
      label: RATING_BY_KEY[k]?.label ?? k,
      raw,
      normalized: round1(n),
      weight: round3(w[k]),
      contribution: round1(contribution),
    });
  }
  return { score, breakdown };
}

export function scoreCard(card: Card, ctx: ScoreContext): CardScore {
  const env = RUN_ENVIRONMENTS[ctx.runEnv];
  const weights = ctx.weights ?? DEFAULT_WEIGHTS;
  const price = card.prices.last10 ?? card.prices.sellLow ?? card.prices.buyHigh;

  if (card.isPitcher) {
    const { score: rp, breakdown } = scorePitching(card, ctx, env, weights);
    const stamina = norm(card.pitcherPhysical.stamina);
    const comp = weights.pitcherComposition;
    // Relievers don't need stamina; weight it only for starters.
    const staminaWeight = card.pitcherRole === "SP" ? comp.stamina : comp.stamina * 0.25;
    const total =
      rp * (1 - staminaWeight) + stamina * staminaWeight;
    return {
      cardId: card.id,
      total: round1(total),
      offense: 0,
      baserunning: 0,
      defense: 0,
      runPrevention: round1(rp),
      stamina: round1(stamina),
      isPitcher: true,
      breakdown,
      efficiency: price ? round2((total / price) * 1000) : null,
    };
  }

  const { score: offense, breakdown } = scoreOffense(card, ctx, env, weights);
  const baserunning = scoreBaserunning(card);
  const defenseRaw = scoreDefense(card);
  const scarcity = POSITION_SCARCITY[card.position] ?? 1;
  const defense = Math.min(100, defenseRaw * scarcity);

  // Defense & baserunning matter more as RE falls.
  const reTilt = (RUN_ENVIRONMENTS.medium.runsPerGame - env.runsPerGame) / 8;
  const comp = weights.hitterComposition;
  const defShare = Math.max(0.05, comp.defense * (1 + reTilt));
  const brShare = Math.max(0.02, comp.baserunning * (1 + reTilt));
  const offShare = Math.max(0.4, 1 - defShare - brShare);

  const total = offense * offShare + baserunning * brShare + defense * defShare;

  return {
    cardId: card.id,
    total: round1(total),
    offense: round1(offense),
    baserunning: round1(baserunning),
    defense: round1(defense),
    runPrevention: 0,
    stamina: 0,
    isPitcher: false,
    breakdown,
    efficiency: price ? round2((total / price) * 1000) : null,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
