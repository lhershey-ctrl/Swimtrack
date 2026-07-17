# SwimTrack — Architecture & Developer Reference

## Overview

SwimTrack has **two front-ends sharing one cloud database**:

1. **Desktop app** — `swim_tracker.html`, a zero-build single HTML file (vanilla JS, Chart.js, pdf.js). Used to **extract** data from loglig.com and **sync it to the cloud**. Also does full analysis + the Race-PDF tool.
2. **Mobile app** — `mobile/` (React + Vite), a modern phone-first PWA that **reads from the cloud** and shows the analysis. Deployed to Firebase Hosting.

Both authenticate with **Google Sign-In** and talk directly to **Firebase Firestore** (project `swimtrack-e12c8`). Access is restricted to an email allow-list. The desktop app still works fully offline via `localStorage` if you don't sign in.

**Live URLs**
- Mobile app: `https://swimtrack-e12c8.web.app/`
- Desktop extractor + sync: `https://swimtrack-e12c8.web.app/extract.html` (the deploy copies `swim_tracker.html` → `extract.html`)

> Google sign-in only works from a hosted origin (`*.web.app` or `localhost`), **never from a `file://` page** — so use the hosted `/extract.html`, not the local file, when you need to sync.

---

## Cloud Architecture (Firebase)

```
DESKTOP (swim_tracker.html)                MOBILE (mobile/ — React+Vite)
  • Extract (bookmarklet / paste HTML)       • Google sign-in gate
  • Analyze + Race                           • Swimmer picker (from cloud)
  • ☁ Sign in / Load / Sync                  • Home/Meets/Progress/Records/
        │  write/read                          Seasons/Settings (recharts)
        ▼                                            ▲ read (live onSnapshot)
   ┌───────────────────────────────────────────────────────────────────┐
   │  Firebase project: swimtrack-e12c8                                 │
   │  Firestore:                                                        │
   │    swimmers/{playerId} = {                                         │
   │      name, id, birthdate, sex,                                     │
   │      heights:[{date,value}], weights:[...], seasonIds:[...],       │
   │      seasons:{ "2024-2025": {seasonId,bests[],results[]}, …},      │
   │      updatedAt                                                     │
   │    }                                                               │
   │    config/access  = { emails:[...] }         ← live allow-list     │
   │    config/records = { records, segments, count, loadedAt, by }     │
   │      ← Israeli age-group records (juniors+masters, SC+LC)          │
   │    config/rudolph = { table, count, loadedAt, by }                 │
   │      ← Rudolph age-graded 1-20 points table (50m only)             │
   │  Auth: Google                                                      │
   │  Hosting: serves mobile/dist (+ extract.html, bm2.js)              │
   └───────────────────────────────────────────────────────────────────┘
```

### Data ownership (avoids clobbering)
- **`seasons`** (results/bests) is written by the **desktop** "☁ Sync to cloud" (Analyze tab). Firestore `merge:true` updates season-by-season, so re-syncing one season never wipes the others.
- **Profile** (`name`, `birthdate`, `sex`, `heights`, `weights`, `seasonIds`) is editable on **both** desktop Settings (auto-saves to cloud when signed in; "☁ Save to Cloud" button) **and** the mobile Settings tab. All writes use `merge:true` and only touch their own fields.
- **`config/records`** and **`config/rudolph`** are published **only from the desktop app's Extract tab** (③ Israeli Age Records, ④ Rudolph Age-Score Table) after reviewing a diff vs. the current cloud doc. Both mobile and desktop only ever *read* them for scoring/gap features; they're not touched by the swimmer-sync flow at all.

### Security rules (`firestore.rules`)
- **Owners** (hardcoded `ownerEmails()`, currently `lhershey@gmail.com`) always have access and can edit the allow-list.
- Everyone else must be in **`config/access.emails`** (managed live from the mobile Settings → "Who can access"). `swimmers/*` allows read/write only to owners or allow-listed emails; `config/access` is readable by allow-listed users, writable only by owners.
- `config/records` and `config/rudolph` follow the same pattern: readable by any allow-listed user, writable only by owners (so only the owner account can publish new records/table data).

