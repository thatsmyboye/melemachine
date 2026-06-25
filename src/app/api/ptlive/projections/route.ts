import { NextResponse } from "next/server";
import { getCollection } from "@/lib/data";
import {
  getSlate,
  getActiveRoster,
  getPeopleSeasonStats,
  getTeamOffense,
  type PlayerSeason,
} from "@/lib/mlb";
import {
  projectHitter,
  projectStarter,
  projectReliever,
  hitterMatchupMult,
  pitcherMatchupMult,
  type Projection,
} from "@/lib/projections";

export const dynamic = "force-dynamic";

function todayET(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return d.toISOString().slice(0, 10);
}

function normName(n: string): string {
  return n
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SLOT_PA = [0, 4.65, 4.55, 4.45, 4.35, 4.2, 4.05, 3.95, 3.8, 3.7];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayET();
  const season = Number(date.slice(0, 4));

  let slate;
  try {
    slate = await getSlate(date);
  } catch (e) {
    return NextResponse.json({ error: "MLB schedule fetch failed", detail: String(e), date }, { status: 502 });
  }

  // Per-team matchup context for the day.
  interface TeamCtx {
    teamId: number;
    teamName: string;
    oppTeamId: number;
    oppName: string;
    oppProbableId: number | null;
  }
  const teamCtx = new Map<number, TeamCtx>();
  const lineupSlot = new Map<number, number>(); // playerId -> batting slot
  const probableStarterIds = new Set<number>();
  const teamIds = new Set<number>();

  for (const g of slate) {
    teamIds.add(g.home.id);
    teamIds.add(g.away.id);
    if (g.homeProbable) probableStarterIds.add(g.homeProbable.id);
    if (g.awayProbable) probableStarterIds.add(g.awayProbable.id);
    teamCtx.set(g.home.id, {
      teamId: g.home.id,
      teamName: g.home.name,
      oppTeamId: g.away.id,
      oppName: g.away.name,
      oppProbableId: g.awayProbable?.id ?? null,
    });
    teamCtx.set(g.away.id, {
      teamId: g.away.id,
      teamName: g.away.name,
      oppTeamId: g.home.id,
      oppName: g.home.name,
      oppProbableId: g.homeProbable?.id ?? null,
    });
    for (const sp of g.homeLineup) lineupSlot.set(sp.id, sp.slot);
    for (const sp of g.awayLineup) lineupSlot.set(sp.id, sp.slot);
  }

  const lineupsPosted = lineupSlot.size > 0;

  // Roster lookup so we can map owned card names -> MLB player ids on teams
  // that actually play today.
  const rosters = await Promise.all([...teamIds].map((id) => getActiveRoster(id).then((r) => ({ id, r }))));
  const playerByName = new Map<string, { id: number; teamId: number }>();
  for (const { id, r } of rosters) {
    for (const p of r) {
      const key = normName(p.name);
      if (!playerByName.has(key)) playerByName.set(key, { id: p.id, teamId: id });
    }
  }

  // Match owned Live cards to today's players.
  const collection = getCollection();
  interface Matched {
    cardName: string;
    position: string;
    ovr: number;
    active: boolean;
    playerId: number;
    teamId: number;
    isPitcher: boolean;
  }
  const matched: Matched[] = [];
  const seenPlayers = new Set<number>();
  for (const c of collection) {
    if (!c.isLive) continue;
    const hit = playerByName.get(normName(c.name));
    if (!hit) continue;
    if (seenPlayers.has(hit.id)) continue; // dedupe player variants
    seenPlayers.add(hit.id);
    matched.push({
      cardName: c.name,
      position: c.position,
      ovr: c.ovr,
      active: c.active,
      playerId: hit.id,
      teamId: hit.teamId,
      isPitcher: ["SP", "RP", "CL"].includes(c.position),
    });
  }

  // Fetch season stats for matched players + every opposing probable starter.
  const statIds = new Set<number>(matched.map((m) => m.playerId));
  for (const id of probableStarterIds) statIds.add(id);
  const [seasonStats, teamOffense] = await Promise.all([
    getPeopleSeasonStats([...statIds], season),
    getTeamOffense(season),
  ]);

  const eraOf = (id: number | null): number | null => {
    if (id == null) return null;
    const s = seasonStats.get(id);
    return s?.pitch?.era ?? null;
  };

  interface Rec {
    name: string;
    cardPos: string;
    ovr: number;
    active: boolean;
    role: "hitter" | "starter" | "reliever";
    opponent: string;
    projectedPP: number | null;
    confidence: Projection["confidence"] | null;
    detail: string;
    matchupMult: number | null;
    components: Record<string, number> | null;
  }

  const recs: Rec[] = matched.map((m) => {
    const ctx = teamCtx.get(m.teamId);
    const player: PlayerSeason | undefined = seasonStats.get(m.playerId);
    const opponent = ctx?.oppName ?? "";

    if (m.isPitcher) {
      const oppRpg = ctx ? teamOffense.get(ctx.oppTeamId) ?? null : null;
      const mult = pitcherMatchupMult(oppRpg);
      if (m.position === "SP") {
        const starting = probableStarterIds.has(m.playerId);
        if (!starting || !player?.pitch) {
          return base(m, opponent, "starter", null, null, "Not starting today", null, null);
        }
        const proj = projectStarter(player.pitch, { matchupMult: mult });
        return base(m, opponent, "starter", proj?.pp ?? null, proj?.confidence ?? null, proj?.detail ?? "—", mult, proj?.components ?? null);
      }
      // RP / CL
      if (!player?.pitch) return base(m, opponent, "reliever", null, null, "No season data", null, null);
      const proj = projectReliever(player.pitch, { appearanceProb: m.position === "CL" ? 0.5 : 0.45 });
      return base(m, opponent, "reliever", proj?.pp ?? null, proj?.confidence ?? null, proj?.detail ?? "—", null, proj?.components ?? null);
    }

    // Hitter
    if (!player?.hit) return base(m, opponent, "hitter", null, null, "No season data", null, null);
    const slot = lineupSlot.get(m.playerId);
    const starting = slot != null;
    const expectedPA = starting
      ? SLOT_PA[slot] ?? 4.1
      : player.hit.games > 0
        ? player.hit.pa / player.hit.games
        : 3.5;
    const mult = hitterMatchupMult(eraOf(ctx?.oppProbableId ?? null));
    const proj = projectHitter(player.hit, { expectedPA, matchupMult: mult, starting });
    return base(m, opponent, "hitter", proj?.pp ?? null, proj?.confidence ?? null, proj?.detail ?? "—", mult, proj?.components ?? null);
  });

  function base(
    m: Matched,
    opponent: string,
    role: Rec["role"],
    projectedPP: number | null,
    confidence: Rec["confidence"],
    detail: string,
    matchupMult: number | null,
    components: Record<string, number> | null
  ): Rec {
    return {
      name: m.cardName,
      cardPos: m.position,
      ovr: m.ovr,
      active: m.active,
      role,
      opponent,
      projectedPP,
      confidence,
      detail,
      matchupMult,
      components,
    };
  }

  recs.sort((a, b) => (b.projectedPP ?? -1) - (a.projectedPP ?? -1));

  return NextResponse.json({
    date,
    season,
    lineupsPosted,
    games: slate.length,
    matchedPlayers: matched.length,
    note: lineupsPosted
      ? "Lineups posted — hitter PA estimated from batting order."
      : "Lineups not yet posted — hitters projected from season PA/game; check back closer to first pitch.",
    recommendations: recs.slice(0, 150),
  });
}
