import { NextResponse } from "next/server";
import {
  getSeasonHitStats,
  getSeasonPitchStats,
  getHitPlatoon,
  getPitchPlatoon,
  getLeagueHitters,
  getLeaguePitchers,
} from "@/lib/mlbhistory";
import { buildHitterCard, buildPitcherCard } from "@/lib/seasoncrafter";
import { getHitCardDist, getPitchCardDist } from "@/lib/carddist";
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
  const playerId = Number(searchParams.get("playerId") ?? 0);
  const year = Number(searchParams.get("year") ?? 0);
  const isPitcher = searchParams.get("isPitcher") === "1";
  const position = (searchParams.get("position") ?? "").toUpperCase();
  const playerName = (searchParams.get("name") ?? "").trim();

  if (!playerId || !year) {
    return NextResponse.json({ error: "Missing playerId or year" }, { status: 400 });
  }

  try {
    if (isPitcher) {
      const [stats, splits, lgPitchers] = await Promise.all([
        getSeasonPitchStats(playerId, year),
        getPitchPlatoon(playerId, year),
        getLeaguePitchers(year),
      ]);

      if (!stats) {
        return NextResponse.json(
          { error: `No pitching stats found for ${year}` },
          { status: 404 }
        );
      }

      const card = buildPitcherCard(stats, lgPitchers, splits, getPitchCardDist());

      // Find cards already in the pool with this player+year
      const existingCards = getAllCards().filter(
        (c) =>
          c.isPitcher &&
          c.year === year &&
          playerName &&
          normName(c.firstName + " " + c.lastName) === normName(playerName)
      );

      // Find comparable cards
      const allPitchers = getAllCards().filter((c) => c.isPitcher);
      const comparables = allPitchers
        .map((c) => {
          const r = card.pitcher!;
          const dist =
            Math.abs(c.pitch.overall.stuff - r.stuff) +
            Math.abs(c.pitch.overall.movement - r.movement) +
            Math.abs(c.pitch.overall.control - r.control) +
            Math.abs(c.pitch.overall.pHR - r.pHR) +
            Math.abs(c.pitch.overall.pBABIP - r.pBABIP);
          return { card: c, dist };
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5)
        .map(({ card: c }) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          year: c.year,
          team: c.team,
          ovr: c.ovr,
          tier: c.tier,
          cardTypeName: c.cardTypeName,
        }));

      return NextResponse.json({
        year,
        isPitcher: true,
        position,
        playerName,
        card,
        stats,
        comparables,
        alreadyInGame: existingCards.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          cardTypeName: c.cardTypeName,
          ovr: c.ovr,
          tier: c.tier,
        })),
      });
    } else {
      const [stats, splits, lgHitters] = await Promise.all([
        getSeasonHitStats(playerId, year),
        getHitPlatoon(playerId, year),
        getLeagueHitters(year),
      ]);

      if (!stats) {
        return NextResponse.json(
          { error: `No hitting stats found for ${year}` },
          { status: 404 }
        );
      }

      const card = buildHitterCard(stats, lgHitters, splits, position, getHitCardDist());

      const existingCards = getAllCards().filter(
        (c) =>
          !c.isPitcher &&
          c.year === year &&
          playerName &&
          normName(c.firstName + " " + c.lastName) === normName(playerName)
      );

      const allHitters = getAllCards().filter((c) => !c.isPitcher);
      const comparables = allHitters
        .map((c) => {
          const r = card.hitter!;
          const dist =
            Math.abs(c.hit.overall.contact - r.contact) +
            Math.abs(c.hit.overall.gap - r.gap) +
            Math.abs(c.hit.overall.power - r.power) +
            Math.abs(c.hit.overall.eye - r.eye) +
            Math.abs(c.hit.overall.avoidK - r.avoidK) +
            Math.abs(c.hit.overall.babip - r.babip);
          return { card: c, dist };
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5)
        .map(({ card: c }) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          year: c.year,
          team: c.team,
          ovr: c.ovr,
          tier: c.tier,
          cardTypeName: c.cardTypeName,
        }));

      return NextResponse.json({
        year,
        isPitcher: false,
        position,
        playerName,
        card,
        stats,
        comparables,
        alreadyInGame: existingCards.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          cardTypeName: c.cardTypeName,
          ovr: c.ovr,
          tier: c.tier,
        })),
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: "Projection failed", detail: String(e) },
      { status: 500 }
    );
  }
}
