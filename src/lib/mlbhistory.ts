// ─────────────────────────────────────────────────────────────────────────
// MLB Stats API — historical data layer for Season Crafter.
// Aggressively cached (24h) since historical stats are immutable.
// ─────────────────────────────────────────────────────────────────────────

const BASE = "https://statsapi.mlb.com/api/v1";

async function hist(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    next: { revalidate: 86400 },
    headers: { "User-Agent": "MeleMachine/0.1" },
  });
  if (!res.ok) throw new Error(`MLB API ${res.status}: ${path}`);
  return res.json();
}

function ipToNum(ip: string | number | undefined): number {
  if (ip == null) return 0;
  const s = String(ip);
  const [whole, frac] = s.split(".");
  return Number(whole) + (frac ? Number(frac) / 3 : 0);
}

function numStr(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isFinite(n) ? n : 0;
}

// ── Player search ─────────────────────────────────────────────────────────

export interface PlayerSearchResult {
  id: number;
  name: string;
  position: string;
  isPitcher: boolean;
  birthYear: number | null;
  active: boolean;
}

export async function searchPlayers(query: string): Promise<PlayerSearchResult[]> {
  const data = await hist(`/people/search?names=${encodeURIComponent(query)}&sportId=1`);
  return (data.people ?? []).slice(0, 20).map((p: any) => ({
    id: p.id,
    name: p.fullName ?? "",
    position: p.primaryPosition?.abbreviation ?? "",
    isPitcher: p.primaryPosition?.code === "1",
    birthYear: p.birthDate ? Number(String(p.birthDate).slice(0, 4)) : null,
    active: p.active ?? false,
  }));
}

// ── Career year-by-year seasons ───────────────────────────────────────────

export interface CareerSeason {
  year: number;
  team: string;
  gamesPlayed: number;
}

export async function getCareerSeasons(
  playerId: number,
  group: "hitting" | "pitching"
): Promise<CareerSeason[]> {
  const data = await hist(
    `/people/${playerId}/stats?stats=yearByYear&group=${group}&sportId=1&gameType=R`
  );
  const splits: any[] = data.stats?.[0]?.splits ?? [];

  const byYear = new Map<number, CareerSeason>();
  for (const s of splits) {
    const year = Number(s.season ?? 0);
    if (!year) continue;
    const g = s.stat?.gamesPlayed ?? 0;
    const prev = byYear.get(year);
    byYear.set(year, {
      year,
      team: prev ? "Multiple" : s.team?.name ?? "",
      gamesPlayed: (prev?.gamesPlayed ?? 0) + g,
    });
  }

  return [...byYear.values()]
    .filter((s) => s.gamesPlayed >= 5)
    .sort((a, b) => a.year - b.year);
}

// ── Single-season hitting stats ──────────────────────────────────────────

export interface SeasonHitStats {
  gamesPlayed: number;
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
  cs: number;
  avg: number;
  obp: number;
  slg: number;
}

export async function getSeasonHitStats(
  playerId: number,
  year: number
): Promise<SeasonHitStats | null> {
  const data = await hist(
    `/people/${playerId}/stats?stats=season&group=hitting&season=${year}&sportId=1&gameType=R`
  );
  const raw = data.stats?.[0]?.splits?.[0]?.stat;
  if (!raw) return null;

  const ab = raw.atBats ?? 0;
  const bb = raw.baseOnBalls ?? 0;
  const hbp = raw.hitByPitch ?? 0;
  return {
    gamesPlayed: raw.gamesPlayed ?? 0,
    pa: raw.plateAppearances ?? ab + bb + hbp,
    ab,
    hits: raw.hits ?? 0,
    doubles: raw.doubles ?? 0,
    triples: raw.triples ?? 0,
    hr: raw.homeRuns ?? 0,
    rbi: raw.rbi ?? 0,
    bb,
    hbp,
    so: raw.strikeOuts ?? 0,
    sb: raw.stolenBases ?? 0,
    cs: raw.caughtStealing ?? 0,
    avg: numStr(raw.avg),
    obp: numStr(raw.obp),
    slg: numStr(raw.slg),
  };
}

