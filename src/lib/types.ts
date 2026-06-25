// ─────────────────────────────────────────────────────────────────────────
// Core domain types for the Mele Machine
// ─────────────────────────────────────────────────────────────────────────

export type Tier =
  | "Iron"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Diamond"
  | "Perfect";

export type PositionCode =
  | "P"
  | "C"
  | "1B"
  | "2B"
  | "3B"
  | "SS"
  | "LF"
  | "CF"
  | "RF"
  | "DH";

export type PitcherRole = "None" | "SP" | "RP" | "CL";

export type Handed = "L" | "R" | "S";

/** Hitting ratings on OOTP's ~1-250 internal scale. */
export interface HitRatings {
  contact: number;
  gap: number;
  power: number;
  eye: number;
  avoidK: number;
  babip: number;
}

export interface HitSplits {
  overall: HitRatings;
  vL: HitRatings;
  vR: HitRatings;
}

export interface BaserunRatings {
  speed: number;
  stealRate: number;
  stealing: number;
  baserunning: number;
  sacBunt: number;
  buntForHit: number;
}

export interface PitchRatings {
  stuff: number;
  movement: number;
  control: number;
  pHR: number;
  pBABIP: number;
}

export interface PitchSplits {
  overall: PitchRatings;
  vL: PitchRatings;
  vR: PitchRatings;
}

export interface FieldRatings {
  ifRange: number;
  ifError: number;
  ifArm: number;
  turnDP: number;
  cAbility: number;
  cFraming: number;
  cArm: number;
  ofRange: number;
  ofError: number;
  ofArm: number;
}

export interface PitcherPhysical {
  stamina: number;
  hold: number;
  groundball: number;
  velocity: string; // e.g. "97-99"
  armSlot: number;
}

export interface Prices {
  buyHigh: number | null; // highest standing buy order
  sellLow: number | null; // lowest standing sell order
  last10: number | null; // average of last 10 sales
  last10Var: number | null;
}

export interface Card {
  id: number;
  title: string;
  firstName: string;
  lastName: string;
  nickName: string;
  ovr: number;
  tier: Tier;
  cardType: number;
  cardTypeName: string;
  subType: string; // LE, HOF, BBR, UTIL, WBC, ...
  badge: string;
  series: string;
  year: number;
  team: string;
  franchise: string;
  position: PositionCode;
  pitcherRole: PitcherRole;
  isPitcher: boolean;
  bats: Handed;
  throws: Handed;
  isLE: boolean; // limited edition
  limitQty: number; // 0 = unlimited
  owned: number;
  brefid: string; // baseball-reference id, key to MLB data
  era: number;

  hit: HitSplits;
  baserun: BaserunRatings;
  pitch: PitchSplits;
  field: FieldRatings;
  pitcherPhysical: PitcherPhysical;
  positionRatings: Partial<Record<PositionCode, number>>;

  prices: Prices;
  date: string; // release date
}

/** A row from the user's personal collection export. */
export interface CollectionCard {
  name: string;
  position: string;
  bats: Handed;
  throws: Handed;
  cType: string; // "2026 MLB", "Snapshot", ...
  ovr: number;
  isLive: boolean; // 2026 MLB == Live card
  active: boolean; // Active vs Reserve
  tourEligible: boolean;
  prices: { buy: number | null; sell: number | null; last10: number | null };
}

export interface CardDataset {
  generatedAt: string;
  count: number;
  cards: Card[];
}

export interface CollectionDataset {
  generatedAt: string;
  count: number;
  cards: CollectionCard[];
}
