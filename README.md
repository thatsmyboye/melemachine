# Mele Machine

A companion app for **Out of the Park Baseball — Perfect Team (PT)** mode.
Reads the OOTP card-pool and collection CSV exports, understands what every
rating does, and scores cards through a tunable **Rating Intelligence Engine**
that re-weights value for the run environment you're playing in. Includes a
**PT Live** module powered by the free MLB Stats API with pre-game projections
and confirmed Perfect Points scoring.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** — deployable to Vercel
- **Tailwind CSS** for the UI
- A build-time data pipeline that parses the CSVs into typed JSON

## Getting started

```bash
npm install
npm run dev        # builds data from the CSVs, then starts the dev server
# open http://localhost:3000
```

`npm run data` regenerates `src/data/*.json` from the two CSVs in the repo root.
It runs automatically before `dev` and `build`.

### Updating the data weekly

New cards drop weekly. Re-export the two CSVs from OOTP, drop them in the repo
root with the **same filenames**, and run `npm run data` (or just `npm run dev`).

- `pt_card_list.csv` — the full card pool with all ratings
- `collection_-_manage_cards_..._l10.csv` — your personal collection export

## Features

| Page | What it does |
|------|--------------|
| **Dashboard** (`/`) | Pool/collection stats, tier distribution, top cards |
| **Card Explorer** (`/cards`) | Score & rank the whole pool. Switch run environment, platoon split, and tune rating weights live. Sort by score or value-efficiency. |
| **My Collection** (`/collection`) | Your owned cards with Live / Active / Tournament filters |
| **PT Live** (`/ptlive`) | Today's slate + probable pitchers, Live cards ranked by projected PP (pre-game) or actual PP from box scores. Flags bullpen cards that are today's probable starter with a **▲ Starting** badge (guaranteed appearance). |
| **Engine** (`/about`) | Explains every rating and how run environment shifts value |

## The Rating Intelligence Engine

Lives in `src/lib/`:

- `ratings.ts` — knowledge base: what each rating does and its run-environment bias
- `engine.ts` — normalization, RE-aware weighting, hitter/pitcher/defense scoring, value-efficiency
- `query.ts` — filtering, sorting, pagination over the pool (server-side; the 4.5 MB dataset never ships to the client)
- `mlb.ts` — MLB Stats API client (schedule, probable pitchers, rosters, season stats, box scores)
- `ptlive.ts` — confirmed Perfect Points scoring tables (separate SP / RP tables, 3+ HR bonus, 10+ K bonus for SP, 4+ hit = +25 PP per hit at or beyond the 4th)
- `projections.ts` — pre-game PP projections from 2026 season rate stats, matchup-adjusted

## PT Live

**Actual PP** (post-game): fetches box scores via the MLB Stats API and scores each line using the confirmed beanecounter PP tables. Hitters and pitchers are scored with their respective tables; SP vs RP is determined by position on the card.

**Projected PP** (pre-game): each owned Live card is matched to a real MLB player on today's roster, then projected using their 2026 season rates:

- *Hitters* — expected PA by batting-order slot (or season PA/G if lineup not posted) × opposing SP ERA matchup multiplier
- *Starters* — season IP/GS, K/GS, ER/GS × opposing offense (R/G) multiplier, with probabilistic Win / QS / 10+ K / CG bonuses
- *Relievers* — season PP/appearance × appearance probability (CL ≈ 50%, RP ≈ 45%)

**Role mismatch detection**: if a bullpen-labeled card's player is listed as today's probable starter (opener, bulk guy), the projection sets appearance probability to 100% and displays a gold **▲ Starting** badge indicating a guaranteed appearance.

Confidence tiers: **high** (lineup posted / SP starting), **medium** (lineup not yet posted / RP starting), **low** (reliever with uncertain appearance).

## Deploy

```bash
npx vercel        # or push to a Git repo connected to Vercel
```

The data JSON is gitignored and rebuilt during Vercel's build step (`prebuild`),
so make sure the two source CSVs are committed.

> **Note:** do not run `npm run build` while the dev server is running — both write to `.next/` and the concurrent writes corrupt the dev server's module map. Use `npx tsc --noEmit` to typecheck without stopping the dev server.