### Desktop ↔ cloud (Analyze tab "☁ Cloud" bar)
- **☁ Load from cloud** — builds the global `D` from `swimmers/{activeId}.seasons` and renders via `finalize()`.
- **☁ Sync to cloud** — pushes the loaded `D` + profile to `swimmers/{activeId}`.
- File loads now **merge** into the current view; switching swimmers auto-resets; **✕ Clear** resets.
- The Firebase code is a `<script type="module">` at the bottom of `swim_tracker.html` importing the modular SDK from gstatic. Cloud load/clear are defined **in that module** (using `window.D` + the hoisted `window.finalize`) so they don't depend on the main script's execution order.

### Mobile app (`mobile/`)
- Vite + React 19 + recharts; Firebase Web SDK.
- `src/firebase.js` — init, Google auth (`signInWithPopup`), `fetchSwimmers`, `subscribeSwimmer` (live), profile CRUD, access-list read/write, `fetchRecords()`/`fetchRudolph()` (read-only; publishing is desktop-only).
- `src/analysis.js` — pure analysis builders ported from the desktop (`allResults`, `getStroke`, `competitions`, `scLc`, `insights`, `seasonRecap`, `strokeImprovement`, `pointsTrend`, `eventHeatmap`, `recordGap`/`bestInAgeGroup`/`recordsHeldBy` (Israeli records), `rudolphAgeBracket`/`rudolphScore`/`rudolphTrend` (Rudolph age-graded score), …).
- `src/theme.jsx` — light/dark palettes + context (`useUI`), persisted to `localStorage`.
- `src/App.jsx` — auth gate, swimmer picker, 6 tabs (Home, Meets, Progress, Records, Seasons, Settings). Progress tab shows Points Trend + Rudolph "Age Score" trend (50m only, hidden for swimmers over 20) with a "?" info modal.
- Build/deploy: `cd mobile && npm run build` (a `prebuild` copies `../swim_tracker.html` → `public/extract.html`; Vite also copies `mobile/public/bm2.js` verbatim into `dist/`) then `firebase deploy`.

---

## Desktop single-file app

`swim_tracker.html` is a **zero-dependency, single-file** swimming analysis tool. No server, no build step. Open in any browser. Local state is stored in browser `localStorage` (key `sw_settings`); cloud sync is optional (sign in).

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Vanilla JavaScript (ES5-compatible) |
| Charting | Chart.js 4.4.1 (CDN) |
| PDF extraction | pdf.js 3.11.174 (CDN) |
| Styling | Custom CSS with CSS variables |
| Storage | browser `localStorage` key `sw_settings` |
| Build | None — edit the HTML file directly |

---

## File Structure

Single file: `swim_tracker.html` (~3000 lines)

```
<head>
  <style>          ← All CSS (~300 lines)
</head>
<body>
  .topbar          ← Tab navigation
  #tc-extract      ← Tab 1: Extract Data
  #tc-analyze      ← Tab 2: Analyze
  #tc-race         ← Tab 3: Race Curve
  #tc-settings     ← Tab 4: Settings
  <script>
    IIFE block     ← Swimmer management + settings (SWIMMERS, activeSwimmer)
    Global scope   ← All analysis functions, chart builders, data model
  </script>
</body>
```

---

## Data Model

### Global `D` object (in-memory, built from loaded JSON)

```js
D = {
  '2024-2025': {
    results: [
      { event, pool, place, time, seconds, points, date, competition }
    ],
    bests: [
      { event, pool, time, seconds, points }
    ]
  },
  '2023-2024': { ... }
}
```

- `results` = every individual swim from competition history
- `bests` = season-best per event (from LogLig "Best Times" table)
- Key = season string e.g. `'2024-2025'`
- `pool` = raw string scraped from LogLig ('25', '50', or empty)

### Helper functions

```js
allResults()         // deduped results across all seasons
seasons()            // sorted season keys from D
poolNorm(raw)        // '25'|'50'|'' normalized
parseDate('DD/MM/YYYY')  // → timestamp
dateToSeason(ts)         // → '2024-2025' string
getStroke(eventName)     // → 'Free'|'Back'|'Breast'|'Fly'|'IM'
isRelay(eventName)       // → bool
```

