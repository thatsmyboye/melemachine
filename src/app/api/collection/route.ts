import { NextResponse } from "next/server";
import { getCollection } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const cards = getCollection();
  const byType: Record<string, number> = {};
  for (const c of cards) byType[c.cType] = (byType[c.cType] ?? 0) + 1;
  return NextResponse.json({
    count: cards.length,
    byType,
    cards,
  });
}
