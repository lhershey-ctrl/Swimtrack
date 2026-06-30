# SwimTrack — Architecture & Developer Reference

## Overview

`swim_tracker.html` is a **zero-dependency, single-file** swimming analysis tool. It requires no server, no build step, and no installation. Open in any browser. All state is stored in browser `localStorage`.

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

### Auto Extractor (console script)

`BM` variable holds the full extractor script as a JS string. When the user clicks "Copy Extractor Code":

1. `copyBM1()` prepends `var __manualSids=[...];` (active swimmer's season IDs) then copies to clipboard
2. User pastes into the browser console on the LogLig swimmer page
3. Script:
   - Reads swimmer name from `document.title`
   - Iterates all season IDs (from DOM or `__manualSids`)
   - Loads each season page in a hidden `<iframe>`
   - Parses two table structures: "event detail" view and "bests" view
   - Uses Hebrew regex to identify column headers (date/תאריך, competition/שם תחרות, pool/אורך, time/תוצאה, points/ניקוד)
   - Downloads result as `swimming_{name}.json`

### Manual Bookmarklet

`bmLink2` href = `javascript:` + encoded single-season extractor. Drag to bookmarks bar. Click on any LogLig season page to download that season's JSON.

---

## Analysis Functions

```
buildAll()               ← called after data load; calls all builders
buildCompetitions()      ← ① competition table with PB badges
buildTop5()              ← ② event progress charts
buildRecords()           ← ③ personal records table
buildSCLC()              ← ④ SC vs LC comparison
buildInsights()          ← ⑤ insight cards
buildBestTimes()         ← ⑥ best times chart (pool + stroke filter)
buildSeasonRecap()       ← ⑦ collapsible season cards
buildSeasonComp()        ← ⑦b season comparison table
buildStrokeBreakdown()   ← ⑧ improvement by stroke (2-season compare)
buildPointsTrend()       ← ⑨ points trend chart
renderSwimmerBanner()    ← swimmer identity card at top of Analyze tab
```

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

```js
getAgeAt(birthdate, atDate)  // fractional age at a given date
ageGroupLabel(age)           // 'U12'|'Age 12–15'|'Cadet (16-17)'|'Junior (18-19)'|'Senior (20+)'
```

Used in: swimmer banner, competition table Age column, season recap header.

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

---

## How to Extend

**Add a new analysis section:**
1. Add HTML container in `#tc-analyze`
2. Write `buildXxx()` function
3. Call it from `buildAll()`
4. Add a section-title div with the next ⑩ emoji number

**Add a new swimmer field:**
1. Add to `DEFAULT_SWIMMERS` schema
2. Add migration in `loadSettings()`
3. Add input in `renderSettingsUI()` inside the IIFE
4. Call `saveSettings()` on change

**Add a new known season:**
1. Update `KNOWN` map in `renderSettingsUI()`:  
   `var KNOWN = {1715:'2025-2026', 1605:'2024-2025', ...}`
