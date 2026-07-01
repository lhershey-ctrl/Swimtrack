import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const DIR = "../Data/";
const FILES = [
  { f: "שיאי ישראל בריכה ארוכה 25_06_2026 (1).pdf", pool: "50", type: "juniors" },
  { f: "שיאי ישראל בריכה קצרה 28_12_2025.pdf", pool: "25", type: "juniors" },
  { f: "שיאים מאסטרס ארוכה - 4_25.pdf", pool: "50", type: "masters" },
  { f: "שיאים מאסטרס קצרה - 1_26.pdf", pool: "25", type: "masters" },
];

const TIME_RE = /^\d{1,2}:\d{2}\.\d{1,2}$/;
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const AGE_RE = /^\d{2}-\d{2}$/;           // masters 25-29
const relayRe = /שליחים|מיקס|4[xX]|[xX]4/;

function strokeKey(t) {
  if (/פרפר|fly/i.test(t)) return "Fly";
  if (/גב|back/i.test(t)) return "Back";
  if (/חזה|breast/i.test(t)) return "Breast";
  if (/מעורב|משולב|medley/i.test(t)) return "IM";
  if (/חופשי|free/i.test(t)) return "Free";
  return null;
}
function parseTime(s) {
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,2})\.(\d{1,2})$/);
  if (!m) return null;
  return (m[1] ? +m[1] * 60 : 0) + +m[2] + +("0." + m[3]);
}

async function loadRows(path) {
  const data = new Uint8Array(readFileSync(DIR + path));
  const pdf = await getDocument({ data }).promise;
  const rows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const byY = {};
    tc.items.forEach((it) => {
      if (!it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      (byY[y] = byY[y] || []).push({ x: it.transform[4], s: it.str.trim() });
    });
    Object.keys(byY).map(Number).sort((a, b) => b - a).forEach((y) => {
      rows.push({ gy: p * 100000 - y, cells: byY[y].sort((a, b) => a.x - b.x) });
    });
  }
  return mergeSplitRows(rows);
}

// Most records render on one baseline, but a few split across two ~3.5px-apart
// baselines: an upper row (club/name/date) and a lower row (venue/time/category).
// A time-only row (no name) borrows its name from an adjacent name-only fragment
// (which may sit either above or below it) so the record comes out complete.
function mergeSplitRows(rows) {
  // Name column sits ~x244; keep the upper bound below the date column (~x343)
  // so a lone date on a split time-row isn't mistaken for a name.
  const hasName = (cells) => cells.some((c) => c.x >= 205 && c.x <= 340);
  const hasTime = (cells) => cells.some((c) => TIME_RE.test(c.s));
  const isNameFrag = (cells) => hasName(cells) && !hasTime(cells);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    let r = rows[i];
    if (hasTime(r.cells) && !hasName(r.cells)) {
      const prev = out[out.length - 1], nxt = rows[i + 1];
      if (prev && isNameFrag(prev.cells) && Math.abs(prev.gy - r.gy) < 6) {
        r = { gy: r.gy, cells: [...prev.cells, ...r.cells].sort((a, b) => a.x - b.x) };
        out.pop();
      } else if (nxt && isNameFrag(nxt.cells) && Math.abs(nxt.gy - r.gy) < 6) {
        r = { gy: r.gy, cells: [...r.cells, ...nxt.cells].sort((a, b) => a.x - b.x) };
        i++; // consume nxt
      }
    }
    out.push(r);
  }
  return out;
}

function bandJoin(cells, lo, hi) {
  const t = cells
    .filter((c) => c.x >= lo && c.x < hi)
    // a name never contains a date/time/number — drop those (some files place
    // the date column inside the name band)
    .filter((c) => !DATE_RE.test(c.s) && !TIME_RE.test(c.s) && !/^\d+$/.test(c.s))
    .sort((a, b) => b.x - a.x).map((c) => c.s);
  // collapse spaces, and tidy a hyphen/geresh split across tokens
  // ("הר - שי" → "הר-שי", "סולובייצ ' יק" → "סולובייצ'יק")
  return t.join(" ").replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").replace(/\s*['’‘׳]\s*/g, "'").trim();
}
function findTime(cells) { const c = cells.find((c) => TIME_RE.test(c.s)); return c ? c.s : null; }
function findDate(cells) { const c = cells.find((c) => DATE_RE.test(c.s)); return c ? c.s : null; }