// ── Single-season pitching stats ─────────────────────────────────────────

export interface SeasonPitchStats {
  gamesPlayed: number;
  gamesStarted: number;
  ip: number;
  hits: number;
  er: number;
  bb: number;
  hbp: number;
  so: number;
  hr: number;
  era: number;
  whip: number;
}

export async function getSeasonPitchStats(
  playerId: number,
  year: number
): Promise<SeasonPitchStats | null> {
  const data = await hist(
    `/people/${playerId}/stats?stats=season&group=pitching&season=${year}&sportId=1&gameType=R`
  );
  const raw = data.stats?.[0]?.splits?.[0]?.stat;
  if (!raw) return null;

  const ip = ipToNum(raw.inningsPitched);
  const bb = raw.baseOnBalls ?? 0;
  const h = raw.hits ?? 0;
  return {
    gamesPlayed: raw.gamesPlayed ?? 0,
    gamesStarted: raw.gamesStarted ?? 0,
    ip,
    hits: h,
    er: raw.earnedRuns ?? 0,
    bb,
    hbp: raw.hitByPitch ?? 0,
    so: raw.strikeOuts ?? 0,
    hr: raw.homeRuns ?? 0,
    era: numStr(raw.era),
    whip: ip > 0 ? (h + bb) / ip : 0,
  };
}

// ── Platoon splits ────────────────────────────────────────────────────────

export interface HitSplitLine {
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  so: number;
  avg: number;
  obp: number;
  slg: number;
  sb: number;
  cs: number;
  hbp: number;
}

export interface HitPlatoon {
  vsLeft: HitSplitLine | null;
  vsRight: HitSplitLine | null;
}

function parseSplitHit(raw: any): HitSplitLine {
  const ab = raw?.atBats ?? 0;
  const bb = raw?.baseOnBalls ?? 0;
  const hbp = raw?.hitByPitch ?? 0;
  return {
    pa: raw?.plateAppearances ?? ab + bb + hbp,
    ab,
    hits: raw?.hits ?? 0,
    doubles: raw?.doubles ?? 0,
    triples: raw?.triples ?? 0,
    hr: raw?.homeRuns ?? 0,
    bb,
    so: raw?.strikeOuts ?? 0,
    avg: numStr(raw?.avg),
    obp: numStr(raw?.obp),
    slg: numStr(raw?.slg),
    sb: raw?.stolenBases ?? 0,
    cs: raw?.caughtStealing ?? 0,
    hbp,
  };
}

export async function getHitPlatoon(
  playerId: number,
  year: number
): Promise<HitPlatoon> {
  try {
    const data = await hist(
      `/people/${playerId}/stats?stats=statSplits&group=hitting&season=${year}&sportId=1&gameType=R&sitCodes=vl,vr`
    );
    const splits: any[] = data.stats?.[0]?.splits ?? [];
    const vl = splits.find((s) => s.split?.code === "vl")?.stat;
    const vr = splits.find((s) => s.split?.code === "vr")?.stat;
    return {
      vsLeft: vl ? parseSplitHit(vl) : null,
      vsRight: vr ? parseSplitHit(vr) : null,
    };
  } catch {
    return { vsLeft: null, vsRight: null };
  }
}

export interface PitchSplitLine {
  ip: number;
  hits: number;
  er: number;
  bb: number;
  so: number;
  hr: number;
  era: number;
  whip: number;
}

export interface PitchPlatoon {
  vsLeft: PitchSplitLine | null;
  vsRight: PitchSplitLine | null;
}

function parseSplitPitch(raw: any): PitchSplitLine {
  const ip = ipToNum(raw?.inningsPitched);
  const bb = raw?.baseOnBalls ?? 0;
  const h = raw?.hits ?? 0;
  return {
    ip,
    hits: h,
    er: raw?.earnedRuns ?? 0,
    bb,
    so: raw?.strikeOuts ?? 0,
    hr: raw?.homeRuns ?? 0,
    era: numStr(raw?.era),
    whip: ip > 0 ? (h + bb) / ip : 0,
  };
}

