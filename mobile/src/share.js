// Build a shareable progress summary (text + image card) and hand it to the
// native share sheet (WhatsApp etc.) via the Web Share API, with fallbacks.
import {
  fmtT, fmtDateShort, parseDate, poolNorm, allResults, seasons,
  computePBTimeline, getStrokeColor, getAgeAt, ageGroupLabel,
} from "./analysis.js";

const APP_URL = "https://swimtrack-e12c8.web.app/";
const GRAD_STOPS = [[0, "#0f3d72"], [0.55, "#1d4ed8"], [1, "#0ea5e9"]];

function recentPBs(D, n) {
  const ar = allResults(D);
  const pb = computePBTimeline(D);
  return ar
    .filter((r) => pb.has(r.event + "|" + poolNorm(r.pool) + "|" + (r.date || "") + "|" + r.seconds))
    .sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0))
    .slice(0, n || 5);
}

export function summaryText(sw, D) {
  const ss = seasons(D);
  const ar = allResults(D);
  const age = sw && sw.birthdate ? getAgeAt(sw.birthdate, "") : null;
  const pbs = recentPBs(D, 5);
  const L = [];
  L.push("🏊 " + (sw && sw.name ? sw.name : "Swimmer") + " — SwimTrack");
  if (age) L.push("Age " + Math.floor(age) + " · " + ageGroupLabel(age));
  L.push(ss.length + " season" + (ss.length !== 1 ? "s" : "") + " · " + ar.length + " swims");
  if (pbs.length) {
    L.push("");
    L.push("🏅 Recent personal bests:");
    pbs.forEach((r) => L.push("• " + r.event + " " + poolNorm(r.pool) + "m — " + fmtT(r.seconds) + " (" + fmtDateShort(parseDate(r.date)) + ")"));
  }
  L.push("");
  L.push(APP_URL);
  return L.join("\n");
}

function roundRect(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}

export function makeCardBlob(sw, D) {
  return new Promise((resolve) => {
    const W = 1080, H = 1350;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const x = cv.getContext("2d");

    // Background
    x.fillStyle = "#0b1220"; x.fillRect(0, 0, W, H);

    // Header gradient
    const g = x.createLinearGradient(0, 0, W, 380);
    GRAD_STOPS.forEach(([o, c]) => g.addColorStop(o, c));
    x.fillStyle = g; x.fillRect(0, 0, W, 380);

    // Header text
    const age = sw && sw.birthdate ? getAgeAt(sw.birthdate, "") : null;
    x.fillStyle = "#fff";
    x.font = "800 84px -apple-system, Segoe UI, sans-serif";
    x.fillText((sw && sw.name) || "Swimmer", 64, 170);
    x.font = "500 40px -apple-system, Segoe UI, sans-serif";
    x.fillStyle = "rgba(255,255,255,.85)";
    x.fillText(age ? "Age " + Math.floor(age) + " · " + ageGroupLabel(age) : "SwimTrack", 64, 240);
    x.font = "800 34px -apple-system, Segoe UI, sans-serif";
    x.fillStyle = "rgba(255,255,255,.9)";
    x.fillText("🏊  SwimTrack", 64, 320);

    // KPI tiles
    const ar = allResults(D);
    const ss = seasons(D);
    const pb = computePBTimeline(D);
    const totalPBs = ar.filter((r) => pb.has(r.event + "|" + poolNorm(r.pool) + "|" + (r.date || "") + "|" + r.seconds)).length;
    const bestPts = ar.reduce((m, r) => Math.max(m, r.points || 0), 0);
    const tiles = [
      ["Personal bests", String(totalPBs), "#f59e0b"],
      ["Best points", bestPts ? String(bestPts) : "—", "#10b981"],
      ["Swims", String(ar.length), "#3b82f6"],
    ];
    const tw = (W - 64 * 2 - 32 * 2) / 3;
    tiles.forEach((t, i) => {
      const tx = 64 + i * (tw + 32);
      x.fillStyle = "#121c2e"; roundRect(x, tx, 430, tw, 200, 24); x.fill();
      x.fillStyle = t[2]; x.font = "800 76px -apple-system, Segoe UI, sans-serif";
      x.textAlign = "center"; x.fillText(t[1], tx + tw / 2, 540);
      x.fillStyle = "#8aa0bd"; x.font = "700 26px -apple-system, Segoe UI, sans-serif";
      x.fillText(t[0].toUpperCase(), tx + tw / 2, 590);
      x.textAlign = "left";
    });

    // Recent PBs
    x.fillStyle = "#e7edf5"; x.font = "800 40px -apple-system, Segoe UI, sans-serif";
    x.fillText("🏅 Recent personal bests", 64, 730);
    const pbs = recentPBs(D, 5);
    let y = 800;
    pbs.forEach((r) => {
      x.fillStyle = getStrokeColor(r.event); roundRect(x, 64, y - 34, 12, 44, 6); x.fill();
      x.fillStyle = "#e7edf5"; x.font = "700 38px -apple-system, Segoe UI, sans-serif";
      x.fillText(r.event + "  " + poolNorm(r.pool) + "m", 96, y);
      x.fillStyle = "#fff"; x.font = "800 40px -apple-system, Segoe UI, sans-serif";
      x.textAlign = "right"; x.fillText(fmtT(r.seconds), W - 64, y);
      x.textAlign = "left";
      x.fillStyle = "#8aa0bd"; x.font = "400 28px -apple-system, Segoe UI, sans-serif";
      x.fillText(fmtDateShort(parseDate(r.date)), 96, y + 38);
      y += 110;
    });
    if (!pbs.length) {
      x.fillStyle = "#8aa0bd"; x.font = "400 34px -apple-system, Segoe UI, sans-serif";
      x.fillText("No personal bests yet — keep swimming!", 64, 800);
    }

    // Footer
    x.fillStyle = "#22324d"; x.fillRect(0, H - 92, W, 2);
    x.fillStyle = "#8aa0bd"; x.font = "500 30px -apple-system, Segoe UI, sans-serif";
    x.fillText(APP_URL, 64, H - 40);

    cv.toBlob((b) => resolve(b), "image/png");
  });
}

// Returns "shared" | "cancelled" | "fallback".
export async function shareProgress(sw, D) {
  const text = summaryText(sw, D);
  let blob = null;
  try { blob = await makeCardBlob(sw, D); } catch (e) { /* ignore */ }

  // 1) Native share with image file (best — WhatsApp shows the card)
  if (blob && navigator.canShare) {
    const file = new File([blob], "swimtrack.png", { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text, title: "SwimTrack" }); return "shared"; }
      catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
    }
  }
  // 2) Native share, text only
  if (navigator.share) {
    try { await navigator.share({ text, title: "SwimTrack" }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  // 3) Fallback (desktop): download the card + open WhatsApp web with the text
  if (blob) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = "swimtrack.png"; a.click();
    URL.revokeObjectURL(u);
  }
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  return "fallback";
}
