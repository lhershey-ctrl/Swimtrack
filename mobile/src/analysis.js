// ── SwimTrack analysis helpers ──────────────────────────────────────
// Ported from the desktop app (swim_tracker.html). All functions
// are pure and take `D` = the swimmer's season map:
//   { "2024-2025": { seasonId, bests:[], results:[] }, ... }
// (Same shape as the desktop global `D`.)

export const STROKE_COLORS = {
  Free: "#3b82f6",
  Back: "#10b981",
  Breast: "#f59e0b",
  Fly: "#ef4444",
  IM: "#a78bfa",
};

export const COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#a78bfa",
  "#eab308", "#06b6d4", "#fb923c", "#4ade80",
];

export const ENG_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ── Formatting ──────────────────────────────────────────────────────
export function fmtT(s) {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60);
  let sc = (s % 60).toFixed(2);
  if (parseFloat(sc) < 10) sc = "0" + sc;
  return m + ":" + sc;
}

export function fmtDateShort(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.getDate() + " " + ENG_MONTHS[d.getMonth()] + " " + String(d.getFullYear()).slice(2);
}

// ── Primitives ──────────────────────────────────────────────────────
export function poolNorm(p) {
  return (p || "").toString().replace(/[^0-9]/g, "");
}
export function extractDist(ev) {
  const m = (ev || "").match(/^(\d+)/);
  return m ? parseInt(m[1]) : 0;
}
export function expectedSCAdv(dist) {
  return (dist / 50) * 1.5; // 1.5s per 50m
}
export function isRelay(ev) {
  return /שליחים|4X|4x|\brelay\b/i.test(ev || "");
}
export function parseDate(d) {
  if (!d) return null;
  const p = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (p) return new Date(+p[3], +p[2] - 1, +p[1]).getTime();
  return null;
}
// Map a timestamp to swimming season (Aug–Jul).
export function dateToSeason(ts) {
  if (!ts && ts !== 0) return null;
  const d = new Date(ts);
  const m = d.getMonth();
  const y = d.getFullYear();
  const sy = m >= 7 ? y : y - 1;
  return sy + "-" + (sy + 1);
}

export function getStroke(ev) {
  if (/פרפר|butterfly|fly(?!.*medley)/i.test(ev)) return "Fly";
  if (/גב|backstroke|back(?!.*stroke.*free)/i.test(ev)) return "Back";
  if (/חזה|breaststroke|breast/i.test(ev)) return "Breast";
  if (/medley|im\b|מעורב|משולב|שחייה/i.test(ev)) return "IM";
  return "Free";
}
export function getStrokeColor(ev) {
  return STROKE_COLORS[getStroke(ev)] || STROKE_COLORS.Free;
}

// ── Age helpers ─────────────────────────────────────────────────────
export function getAgeAt(birthdate, atDate) {
  const bd = parseDate(birthdate);
  const ad = atDate && atDate !== "" ? parseDate(atDate) : Date.now();
  if (!bd) return null;
  const diff = (ad - bd) / (365.25 * 24 * 3600 * 1000);
  return diff > 0 ? diff : null;
}
export function ageGroupLabel(age) {
  if (!age) return "";
  const a = Math.floor(age);
  if (a <= 11) return "U12";
  if (a <= 15) return "Age " + a;
  if (a <= 17) return "Cadet (16-17)";
  if (a <= 19) return "Junior (18-19)";
  return "Senior (20+)";
}

