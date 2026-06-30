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
    const age = swimmer && swimmer.birthdate ? getAgeAt(swimmer.birthdate, "01/09/" + parseInt(sk)) : null;
    return { season: sk, ageLabel: age ? "Age " + Math.floor(age) + " · " + ageGroupLabel(Math.floor(age)) : "",
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
    (byEvent[r.event] = byEvent[r.event] || []).push({ x: ts, y: r.points });
    all.push({ x: ts, y: r.points, event: r.event });
  });
  const reg = linReg(all);
  let trend = null;
  if (reg && all.length >= 3) {
    const xs = all.map((p) => p.x), mn = Math.min(...xs), mx = Math.max(...xs);
    trend = [{ x: mn, y: reg.m * mn + reg.b }, { x: mx, y: reg.m * mx + reg.b }];
  }
  return { points: all, byEvent, trend, events: Object.keys(byEvent).sort() };
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
