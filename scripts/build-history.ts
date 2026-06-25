// scripts/build-history.ts
// Compiles Lahman Baseball Database CSVs into compact JSON files for the
// Season Crafter reverse search.  Historical stats are immutable so these
// outputs are committed to the repo alongside cards.json.
//
// Prerequisites — download these four files into ./lahman/:
//   https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core/People.csv
//   https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core/Batting.csv
//   https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core/Pitching.csv
//   https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core/Appearances.csv
//
// Then run:  npm run history
// Writes:
//   src/data/hist_hit.json   (~600 KB) — qualified hitter seasons 1871–present
//   src/data/hist_pit.json   (~300 KB) — qualified pitcher seasons 1871–present

import * as fs from "fs";
import * as path from "path";

const LAHMAN_DIR = path.join(process.cwd(), "lahman");
const OUT_DIR = path.join(process.cwd(), "src/data");

// ── CSV helpers ────────────────────────────────────────────────────────────

function readCsv(file: string): Array<Record<string, string>> {
  const full = path.join(LAHMAN_DIR, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing: ${full}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(full, "utf8").trim().split("\n");
  const headers = lines[0].replace(/\r/g, "").split(",");
  return lines.slice(1).map((line) => {
    const vals = line.replace(/\r/g, "").split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = vals[i] ?? ""));
    return obj;
  });
}

function n(v: string | undefined): number {
  const x = parseFloat(v ?? "");
  return isFinite(x) ? x : 0;
}

function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ── People (id → name) ────────────────────────────────────────────────────

console.log("Reading People.csv…");
const people = readCsv("People.csv");
const nameOf = new Map<string, string>();
for (const p of people) {
  const first = (p.nameFirst ?? "").trim();
  const last = (p.nameLast ?? "").trim();
  nameOf.set(p.playerID, `${first} ${last}`.trim());
}
console.log(`  ${nameOf.size} people`);

// ── Appearances (id+year → primary position) ──────────────────────────────

console.log("Reading Appearances.csv…");
const appearances = readCsv("Appearances.csv");

// Map (playerID|yearID) → position code
const posOf = new Map<string, string>();

const POS_COLS: Array<[string, string]> = [
  ["G_p", "P"],
  ["G_c", "C"],
  ["G_1b", "1B"],
  ["G_2b", "2B"],
  ["G_3b", "3B"],
  ["G_ss", "SS"],
  ["G_lf", "LF"],
  ["G_cf", "CF"],
  ["G_rf", "RF"],
  ["G_of", "OF"],
  ["G_dh", "DH"],
];

// Accumulate games per position across stints
const posGames = new Map<string, Map<string, number>>();
for (const row of appearances) {
  const key = `${row.playerID}|${row.yearID}`;
  let map = posGames.get(key);
  if (!map) { map = new Map(); posGames.set(key, map); }
  for (const [col, pos] of POS_COLS) {
    const g = n(row[col]);
    if (g > 0) map.set(pos, (map.get(pos) ?? 0) + g);
  }
}

for (const [key, map] of posGames) {
  let best = ""; let bestG = 0;
  for (const [pos, g] of map) {
    if (g > bestG) { bestG = g; best = pos; }
  }
  if (best) posOf.set(key, best);
}
console.log(`  ${posOf.size} player-seasons with position data`);

// ── Batting ───────────────────────────────────────────────────────────────

console.log("Reading Batting.csv…");
const batting = readCsv("Batting.csv");

// Aggregate multi-stint seasons
interface HitAgg {
  name: string; year: number; team: string; pos: string;
  g: number; ab: number; h: number; d: number; t: number;
  hr: number; rbi: number; bb: number; hbp: number; so: number;
  sb: number; cs: number; sf: number; sh: number;
  stints: number;
}

const hitAgg = new Map<string, HitAgg>();
for (const row of batting) {
  const key = `${row.playerID}|${row.yearID}`;
  const name = nameOf.get(row.playerID) ?? row.playerID;
  const year = parseInt(row.yearID, 10);
  const pos = posOf.get(key) ?? "";

  if (!hitAgg.has(key)) {
    hitAgg.set(key, {
      name, year, team: row.teamID, pos,
      g: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0,
      bb: 0, hbp: 0, so: 0, sb: 0, cs: 0, sf: 0, sh: 0,
      stints: 0,
    });
  }
  const a = hitAgg.get(key)!;
  a.g += n(row.G);
  a.ab += n(row.AB);
  a.h += n(row.H);
  a.d += n(row["2B"]);
  a.t += n(row["3B"]);
  a.hr += n(row.HR);
  a.rbi += n(row.RBI);
  a.bb += n(row.BB);
  a.hbp += n(row.HBP);
  a.so += n(row.SO);
  a.sb += n(row.SB);
  a.cs += n(row.CS);
  a.sf += n(row.SF);
  a.sh += n(row.SH);
  a.stints++;
  if (a.stints > 1) a.team = "Various";
}