// ── Israeli record gap ──────────────────────────────────────────────
// Normalise a swimmer sex value ("female"/"male"/"F"/"M") → "F"|"M"|null.
export function sexNorm(sex) {
  const x = (sex || "").toString().trim().toLowerCase();
  if (x[0] === "f") return "F";
  if (x[0] === "m") return "M";
  return null;
}
// Current age → the record category key used in config/records.
export function recordCategory(age) {
  if (age == null) return null;
  const a = Math.floor(age);
  if (a >= 10 && a <= 18) return String(a);      // juniors single-age groups
  if (a >= 19 && a <= 24) return "open";          // national / open
  if (a >= 25) { const base = 25 + Math.floor((a - 25) / 5) * 5; return base + "-" + (base + 4); } // masters 5-yr band
  return null;                                    // under 10: no age record
}
// Swimmer event string ("100 גב") → records key ("100|Back"), or null.
export function recordKey(event) {
  const d = extractDist(event);
  return d ? d + "|" + getStroke(event) : null;
}
// Loose name match (ignore spaces / hyphens / geresh) so a swimmer's "name in
// records" matches a record holder even with punctuation/spacing differences.
export function nameMatch(a, b) {
  const norm = (x) => (x || "").toString().replace(/['’‘׳\s-]/g, "");
  return !!a && !!b && norm(a) === norm(b);
}
// Ordered list of category keys present anywhere in a records doc.
const CAT_ORDER = ["open", "10", "11", "12", "13", "14", "15", "16", "17", "18",
  "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85-89", "90-94"];
export function recordCategories(records) {
  const set = new Set();
  for (const p in records) for (const s in records[p]) for (const c in records[p][s]) set.add(c);
  return CAT_ORDER.filter((c) => set.has(c));
}
export function catLabel(cat) {
  return cat === "open" ? "Open / National" : /^\d{2}-\d{2}$/.test(cat) ? "Masters " + cat : "Age " + cat;
}
// Every record held by `name` across all pools / sexes / age groups (loose name match).
export function recordsHeldBy(records, name) {
  if (!records || !name) return [];
  const out = [];
  for (const p in records) for (const sx in records[p]) for (const cat in records[p][sx]) {
    const m = records[p][sx][cat];
    for (const k in m) if (nameMatch(m[k].name, name))
      out.push({ pool: p, sex: sx, cat, dist: +k.split("|")[0], stroke: k.split("|")[1], ...m[k] });
  }
  const ci = (c) => CAT_ORDER.indexOf(c);
  return out.sort((a, b) => a.pool.localeCompare(b.pool) || ci(a.cat) - ci(b.cat) || STROKES.indexOf(a.stroke) - STROKES.indexOf(b.stroke) || a.dist - b.dist);
}
// Gap from a PB to the relevant age record. Returns {rec, cat, gap, pct, holds}
// or null when no matching record exists (missing data / under-10 / relay).
export function recordGap(records, sex, age, pool, event, seconds) {
  const rec = lookupRecord(records, sex, age, pool, event);
  if (!rec || !seconds) return null;
  const gap = +(seconds - rec.sec).toFixed(2);
  return { rec, cat: recordCategory(age), gap, pct: +((gap / rec.sec) * 100).toFixed(1), holds: gap <= 0 };
}
// For each event, the swimmer's best time in EACH age group they swam it (year-end
// age at the meet). Returns { event: [ {cat, seconds, time, date} ] } sorted by age.
export function bestsByAgeGroup(D, pool, birthdate) {
  const tmp = {};
  allResults(D).forEach((r) => {
    if (poolNorm(r.pool) !== pool || !r.seconds || r.seconds <= 0) return;
    const cat = recordCategory(recordAge(birthdate, parseDate(r.date)));
    if (!cat) return;
    const ev = tmp[r.event] = tmp[r.event] || {};
    if (!ev[cat] || r.seconds < ev[cat].seconds) ev[cat] = { cat, seconds: r.seconds, time: r.time, date: r.date };
  });
  const out = {};
  Object.keys(tmp).forEach((ev) => {
    out[ev] = Object.values(tmp[ev]).sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat));
  });
  return out;
}
// Fetch just the record entry for a swimmer's current age group + event (no gap math).
export function lookupRecord(records, sex, age, pool, event) {
  const S = sexNorm(sex), cat = recordCategory(age), key = recordKey(event);
  if (!records || !S || !cat || !key) return null;
  const rec = (((records[pool] || {})[S] || {})[cat] || {})[key];
  return rec && rec.sec ? rec : null;
}
// Age band [min,max] inclusive for a category, or null when unrestricted (open/national).
export function categoryAgeRange(cat) {
  if (!cat || cat === "open") return null;
  if (/^\d{1,2}$/.test(cat)) return [+cat, +cat];
  const m = cat.match(/^(\d{2,3})-(\d{2,3})$/);
  return m ? [+m[1], +m[2]] : null;
}
// Israeli age groups use the age a swimmer REACHES during the calendar year (age on
// Dec 31) — not their age on the meet day. So a swim in the year they turn 45 counts
// as 45 even if it was before their birthday.
export function birthYear(birthdate) {
  const bd = parseDate(birthdate);
  return bd ? new Date(bd).getFullYear() : null;
}
export function recordAge(birthdate, atTs) {
  const by = birthYear(birthdate);
  if (by == null) return null;
  return new Date(atTs == null ? Date.now() : atTs).getFullYear() - by;
}
// Best time per event among results swum WHILE in `cat`'s age band (year-end age at
// each meet). A faster time set in a younger age group does NOT count toward this
// group's record. Returns { event: {seconds,time,date} }.
export function bestInAgeGroup(D, pool, birthdate, cat) {
  const range = categoryAgeRange(cat), out = {};
  allResults(D).forEach((r) => {
    if (poolNorm(r.pool) !== pool || !r.seconds || r.seconds <= 0) return;
    if (range) {
      const a = recordAge(birthdate, parseDate(r.date));
      if (a == null || a < range[0] || a > range[1]) return;
    }
    if (!out[r.event] || r.seconds < out[r.event].seconds) out[r.event] = { seconds: r.seconds, time: r.time, date: r.date };
  });
  return out;
}

// Per-event table for a season report: best time that season per event+pool,
// the Δ vs the previous season, and the gap to that season's age-group record.
export function seasonEventReport(D, swimmer, recordsDoc, season) {
  const records = recordsDoc && recordsDoc.records;
  const sex = sexNorm(swimmer && swimmer.sex);
  const by = birthYear(swimmer && swimmer.birthdate);
  const endYear = +(String(season).split("-")[1]) || null;
  const cat = by && endYear ? recordCategory(endYear - by) : null; // group that season (year-end age)
  const bestMap = (bests) => {
    const m = {};
    (bests || []).forEach((b) => {
      if (!b.event || !b.seconds || b.seconds <= 0 || isRelay(b.event)) return;
      const k = poolNorm(b.pool) + "|" + b.event;
      if (!m[k] || b.seconds < m[k].seconds) m[k] = { pool: poolNorm(b.pool), event: b.event, seconds: b.seconds, time: b.time };
    });
    return m;
  };
  const cur = bestMap((D[season] || {}).bests);
  const all = seasons(D), idx = all.indexOf(season), prevK = idx > 0 ? all[idx - 1] : null;
  const prev = prevK ? bestMap((D[prevK] || {}).bests) : {};
  const events = Object.keys(cur).map((k) => {
    const e = cur[k], p = prev[k] ? prev[k].seconds : null;
    const deltaPct = p ? +(((p - e.seconds) / p) * 100).toFixed(1) : null; // + = faster than last season
    let rec = null, gap = null, pct = null, holds = false;
    if (records && sex && cat) {
      rec = (((records[e.pool] || {})[sex] || {})[cat] || {})[recordKey(e.event)] || null;
      if (rec && rec.sec) {
        gap = +(e.seconds - rec.sec).toFixed(2);
        pct = +((gap / rec.sec) * 100).toFixed(1);
        holds = gap <= 0.005 || (swimmer.recordName && nameMatch(rec.name, swimmer.recordName));
      }
    }
    return { ...e, prevSec: p, deltaPct, rec, gap, pct, holds };
  }).sort((a, b) => a.pool.localeCompare(b.pool) || extractDist(a.event) - extractDist(b.event) || a.event.localeCompare(b.event));
  const drops = events.filter((e) => e.deltaPct != null && e.deltaPct > 0).sort((a, b) => b.deltaPct - a.deltaPct);
  return { season, cat, seasonAge: by && endYear ? endYear - by : null, events, bestDrop: drops[0] || null, held: events.filter((e) => e.holds) };
}

