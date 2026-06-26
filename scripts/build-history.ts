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
  // Lahman fielding ratings (1-250), pre-normalized against position+era peers.
  // Absent when fielding data is unavailable (pitchers, DH, very old records).
  fr?: number;   // range (RF/9 percentile)
  ferr?: number; // errors (error-rate percentile, higher = fewer errors)
  farm?: number; // arm strength (assists/9 or CS% for catchers)
}

// Track playerID alongside rows so we can join fielding data later.
const hitRowPids: string[] = [];
const hitRows: HistHit[] = [];
for (const [key, a] of hitAgg.entries()) {
  const pid = key.split("|")[0];
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
  hitRowPids.push(pid);
}

console.log(`  ${hitRows.length} qualified hitter seasons`);

// ── Fielding ──────────────────────────────────────────────────────────────

console.log("Reading Fielding.csv…");
const fielding = readCsv("Fielding.csv");

// Skip positions where fielding metrics are irrelevant for rating purposes.
const SKIP_POS = new Set(["P", "DH", ""]);

interface FieldEntry { po: number; a: number; e: number; inn: number; sb: number; cs: number; }

// Aggregate by playerID|yearID|POS across stints.
const fieldByKey = new Map<string, FieldEntry>();
for (const row of fielding) {
  const pos = row.POS ?? "";
  if (SKIP_POS.has(pos)) continue;
  const key = `${row.playerID}|${row.yearID}|${pos}`;
  if (!fieldByKey.has(key)) fieldByKey.set(key, { po: 0, a: 0, e: 0, inn: 0, sb: 0, cs: 0 });
  const f = fieldByKey.get(key)!;
  f.po += n(row.PO);
  f.a  += n(row.A);
  f.e  += n(row.E);
  // InnOuts: outs recorded while the player was on the field (InnOuts/3 = innings).
  // Pre-1956 records often lack InnOuts; fall back to games × 9 as a rough proxy.
  const rawInn = n(row.InnOuts);
  f.inn += rawInn > 0 ? rawInn / 3 : n(row.G) * 9;
  f.sb += n(row.SB);  // runners who stole on catcher
  f.cs += n(row.CS);  // runners caught stealing by catcher
}

const MIN_FIELD_INN = 20; // discard tiny fielding samples

// For each year+position pair, collect the metric distributions so we can
// normalize each player's numbers against their positional peers in that era.
interface FieldDist { rf9: number[]; errRate: number[]; arm: number[]; }
const yearPosDist = new Map<string, FieldDist>();

for (const [key, f] of fieldByKey) {
  if (f.inn < MIN_FIELD_INN) continue;
  const [, yr, pos] = key.split("|");
  const ypk = `${yr}|${pos}`;
  if (!yearPosDist.has(ypk)) yearPosDist.set(ypk, { rf9: [], errRate: [], arm: [] });
  const d = yearPosDist.get(ypk)!;
  d.rf9.push((f.po + f.a) / f.inn * 9);
  const tot = f.po + f.a + f.e;
  d.errRate.push(tot > 0 ? f.e / tot : 0);
  // Arm proxy: assists per 9 innings for IF/OF; CS% for catchers.
  if (pos === "C") {
    const att = f.sb + f.cs;
    d.arm.push(att >= 5 ? f.cs / att : -1); // -1 flags insufficient sample
  } else {
    d.arm.push(f.a / f.inn * 9);
  }
}

// Pre-compute [mean, std] for each distribution so z-scores are fast at lookup.
function fldMs(arr: number[]): [number, number] {
  const valid = arr.filter(v => v >= 0);
  if (valid.length < 5) return [0, 1];
  const m = valid.reduce((s, v) => s + v, 0) / valid.length;
  const v = valid.reduce((s, x) => s + (x - m) ** 2, 0) / valid.length;
  return [m, Math.sqrt(v) || 1];
}

interface FieldDistStats { rf9: [number, number]; errRate: [number, number]; arm: [number, number]; }
const distStats = new Map<string, FieldDistStats>();
for (const [ypk, d] of yearPosDist) {
  distStats.set(ypk, {
    rf9:     fldMs(d.rf9),
    errRate: fldMs(d.errRate),
    arm:     fldMs(d.arm),
  });
}

function fldZ([m, s]: [number, number], val: number): number { return (val - m) / s; }
function zrFld(z: number): number { return Math.max(20, Math.min(250, Math.round(125 + z * 33))); }

// Join fielding ratings onto each hit row.
let fieldedCount = 0;
for (let i = 0; i < hitRows.length; i++) {
  const row = hitRows[i];
  const pid  = hitRowPids[i];
  const pos  = row.p;
  if (!pos || SKIP_POS.has(pos) || pos === "?") continue;

  const f = fieldByKey.get(`${pid}|${row.y}|${pos}`);
  if (!f || f.inn < MIN_FIELD_INN) continue;

  const ds = distStats.get(`${row.y}|${pos}`);
  if (!ds) continue;

  const rf9     = (f.po + f.a) / f.inn * 9;
  const tot     = f.po + f.a + f.e;
  const errRate = tot > 0 ? f.e / tot : 0;

  row.fr   = zrFld( fldZ(ds.rf9,     rf9));
  row.ferr = zrFld(-fldZ(ds.errRate, errRate)); // lower error rate → higher rating

  // Arm: CS% for catchers, assists/9 for everyone else.
  if (pos === "C") {
    const att = f.sb + f.cs;
    if (att >= 10) {
      row.farm = zrFld(fldZ(ds.arm, f.cs / att));
    }
  } else {
    const arm9 = f.a / f.inn * 9;
    row.farm = zrFld(fldZ(ds.arm, arm9));
  }

  fieldedCount++;
}

console.log(`  ${fieldedCount} hitter seasons with fielding data`);

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
