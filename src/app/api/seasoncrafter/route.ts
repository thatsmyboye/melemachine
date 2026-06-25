import { NextResponse } from "next/server";
import { searchPlayers } from "@/lib/mlbhistory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ players: [] });
  }
  try {
    const players = await searchPlayers(q);
    return NextResponse.json({ players });
  } catch (e) {
    return NextResponse.json(
      { error: "Player search failed", detail: String(e) },
      { status: 502 }
    );
  }
}