// ── Season / result aggregation ─────────────────────────────────────
export function seasons(D) {
  return Object.keys(D || {}).sort();
}

// All unique results across all seasons, deduped by event+pool+date+seconds.
export function allResults(D) {
  const seen = new Set();
  const res = [];
  Object.keys(D || {})
    .sort()
    .forEach((sk) => {
      const s = D[sk];
      const src = s && s.results && s.results.length ? s.results : [];
      src.forEach((r) => {
        if (!r.event || !r.seconds || r.seconds <= 0 || isRelay(r.event)) return;
        const key = r.event + "|" + (r.pool || "") + "|" + (r.date || "") + "|" + r.seconds;
        if (seen.has(key)) return;
        seen.add(key);
        const ts = parseDate(r.date);
        res.push({ ...r, pool: poolNorm(r.pool), season: dateToSeason(ts) || sk });
      });
    });
  return res;
}

export function allEventKeys(D, useResults) {
  const keys = new Set();
  Object.values(D || {}).forEach((s) => {
    const src = useResults && s.results && s.results.length ? s.results : s.bests;
    (src || []).forEach((b) => {
      if (b.event && b.pool && b.seconds > 0 && !isRelay(b.event))
        keys.add(b.event + "|" + poolNorm(b.pool));
    });
  });
  return Array.from(keys).sort((a, b) => {
    const da = parseInt(a), db = parseInt(b);
    return da !== db ? da - db : a.localeCompare(b);
  });
}

// Best (fastest) result for a given season/event/pool.
export function getBest(D, seasonKey, evName, pool) {
  const s = D[seasonKey];
  if (!s) return null;
  const hits = (s.bests || []).filter(
    (b) => b.event === evName && poolNorm(b.pool) === pool && b.seconds > 0
  );
  if (!hits.length) return null;
  return hits.reduce((a, b) => (a.seconds < b.seconds ? a : b));
}

// Lifetime personal-best per event×pool, with the season it was set.
export function personalRecords(D, pool) {
  const ar = allResults(D).filter((r) => poolNorm(r.pool) === pool);
  const best = {};
  ar.forEach((r) => {
    if (!best[r.event] || r.seconds < best[r.event].seconds) best[r.event] = r;
  });
  return Object.values(best).sort(
    (a, b) => extractDist(a.event) - extractDist(b.event) || a.event.localeCompare(b.event)
  );
}

// Set of "event|pool|date|seconds" keys that were a PB at the time swum.
export function computePBTimeline(D) {
  const ar = allResults(D)
    .slice()
    .sort((a, b) => (parseDate(a.date) || 0) - (parseDate(b.date) || 0));
  const bests = {};
  const pbKeys = new Set();
  ar.forEach((r) => {
    if (!r.event || !r.seconds || r.seconds <= 0) return;
    const k = r.event + "|" + (poolNorm(r.pool) || "");
    if (!bests[k] || r.seconds < bests[k]) {
      bests[k] = r.seconds;
      pbKeys.add(r.event + "|" + (poolNorm(r.pool) || "") + "|" + (r.date || "") + "|" + r.seconds);
    }
  });
  return pbKeys;
}

// Linear regression for trend lines.
export function linReg(pts) {
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  pts.forEach((p) => {
    sx += p.x; sy += p.y; sxy += p.x * p.y; sx2 += p.x * p.x;
  });
  const denom = n * sx2 - sx * sx;
  if (!denom) return null;
  const m = (n * sxy - sx * sy) / denom;
  return { m, b: (sy - m * sx) / n };
}

