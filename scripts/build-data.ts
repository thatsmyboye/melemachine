// ─────────────────────────────────────────────────────────────────────────
// Parses the raw OOTP Perfect Team CSV exports into typed JSON consumed by
// the app. Run via `npm run data` (also runs automatically before dev/build).
// ─────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import {
  TIER_BY_CODE,
  tierFromOvr,
  POSITION_BY_CODE,
  PITCHER_ROLE_BY_CODE,
  HAND_BY_CODE,
  CARD_TYPE_NAME,
} from "../src/lib/encodings.ts";
import type {
  Card,
  CollectionCard,
  CardDataset,
  CollectionDataset,
  PositionCode,
} from "../src/lib/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "src", "data");

const CARD_LIST_CSV = path.join(
  ROOT,
  "pt_card_list.csv"
);
const COLLECTION_CSV = path.join(
  ROOT,
  "collection_-_manage_cards_collection_-_manage_cards_all_ratings___l10.csv"
);

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Prices may use a space as a thousands separator ("23 018" -> 23018). */
function price(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, "").trim();
  if (s === "" || s === "0") return s === "0" ? 0 : null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function readCsv(file: string): Record<string, string>[] {
  let text = fs.readFileSync(file, "utf8");
  // The card list header begins with a leading "//".
  text = text.replace(/^\/\//, "");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data;
}

// ── Card list ────────────────────────────────────────────────────────────
function buildCards(): Card[] {
  const rows = readCsv(CARD_LIST_CSV);
  const cards: Card[] = [];

  for (const r of rows) {
    const ovr = num(r["Card Value"]);
    if (!ovr) continue;

    const pos = POSITION_BY_CODE[String(num(r["Position"]))] ?? "DH";
    const role =
      PITCHER_ROLE_BY_CODE[String(num(r["Pitcher Role"]))] ?? "None";
    const isPitcher = pos === "P" || role !== "None";

    const positionRatings: Partial<Record<PositionCode, number>> = {
      P: num(r["Pos Rating P"]),
      C: num(r["Pos Rating C"]),
      "1B": num(r["Pos Rating 1B"]),
      "2B": num(r["Pos Rating 2B"]),
      "3B": num(r["Pos Rating 3B"]),
      SS: num(r["Pos Rating SS"]),
      LF: num(r["Pos Rating LF"]),
      CF: num(r["Pos Rating CF"]),
      RF: num(r["Pos Rating RF"]),
    };

    const limitQty = num(r["limit"]);
    const tierCode = String(num(r["tier"]));

    cards.push({
      id: num(r["Card ID"]),
      title: (r["Card Title"] ?? "").trim(),
      firstName: (r["FirstName"] ?? "").trim(),
      lastName: (r["LastName"] ?? "").trim(),
      nickName: (r["NickName"] ?? "").trim(),
      ovr,
      tier: TIER_BY_CODE[tierCode] ?? tierFromOvr(ovr),
      cardType: num(r["Card Type"]),
      cardTypeName:
        CARD_TYPE_NAME[String(num(r["Card Type"]))] ?? `Type ${r["Card Type"]}`,
      subType: (r["Card Sub Type"] ?? "").trim(),
      badge: (r["Card Badge"] ?? "").trim(),
      series: (r["Card Series"] ?? "").trim(),
      year: num(r["Year"]),
      team: (r["Team"] ?? "").trim(),
      franchise: (r["Franchise"] ?? "").trim(),
      position: pos,
      pitcherRole: role,
      isPitcher,
      bats: HAND_BY_CODE[String(num(r["Bats"]))] ?? "R",
      throws: HAND_BY_CODE[String(num(r["Throws"]))] ?? "R",
      isLE: limitQty > 0,
      limitQty,
      owned: num(r["owned"]),
      brefid: (r["brefid"] ?? "").trim(),
      era: num(r["era"]),

      hit: {
        overall: {
          contact: num(r["Contact"]),
          gap: num(r["Gap"]),
          power: num(r["Power"]),
          eye: num(r["Eye"]),
          avoidK: num(r["Avoid Ks"]),
          babip: num(r["BABIP"]),
        },
        vL: {
          contact: num(r["Contact vL"]),
          gap: num(r["Gap vL"]),
          power: num(r["Power vL"]),
          eye: num(r["Eye vL"]),
          avoidK: num(r["Avoid K vL"]),
          babip: num(r["BABIP vL"]),
        },
        vR: {
          contact: num(r["Contact vR"]),
          gap: num(r["Gap vR"]),
          power: num(r["Power vR"]),
          eye: num(r["Eye vR"]),
          avoidK: num(r["Avoid K vR"]),
          babip: num(r["BABIP vR"]),
        },
      },
      baserun: {
        speed: num(r["Speed"]),
        stealRate: num(r["Steal Rate"]),
        stealing: num(r["Stealing"]),
        baserunning: num(r["Baserunning"]),
        sacBunt: num(r["Sac bunt"]),
        buntForHit: num(r["Bunt for hit"]),
      },
      pitch: {
        overall: {
          stuff: num(r["Stuff"]),
          movement: num(r["Movement"]),
          control: num(r["Control"]),
          pHR: num(r["pHR"]),
          pBABIP: num(r["pBABIP"]),
        },
        vL: {
          stuff: num(r["Stuff vL"]),
          movement: num(r["Movement vL"]),
          control: num(r["Control vL"]),
          pHR: num(r["pHR vL"]),
          pBABIP: num(r["pBABIP vL"]),
        },
        vR: {
          stuff: num(r["Stuff vR"]),
          movement: num(r["Movement vR"]),
          control: num(r["Control vR"]),
          pHR: num(r["pHR vR"]),
          pBABIP: num(r["pBABIP vR"]),
        },
      },
      field: {
        ifRange: num(r["Infield Range"]),
        ifError: num(r["Infield Error"]),
        ifArm: num(r["Infield Arm"]),
        turnDP: num(r["DP"]),
        cAbility: num(r["CatcherAbil"]),
        cFraming: num(r["CatcherFrame"]),
        cArm: num(r["Catcher Arm"]),
        ofRange: num(r["OF Range"]),
        ofError: num(r["OF Error"]),
        ofArm: num(r["OF Arm"]),
      },
      pitcherPhysical: {
        stamina: num(r["Stamina"]),
        hold: num(r["Hold"]),
        groundball: num(r["GB"]),
        velocity: (r["Velocity"] ?? "").trim(),
        armSlot: num(r["Arm Slot"]),
      },
      positionRatings,
      prices: {
        buyHigh: price(r["Buy Order High"]),
        sellLow: price(r["Sell Order Low"]),
        last10: price(r["Last 10 Price"]),
        last10Var: price(r["Last 10 Price(VAR)"]),
      },
      date: (r["date"] ?? "").trim(),
    });
  }
  return cards;
}

// ── Collection ─────────────────────────────────────────────────────────────
function buildCollection(): CollectionCard[] {
  const rows = readCsv(COLLECTION_CSV);
  const out: CollectionCard[] = [];
  for (const r of rows) {
    const name = (r["Name"] ?? "").trim();
    if (!name) continue;
    const cType = (r["CType"] ?? "").trim();
    out.push({
      name,
      position: (r["POS"] ?? "").trim(),
      bats: (HAND_BY_CODE[r["B"]] ?? (r["B"] as any) ?? "R") as any,
      throws: (HAND_BY_CODE[r["T"]] ?? (r["T"] as any) ?? "R") as any,
      cType,
      ovr: num(r["OVR"]),
      isLive: cType === "2026 MLB",
      active: (r["St"] ?? "").trim().toLowerCase() === "active",
      tourEligible: (r["Tour"] ?? "").trim().toUpperCase() === "Y",
      prices: {
        buy: price(r["BUY"]),
        sell: price(r["SELL"]),
        last10: price(r["L10"]),
      },
    });
  }
  return out;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cards = buildCards();
  const collection = buildCollection();

  const cardDataset: CardDataset = {
    generatedAt: new Date().toISOString(),
    count: cards.length,
    cards,
  };
  const collectionDataset: CollectionDataset = {
    generatedAt: new Date().toISOString(),
    count: collection.length,
    cards: collection,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "cards.json"),
    JSON.stringify(cardDataset)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "collection.json"),
    JSON.stringify(collectionDataset)
  );

  console.log(
    `✓ Wrote ${cards.length} cards and ${collection.length} collection rows to src/data/`
  );
}

main();