// Event header row? returns {dist, stroke} or null.
function eventHeader(cells) {
  if (findTime(cells)) return null;
  const joined = cells.map((c) => c.s).join(" ");
  const sk = strokeKey(joined);
  const dnum = cells.find((c) => /^(50|100|200|400|800|1500)$/.test(c.s));
  if (sk && dnum) return { dist: dnum.s, stroke: sk, relay: relayRe.test(joined) };
  return null;
}
function sexRow(cells) {
  const joined = cells.map((c) => c.s).join("");
  if (findTime(cells)) return null;
  if (/^גברים$/.test(joined)) return "M";
  if (/^נשים$/.test(joined)) return "F";
  return null;
}

// Physically-impossible floors per distance (seconds) — generous vs any real
// record, but catch cross-event contamination (e.g. a 200-range time filed under
// a 400 event). World-record ballpark: 50 free ~20s, 400 free ~3:32, 1500 ~14:30.
const MIN_SEC = { "50": 18, "100": 42, "200": 90, "400": 190, "800": 400, "1500": 780 };

function addRec(out, pool, sex, cat, evKey, sec, time, name, date) {
  if (!sex || !cat || !evKey || !sec) return;
  const floor = MIN_SEC[evKey.split("|")[0]];
  if (floor && sec < floor) return; // implausible → drop

  const P = (out[pool] = out[pool] || {});
  const S = (P[sex] = P[sex] || {});
  const C = (S[cat] = S[cat] || {});
  // keep the fastest if duplicate
  if (!C[evKey] || sec < C[evKey].sec) C[evKey] = { sec: +sec.toFixed(2), time, name, date };
}

async function parseMasters(file, out) {
  const rows = await loadRows(file.f);
  let sex = null, ev = null;
  for (const r of rows) {
    const s = sexRow(r.cells); if (s) { sex = s; continue; }
    const eh = eventHeader(r.cells); if (eh) { ev = eh.relay ? null : eh; continue; }
    const time = findTime(r.cells); if (!time || !ev || !sex) continue;
    const ageTok = r.cells.find((c) => AGE_RE.test(c.s)); if (!ageTok) continue;
    const cat = ageTok.s; // e.g. 45-49
    const name = bandJoin(r.cells, 250, 392);
    addRec(out, file.pool, sex, cat, ev.dist + "|" + ev.stroke, parseTime(time), time, name, findDate(r.cells));
  }
}