// Top events by number of results (for the progress section).
export function topEvents(D, n) {
  const counts = {};
  allResults(D).forEach((r) => {
    const k = r.event + "|" + poolNorm(r.pool);
    counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n || 6)
    .map(([k]) => k);
}

export function latest(D) { const ss = seasons(D); return ss[ss.length - 1]; }
export function prevSeason(D) { const ss = seasons(D); return ss.length >= 2 ? ss[ss.length - 2] : null; }

export const STROKES = ["Free", "Back", "Breast", "Fly", "IM"];

// Catalog of unique event×pool with stroke + distance, for filterable pickers.
export function eventCatalog(D) {
  const seen = {};
  allResults(D).forEach((r) => {
    const pool = poolNorm(r.pool);
    const key = r.event + "|" + pool;
    if (!seen[key]) seen[key] = { key, event: r.event, pool, stroke: getStroke(r.event), dist: extractDist(r.event), count: 0 };
    seen[key].count++;
  });
  return Object.values(seen).sort((a, b) => a.dist - b.dist || a.event.localeCompare(b.event));
}

// Time series (chronological) of results for one event|pool key.
export function eventSeries(D, key) {
  const [event, pool] = (key || "|").split("|");
  return allResults(D)
    .filter((r) => r.event === event && poolNorm(r.pool) === pool)
    .map((r) => ({ x: parseDate(r.date), t: r.seconds, label: fmtDateShort(parseDate(r.date)), comp: r.competition || "" }))
    .filter((p) => p.x)
    .sort((a, b) => a.x - b.x);
}

// ① Competitions: metrics + meet list (each meet's events incl. seconds for PB matching).
export function competitions(D) {
  const ss = seasons(D);
  let totalComps = 0, totalSwims = 0, maxEv = 0, maxName = "";
  const list = [];
  ss.forEach((s) => {
    const results = (D[s].results || []).filter((r) => r.competition && r.seconds > 0 && !isRelay(r.event));
    const byComp = {};
    results.forEach((r) => {
      const key = (r.competition || "?") + "__" + (r.date || "?");
      if (!byComp[key]) byComp[key] = { name: r.competition, date: r.date, season: s, eventList: [] };
      byComp[key].eventList.push({ event: r.event, pool: poolNorm(r.pool), time: r.time, points: r.points, seconds: r.seconds });
    });
    Object.values(byComp).forEach((c) => {
      totalComps++; totalSwims += c.eventList.length;
      if (c.eventList.length > maxEv) { maxEv = c.eventList.length; maxName = c.name; }
      list.push(c);
    });
  });
  if (!totalSwims) {
    ss.forEach((s) => {
      const byDate = {};
      (D[s].bests || []).filter((b) => b.date).forEach((b) => {
        (byDate[b.date] = byDate[b.date] || []).push({ event: b.event, pool: poolNorm(b.pool), time: b.time, points: b.points, seconds: b.seconds });
      });
      Object.entries(byDate).forEach(([date, evs]) => { totalComps++; totalSwims += evs.length; list.push({ name: "Competition", date, season: s, eventList: evs }); });
    });
  }
  // newest first, by actual parsed date (DD/MM/YYYY)
  list.sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0));
  return { metrics: { totalComps, totalSwims, avgEv: totalComps ? Math.round(totalSwims / totalComps) : 0, busiestName: maxName, busiestCount: maxEv }, list };
}

// ④ SC vs LC comparison rows.
export function scLc(D) {
  const ss = seasons(D);
  const ev = {};
  ss.forEach((s) => {
    const evs = {};
    (D[s].bests || []).forEach((b) => {
      if (!b.event || !b.seconds || isRelay(b.event)) return;
      const pool = poolNorm(b.pool);
      if (!evs[b.event]) evs[b.event] = {};
      if (!evs[b.event][pool] || b.seconds < evs[b.event][pool].seconds) evs[b.event][pool] = b;
    });
    Object.keys(evs).forEach((e) => {
      if (evs[e]["25"] && evs[e]["50"]) {
        if (!ev[e]) ev[e] = { sc: evs[e]["25"].seconds, lc: evs[e]["50"].seconds, scTime: evs[e]["25"].time, lcTime: evs[e]["50"].time };
        else {
          if (evs[e]["25"].seconds < ev[e].sc) { ev[e].sc = evs[e]["25"].seconds; ev[e].scTime = evs[e]["25"].time; }
          if (evs[e]["50"].seconds < ev[e].lc) { ev[e].lc = evs[e]["50"].seconds; ev[e].lcTime = evs[e]["50"].time; }
        }
      }
    });
  });
  return Object.entries(ev)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]) || a[0].localeCompare(b[0]))
    .map(([event, d]) => {
      const exp = expectedSCAdv(extractDist(event));
      const actual = d.lc - d.sc;
      const gap = actual - exp;
      const cls = Math.abs(gap) < 0.5 ? "good" : Math.abs(gap) < 2 ? "warn" : "bad";
      const note = Math.abs(gap) < 0.5 ? "As expected" : gap < -0.5 ? "LC is strong!" : "SC advantage > expected";
      return { event, scTime: d.scTime, lcTime: d.lcTime, actual, exp, gap, cls, note };
    });
}

// ⑤ Auto insights (season-level overview).
export function insights(D) {
  const ss = seasons(D);
  if (!ss.length) return [];
  const lat = ss[ss.length - 1], prv = ss.length >= 2 ? ss[ss.length - 2] : null;
  const latBests = (D[lat].bests || []).filter((b) => b.points > 0);
  const ins = [];
  const over400 = latBests.filter((b) => b.points >= 400);
  if (over400.length)
    ins.push({ type: "green", ico: "🏅", title: over400.length + " event" + (over400.length > 1 ? "s" : "") + " at 400+ pts",
      text: over400.map((b) => b.event + " " + poolNorm(b.pool) + "m (" + b.points + ")").join(", ") });
  if (prv) {
    const imps = [];
    allEventKeys(D, false).forEach((key) => {
      const [kev, kpool] = key.split("|");
      const c = getBest(D, lat, kev, kpool), o = getBest(D, prv, kev, kpool);
      if (c && o) imps.push({ key: kev + " " + kpool + "m", pct: (o.seconds - c.seconds) / o.seconds * 100, delta: (c.points || 0) - (o.points || 0) });
    });
    imps.sort((a, b) => b.pct - a.pct);
    if (imps.length)
      ins.push({ type: "green", ico: "🚀", title: "Most improved: " + imps[0].key,
        text: "Improved " + imps[0].pct.toFixed(1) + "% from " + prv + " to " + lat + (imps[0].delta > 0 ? " (+" + imps[0].delta + " pts)" : "") });
    const worst = imps[imps.length - 1];
    if (worst && worst.pct < -1)
      ins.push({ type: "amber", ico: "📉", title: "Slower: " + worst.key, text: Math.abs(worst.pct).toFixed(1) + "% off vs " + prv + "." });
  }
  const sp = {}, cnt = {};
  latBests.forEach((b) => { const st = getStroke(b.event); sp[st] = (sp[st] || 0) + b.points; cnt[st] = (cnt[st] || 0) + 1; });
  const avg = {}; Object.keys(sp).forEach((k) => (avg[k] = Math.round(sp[k] / cnt[k])));
  const sorted = Object.keys(avg).sort((a, b) => avg[b] - avg[a]);
  if (sorted.length)
    ins.push({ type: "blue", ico: "💪", title: "Strongest stroke: " + sorted[0] + " (" + avg[sorted[0]] + " avg pts)",
      text: sorted.length > 1 ? "Runner-up: " + sorted[1] + " (" + avg[sorted[1]] + ")." : "" });
  if (sorted.length > 1) {
    const w = sorted[sorted.length - 1];
    ins.push({ type: "amber", ico: "🔧", title: "Needs work: " + w + " (" + avg[w] + " avg pts)", text: "Lower average than other strokes." });
  }
  return ins;
}