export async function getPitchPlatoon(
  playerId: number,
  year: number
): Promise<PitchPlatoon> {
  try {
    const data = await hist(
      `/people/${playerId}/stats?stats=statSplits&group=pitching&season=${year}&sportId=1&gameType=R&sitCodes=vl,vr`
    );
    const splits: any[] = data.stats?.[0]?.splits ?? [];
    const vl = splits.find((s) => s.split?.code === "vl")?.stat;
    const vr = splits.find((s) => s.split?.code === "vr")?.stat;
    return {
      vsLeft: vl ? parseSplitPitch(vl) : null,
      vsRight: vr ? parseSplitPitch(vr) : null,
    };
  } catch {
    return { vsLeft: null, vsRight: null };
  }
}

// ── League distributions (for percentile computation) ────────────────────

export interface LeagueHitter {
  id: number;
  name: string;
  team: string;
  position: string;
  gamesPlayed: number;
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sb: number;
  cs: number;
  avg: number;
  obp: number;
  slg: number;
}

export async function getLeagueHitters(year: number): Promise<LeagueHitter[]> {
  try {
    const data = await hist(
      `/stats?stats=season&group=hitting&gameType=R&sportId=1&season=${year}&playerPool=All&limit=800`
    );
    const splits: any[] = data.stats?.[0]?.splits ?? [];
    return splits
      .map((s: any) => {
        const ab = s.stat?.atBats ?? 0;
        const bb = s.stat?.baseOnBalls ?? 0;
        const hbp = s.stat?.hitByPitch ?? 0;
        return {
          id: s.player?.id ?? 0,
          name: s.player?.fullName ?? "",
          team: s.team?.name ?? "",
          position: s.player?.primaryPosition?.abbreviation ?? "",
          gamesPlayed: s.stat?.gamesPlayed ?? 0,
          pa: s.stat?.plateAppearances ?? ab + bb + hbp,
          ab,
          hits: s.stat?.hits ?? 0,
          doubles: s.stat?.doubles ?? 0,
          triples: s.stat?.triples ?? 0,
          hr: s.stat?.homeRuns ?? 0,
          bb,
          hbp,
          so: s.stat?.strikeOuts ?? 0,
          sb: s.stat?.stolenBases ?? 0,
          cs: s.stat?.caughtStealing ?? 0,
          avg: numStr(s.stat?.avg),
          obp: numStr(s.stat?.obp),
          slg: numStr(s.stat?.slg),
        };
      })
      .filter((p) => p.pa >= 100);
  } catch {
    return [];
  }
}

export interface LeaguePitcher {
  id: number;
  name: string;
  team: string;
  position: string;
  gamesPlayed: number;
  gamesStarted: number;
  ip: number;
  hits: number;
  er: number;
  bb: number;
  hbp: number;
  so: number;
  hr: number;
  era: number;
  whip: number;
}

export async function getLeaguePitchers(year: number): Promise<LeaguePitcher[]> {
  try {
    const data = await hist(
      `/stats?stats=season&group=pitching&gameType=R&sportId=1&season=${year}&playerPool=All&limit=500`
    );
    const splits: any[] = data.stats?.[0]?.splits ?? [];
    return splits
      .map((s: any) => {
        const ip = ipToNum(s.stat?.inningsPitched);
        const bb = s.stat?.baseOnBalls ?? 0;
        const h = s.stat?.hits ?? 0;
        return {
          id: s.player?.id ?? 0,
          name: s.player?.fullName ?? "",
          team: s.team?.name ?? "",
          position: s.player?.primaryPosition?.abbreviation ?? "",
          gamesPlayed: s.stat?.gamesPlayed ?? 0,
          gamesStarted: s.stat?.gamesStarted ?? 0,
          ip,
          hits: h,
          er: s.stat?.earnedRuns ?? 0,
          bb,
          hbp: s.stat?.hitByPitch ?? 0,
          so: s.stat?.strikeOuts ?? 0,
          hr: s.stat?.homeRuns ?? 0,
          era: numStr(s.stat?.era),
          whip: ip > 0 ? (h + bb) / ip : 0,
        };
      })
      .filter((p) => p.ip >= 20);
  } catch {
    return [];
  }
}
