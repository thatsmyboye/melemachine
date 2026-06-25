import { NextResponse } from "next/server";
import { getCardById } from "@/lib/data";
import { scoreCard, RUN_ENVIRONMENTS, type RunEnvKey, type Split } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const card = getCardById(Number(id));
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const re = (searchParams.get("re") as RunEnvKey) || "medium";
  const split = (searchParams.get("split") as Split) || "overall";

  // Score across all environments so the detail view can show RE sensitivity.
  const byEnv = Object.fromEntries(
    (Object.keys(RUN_ENVIRONMENTS) as RunEnvKey[]).map((k) => [
      k,
      scoreCard(card, { runEnv: k, split }),
    ])
  );

  return NextResponse.json({
    card,
    score: scoreCard(card, { runEnv: re, split }),
    byEnv,
  });
}