// ⑦ Season recap cards.
export function seasonRecap(D, swimmer) {
  const ss = seasons(D);
  if (!ss.length) return [];
  const pbKeys = computePBTimeline(D);
  return ss.slice().reverse().map((sk) => {
    const res = (D[sk].results || []).filter((r) => r.seconds > 0 && !isRelay(r.event));
    const bests = (D[sk].bests || []).filter((b) => b.seconds > 0 && !isRelay(b.event));
    const nMeets = new Set(res.map((r) => (r.competition || "?") + "__" + (r.date || "?"))).size;
    let nPBs = 0; const pbEvs = [];
    res.forEach((r) => {
      const k = r.event + "|" + (poolNorm(r.pool) || "") + "|" + (r.date || "") + "|" + r.seconds;
      if (pbKeys.has(k)) { nPBs++; if (pbEvs.length < 6) pbEvs.push(r.event + (r.pool ? " " + poolNorm(r.pool) + "m" : "")); }
    });
    let bestPts = null;
    res.forEach((r) => { if (r.points > 0 && (!bestPts || r.points > bestPts.points)) bestPts = r; });
    if (!bestPts) bests.forEach((b) => { if (b.points > 0 && (!bestPts || b.points > bestPts.points)) bestPts = b; });
    const firstIn = {}, bestIn = {};
    res.slice().sort((a, b) => (parseDate(a.date) || 0) - (parseDate(b.date) || 0)).forEach((r) => {
      const k = r.event + "|" + (poolNorm(r.pool) || "");
      if (!firstIn[k]) firstIn[k] = r.seconds;
      if (!bestIn[k] || r.seconds < bestIn[k]) bestIn[k] = r.seconds;
    });
    let impEv = null, impPct = 0;
    Object.keys(firstIn).forEach((k) => { const pct = (firstIn[k] - bestIn[k]) / firstIn[k] * 100; if (pct > impPct) { impPct = pct; impEv = k; } });
    // Age-group convention (matches seasonEventReport): the age used for a whole
    // season is the swimmer's age at the END year of that season (e.g. "2025-2026"
    // → 2026), not the calendar year the season starts in — a swimmer competes in
    // next year's age group for most of a season that started the year before.
    const endYear = parseInt(String(sk).split("-")[1]) || parseInt(sk);
    const by = swimmer && swimmer.birthdate ? birthYear(swimmer.birthdate) : null;
    const age = by && endYear ? endYear - by : null;
    return { season: sk, ageLabel: age != null ? "Age " + age + " · " + ageGroupLabel(age) : "",
      nMeets, nSwims: res.length, nPBs, pbEvs, bestPts, impEv: impEv ? impEv.replace("|", " ") : null, impPct };
  });
}

// ⑧ Improvement by stroke/distance between two seasons (null = earliest-first / overall-best).
export function strokeImprovement(D, fromSk, toSk) {
  function bestInSeason(sk) {
    const src = sk ? (D[sk] && D[sk].results) || [] : allResults(D);
    const src2 = sk ? (D[sk] && D[sk].bests) || [] : [];
    const m = {};
    const proc = (r) => {
      if (!r.event || !r.seconds || r.seconds <= 0 || isRelay(r.event)) return;
      const pool = poolNorm(r.pool), key = r.event + "|" + pool;
      if (!m[key] || r.seconds < m[key].s) m[key] = { s: r.seconds, t: r.time || fmtT(r.seconds), pool, event: r.event };
    };
    src.forEach(proc); src2.forEach(proc);
    return m;
  }
  let fromMap = bestInSeason(fromSk);
  const toMap = bestInSeason(toSk);
  if (!fromSk) {
    fromMap = {};
    allResults(D).forEach((r) => {
      if (!r.event || !r.seconds || r.seconds <= 0 || isRelay(r.event)) return;
      const pool = poolNorm(r.pool), key = r.event + "|" + pool, ts = parseDate(r.date) || 0;
      if (!fromMap[key] || ts < fromMap[key].ts) fromMap[key] = { s: r.seconds, t: r.time || fmtT(r.seconds), pool, event: r.event, ts };
    });
  }
  const keys = Array.from(new Set(Object.keys(fromMap).concat(Object.keys(toMap))));
  const rows = [];
  keys.forEach((key) => {
    const f = fromMap[key], tgt = toMap[key];
    if (!f || !tgt || f.s <= 0 || tgt.s <= 0) return;
    rows.push({ key, event: f.event, pool: f.pool, fromT: f.t, toT: tgt.t, pct: +((f.s - tgt.s) / f.s * 100).toFixed(1) });
  });
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}