async function parseJuniors(file, out) {
  const rows = await loadRows(file.f);
  // Individual events come first (Men block then Women block per event, each
  // block = open + gil 18..10), then relays. Header cells (distance+stroke) live
  // in the right-most columns (x≳478) and are sometimes split across two rows,
  // so collect stroke- and distance-tokens separately and pair each stroke with
  // its nearest distance. Then pair block b → events[floor(b/2)], sex M then F.
  let relayStarted = false;
  const strokeFrags = [], distFrags = [], blocks = [];
  let cur = null;
  for (const r of rows) {
    const joined = r.cells.map((c) => c.s).join(" ");
    if (relayRe.test(joined)) { relayStarted = true; }
    if (relayStarted) continue; // individual events only
    // header fragments (right-most columns)
    r.cells.forEach((c) => {
      if (c.x >= 478 && c.x <= 505) { const sk = strokeKey(c.s); if (sk) strokeFrags.push({ gy: r.gy, stroke: sk }); }
      if (c.x >= 505 && /^(50|100|200|400|800|1500)$/.test(c.s)) distFrags.push({ gy: r.gy, dist: c.s });
    });
    // data rows
    const time = findTime(r.cells); if (!time) continue;
    // Relay rows list 4 swimmers → ≥2 commas; individual rows have at most 1
    // (a foreign "City, Country" venue). Skip relays so block counts stay exact.
    if ((joined.match(/,/g) || []).length >= 2) continue;
    let cat = null;
    if (r.cells.some((c) => c.s === "ישראל" && c.x >= 428 && c.x <= 448)) cat = "open";
    else if (r.cells.some((c) => c.s === "גיל")) {
      const n = r.cells.find((c) => /^\d{1,2}$/.test(c.s) && +c.s >= 10 && +c.s <= 18 && c.x > 420);
      if (n) cat = n.s;
    }
    if (!cat) continue;
    if (cat === "open" || !cur) { cur = { rows: [] }; blocks.push(cur); }
    cur.rows.push({ cat, time, name: bandJoin(r.cells, 205, 300), date: findDate(r.cells) });
  }
  // Reconstruct events: pair each stroke fragment with its nearest distance → ordered by gy.
  const events = strokeFrags.map((s) => {
    const d = distFrags.reduce((b, a) => (!b || Math.abs(a.gy - s.gy) < Math.abs(b.gy - s.gy) ? a : b), null);
    return { gy: s.gy, dist: d ? d.dist : null, stroke: s.stroke };
  }).filter((e) => e.dist).sort((a, b) => a.gy - b.gy);
  console.error("  " + file.f + " → events=" + events.length + " blocks=" + blocks.length + " (expect blocks = 2×events)");
  console.error("    order: " + events.map((e) => e.dist + e.stroke[0]).join(" "));
  // Blocks appear in page order as M,F per event → block b maps to events[b/2], sex by parity.
  blocks.forEach((blk, b) => {
    const ev = events[Math.floor(b / 2)]; const sex = b % 2 === 0 ? "M" : "F";
    if (!ev) return;
    blk.rows.forEach((row) => addRec(out, file.pool, sex, row.cat, ev.dist + "|" + ev.stroke, parseTime(row.time), row.time, row.name, row.date));
  });
}

const out = {};
for (const f of FILES) {
  if (f.type === "masters") await parseMasters(f, out);
  else await parseJuniors(f, out);
}

// ---- summary ----
const AGE_ORDER = ["open","10","11","12","13","14","15","16","17","18","25-29","30-34","35-39","40-44","45-49","50-54","55-59","60-64","65-69","70-74","75-79","80-84","85-89","90-94"];
for (const pool of ["25", "50"]) {
  for (const sex of ["M", "F"]) {
    const S = out[pool] && out[pool][sex]; if (!S) continue;
    let n = 0; Object.values(S).forEach((c) => (n += Object.keys(c).length));
    const cats = AGE_ORDER.filter((a) => S[a]).map((a) => a + "(" + Object.keys(S[a]).length + ")");
    console.log(`pool ${pool} ${sex}: ${n} records · cats: ${cats.join(" ")}`);
  }
}
function show(pool, sex, cat, ev) {
  const r = out[pool] && out[pool][sex] && out[pool][sex][cat] && out[pool][sex][cat][ev];
  console.log(`  [${pool} ${sex} ${cat} ${ev}] = ${r ? r.time + " (" + r.name + ")" : "—"}`);
}
console.log("\nSPOT CHECKS:");
show("50", "F", "13", "100|Back");
show("50", "F", "open", "50|Free");
show("50", "M", "open", "50|Free");
show("25", "M", "45-49", "100|Breast");
show("50", "M", "45-49", "200|Breast");
show("25", "F", "13", "100|Back");
show("50", "M", "open", "400|Free");

writeFileSync("records_out.json", JSON.stringify(out, null, 0));
console.log("\nwrote records_out.json (" + (JSON.stringify(out).length / 1024).toFixed(1) + " KB)");
process.exit(0);
