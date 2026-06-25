// Filtering, scoring, sorting and pagination over the card pool. Used by the
// API routes so the heavy 4.5MB dataset never crosses the wire.
import type { Card, Tier, PositionCode } from "./types";
import {
  scoreCard,
  type ScoreContext,
  type CardScore,
  type RunEnvKey,
  type Split,
  type EngineWeights,
} from "./engine";

export interface CardFilters {
  search?: string;
  tiers?: Tier[];
  positions?: string[];
  cardTypes?: number[];
  pitchersOnly?: boolean;
  hittersOnly?: boolean;
  leOnly?: boolean;
  ownedOnly?: boolean;
  liveOnly?: boolean; // cardType 1 == Live (current MLB)
  minOvr?: number;
  maxOvr?: number;
  maxPrice?: number;
}

export type SortKey =
  | "score"
  | "efficiency"
  | "ovr"
  | "price"
  | "name";

export interface QueryParams {
  filters: CardFilters;
  ctx: ScoreContext;
  sort: SortKey;
  desc: boolean;
  page: number;
  pageSize: number;
}

export interface ScoredCard {
  card: Card;
  score: CardScore;
}

export interface QueryResult {
  total: number;
  page: number;
  pageSize: number;
  rows: ScoredCard[];
}

function priceOf(c: Card): number | null {
  return c.prices.last10 ?? c.prices.sellLow ?? c.prices.buyHigh;
}

function matches(c: Card, f: CardFilters): boolean {
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${c.title} ${c.firstName} ${c.lastName} ${c.nickName} ${c.team}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.tiers?.length && !f.tiers.includes(c.tier)) return false;
  if (f.positions?.length && !f.positions.includes(c.position)) return false;
  if (f.cardTypes?.length && !f.cardTypes.includes(c.cardType)) return false;
  if (f.pitchersOnly && !c.isPitcher) return false;
  if (f.hittersOnly && c.isPitcher) return false;
  if (f.leOnly && !c.isLE) return false;
  if (f.ownedOnly && c.owned <= 0) return false;
  if (f.liveOnly && c.cardType !== 1) return false;
  if (f.minOvr != null && c.ovr < f.minOvr) return false;
  if (f.maxOvr != null && c.ovr > f.maxOvr) return false;
  if (f.maxPrice != null) {
    const p = priceOf(c);
    if (p == null || p > f.maxPrice) return false;
  }
  return true;
}

function sortValue(sc: ScoredCard, key: SortKey): number | string {
  switch (key) {
    case "score":
      return sc.score.total;
    case "efficiency":
      return sc.score.efficiency ?? -Infinity;
    case "ovr":
      return sc.card.ovr;
    case "price":
      return priceOf(sc.card) ?? -Infinity;
    case "name":
      return `${sc.card.lastName} ${sc.card.firstName}`.toLowerCase();
  }
}

export function runQuery(
  cards: Card[],
  params: QueryParams
): QueryResult {
  const { filters, ctx, sort, desc, page, pageSize } = params;

  const scored: ScoredCard[] = [];
  for (const c of cards) {
    if (!matches(c, filters)) continue;
    scored.push({ card: c, score: scoreCard(c, ctx) });
  }

  scored.sort((a, b) => {
    const av = sortValue(a, sort);
    const bv = sortValue(b, sort);
    let cmp: number;
    if (typeof av === "string" && typeof bv === "string") {
      cmp = av.localeCompare(bv);
    } else {
      cmp = (av as number) - (bv as number);
    }
    return desc ? -cmp : cmp;
  });

  const start = page * pageSize;
  return {
    total: scored.length,
    page,
    pageSize,
    rows: scored.slice(start, start + pageSize),
  };
}

export function parseQuery(searchParams: URLSearchParams): QueryParams {
  const csvNums = (v: string | null) =>
    v ? v.split(",").map((x) => Number(x)).filter((x) => Number.isFinite(x)) : undefined;
  const csvStrs = (v: string | null) =>
    v ? v.split(",").filter(Boolean) : undefined;
  const bool = (v: string | null) => v === "1" || v === "true";

  const ctx: ScoreContext = {
    runEnv: (searchParams.get("re") as RunEnvKey) || "medium",
    split: (searchParams.get("split") as Split) || "overall",
  };
  const weightsRaw = searchParams.get("weights");
  if (weightsRaw) {
    try {
      ctx.weights = JSON.parse(weightsRaw) as EngineWeights;
    } catch {
      /* ignore malformed weights, use defaults */
    }
  }

  return {
    filters: {
      search: searchParams.get("q") || undefined,
      tiers: csvStrs(searchParams.get("tiers")) as Tier[] | undefined,
      positions: csvStrs(searchParams.get("pos")) as PositionCode[] | undefined,
      cardTypes: csvNums(searchParams.get("types")),
      pitchersOnly: bool(searchParams.get("pitchers")),
      hittersOnly: bool(searchParams.get("hitters")),
      leOnly: bool(searchParams.get("le")),
      ownedOnly: bool(searchParams.get("owned")),
      liveOnly: bool(searchParams.get("live")),
      minOvr: searchParams.get("minOvr") ? Number(searchParams.get("minOvr")) : undefined,
      maxOvr: searchParams.get("maxOvr") ? Number(searchParams.get("maxOvr")) : undefined,
      maxPrice: searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : undefined,
    },
    ctx,
    sort: (searchParams.get("sort") as SortKey) || "score",
    desc: searchParams.get("asc") ? false : true,
    page: Number(searchParams.get("page") || 0),
    pageSize: Math.min(100, Number(searchParams.get("pageSize") || 50)),
  };
}
