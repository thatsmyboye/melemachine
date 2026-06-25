// ─────────────────────────────────────────────────────────────────────────
// MLB Stats API integration (statsapi.mlb.com — free, no key).
// Powers PT Live: who is playing today, probable pitchers, and live/final
// box-score stat lines used to compute Perfect Points earned.
// ─────────────────────────────────────────────────────────────────────────

const BASE = "https://statsapi.mlb.com/api/v1";

export interface ProbablePitcher {
  id: number;
  fullName: string;
  team: string;
}

export interface ScheduledGame {
  gamePk: number;
  status: string;
  away: string;
  home: string;
  awayProbable?: ProbablePitcher;
  homeProbable?: ProbablePitcher;
}

export interface HitterLine {
  name: string;
  team: string;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  cs: number;
  hbp: number;
}

export interface PitcherLine {
  name: string;
  team: string;
  ip: number;
  h: number;
  r: number;
  er: number;
  bb: number;
  hbp: number;
  k: number;
  hr: number;
  win: boolean;
  loss: boolean;
  save: boolean;
  hold: boolean;
  blownSave: boolean;
  completeGame: boolean;
  shutout: boolean;
  qualityStart: boolean;
}

export interface DayStats {
  date: string;
  hitters: HitterLine[];
  pitchers: PitcherLine[];
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    // Revalidate hourly; live stats endpoints are called with no-store below.
    next: { revalidate: 1800 },
    headers: { "User-Agent": "MeleMachine/0.1" },
  });
  if (!res.ok) throw new Error(`MLB API ${res.status}: ${url}`);
  return res.json();
}

export async function getSchedule(date: string): Promise<ScheduledGame[]> {
  const url = `${BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher`;
  const data = await getJson(url);
  const games: ScheduledGame[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      const away = g.teams?.away;
      const home = g.teams?.home;
      games.push({
        gamePk: g.gamePk,
        status: g.status?.detailedState ?? "",
        away: away?.team?.name ?? "",
        home: home?.team?.name ?? "",
        awayProbable: away?.probablePitcher
          ? { id: away.probablePitcher.id, fullName: away.probablePitcher.fullName, team: away?.team?.name }
          : undefined,
        homeProbable: home?.probablePitcher
          ? { id: home.probablePitcher.id, fullName: home.probablePitcher.fullName, team: home?.team?.name }
          : undefined,
      });
    }
  }
  return games;
}

function ipToNumber(ip: string | number | undefined): number {
  if (ip == null) return 0;
  // "6.2" means 6 and 2/3 innings.
  const s = String(ip);
  const [whole, frac] = s.split(".");
  return Number(whole) + (frac ? Number(frac) / 3 : 0);
}

export async function getBoxscoreLines(gamePk: number): Promise<{
  hitters: HitterLine[];
  pitchers: PitcherLine[];
}> {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "MeleMachine/0.1" } });
  if (!res.ok) return { hitters: [], pitchers: [] };
  const data = await res.json();
  const box = data.liveData?.boxscore?.teams;
  const hitters: HitterLine[] = [];
  const pitchers: PitcherLine[] = [];
  if (!box) return { hitters, pitchers };

  for (const side of ["away", "home"] as const) {
    const teamName = box[side]?.team?.name ?? "";
    const players = box[side]?.players ?? {};
    for (const pid of Object.keys(players)) {
      const p = players[pid];
      const bat = p.stats?.batting;
      const pit = p.stats?.pitching;
      const name = p.person?.fullName ?? "";
      if (bat && (bat.atBats || bat.baseOnBalls || bat.hits)) {
        hitters.push({
          name,
          team: teamName,
          ab: bat.atBats ?? 0,
          r: bat.runs ?? 0,
          h: bat.hits ?? 0,
          doubles: bat.doubles ?? 0,
          triples: bat.triples ?? 0,
          hr: bat.homeRuns ?? 0,
          rbi: bat.rbi ?? 0,
          bb: bat.baseOnBalls ?? 0,
          k: bat.strikeOuts ?? 0,
          sb: bat.stolenBases ?? 0,
          cs: bat.caughtStealing ?? 0,
          hbp: bat.hitByPitch ?? 0,
        });
      }
      if (pit && (pit.inningsPitched || pit.battersFaced)) {
        const ip = ipToNumber(pit.inningsPitched);
        const er = pit.earnedRuns ?? 0;
        pitchers.push({
          name,
          team: teamName,
          ip,
          h: pit.hits ?? 0,
          r: pit.runs ?? 0,
          er,
          bb: pit.baseOnBalls ?? 0,
          hbp: pit.hitByPitch ?? 0,
          k: pit.strikeOuts ?? 0,
          hr: pit.homeRuns ?? 0,
          win: !!pit.wins,
          loss: !!pit.losses,
          save: !!pit.saves,
          hold: !!pit.holds,
          blownSave: !!pit.blownSaves,
          completeGame: !!pit.completeGames,
          shutout: !!pit.shutouts,
          qualityStart: ip >= 6 && er <= 3,
        });
      }
    }
  }
  return { hitters, pitchers };
}

// ── Pre-game projection data ─────────────────────────────────────────────

export interface SlateTeam {
  id: number;
  name: string;
}
export interface LineupSpot {
  id: number;
  name: string;
  slot: number; // 1-9 batting order
}
export interface SlateGame {
  gamePk: number;
  status: string;
  away: SlateTeam;
  home: SlateTeam;
  awayProbable?: ProbablePitcher;
  homeProbable?: ProbablePitcher;
  awayLineup: LineupSpot[];
  homeLineup: LineupSpot[];
}

