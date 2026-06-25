import "server-only";
import * as fs from "fs";
import * as path from "path";

interface LeagueRow {
  year: number;
  rpg: number;
  ba: number;
  obp: number;
  slg: number;
  ops: number;
}

function parse(): Map<number, LeagueRow> {
  const csv = fs.readFileSync(
    path.join(process.cwd(), "league_averages_sportsref_download_BRef.csv"),
    "utf8"
  );
  const lines = csv.trim().split("\n");
  const cols = lines[0].split(",");
  const ci = (name: string) => cols.indexOf(name);
  const yi = ci("Year"), ri = ci("R/G"), bi = ci("BA"), oi = ci("OBP"), si = ci("SLG"), pi = ci("OPS");

  const map = new Map<number, LeagueRow>();
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const year = Number(c[yi]);
    if (!Number.isFinite(year) || year < 1871) continue;
    map.set(year, {
      year,
      rpg: Number(c[ri]),
      ba: Number(c[bi]),
      obp: Number(c[oi]),
      slg: Number(c[si]),
      ops: Number(c[pi]),
    });
  }
  return map;
}

let _cache: Map<number, LeagueRow> | null = null;
function cache(): Map<number, LeagueRow> {
  if (!_cache) _cache = parse();
  return _cache;
}

export function getLeagueRpg(year: number): number | null {
  return cache().get(year)?.rpg ?? null;
}

/** Year → R/G lookup table for sending to the client. */
export function leagueRpgTable(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [year, row] of cache()) out[year] = row.rpg;
  return out;
}

export function getLeagueRow(year: number): LeagueRow | null {
  return cache().get(year) ?? null;
}
