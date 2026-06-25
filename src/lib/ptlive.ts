// ─────────────────────────────────────────────────────────────────────────
// PT Live scoring — transcribed from the beanecounter PT Live scoring table.
//
// Perfect Points are awarded for the real-life performance of a card's player
// on a given day. Starters and relievers use DIFFERENT pitching tables, and
// the card's own designation (SP vs RP/CL) decides which one applies — not how
// the player was used in the game.
// ─────────────────────────────────────────────────────────────────────────
import type { HitterLine, PitcherLine } from "./mlb";

export interface HitterScoring {
  single: number;
  double: number;
  triple: number;
  hr: number;
  threePlusHrBonus: number; // flat bonus for 3+ HR in a game
  fourPlusHitEach: number; // bonus for each hit at/beyond the 4th (4th, 5th, ...)
  run: number;
  rbi: number;
  bbHbp: number;
  sb: number;
  cs: number;
}

export interface PitcherScoring {
  win: number;
  ipPerInning: number;
  k: number;
  tenPlusKBonus: number; // flat bonus for 10+ K
  er: number;
  bbHbp: number;
  // starter-only
  completeGame?: number;
  shutout?: number;
  qualityStart?: number;
  // reliever-only
  save?: number;
  hold?: number;
  blownSave?: number;
}

export interface PPScoring {
  /** True now that beanecounter values are entered. */
  confirmed: boolean;
  source: string;
  hitter: HitterScoring;
  startingPitcher: PitcherScoring;
  reliefPitcher: PitcherScoring;
}

// Source: beanecounter.com/pt-live scoring table (screenshot 2026-06-25).
export const PP_SCORING: PPScoring = {
  confirmed: true,
  source: "beanecounter.com/pt-live (2026-06-25)",
  hitter: {
    single: 4,
    double: 6,
    triple: 10,
    hr: 15,
    threePlusHrBonus: 100,
    fourPlusHitEach: 25,
    run: 6,
    rbi: 6,
    bbHbp: 3,
    sb: 10,
    cs: -2,
  },
  startingPitcher: {
    win: 20,
    completeGame: 50,
    shutout: 100,
    ipPerInning: 4,
    k: 2,
    tenPlusKBonus: 40,
    qualityStart: 5,
    er: -2,
    bbHbp: -1,
  },
  reliefPitcher: {
    win: 12,
    save: 35,
    hold: 20,
    ipPerInning: 4,
    k: 3,
    tenPlusKBonus: 0, // not listed for relievers
    er: -2,
    blownSave: -1,
    bbHbp: -1,
  },
};

export function scoreHitterLine(line: HitterLine, s = PP_SCORING.hitter): number {
  const singles = Math.max(0, line.h - line.doubles - line.triples - line.hr);
  let pts =
    singles * s.single +
    line.doubles * s.double +
    line.triples * s.triple +
    line.hr * s.hr +
    line.r * s.run +
    line.rbi * s.rbi +
    (line.bb + line.hbp) * s.bbHbp +
    line.sb * s.sb +
    line.cs * s.cs;
  if (line.hr >= 3) pts += s.threePlusHrBonus;
  // 25 PP for each hit at or beyond the 4th (4th, 5th, 6th, ...).
  if (line.h >= 4) pts += (line.h - 3) * s.fourPlusHitEach;
  return Math.round(pts * 10) / 10;
}

export type PitcherKind = "SP" | "RP";

export function scorePitcherLine(
  line: PitcherLine,
  kind: PitcherKind,
  scoring = PP_SCORING
): number {
  const s = kind === "SP" ? scoring.startingPitcher : scoring.reliefPitcher;
  let pts =
    line.ip * s.ipPerInning +
    line.k * s.k +
    line.er * s.er +
    (line.bb + line.hbp) * s.bbHbp +
    (line.win ? s.win : 0);

  if (s.tenPlusKBonus && line.k >= 10) pts += s.tenPlusKBonus;

  if (kind === "SP") {
    if (line.shutout) pts += s.shutout ?? 0;
    else if (line.completeGame) pts += s.completeGame ?? 0;
    if (line.qualityStart) pts += s.qualityStart ?? 0;
  } else {
    if (line.save) pts += s.save ?? 0;
    if (line.hold) pts += s.hold ?? 0;
    if (line.blownSave) pts += s.blownSave ?? 0;
  }
  return Math.round(pts * 10) / 10;
}