/** Schedule with probable pitchers and (when posted) batting orders. */
export async function getSlate(date: string): Promise<SlateGame[]> {
  const url = `${BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,lineups`;
  const data = await getJson(url);
  const out: SlateGame[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      const away = g.teams?.away;
      const home = g.teams?.home;
      const lineup = (arr: any[]): LineupSpot[] =>
        (arr ?? []).map((p, i) => ({ id: p.id, name: p.fullName, slot: i + 1 }));
      const probable = (t: any): ProbablePitcher | undefined =>
        t?.probablePitcher
          ? { id: t.probablePitcher.id, fullName: t.probablePitcher.fullName, team: t?.team?.name }
          : undefined;
      out.push({
        gamePk: g.gamePk,
        status: g.status?.detailedState ?? "",
        away: { id: away?.team?.id, name: away?.team?.name ?? "" },
        home: { id: home?.team?.id, name: home?.team?.name ?? "" },
        awayProbable: probable(away),
        homeProbable: probable(home),
        awayLineup: lineup(g.lineups?.awayPlayers),
        homeLineup: lineup(g.lineups?.homePlayers),
      });
    }
  }
  return out;
}

export interface RosterPlayer {
  id: number;
  name: string;
  position: string;
}

export async function getActiveRoster(teamId: number): Promise<RosterPlayer[]> {
  try {
    const data = await getJson(`${BASE}/teams/${teamId}/roster?rosterType=active`);
    return (data.roster ?? []).map((r: any) => ({
      id: r.person?.id,
      name: r.person?.fullName ?? "",
      position: r.position?.abbreviation ?? "",
    }));
  } catch {
    return [];
  }
}

export interface HitSeason {
  games: number;
  pa: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  r: number;
  rbi: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
  cs: number;
}
export interface PitchSeason {
  games: number;
  gamesStarted: number;
  ip: number;
  er: number;
  h: number;
  bb: number;
  hbp: number;
  so: number;
  hr: number;
  wins: number;
  saves: number;
  holds: number;
  era: number;
}
export interface PlayerSeason {
  id: number;
  name: string;
  hit?: HitSeason;
  pitch?: PitchSeason;
}

/** Batch-fetch current-season hitting & pitching stats for many players. */
export async function getPeopleSeasonStats(
  ids: number[],
  season: number
): Promise<Map<number, PlayerSeason>> {
  const out = new Map<number, PlayerSeason>();
  if (!ids.length) return out;
  // Chunk to keep URLs sane.
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 60) chunks.push(ids.slice(i, i + 60));
  await Promise.all(
    chunks.map(async (chunk) => {
      const url = `${BASE}/people?personIds=${chunk.join(",")}&hydrate=stats(group=[hitting,pitching],type=[season],season=${season})`;
      let data: any;
      try {
        data = await getJson(url);
      } catch {
        return;
      }
      for (const p of data.people ?? []) {
        const h = p.stats?.find((s: any) => s.group?.displayName === "hitting")?.splits?.[0]?.stat;
        const pit = p.stats?.find((s: any) => s.group?.displayName === "pitching")?.splits?.[0]?.stat;
        out.set(p.id, {
          id: p.id,
          name: p.fullName,
          hit: h
            ? {
                games: h.gamesPlayed ?? 0,
                pa: h.plateAppearances ?? 0,
                h: h.hits ?? 0,
                doubles: h.doubles ?? 0,
                triples: h.triples ?? 0,
                hr: h.homeRuns ?? 0,
                r: h.runs ?? 0,
                rbi: h.rbi ?? 0,
                bb: h.baseOnBalls ?? 0,
                hbp: h.hitByPitch ?? 0,
                so: h.strikeOuts ?? 0,
                sb: h.stolenBases ?? 0,
                cs: h.caughtStealing ?? 0,
              }
            : undefined,
          pitch: pit
            ? {
                games: pit.gamesPlayed ?? 0,
                gamesStarted: pit.gamesStarted ?? 0,
                ip: ipToNumber(pit.inningsPitched),
                er: pit.earnedRuns ?? 0,
                h: pit.hits ?? 0,
                bb: pit.baseOnBalls ?? 0,
                hbp: pit.hitByPitch ?? 0,
                so: pit.strikeOuts ?? 0,
                hr: pit.homeRuns ?? 0,
                wins: pit.wins ?? 0,
                saves: pit.saves ?? 0,
                holds: pit.holds ?? 0,
                era: typeof pit.era === "string" ? parseFloat(pit.era) || 0 : pit.era ?? 0,
              }
            : undefined,
        });
      }
    })
  );
  return out;
}

/** Runs-per-game by team id, for matchup adjustments. Neutral on failure. */
export async function getTeamOffense(season: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  try {
    const data = await getJson(
      `${BASE}/teams/stats?stats=season&group=hitting&season=${season}&sportIds=1`
    );
    for (const sp of data.stats?.[0]?.splits ?? []) {
      const g = sp.stat?.gamesPlayed ?? 0;
      const r = sp.stat?.runs ?? 0;
      if (sp.team?.id && g > 0) out.set(sp.team.id, r / g);
    }
  } catch {
    /* neutral */
  }
  return out;
}

/** Collect all stat lines for every game on a date. */
export async function getDayStats(date: string): Promise<DayStats> {
  const games = await getSchedule(date);
  const hitters: HitterLine[] = [];
  const pitchers: PitcherLine[] = [];
  // Sequential-ish but small; MLB rarely has > 16 games/day.
  const results = await Promise.all(
    games.map((g) => getBoxscoreLines(g.gamePk).catch(() => ({ hitters: [], pitchers: [] })))
  );
  for (const r of results) {
    hitters.push(...r.hitters);
    pitchers.push(...r.pitchers);
  }
  return { date, hitters, pitchers };
}
