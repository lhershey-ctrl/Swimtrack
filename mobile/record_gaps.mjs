// Post-extraction gap report: for each family swimmer, compare their all-time PBs
// against the relevant Israeli age record and print the gap (seconds + %).
// Run after parse_records.mjs so you immediately see what the new records MEAN.
//   node record_gaps.mjs
import { readFileSync, readdirSync } from "node:fs";

const DATA = "../Data/";
const records = JSON.parse(readFileSync("./records_out.json", "utf8"));

// ── Swimmer meta (sex + birthdate). The APP is the source of truth: the mobile /
//    desktop gap feature reads these from each swimmer's cloud profile. This dev
//    report falls back to a local swimmers_meta.json (exported by the app) if
//    present, else the defaults below. Ages are derived from birthdate at run time.
let SWIMMERS = [
  { label: "Noga",  nameHe: "נוגה",  sex: "F", birthdate: "2013-10-22" },
  { label: "Gal",   nameHe: "גל",    sex: "M", birthdate: "2015-10-24" },
  { label: "Liron", nameHe: "לירון", sex: "M", birthdate: "1980-10-22" },
];
try { SWIMMERS = JSON.parse(readFileSync("../Data/swimmers_meta.json", "utf8")); } catch {}

const strokeKey = (t) =>
  /פרפר/.test(t) ? "Fly" : /גב/.test(t) ? "Back" : /חזה/.test(t) ? "Breast" :
  /מעורב|משולב/.test(t) ? "IM" : /חופשי/.test(t) ? "Free" : null;

// swimmer event string ("100 מעורב אישי") → "100|IM", or null (relays, 3000m…)
function evKey(ev) {
  if (/שליחים|מיקס|4[xX]|[xX]4/.test(ev)) return null;
  const dist = (ev.match(/\b(50|100|200|400|800|1500)\b/) || [])[1];
  const sk = strokeKey(ev);
  return dist && sk ? dist + "|" + sk : null;
}

function ageFrom(birthdate, today) {
  const b = new Date(birthdate), t = new Date(today);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}

// current age → record category key
function catFor(age) {
  if (age >= 10 && age <= 18) return String(age);
  if (age >= 19 && age <= 24) return "open";                     // national/open
  if (age >= 25) { const base = 25 + Math.floor((age - 25) / 5) * 5; return base + "-" + (base + 4); }
  return null;                                                    // under 10: no age record
}

// merge every season's bests for one swimmer → fastest seconds per pool|event
function loadPBs(nameHe) {
  const pb = {};
  for (const f of readdirSync(DATA)) {
    if (!f.endsWith(".json") || !f.includes(nameHe) || f.includes("settings")) continue;
    const seasons = JSON.parse(readFileSync(DATA + f, "utf8"));
    for (const s of Object.values(seasons)) {
      for (const b of s.bests || []) {
        const k = evKey(b.event); if (!k) continue;
        const key = b.pool + "|" + k;
        if (!pb[key] || b.seconds < pb[key].seconds)
          pb[key] = { seconds: b.seconds, time: b.time, date: b.date };
      }
    }
  }
  return pb;
}

const fmt = (s) => {
  const m = Math.floor(s / 60), r = (s - m * 60).toFixed(2).padStart(5, "0");
  return (m ? m + ":" : "0:") + r;
};
const HE = { Free: "חופשי", Back: "גב", Breast: "חזה", Fly: "פרפר", IM: "מעורב" };
const today = new Date().toISOString().slice(0, 10);

for (const sw of SWIMMERS) {
  const age = sw.birthdate.includes("?") ? null : ageFrom(sw.birthdate, today);
  const cat = age == null ? null : catFor(age);
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  ${sw.label}  (sex ${sw.sex}, age ${age ?? "?"} → record group "${cat ?? "?"}")`);
  console.log("════════════════════════════════════════════════════════════");
  if (sw.sex === "?" || !cat) { console.log("  ⚠ set sex + birthdate for this swimmer to compute gaps"); continue; }

  const pbs = loadPBs(sw.nameHe);
  const rows = Object.keys(pbs).sort();
  if (!rows.length) { console.log("  (no PBs found)"); continue; }

  for (const key of rows) {
    const [pool, dist, stroke] = key.split("|");
    const pb = pbs[key];
    const rec = (((records[pool] || {})[sw.sex] || {})[cat] || {})[dist + "|" + stroke];
    const label = `${pool}m ${dist} ${HE[stroke]}`.padEnd(15);
    if (!rec) { console.log(`  ${label} PB ${fmt(pb.seconds)}   — no record for this group`); continue; }
    const gap = +(pb.seconds - rec.sec).toFixed(2);
    const pct = +((gap / rec.sec) * 100).toFixed(1);
    const verdict = gap <= 0 ? "🏅 RECORD (0s / 0%)" : `gap ${gap}s / ${pct}%`;
    console.log(`  ${label} PB ${fmt(pb.seconds)}  vs rec ${fmt(rec.sec)} (${rec.name})  →  ${verdict}`);
  }
}
console.log("");
