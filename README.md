# Mele Machine

A companion app for **Out of the Park Baseball — Perfect Team (PT)** mode.
Reads the OOTP card-pool and collection CSV exports, understands what every
rating does, and scores cards through a tunable **Rating Intelligence Engine**
that re-weights value for the run environment you're playing in. Includes a
**PT Live** module powered by the free MLB Stats API.

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
| **PT Live** (`/ptlive`) | Today's games + probable pitchers, and your Live cards ranked by real-life Perfect Points |
| **Engine** (`/about`) | Explains every rating and how run environment shifts value |

## The Rating Intelligence Engine

Lives in `src/lib/`:

- `ratings.ts` — the knowledge base: what each rating does and its run-environment bias
- `engine.ts` — normalization, RE-aware weighting, hitter/pitcher/defense scoring, value-efficiency
- `query.ts` — filtering, sorting, pagination over the pool (server-side; the 4.5 MB dataset never ships to the client)
- `mlb.ts` — MLB Stats API client (schedule, probable pitchers, box scores)
- `ptlive.ts` — Perfect Points scoring config

### ⚠ PT Live scoring is provisional

`PP_SCORING` in `src/lib/ptlive.ts` currently uses a placeholder fantasy-style
point table. Replace it with the confirmed beanecounter PT Live point values
and all projections/rankings update automatically.

## Deploy

```bash
npx vercel        # or push to a Git repo connected to Vercel
```

The data JSON is gitignored and rebuilt during Vercel's build step (`prebuild`),
so make sure the two source CSVs are committed.
