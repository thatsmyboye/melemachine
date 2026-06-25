// ─────────────────────────────────────────────────────────────────────────
// OOTP / Perfect Team numeric encodings used in the CSV exports.
// ─────────────────────────────────────────────────────────────────────────
import type { PositionCode, PitcherRole, Tier, Handed } from "./types";

export const TIER_BY_CODE: Record<string, Tier> = {
  "0": "Iron",
  "1": "Bronze",
  "2": "Silver",
  "3": "Gold",
  "4": "Diamond",
  "5": "Perfect",
};

/** Authoritative tier from overall rating (OVR), per PT definitions. */
export function tierFromOvr(ovr: number): Tier {
  if (ovr >= 100) return "Perfect";
  if (ovr >= 90) return "Diamond";
  if (ovr >= 80) return "Gold";
  if (ovr >= 70) return "Silver";
  if (ovr >= 60) return "Bronze";
  return "Iron";
}

export const POSITION_BY_CODE: Record<string, PositionCode> = {
  "1": "P",
  "2": "C",
  "3": "1B",
  "4": "2B",
  "5": "3B",
  "6": "SS",
  "7": "LF",
  "8": "CF",
  "9": "RF",
  "10": "DH",
};

export const PITCHER_ROLE_BY_CODE: Record<string, PitcherRole> = {
  "0": "None",
  "11": "SP",
  "12": "RP",
  "13": "CL",
};

export const HAND_BY_CODE: Record<string, Handed> = {
  "1": "R",
  "2": "L",
  "3": "S",
};

// Card Type numeric -> game-canonical label (confirmed against in-game filter UI).
// Note: T4 cards (series "T4 Ep. 1/2/3") are distributed across multiple types
// and are identifiable via the Card.series field, not a distinct numeric type code.
export const CARD_TYPE_NAME: Record<string, string> = {
  "1": "2026 MLB Live Card",
  "2": "Negro League Star",
  "3": "Rookie Sensation",
  "4": "All-Time Legend",
  "5": "Historical All-Star",
  "6": "Future Legend",
  "7": "Snapshot",
  "8": "Unsung Heroes",
  "9": "Hardware Heroes",
  "10": "Veteran Presence",
};

export const TIER_ORDER: Tier[] = [
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Diamond",
  "Perfect",
];

export const TIER_COLORS: Record<Tier, string> = {
  Iron: "#8a8f98",
  Bronze: "#b87333",
  Silver: "#c0c5ce",
  Gold: "#e3b341",
  Diamond: "#5ad1e6",
  Perfect: "#c084fc",
};
