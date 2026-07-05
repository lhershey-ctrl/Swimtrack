---
name: swimtrack-records-feature
description: "Israeli age-group swim records feature — PDF parsing, publish flow, and domain terms"
metadata: 
  node_type: memory
  type: project
  originSessionId: aa2468ed-d83c-497d-a96c-a5606287bdf8
---

Added 2026-07 (commits `66cf0f8`…`e4741f6`). Lets swimmers compare their bests against official Israeli age-group records and see which records they personally hold.

**Source data:** 4 official Hebrew PDFs in `Data/` (juniors/masters × long course 50m / short course 25m, e.g. `שיאי ישראל בריכה ארוכה ...pdf`). Parsed by scraping PDF.js text items, grouping into rows by y-coordinate then columns by x-coordinate (name band / date / time-regex / age token), reconstructing event headers (distance+stroke) from the right-most columns. Relay rows are filtered out via comma-count/regex heuristics.

**Where parsing runs:** the *production* parser is embedded directly in `swim_tracker.html` (desktop "③ Israeli Age Records" panel, no separate HTML file) — user picks PDFs there, it parses client-side, shows a diff vs the current cloud doc ("Review changes vs cloud"), and a manual **"☁ Upload changes to Cloud"** button (`recPublish`) writes `config/records` (owners-only write per `firestore.rules`). `mobile/parse_records.mjs` (+ `probe_records.mjs` for inspecting raw PDF text-item layout, + `record_gaps.mjs`) are separate **manual dev-only Node scripts** using `pdfjs-dist` — used only for offline tuning of the column x-ranges, never invoked by the running app. `mobile/records_out.json`/`records_preview.txt` are scratch output from those scripts.

**Firestore shape:** `config/records = { records, segments:{"50|J","25|J","50|M","25|M":{loadedAt,count}}, count, loadedAt, by }`. Mobile only ever reads this doc.

**Domain terms:**
- **"Record gap"** — a swimmer's best time in their *current* age group vs the matching official record time (seconds + %). Computed by `recordGap()`/`bestInAgeGroup()`/`bestsByAgeGroup()` in `mobile/src/analysis.js`.
- **"Records I hold"** — records where the record-holder's Hebrew name (loose-matched via `nameMatch()`) equals the swimmer's own `recordName` profile field. Surfaced as a permanent "🏅 Records Held" list (`recordsHeldBy()`), independent of current age group.

**Non-obvious rules:**
- Age group uses **year-end (Dec 31) age**, not meet-day age (`recordAge()`) — a faster time swum in a younger group doesn't retroactively count toward an older group's record.
- Masters bands are 5-year (25-29, 30-34, …); juniors are single ages 10–18 plus a 19-24 "open" band.
- SC(25m)/LC(50m) and juniors/masters are 4 fully separate segments, each with its own 6-month staleness tracking (`segments` map).
- Commit `19c1226`: if the swimmer holds a record but it was set **internationally** (missing from loglig's own meet data), the Records tab still shows the *record* time as the headline, flagged "★ record time — not in the meet data" rather than falling back to whatever (slower/absent) loglig time exists.
- Commit `e4741f6`: records the swimmer holds that have no matching loglig result at all are still listed as rows (not silently dropped).

See [[swimtrack-cloud-architecture]], [[swimtrack-references]].
