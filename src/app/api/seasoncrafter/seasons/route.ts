import { NextResponse } from "next/server";
import { getCareerSeasons } from "@/lib/mlbhistory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("playerId") ?? 0);
  const isPitcher = searchParams.get("isPitcher") === "1";

  if (!id) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  try {
    const seasons = await getCareerSeasons(id, isPitcher ? "pitching" : "hitting");
    return NextResponse.json({ seasons });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not load seasons", detail: String(e) },
      { status: 502 }
    );
  }
}
