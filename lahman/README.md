# Lahman Baseball Database

Source CSVs for the Season Crafter historical reverse search.

## Download

Run from the repo root:

```bash
BASE="https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core"
curl -o lahman/People.csv      "$BASE/People.csv"
curl -o lahman/Batting.csv     "$BASE/Batting.csv"
curl -o lahman/Pitching.csv    "$BASE/Pitching.csv"
curl -o lahman/Appearances.csv "$BASE/Appearances.csv"
```

Or with wget:

```bash
wget -P lahman \
  https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core/People.csv \
  https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core/Batting.csv \
  https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core/Pitching.csv \
  https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core/Appearances.csv
```

## Compile

After downloading, compile to `src/data/hist_hit.json` and `src/data/hist_pit.json`:

```bash
npm run history
```

The compiled JSON files are committed to the repo. Re-run `npm run history` only when the Lahman CSVs are updated (typically once per season).

## License

The Lahman Baseball Database is released under a Creative Commons Attribution-ShareAlike 3.0 Unported License.
http://www.seanlahman.com/baseball-archive/statistics/
