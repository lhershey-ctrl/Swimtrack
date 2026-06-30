// ── SwimTrack analysis helpers ──────────────────────────────────────
// Ported from the desktop app (noga_swimming_app.html). All functions
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
  if (/medley|im\b|משולב|שחייה/i.test(ev)) return "IM";
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