// ⑨ Points trend (all swims by date, optional pool/event filter) + regression line.
export function pointsTrend(D, opts) {
  opts = opts || {};
  const ar = allResults(D).filter((r) => {
    if (opts.event && r.event !== opts.event) return false;
    if (opts.pool) { const p = poolNorm(r.pool); if (p && p !== opts.pool) return false; }
    return true;
  });
  const byEvent = {};
  const all = [];
  ar.forEach((r) => {
    const ts = parseDate(r.date);
    if (!ts || !r.points) return;
    const pt = { x: ts, y: r.points, event: r.event, time: r.time, pool: r.pool };
    (byEvent[r.event] = byEvent[r.event] || []).push(pt);
    all.push(pt);
  });
  const reg = linReg(all);
  let trend = null;
  if (reg && all.length >= 3) {
    const xs = all.map((p) => p.x), mn = Math.min(...xs), mx = Math.max(...xs);
    trend = [{ x: mn, y: reg.m * mn + reg.b }, { x: mx, y: reg.m * mx + reg.b }];
  }
  return { points: all, byEvent, trend, events: Object.keys(byEvent).sort() };
}

// ⑩ Rudolph age-graded points (config/rudolph) ───────────────────────────
// Published from the desktop app (Extract tab) after uploading Dr. Klaus
// Rudolph's German age-graded points PDF. Shape:
//   { table: { "F"|"M": { "8".."18"|"offen": { "dist|stroke": [{pts,sec}, …20] } } },
//     count, loadedAt, by }
// Unlike the Israeli age-group records (absolute times), this maps a time to
// 1-20 points FOR THAT AGE, so swimmers of different ages can be compared on
// one scale. Age bracket uses the swimmer's AGE GROUP for that swim — same
// recordAge() convention as the Israeli records (calendar year of the swim
// minus birth year) — not their precise age-in-years on that exact day; see
// rudolphTrend() for why.
export function rudolphAgeBracket(age) {
  if (age == null) return null;
  const a = Math.floor(age);
  if (a < 8) return null;   // table starts at 8
  if (a >= 19) return "offen";
  return String(a);
}
// Interpolates (or extrapolates beyond the printed 1/20 rows, using the
// nearest segment's slope — uncapped, matching how these tables are read)
// a swim time to Rudolph points for a given sex/age/event.
export function rudolphScore(table, sex, age, event, seconds) {
  const S = sexNorm(sex), br = rudolphAgeBracket(age), key = recordKey(event);
  if (!table || !S || !br || !key || !seconds) return null;
  const rows = ((table[S] || {})[br] || {})[key];
  if (!rows || rows.length < 2) return null;
  const n = rows.length; // sorted pts 20→1, i.e. seconds ascending (fastest→slowest)
  const seg = (a, b) => a.pts + (b.pts - a.pts) * ((seconds - a.sec) / (b.sec - a.sec));
  if (seconds <= rows[0].sec) return +seg(rows[0], rows[1]).toFixed(2);
  if (seconds >= rows[n - 1].sec) return +seg(rows[n - 2], rows[n - 1]).toFixed(2);
  for (let i = 0; i < n - 1; i++) {
    if (seconds >= rows[i].sec && seconds <= rows[i + 1].sec) return +seg(rows[i], rows[i + 1]).toFixed(2);
  }
  return null;
}
// Rudolph score trend (all swims by date, optional pool/event filter) +
// regression line — mirrors pointsTrend() but scores against the age-graded
// table using the swimmer's AGE GROUP for that swim (calendar year of the
// swim date minus birth year — recordAge()'s convention, same as the
// Israeli-records feature), not their precise age-in-years on that exact
// day. Real meets confirm this: a swimmer born in a year that makes them
// "still 10" by exact age already competes (and is labelled by LogLig) in
// the age-11 category once the calendar reaches their age-group year —
// scoring by exact age would use the wrong (younger, more lenient) table.
export function rudolphTrend(D, table, sex, birthdate, opts) {
  opts = opts || {};
  const ar = allResults(D).filter((r) => {
    if (opts.event && r.event !== opts.event) return false;
    if (opts.pool) { const p = poolNorm(r.pool); if (p && p !== opts.pool) return false; }
    return true;
  });
  const byEvent = {};
  const all = [];
  ar.forEach((r) => {
    const ts = parseDate(r.date);
    if (!ts || !r.seconds) return;
    const age = recordAge(birthdate, ts);
    const score = rudolphScore(table, sex, age, r.event, r.seconds);
    if (score == null) return;
    const pt = { x: ts, y: score, event: r.event, time: r.time, pool: r.pool, age };
    (byEvent[r.event] = byEvent[r.event] || []).push(pt);
    all.push(pt);
  });
  const reg = linReg(all);
  let trend = null;
  if (reg && all.length >= 3) {
    const xs = all.map((p) => p.x), mn = Math.min(...xs), mx = Math.max(...xs);
    trend = [{ x: mn, y: reg.m * mn + reg.b }, { x: mx, y: reg.m * mx + reg.b }];
  }
  return { points: all, byEvent, trend, events: Object.keys(byEvent).sort() };
}

