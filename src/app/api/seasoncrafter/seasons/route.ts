import { NextResponse } from "next/server";
import { getCareerSeasonsAll } from "@/lib/mlbhistory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("playerId") ?? 0);

  if (!id) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  try {
    const seasons = await getCareerSeasonsAll(id);
    return NextResponse.json({ seasons });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not load seasons", detail: String(e) },
      { status: 502 }
    );
  }
}
