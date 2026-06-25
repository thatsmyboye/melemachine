// ─────────────────────────────────────────────────────────────────────────
// Rating metadata: what each OOTP rating actually does, the real-baseball
// outcome it drives, and which run environments amplify its importance.
// This is the "knowledge base" the Rating Intelligence Engine reasons over.
// ─────────────────────────────────────────────────────────────────────────

export type RatingGroup =
  | "hitting"
  | "baserunning"
  | "pitching"
  | "fielding";

export interface RatingDef {
  key: string;
  label: string;
  group: RatingGroup;
  /** Plain-English description of what the rating governs. */
  what: string;
  /** The real outcome / stat it most influences. */
  drives: string;
  /**
   * Run-environment sensitivity. > 1 means the rating becomes MORE important
   * as run environment rises (e.g. Power); < 1 means it becomes more important
   * as run environment FALLS (e.g. Avoid K, Speed, Defense). 1 is neutral.
   */
  reBias: number;
}

// OOTP ratings are stored on an internal ~1-250 scale in these exports.
export const RATING_SCALE_MAX = 250;

export const RATINGS: RatingDef[] = [
  // ── Hitting ──────────────────────────────────────────────────────────────
  {
    key: "contact",
    label: "Contact",
    group: "hitting",
    what: "How often the batter makes solid contact and avoids weak outs.",
    drives: "Batting average / hits",
    reBias: 0.95,
  },
  {
    key: "gap",
    label: "Gap Power",
    group: "hitting",
    what: "Ability to drive balls into the gaps for extra bases short of HRs.",
    drives: "Doubles & triples (ISO ex-HR)",
    reBias: 1.05,
  },
  {
    key: "power",
    label: "Power",
    group: "hitting",
    what: "Raw home-run power. The single biggest swing factor in high-RE play.",
    drives: "Home runs / SLG",
    reBias: 1.45,
  },
  {
    key: "eye",
    label: "Eye",
    group: "hitting",
    what: "Plate discipline — drawing walks and working counts.",
    drives: "Walks / OBP",
    reBias: 0.9,
  },
  {
    key: "avoidK",
    label: "Avoid K",
    group: "hitting",
    what: "Ability to avoid strikeouts and put the ball in play.",
    drives: "Strikeout rate (fewer Ks)",
    reBias: 0.8,
  },
  {
    key: "babip",
    label: "BABIP",
    group: "hitting",
    what: "Quality/luck of balls in play turning into hits.",
    drives: "Batting average on balls in play",
    reBias: 0.95,
  },

  // ── Baserunning ────────────────────────────────────────────────────────
  {
    key: "speed",
    label: "Speed",
    group: "baserunning",
    what: "Raw foot speed — infield hits, extra bases, range overlap.",
    drives: "Baserunning & infield hits",
    reBias: 0.75,
  },
  {
    key: "stealing",
    label: "Stealing",
    group: "baserunning",
    what: "Stolen-base technique and success rate.",
    drives: "Stolen bases",
    reBias: 0.7,
  },
  {
    key: "baserunning",
    label: "Baserunning",
    group: "baserunning",
    what: "Instincts taking extra bases and avoiding outs on the bases.",
    drives: "Baserunning runs",
    reBias: 0.8,
  },

  // ── Pitching ─────────────────────────────────────────────────────────────
  {
    key: "stuff",
    label: "Stuff",
    group: "pitching",
    what: "Swing-and-miss quality. Higher Stuff = more strikeouts.",
    drives: "Strikeouts (K/9)",
    reBias: 0.95,
  },
  {
    key: "movement",
    label: "Movement",
    group: "pitching",
    what: "How much pitches move — suppresses hard contact and home runs.",
    drives: "HR & hard-hit suppression",
    reBias: 1.35,
  },
  {
    key: "control",
    label: "Control",
    group: "pitching",
    what: "Command — limiting walks and staying in the zone.",
    drives: "Walks (BB/9)",
    reBias: 0.95,
  },
  {
    key: "pHR",
    label: "HR Allowed (pHR)",
    group: "pitching",
    what: "Tendency to surrender home runs (higher rating = fewer HR).",
    drives: "Home runs allowed",
    reBias: 1.4,
  },
  {
    key: "pBABIP",
    label: "Hits on Balls In Play (pBABIP)",
    group: "pitching",
    what: "Ability to limit hits on balls in play.",
    drives: "BABIP against",
    reBias: 1.0,
  },
  {
    key: "stamina",
    label: "Stamina",
    group: "pitching",
    what: "How deep a pitcher can go — separates starters from relievers.",
    drives: "Innings per appearance",
    reBias: 1.0,
  },

  // ── Fielding ─────────────────────────────────────────────────────────────
  {
    key: "ifRange",
    label: "IF Range",
    group: "fielding",
    what: "Infield range — getting to more balls.",
    drives: "Infield defense",
    reBias: 0.7,
  },
  {
    key: "ofRange",
    label: "OF Range",
    group: "fielding",
    what: "Outfield range — covering more ground.",
    drives: "Outfield defense",
    reBias: 0.7,
  },
];

export const RATING_BY_KEY: Record<string, RatingDef> = Object.fromEntries(
  RATINGS.map((r) => [r.key, r])
);