// Compute rate stats and filter
interface HistHit {
  n: string; y: number; tm: string; p: string;
  g: number; pa: number; ab: number; h: number;
  d: number; t: number; hr: number; bb: number;
  hbp: number; so: number; sb: number; cs: number;
  avg: number; obp: number; slg: number;
}

const hitRows: HistHit[] = [];
for (const a of hitAgg.values()) {
  if (a.ab < 50) continue; // skip tiny samples
  const pa = a.ab + a.bb + a.hbp + a.sf + a.sh;
  if (pa < 80) continue;
  const avg = a.ab > 0 ? a.h / a.ab : 0;
  const obpDen = a.ab + a.bb + a.hbp + a.sf;
  const obp = obpDen > 0 ? (a.h + a.bb + a.hbp) / obpDen : 0;
  const tb = a.h + a.d + 2 * a.t + 3 * a.hr; // 1B + 2*2B + 3*3B + 4*HR = H + D + 2T + 3HR
  const slg = a.ab > 0 ? tb / a.ab : 0;
  hitRows.push({
    n: a.name,
    y: a.year,
    tm: a.team,
    p: a.pos || "?",
    g: a.g,
    pa,
    ab: a.ab,
    h: a.h,
    d: a.d,
    t: a.t,
    hr: a.hr,
    bb: a.bb,
    hbp: a.hbp,
    so: a.so,
    sb: a.sb,
    cs: a.cs,
    avg: r3(avg),
    obp: r3(obp),
    slg: r3(slg),
  });
}

console.log(`  ${hitRows.length} qualified hitter seasons`);

// ── Pitching ──────────────────────────────────────────────────────────────

console.log("Reading Pitching.csv…");
const pitching = readCsv("Pitching.csv");

interface PitAgg {
  name: string; year: number; team: string;
  g: number; gs: number; ipouts: number; h: number;
  er: number; bb: number; hbp: number; so: number; hr: number;
  stints: number;
}

const pitAgg = new Map<string, PitAgg>();
for (const row of pitching) {
  const key = `${row.playerID}|${row.yearID}`;
  const name = nameOf.get(row.playerID) ?? row.playerID;
  const year = parseInt(row.yearID, 10);

  if (!pitAgg.has(key)) {
    pitAgg.set(key, {
      name, year, team: row.teamID,
      g: 0, gs: 0, ipouts: 0, h: 0,
      er: 0, bb: 0, hbp: 0, so: 0, hr: 0,
      stints: 0,
    });
  }
  const a = pitAgg.get(key)!;
  a.g += n(row.G);
  a.gs += n(row.GS);
  a.ipouts += n(row.IPouts);
  a.h += n(row.H);
  a.er += n(row.ER);
  a.bb += n(row.BB);
  a.hbp += n(row.HBP);
  a.so += n(row.SO);
  a.hr += n(row.HR);
  a.stints++;
  if (a.stints > 1) a.team = "Various";
}

interface HistPit {
  n: string; y: number; tm: string;
  g: number; gs: number; ip: number; h: number;
  er: number; bb: number; hbp: number; so: number; hr: number;
  era: number; whip: number;
}

const pitRows: HistPit[] = [];
for (const a of pitAgg.values()) {
  if (a.ipouts < 60) continue; // ~20 IP minimum
  const ip = a.ipouts / 3;
  const era = ip > 0 ? r3((a.er / ip) * 9) : 0;
  const whip = ip > 0 ? r3((a.h + a.bb) / ip) : 0;
  pitRows.push({
    n: a.name,
    y: a.year,
    tm: a.team,
    g: a.g,
    gs: a.gs,
    ip: Math.round(ip * 10) / 10,
    h: a.h,
    er: a.er,
    bb: a.bb,
    hbp: a.hbp,
    so: a.so,
    hr: a.hr,
    era,
    whip,
  });
}

console.log(`  ${pitRows.length} qualified pitcher seasons`);

// ── Write output ──────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

const now = new Date().toISOString();

fs.writeFileSync(
  path.join(OUT_DIR, "hist_hit.json"),
  JSON.stringify({ generated: now, count: hitRows.length, players: hitRows })
);

fs.writeFileSync(
  path.join(OUT_DIR, "hist_pit.json"),
  JSON.stringify({ generated: now, count: pitRows.length, players: pitRows })
);

console.log(
  `✓ Wrote ${hitRows.length} hitter and ${pitRows.length} pitcher seasons to src/data/`
);
