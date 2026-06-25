import { NextResponse } from "next/server";
import { getAllCards, getDatasetMeta } from "@/lib/data";
import { RUN_ENVIRONMENTS, DEFAULT_WEIGHTS } from "@/lib/engine";
import { CARD_TYPE_NAME, TIER_ORDER } from "@/lib/encodings";

export const dynamic = "force-dynamic";

export async function GET() {
  const cards = getAllCards();
  const types = new Map<number, string>();
  for (const c of cards) types.set(c.cardType, c.cardTypeName);
  return NextResponse.json({
    ...getDatasetMeta(),
    tiers: TIER_ORDER,
    positions: ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "P"],
    cardTypes: [...types.entries()]
      .map(([id, name]) => ({ id, name: name || CARD_TYPE_NAME[String(id)] || `Type ${id}` }))
      .sort((a, b) => a.id - b.id),
    runEnvironments: Object.values(RUN_ENVIRONMENTS),
    defaultWeights: DEFAULT_WEIGHTS,
  });
}