// ⑪ USA Motivational Standards, junior ages 10-18 (config/usaStandards) ──
// Published from the desktop app (Extract tab) after uploading USA
// Swimming's single-age motivational standards PDF. Shape:
//   { table: { "SCM"|"LCM": { "10".."18": { "F"|"M": { "dist|stroke": {B,BB,A,AA,AAA,AAAA} } } } },
//     count, loadedAt, by }
// Cutoffs are in seconds (lower = harder). Uses the swimmer's AGE GROUP
// (recordAge() convention — calendar year minus birth year), same as
// Israeli records/Rudolph, and the same age-restricted best-time lookup
// (bestInAgeGroup) so each age selected shows the best time actually swum
// while in that age group.
export const USA_TIERS = ["B", "BB", "A", "AA", "AAA", "AAAA"]; // easiest→hardest; tier level = index+1
export const USA_STROKES = ["Free", "Back", "Breast", "Fly", "IM"];
// Highest tier (0 = none, 1..6 = B..AAAA) a time qualifies for.
export function usaTier(table, course, age, sex, event, seconds) {
  const S = sexNorm(sex), key = recordKey(event);
  if (!table || !course || age == null || !S || !key || !seconds) return 0;
  const row = (((table[course] || {})[String(age)] || {})[S] || {})[key];
  if (!row) return 0;
  for (let i = USA_TIERS.length - 1; i >= 0; i--) {
    const cutoff = row[USA_TIERS[i]];
    if (cutoff != null && seconds <= cutoff) return i + 1;
  }
  return 0;
}
// True once past the halfway point toward the next tier up (e.g. solidly in
// "AA" territory, closer to AAA than to the AA cutoff) — shown as "AA+".
export function usaTierPlus(table, course, age, sex, event, seconds, tier) {
  if (!tier || tier >= USA_TIERS.length) return false; // no tier reached, or already at the top (AAAA)
  const S = sexNorm(sex), key = recordKey(event);
  const row = (((table[course] || {})[String(age)] || {})[S] || {})[key];
  if (!row) return false;
  const cutoff = row[USA_TIERS[tier - 1]], nextCutoff = row[USA_TIERS[tier]];
  if (cutoff == null || nextCutoff == null || cutoff <= nextCutoff) return false;
  return (cutoff - seconds) / (cutoff - nextCutoff) > 0.5;
}
// For a given age group, every event with a best time in that group, tiered
// and bucketed into short (<=100m) / long (>=200m) distance bands per
// stroke — mirrors desktop's _usaRenderForAge(). Returns
//   { shortTier: {Free..IM: 0-6}, longTier: {...}, shortRows: [...], longRows: [...] }
// where each row is { event, time, tier, plus } sorted best-tier-first.
export function usaStandardsForAge(D, table, sex, birthdate, age) {
  const shortTier = {}, longTier = {}, shortRows = [], longRows = [];
  USA_STROKES.forEach((s) => { shortTier[s] = 0; longTier[s] = 0; });
  [["25", "SCM"], ["50", "LCM"]].forEach(([pool, course]) => {
    const best = bestInAgeGroup(D, pool, birthdate, String(age));
    Object.keys(best).forEach((ev) => {
      const stroke = getStroke(ev);
      if (USA_STROKES.indexOf(stroke) < 0) return;
      const dist = extractDist(ev);
      const tier = usaTier(table, course, age, sex, ev, best[ev].seconds);
      const plus = usaTierPlus(table, course, age, sex, ev, best[ev].seconds, tier);
      const bucket = dist <= 100 ? shortTier : longTier;
      if (tier > bucket[stroke]) bucket[stroke] = tier;
      (dist <= 100 ? shortRows : longRows).push({ event: `${ev} (${pool}m)`, time: best[ev].time, tier, plus });
    });
  });
  shortRows.sort((a, b) => b.tier - a.tier);
  longRows.sort((a, b) => b.tier - a.tier);
  return { shortTier, longTier, shortRows, longRows };
}

// ⑫ World Aquatics Masters World Records (config/mastersRecords) ─────────
// Published from the desktop app after uploading the SCM/LCM masters world
// records PDFs. Shape:
//   { table: { "SCM"|"LCM": { "F"|"M": { "25-29".."105-109": { "dist|stroke": {seconds,athlete,date} } } } },
//     count, loadedAt, by }
// Like USA Standards, compares the best time actually swum WHILE IN a given
// age bracket (bestInAgeGroup) against that bracket's record — not a
// best-ever time, so only brackets the swimmer has real results in show data.
export function wrAgeGroup(age) {
  if (age == null || age < 25) return null;
  const base = 25 + Math.floor((age - 25) / 5) * 5;
  return base + "-" + (base + 4);
}
// Every age bracket present in the table for this sex, across both courses, sorted young→old.
export function wrAvailableGroups(table, S) {
  const set = new Set();
  ["SCM", "LCM"].forEach((course) => {
    const bySex = ((table[course] || {})[S]) || {};
    Object.keys(bySex).forEach((g) => set.add(g));
  });
  return Array.from(set).sort((a, b) => parseInt(a) - parseInt(b));
}
export function wrGapColor(pct) {
  if (pct <= 5) return "#1D9E75";   // green
  if (pct <= 8) return "#e0b400";   // yellow
  if (pct <= 10) return "#e07b00";  // orange
  if (pct <= 15) return "#d9362e";  // red
  return "#111827";                 // black
}
// Top-5 closest-to-record events for a given bracket, using the best time
// actually swum while the swimmer was in that bracket, sorted by % gap ascending.
export function wrGapRows(table, S, group, D, birthdate) {
  const rows = [];
  [["25", "SCM"], ["50", "LCM"]].forEach(([pool, course]) => {
    const recTable = ((table[course] || {})[S] || {})[group] || {};
    const best = bestInAgeGroup(D, pool, birthdate, group);
    Object.keys(best).forEach((ev) => {
      const key = recordKey(ev); if (!key) return;
      const wr = recTable[key]; if (!wr || !wr.seconds) return;
      const pct = (best[ev].seconds - wr.seconds) / wr.seconds * 100;
      rows.push({ event: `${ev} (${pool}m)`, pct, mine: best[ev].time, wrTime: fmtT(wr.seconds), athlete: wr.athlete });
    });
  });
  rows.sort((a, b) => a.pct - b.pct);
  return rows.slice(0, 5);
}