---

## IIFE — Swimmer Management

Swimmer data and settings are wrapped in an IIFE to prevent scope leakage. Key internals exposed via `window.*`:

```js
window.getAllSwimmers()          // → SWIMMERS array
window.getActiveSwimmerData()   // → SWIMMERS[activeSwimmer]
window.getActiveSwimmerSids()   // → active swimmer's season ID array
window.addSwimmerSeason(i, type)
window.removeSwimmerSeason(i, sid)
window.addMeasurement(i, field)   // field = 'heights'|'weights'
window.removeMeasurement(i, field, j)
window.selectSwimmer(i)
window.showSwChart(divId, swimIdx, type)  // lazy chart init
```

### SWIMMERS schema

```js
[{
  name: 'Noga',
  id: '268117',           // loglig.com Player ID
  seasonIds: [1715, 1605, 1533, 1396, 1284, 1164],
  birthdate: 'DD/MM/YYYY',
  heights: [{ date: 'DD/MM/YYYY', value: 165 }],
  weights: [{ date: 'DD/MM/YYYY', value: 52.0 }]
}]
```

Persisted to `localStorage['sw_settings']` as JSON.

---

## Known Season IDs (loglig.com)

| Season | Season ID |
|--------|-----------|
| 2025–2026 | 1715 |
| 2024–2025 | 1605 |
| 2023–2024 | 1533 |
| 2022–2023 | 1396 |
| 2021–2022 | 1284 |
| 2020–2021 | 1164 |

---

## Data Extraction Mechanism

LogLig's swimmer season page (server-rendered, no client-side lazy loading) has 3 table groups, each `<table class="pld-table tablesorter...">`:
- **#personalbests** — headers מקצוע/אורך הבריכה/תוצאה/תאריך/שם תחרות (no points column) — not used by the app.
- **#seasonalbests** — same + מיקום במשחה + **ניקוד** (points) — this is the `bests` array (detected via the points column).
- **#results** — **one `<table>` per event**, each wrapped in `<div class="pld-card"><div class="pld-group-title">EVENT NAME</div>…`, headers תאריך/שם תחרות/**משחה**(event)/קטגוריה/אורך הבריכה/מקצה/מסלול/מיקום במקצה/מיקום במשחה/תוצאה/ניקוד — this is the `results` array (every individual swim). Detected by an event-name column ("משחה") + a competition-name column, with no points column.

Two independent parsing paths must be kept in sync by hand when LogLig's markup changes (confirmed the hard way in 2026-07 — see [[swimtrack-loglig-extraction]] in the assistant's memory / the git history around commit `4052872`):

### Manual Bookmarklet (primary method)

