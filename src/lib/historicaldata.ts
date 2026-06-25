import "server-only";
import * as fs from "fs";
import * as path from "path";
import type { LeagueHitter, LeaguePitcher } from "./mlbhistory";

// Compact storage types (short keys to keep JSON small)
interface HistHit {
  n: string;  // name
  y: number;  // year
  tm: string; // team
  p: string;  // position
  g: number;
  pa: number;
  ab: number;
  h: number;
  d: number;  // doubles
  t: number;  // triples
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

interface HistPit {
  n: string;
  y: number;
  tm: string;
  g: number;
  gs: number;
  ip: number;
  h: number;
  er: number;
  bb: number;
  hbp: number;
  so: number;
  hr: number;
  era: number;
  whip: number;
}

interface HistDB<T> {
  generated: string;
  count: number;
  players: T[];
}

let _hit: HistDB<HistHit> | null = null;
let _pit: HistDB<HistPit> | null = null;

function hitDB(): HistDB<HistHit> {
  if (!_hit) {
    const p = path.join(process.cwd(), "src/data/hist_hit.json");
    _hit = fs.existsSync(p)
      ? (JSON.parse(fs.readFileSync(p, "utf8")) as HistDB<HistHit>)
      : { generated: "", count: 0, players: [] };
  }
  return _hit;
}

function pitDB(): HistDB<HistPit> {
  if (!_pit) {
    const p = path.join(process.cwd(), "src/data/hist_pit.json");
    _pit = fs.existsSync(p)
      ? (JSON.parse(fs.readFileSync(p, "utf8")) as HistDB<HistPit>)
      : { generated: "", count: 0, players: [] };
  }
  return _pit;
}

export function isStaticHistoryAvailable(): boolean {
  return hitDB().count > 0;
}

export function getStaticLeagueHitters(year: number): LeagueHitter[] {
  return hitDB()
    .players.filter((r) => r.y === year)
    .map((r) => ({
      id: 0,
      name: r.n,
      team: r.tm,
      position: r.p,
      gamesPlayed: r.g,
      pa: r.pa,
      ab: r.ab,
      hits: r.h,
      doubles: r.d,
      triples: r.t,
      hr: r.hr,
      bb: r.bb,
      hbp: r.hbp,
      so: r.so,
      sb: r.sb,
      cs: r.cs,
      avg: r.avg,
      obp: r.obp,
      slg: r.slg,
    }));
}

export function getStaticLeaguePitchers(year: number): LeaguePitcher[] {
  return pitDB()
    .players.filter((r) => r.y === year)
    .map((r) => ({
      id: 0,
      name: r.n,
      team: r.tm,
      position: "P",
      gamesPlayed: r.g,
      gamesStarted: r.gs,
      ip: r.ip,
      hits: r.h,
      er: r.er,
      bb: r.bb,
      hbp: r.hbp,
      so: r.so,
      hr: r.hr,
      era: r.era,
      whip: r.whip,
    }));
}