// ── Team View (cross-swimmer aggregates for a coach's own roster) ───────
// `roster` = [{ swimmer, D }, ...] — one entry per swimmer on the roster,
// `swimmer` the doc (name/birthdate/sex) and `D` its seasons map. All three
// functions below are pure and just loop the existing per-swimmer analysis
// functions above; they never fetch anything themselves.

// USA Standards tier histogram (ages 10-18 only, per the feature's own
// scope). Each swimmer's "headline tier" is the single highest B..AAAA tier
// they've reached in either distance band, using the same "current age +
// best-ever time" convention the per-swimmer USA Standards view already
// uses (see usaStandardsForAge's call site in App.jsx).
export function teamUsaTierSummary(roster, table) {
  const histogram = {}; USA_TIERS.forEach((t) => (histogram[t] = 0));
  const perSwimmer = [];
  if (!table) return { histogram, perSwimmer };
  roster.forEach(({ swimmer, D }) => {
    if (!swimmer || !swimmer.birthdate) return;
    const age = Math.floor(recordAge(swimmer.birthdate, null));
    if (age < 10 || age > 18) return;
    const { shortTier, longTier } = usaStandardsForAge(D, table, swimmer.sex, swimmer.birthdate, age);
    const best = Math.max(0, ...Object.values(shortTier), ...Object.values(longTier));
    if (best > 0) {
      histogram[USA_TIERS[best - 1]]++;
      perSwimmer.push({ swimmer, tier: USA_TIERS[best - 1] });
    }
  });
  return { histogram, perSwimmer };
}

// Rudolph age-graded score per swimmer (long-course only, same convention as
// the per-swimmer Rudolph trend view) — latest scored swim's points, plus
// the team average.
// Rudolph is only calibrated through the junior/youth brackets — like USA
// Standards, it isn't meaningful for masters swimmers, so anyone currently
// over this age is excluded from the team summary entirely.
export const RUDOLPH_TEAM_MAX_AGE = 20;
export function teamRudolphSummary(roster, table) {
  const perSwimmer = [];
  if (!table) return { best: null, perSwimmer };
  roster.forEach(({ swimmer, D }) => {
    if (!swimmer || !swimmer.birthdate) return;
    const age = recordAge(swimmer.birthdate, null);
    if (age != null && age > RUDOLPH_TEAM_MAX_AGE) return;
    const tr = rudolphTrend(D, table, swimmer.sex, swimmer.birthdate, { pool: "50" });
    if (!tr.points.length) return;
    const latest = tr.points.reduce((a, b) => (b.x > a.x ? b : a));
    perSwimmer.push({ swimmer, score: latest.y });
  });
  const best = perSwimmer.length ? perSwimmer.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  return { best: best ? { swimmer: best.swimmer, score: best.score } : null, perSwimmer };
}

// Team-wide highlights, in the same { type, ico, title, text } shape
// insights() already uses (so the existing insight-card UI renders these
// unmodified), plus swimmerName. Most-improved event and biggest single PB
// across the whole roster's latest season.
export function teamHighlights(roster) {
  const out = [];
  let bestImp = null, bestPB = null, busiest = null;
  roster.forEach(({ swimmer, D }) => {
    const ss = seasons(D);
    if (!ss.length) return;
    const recap = seasonRecap(D, swimmer)[0]; // latest season first
    if (recap && recap.impEv && (!bestImp || recap.impPct > bestImp.pct))
      bestImp = { name: swimmer.name, event: recap.impEv, pct: recap.impPct };
    if (recap && recap.bestPts && (!bestPB || recap.bestPts.points > bestPB.points))
      bestPB = { name: swimmer.name, event: recap.bestPts.event, points: recap.bestPts.points };
    if (recap && (!busiest || recap.nMeets > busiest.nMeets))
      busiest = { name: swimmer.name, nMeets: recap.nMeets };
  });
  if (bestImp)
    out.push({ type: "green", ico: "🚀", swimmerName: bestImp.name,
      title: "Most improved: " + bestImp.name, text: bestImp.event + " · +" + bestImp.pct.toFixed(1) + "%" });
  if (bestPB)
    out.push({ type: "blue", ico: "🏅", swimmerName: bestPB.name,
      title: "Top points swim: " + bestPB.name, text: bestPB.event + " · " + bestPB.points + " pts" });
  if (busiest && busiest.nMeets > 0)
    out.push({ type: "amber", ico: "📅", swimmerName: busiest.name,
      title: "Busiest competitor: " + busiest.name, text: busiest.nMeets + " meet" + (busiest.nMeets !== 1 ? "s" : "") + " this season" });
  return out;
}

// Event-coverage heat map for one season: stroke (rows) × distance (cols),
// value = number of swims. Used to see which events were raced and how often.
export function eventHeatmap(D, seasonKey) {
  const s = D[seasonKey];
  if (!s) return null;
  const src = s.results && s.results.length ? s.results : s.bests || [];
  const distSet = new Set();
  const counts = {}; // stroke -> dist -> count
  src.forEach((r) => {
    if (!r.event || !(r.seconds > 0) || isRelay(r.event)) return;
    const st = getStroke(r.event), d = extractDist(r.event);
    if (!d) return;
    distSet.add(d);
    counts[st] = counts[st] || {};
    counts[st][d] = (counts[st][d] || 0) + 1;
  });
  const dists = Array.from(distSet).sort((a, b) => a - b);
  const strokes = STROKES.filter((st) => counts[st] && dists.some((d) => counts[st][d] > 0));
  let max = 0;
  strokes.forEach((st) => dists.forEach((d) => { const v = (counts[st] && counts[st][d]) || 0; if (v > max) max = v; }));
  return { strokes, dists, counts, max };
}