`bmLink2`'s `href` (set directly in the HTML) is a **tiny, permanent loader**:
```js
javascript:(function(){var s=document.createElement('script');s.src='https://swimtrack-e12c8.web.app/bm2.js?t='+Date.now();document.body.appendChild(s);})();
```
The actual extraction logic lives in `mobile/public/bm2.js` (deployed with `no-cache` headers via `firebase.json`, copied into `dist/` verbatim by Vite's public-dir handling). Clicking the bookmark always fetches and runs whatever is *currently* live — a LogLig markup fix ships via a normal `firebase deploy`; the bookmark itself never needs to be re-dragged again. (Before commit `3b86e57`, the entire script was baked into the bookmark's URL — a frozen snapshot from drag-time that no server-side fix could ever reach. Don't reintroduce that pattern.)

### Paste-HTML alternative

`extractFromHtml()` in `swim_tracker.html` (Extract tab → "Alternative: paste page HTML instead") does the same parsing via `DOMParser` on a copy of `document.documentElement.outerHTML` (grabbed via `copy(...)` in the browser console on the LogLig page, then pasted into a textarea). Useful for debugging without needing a working bookmark, and as the primary method if the bookmarklet ever breaks for a reason unrelated to the parsing logic itself.

### Dead code

`BM`/`copyBM1` (the old "Auto Extraction," multi-season, iframe-crawling console script) still exists in the source but isn't wired to any visible button — leave it alone unless specifically asked to revive or remove it.

---

## Analysis Functions

```
buildAll()               ← called after data load; calls all builders in order
buildCompetitions()      ← ① competition table with PB badges
buildTop5()              ← ② event progress charts
buildRecords()           ← ③ personal records table + Israeli age-group gaps
buildSCLC()              ← ④ SC vs LC comparison
buildInsights()          ← ⑤ insight cards
buildBestTimes()         ← ⑥ best times chart (pool + stroke filter)
buildSeasonRecap()       ← ⑦ collapsible season cards
buildSeasonComp()        ← ⑦b season comparison table
buildStrokeBreakdown()   ← ⑧ improvement by stroke (2-season compare)
buildPointsTrend()       ← ⑨ points trend chart
buildRudolphTrend()      ← ⑩ Rudolph age score chart (long course only)
renderSwimmerBanner()    ← swimmer identity card at top of Analyze tab
```

**Analyze tab sub-navigation (added with ⑩):** the 11 sections above are grouped into 3 pill sub-tabs — Overview (①⑤), Progress & Trends (②⑥⑨⑩), Records & Comparisons (③④⑦⑦b⑧) — via `.an-grp[data-grp]` wrapper divs and `setAnalyzeGroup(g)` (toggles `display` + fires a resize event so Chart.js re-sizes canvases that were built while hidden). All 11 builders still run unconditionally in `buildAll()` regardless of which group is currently visible — switching groups is pure visibility, not lazy building.

---

## PB Badge Logic

```js
computePBTimeline()
// Sorts all results chronologically, tracks best per event×pool key,
// returns a Set of strings: `event|pool|date|seconds`
// buildCompetitions() checks each row's key against this Set → gold border + "PB" chip
```

**Known limitation:** the eventList passed to the competition table has `{event, pool, time, points}` but not `seconds`, so PB key matching is unreliable until seconds is added to that pipeline.

---

## Chart Patterns

All charts use **lazy initialization** — built only when the container is visible:

```js
// Settings physical charts
window.showSwChart(divId, swimIdx, type)
// Called from button onclick via data-* attributes (avoids quote escaping):
// data-div="swcp-heights-0" data-idx="0" data-tp="h"
// onclick="showSwChart(this.dataset.div,+this.dataset.idx,this.dataset.tp)"
```

Chart instances are cached in `_swCharts[swimIdx+'-'+type]` — clicking "Show" again hides the div, clicking again reuses the instance.

---

## CSS Architecture

CSS variables defined in `:root`:
```css
--blue: #185FA5       --blue-dark: #0f3d72    --blue-light: #e8f1fb
--green: #1a9e6f      --green-light: #e8f7f1
--orange: #d97706     --red: #dc2626
--gray-50 … --gray-900 (standard scale)
--radius: 12px        --shadow-sm / --shadow / --shadow-lg
```

Key class patterns:
- `.metric` — KPI chip with `.hi` (blue) and `.green` modifiers
- `.ev-btn` + `.active` — pill-style filter toggle buttons
- `.insight` + `.green/.blue/.orange/.red` — left-border gradient card
- `.tbl-card` — rounded table container
- `.section-title` — blue accent bar + uppercase label

---

## Stroke Color Mapping

```js
STROKE_COLORS = {
  Free:   '#185FA5',  // blue
  Back:   '#1D9E75',  // green
  Breast: '#EF9F27',  // orange
  Fly:    '#e05252',  // red
  IM:     '#9b7bc4'   // purple
}
```

`getStroke(eventName)` uses Hebrew + English regex to classify. Tested against loglig.com event name strings.

---

## Age / Age-Group Logic

**Two genuinely different conventions exist — do not conflate them:**

```js
getAgeAt(birthdate, atDate)       // precise fractional age on a literal date
_recAge(bd, ts) / recordAge(bd, ts)  // "age group": calendar YEAR of ts minus birth year
```

- **`getAgeAt`** — "how old is this swimmer right now / on this exact day." Correct for: swimmer banner's current age, the Competitions table's per-meet Age column, the adult (>20) cutoff that hides the Rudolph section.
- **`recordAge`/`_recAge`** — "which age-group table/record applies to this result." Correct for: Israeli age-group records ([[records]]/`buildRecords`), Rudolph age-graded scoring (`buildRudolphTrend`), and season-level age labels (Season Recap header — uses the season's *end* year: `parseInt(season.split('-')[1])`, not the literal meet date's year).

**Why this distinction matters (learned the hard way, twice, same day):** a swimmer already competes in — and LogLig itself categorizes results under — next year's age group before their exact birthday arrives. Using `getAgeAt` (precise age) for "which age-group table applies" picks the wrong, too-lenient younger bracket. Confirmed with real data: Gal's 2:58.12 in 200 IM scored >10 Rudolph points using his exact age (10) instead of ~6.9 using his age group (11, matching LogLig's own "בנים 11" category for that meet). If you're computing "the age that applies to swimmer X for event/season/meet Y," default to the `recordAge` convention unless you've specifically verified `getAgeAt` is what's wanted.

```js
ageGroupLabel(age)  // 'U12'|'Age 12–15'|'Cadet (16-17)'|'Junior (18-19)'|'Senior (20+)'
```

Used in: swimmer banner, competition table Age column, season recap header.

---

## Israeli Age-Group Records (`config/records`)

Published from the desktop Extract tab (③ Israeli Age Records) after uploading the official PDFs from **isr.org.il/records.asp** (juniors + masters, long + short course — 4 separate PDFs, any subset can be uploaded). Parsed entirely client-side (pdf.js text-item extraction, grouped by row/column position), diffed against the current `config/records` doc, then published via a manual "☁ Upload changes to Cloud" button (owner-only, enforced by `firestore.rules`).

`buildRecords()` shows, per pool (25m/50m), the swimmer's best time vs. their current age-group record, using `_recAge()`/`_recCat()`/`_recKey()` (dist+stroke → key) — same helpers reused by the Rudolph feature below.

---

## Rudolph Age-Graded Scoring (`config/rudolph`)

Dr. Klaus Rudolph's German age-graded points table — a swim time maps to **1-20 points**, calibrated separately per sex × age (8 through 18, plus "offen"/open) × event, **long course (50m) only** (25m times are systematically faster — more turns — and would score inflated against a 50m-only table; both apps hard-filter to 50m).

Published from the desktop Extract tab (④ Rudolph Age-Score Table) after uploading the official PDF (source: see the link in that panel — a new "Basis" year gets re-uploaded the same way). Parsed client-side via a row-clustering trick: the PDF renders each row's points-label (leftmost/rightmost column) on a baseline ~1px off from the row's time values, so rows are grouped by y-coordinate with a ~3-unit tolerance (real distinct rows are ~12-13 units apart, so this never merges two different point-rows).

```js
_rudBracket(age)                          // → "8".."18"|"offen"|null (age<8)
_rudScore(table, sex, age, event, seconds) // interpolates/extrapolates the 20-row curve
buildRudolphTrend()                       // ⑩ chart; mirrors buildPointsTrend()'s Chart.js pattern
```

Age used for scoring is the **age group** (`_recAge`/`recordAge` convention — calendar year of the swim minus birth year), not the swimmer's precise age-in-years on that day — see "Age / Age-Group Logic" above for why. `window.__rudolphTable` caches the published table (set in `refreshRudolphStatus()`, mirroring `window.__records`); the whole "⑩ Age Score (Rudolph)" section hides itself for swimmers whose *current* real age (`getAgeAt`, no date arg) is over 20.

Mobile equivalent: `mobile/src/analysis.js`'s `rudolphAgeBracket()`/`rudolphScore()`/`rudolphTrend()`, rendered by `RudolphTrend` in `mobile/src/App.jsx` (Progress tab, below Points Trend).

---

## localStorage Migration

On load, `loadSettings()` runs forward-migration:
```js
if (typeof sw.height === 'string') delete sw.height;   // v1 → v2
if (!Array.isArray(sw.heights)) sw.heights = [];
if (!Array.isArray(sw.weights)) sw.weights = [];
if (!Array.isArray(sw.seasonIds)) sw.seasonIds = [];
if (sw.birthdate === undefined) sw.birthdate = '';
```

---

## Global Constants — Declaration Order

The following globals MUST be defined before `buildAll()` can run. They are declared **twice** intentionally:

1. **Early declaration** — right after `var D=null;` at the top of Script 1, so they are always assigned during top-level script execution
2. **Original declaration** — at their natural position in the source (lines 587–1207), as a self-documenting anchor
3. **Safety net** — `buildAll()` re-initializes all five if still falsy, guarding against any call-before-init edge case

```js
var COLORS = ['#185FA5','#EF9F27', ...];          // 9 chart colors, cycle with ci%COLORS.length
var STROKE_COLORS = {Free,Back,Breast,Fly,IM};     // keyed by getStroke() return value
var top5Active = new Set();                         // which events are toggled on in ② chart
var top5Charts = {};                                // Chart.js instances keyed by canvasId
var ENG_MONTHS = ['Jan','Feb',...,'Dec'];           // used by fmtDateShort()
```

**Why this matters:** if `buildAll()` is ever called before Script 1 has finished top-level execution (e.g. a FileReader `onload` firing early), these vars would be `undefined` and every chart function would throw.

---

## Common Gotchas

| Issue | Root cause | Fix |
|-------|-----------|-----|
| Charts not showing in Settings | SWIMMERS is IIFE-scoped; `buildSwimmerPhysCharts` can't access it from global scope | Use `window.getAllSwimmers()` |
| JS syntax errors after edits | Extra `}` left from replaced functions | Run `node --check extracted.js` after every change |
| Onclick string escaping | Complex nested quotes break | Use `data-*` HTML attributes + `this.dataset.*` in onclick |
| File corruption after Python edits | `bytes.replace(b'', new_bytes, 1)` prepends to start of file | Always locate the `<!DOCTYPE` offset and slice from there |
| PB badges never show | `eventList` rows lack `.seconds` field; key never matches | Add `seconds` to the eventList pipeline |
| `COLORS`/`STROKE_COLORS` undefined in buildAll | These `var` assignments sit past line 587; if called early they're `undefined` | Declared early + safety net in `buildAll()` — do not remove either |
| Charts blank after tab switch | Chart.js doesn't re-render inside hidden containers | `switchTab('analyze')` and `buildAll()` both fire `window.dispatchEvent(new Event('resize'))` |
| Charts blank after switching Analyze sub-tab (Overview/Progress/Records) | Same root cause, one level deeper — charts in a non-default `.an-grp` are built while `display:none` | `setAnalyzeGroup()` also fires `window.dispatchEvent(new Event('resize'))` after toggling visibility — don't remove it when adding new sections |
| New `.an-grp` section stays visible in every sub-tab | Forgot `style="display:none"` on a non-default group's wrapper div (only the *first* mention of a `data-grp` needs to start visible if it's the default "overview" group) | Every `.an-grp[data-grp]` div except the ones meant to show by default must have `style="display:none"` in the HTML itself — `setAnalyzeGroup()` only toggles on click, it doesn't set the initial state |
| LogLig extraction suddenly returns empty `results` | LogLig changed the season page's table markup (happened 2026-07); `bests` keeps working since it's a different table | Get the raw page HTML (`copy(document.documentElement.outerHTML)` in console, not the app's JSON output) and compare against the current parsing logic in `mobile/public/bm2.js` + `extractFromHtml()` — both must be fixed, they're independent copies |

---

## How to Extend

**Add a new analysis section:**
1. Add HTML container in `#tc-analyze`, wrapped in `<div class="an-grp" data-grp="overview|progress|records">` matching whichever sub-tab it belongs to (add `style="display:none"` unless it's going in the default-visible "overview" group)
2. Write `buildXxx()` function
3. Call it from `buildAll()`
4. Add a section-title div with the next ⑪ emoji number

**Add a new swimmer field:**
1. Add to `DEFAULT_SWIMMERS` schema
2. Add migration in `loadSettings()`
3. Add input in `renderSettingsUI()` inside the IIFE
4. Call `saveSettings()` on change

**Add a new known season:**
1. Update `KNOWN` map in `renderSettingsUI()`:  
   `var KNOWN = {1715:'2025-2026', 1605:'2024-2025', ...}`
