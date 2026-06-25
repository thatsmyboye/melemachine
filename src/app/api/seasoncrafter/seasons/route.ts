import { NextResponse } from "next/server";
import { getCareerSeasonsAll } from "@/lib/mlbhistory";
import { getAllCards } from "@/lib/data";

export const dynamic = "force-dynamic";

function normName(n: string) {
  return n
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("playerId") ?? 0);
  const name = (searchParams.get("name") ?? "").trim();

  if (!id) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  try {
    const seasons = await getCareerSeasonsAll(id);

    // Find years where this player already has a card in the pool.
    const inGameYears: number[] = [];
    if (name) {
      const normed = normName(name);
      for (const c of getAllCards()) {
        if (normName(`${c.firstName} ${c.lastName}`) === normed) {
          inGameYears.push(c.year);
        }
      }
    }

    return NextResponse.json({ seasons, inGameYears });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not load seasons", detail: String(e) },
      { status: 502 }
    );
  }
}
