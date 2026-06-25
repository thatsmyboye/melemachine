# Lahman Baseball Database

Source CSVs for the Season Crafter historical reverse search.

## Download

Run from the repo root in PowerShell:

```powershell
$base = "https://raw.githubusercontent.com/chadwickbureau/baseballdatabank/master/core"
foreach ($file in @("People.csv","Batting.csv","Pitching.csv","Appearances.csv")) {
    Invoke-WebRequest -Uri "$base/$file" -OutFile "lahman\$file"
}
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
