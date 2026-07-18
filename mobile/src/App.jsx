import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, ComposedChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { useUI, GRAD } from "./theme.jsx";
import {
  watchAuth, signInWithGoogle, signOut, fetchSwimmers, subscribeSwimmer,
  isOwner, getAccessList, saveAccessList, saveSwimmerProfile, createSwimmer, deleteSwimmer,
  fetchRecords, fetchRudolph, fetchUsaStandards, fetchMastersRecords,
  migrateLegacyAccess, fetchCoach, redeemInviteCode, createInviteCode, claimOrphanedSwimmers,
  fetchAllCoaches, fetchAllSwimmersAdmin, fetchAllInviteCodes,
} from "./firebase.js";
import {
  fmtT, fmtDateShort, parseDate, poolNorm, allResults, seasons, personalRecords,
  computePBTimeline, getStroke, getStrokeColor, STROKE_COLORS, COLORS, extractDist,
  getAgeAt, ageGroupLabel, latest, prevSeason, STROKES, eventCatalog, eventSeries,
  competitions, scLc, insights, seasonRecap, strokeImprovement, pointsTrend, eventHeatmap,
  recordGap, recordCategory, sexNorm, nameMatch, recordCategories, catLabel,
  lookupRecord, bestInAgeGroup, recordAge, recordsHeldBy, seasonEventReport, bestsByAgeGroup,
  recordKey, rudolphTrend, usaStandardsForAge, USA_TIERS, USA_STROKES,
  wrAgeGroup, wrAvailableGroups, wrGapColor, wrGapRows,
  teamUsaTierSummary, teamRudolphSummary, teamHighlights,
} from "./analysis.js";
import { shareProgress } from "./share.js";
import { percentileFor, valueAtBand, PCTL_BANDS, CDC_AGE_MIN, CDC_AGE_MAX } from "./cdcGrowth.js";

// ════════════════════════════════════════════════════════════════════
//  Error boundary — without this, an uncaught error during a tab's
//  render silently blanks the whole app with nothing shown on screen
//  (and no dev tools on a phone to see why). Show the message instead.
// ════════════════════════════════════════════════════════════════════
class TabErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Tab crashed:", error, info); }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div style={{ padding: 16 }}>
          <div style={{ background: "#fee2e2", border: "1px solid #ef4444", borderRadius: 10, padding: 14, color: "#7f1d1d", fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>⚠️ This tab hit an error</div>
            <div style={{ fontFamily: "monospace", fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {String((e && e.message) || e)}
              {e && e.stack ? "\n\n" + e.stack : ""}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>Screenshot this and send it over.</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ════════════════════════════════════════════════════════════════════
//  UI atoms
// ════════════════════════════════════════════════════════════════════
function Card({ children, style }) {
  const { s } = useUI();
  return <div style={{ ...s.card, ...style }}>{children}</div>;
}
function KPI({ val, lbl, color }) {
  const { c, s } = useUI();
  return (
    <div style={{ ...s.card, flex: 1, minWidth: 0, marginBottom: 0, padding: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05, color: color || c.text }}>{val}</div>
      <div style={{ fontSize: 10.5, color: c.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginTop: 4 }}>{lbl}</div>
    </div>
  );
}
function PillRow({ items, active, onPick, label }) {
  const { s, c } = useUI();
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 4px 8px", alignItems: "center", WebkitOverflowScrolling: "touch" }}>
      {label && <span style={{ fontSize: 11, color: c.dim, fontWeight: 700, marginRight: 2, flexShrink: 0 }}>{label}</span>}
      {items.map((it) => (
        <button key={it.key} style={{ ...s.pill(active === it.key), flexShrink: 0,
          ...(it.color && active === it.key ? { background: it.color, borderColor: it.color } : {}),
          ...(it.color && active !== it.key ? { color: it.color, borderColor: it.color + "66" } : {}) }}
          onClick={() => onPick(it.key)}>{it.label}</button>
      ))}
    </div>
  );
}
function Center({ children }) {
  const { c } = useUI();
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", color: c.dim, padding: 30, textAlign: "center" }}>{children}</div>
  );
}
function Select({ label, value, options, onChange }) {
  const { c, s } = useUI();
  return (
    <label style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10.5, color: c.dim, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...s.input }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#4285F4" d="M45 24c0-1.6-.1-2.8-.4-4H24v7.5h12c-.2 1.9-1.5 4.8-4.4 6.7l-.04.3 6.4 5 .4.04C42.6 41.6 45 33.5 45 24z"/>
      <path fill="#34A853" d="M24 46c5.9 0 10.8-1.9 14.4-5.3l-6.8-5.3c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.9-12.5-9.2l-.3.02-6.6 5.1-.1.3C7.9 41.1 15.4 46 24 46z"/>
      <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-.01-.3-6.7-5.2-.2.1C3.3 17.1 2.5 20.5 2.5 24s.8 6.9 2.1 9.8l6.9-5.4z"/>
      <path fill="#EA4335" d="M24 10.8c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.8 4.6 29.9 2.5 24 2.5 15.4 2.5 7.9 7.4 4.6 14.2l6.9 5.4C13.3 14.7 18.2 10.8 24 10.8z"/>
    </svg>
  );
}
const tooltipStyle = (c) => ({ background: c.card2, border: `1px solid ${c.line}`, borderRadius: 10, color: c.text, fontSize: 12 });

// ════════════════════════════════════════════════════════════════════
//  Sign-in
// ════════════════════════════════════════════════════════════════════
function SignIn({ onSignIn, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: 28, background: GRAD }}>
      <div style={{ fontSize: 64, marginBottom: 8 }}>🏊‍♀️</div>
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-.5px", color: "#fff" }}>SwimTrack</div>
      <div style={{ color: "rgba(255,255,255,.8)", marginTop: 8, marginBottom: 36 }}>Swim times, records & progress</div>
      <button onClick={onSignIn} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff",
        color: "#1f2937", border: "none", borderRadius: 14, padding: "14px 22px", fontSize: 15, fontWeight: 700,
        cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
        <GoogleG /> Sign in with Google
      </button>
      {error && <div style={{ color: "#fecaca", marginTop: 18, fontSize: 13, maxWidth: 320, textAlign: "center" }}>{error}</div>}
    </div>
  );
}

// Shown after Google sign-in for any account that isn't yet a recognized
// coach (no coaches/{uid} doc) — a one-time invite code from the owner
// activates the account. Signing out from here lets someone re-try with a
// different Google account without needing to fully reload the page.
function InviteGate({ user, onRedeemed, onSignOut }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function redeem() {
    const c = code.trim().toUpperCase();
    if (!c) { setStatus("Enter your invite code."); return; }
    setBusy(true); setStatus("");
    try { await redeemInviteCode(c, user); onRedeemed(); }
    catch (e) { setStatus("❌ " + e.message); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: 28, background: GRAD }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🔑</div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-.5px", color: "#fff" }}>Invite code needed</div>
      <div style={{ color: "rgba(255,255,255,.8)", marginTop: 8, marginBottom: 8, textAlign: "center", maxWidth: 320 }}>
        Signed in as {user.email}. Enter the one-time invite code the owner gave you to activate your account.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 20, width: "100%", maxWidth: 320 }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="INVITE CODE"
          style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "none", fontSize: 15,
            fontFamily: "monospace", textTransform: "uppercase", textAlign: "center" }} />
      </div>
      <button onClick={redeem} disabled={busy} style={{ marginTop: 12, width: "100%", maxWidth: 320,
        background: "#fff", color: "#1f2937", border: "none", borderRadius: 14, padding: "14px 22px",
        fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
        {busy ? "Checking…" : "Activate"}
      </button>
      {status && <div style={{ color: "#fecaca", marginTop: 18, fontSize: 13, maxWidth: 320, textAlign: "center" }}>{status}</div>}
      <button onClick={onSignOut} style={{ marginTop: 28, background: "none", border: "none",
        color: "rgba(255,255,255,.7)", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
        Sign in with a different account
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  Top bar + bottom nav
// ════════════════════════════════════════════════════════════════════
function TopBar({ user, swimmer, swimmers, onPick, onSignOut }) {
  const { c, dark, toggle } = useUI();
  const [open, setOpen] = useState(false);
  const icon = swimmer?.name === "Noga" ? "🏊‍♀️" : "🏊";
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 30, background: GRAD, padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 10, boxShadow: "0 2px 14px rgba(0,0,0,.35)" }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <button onClick={() => setOpen((o) => !o)} style={{ flex: 1, textAlign: "left", background: "rgba(255,255,255,.12)",
        border: "none", color: "#fff", borderRadius: 12, padding: "8px 12px", display: "flex", alignItems: "center",
        justifyContent: "space-between", cursor: "pointer" }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{swimmer?.name || "Select swimmer"}</span>
        <span style={{ opacity: .8 }}>▾</span>
      </button>
      <button onClick={toggle} title="Toggle theme" style={{ width: 34, height: 34, borderRadius: 999, border: "none",
        cursor: "pointer", background: "rgba(255,255,255,.2)", color: "#fff", fontSize: 15 }}>{dark ? "☀️" : "🌙"}</button>
      <button onClick={onSignOut} title={user?.email} style={{ width: 34, height: 34, borderRadius: 999, border: "none",
        cursor: "pointer", background: "rgba(255,255,255,.2)", color: "#fff", fontWeight: 700 }}>
        {(user?.displayName || user?.email || "?")[0].toUpperCase()}
      </button>
      {open && (
        <div style={{ position: "absolute", top: 58, left: 14, right: 14, background: c.card2, border: `1px solid ${c.line}`,
          borderRadius: 14, overflow: "hidden", zIndex: 40, boxShadow: "0 12px 30px rgba(0,0,0,.45)" }}>
          {swimmers.length === 0 && <div style={{ padding: 14, color: c.dim }}>No swimmers yet</div>}
          {swimmers.map((sw) => (
            <button key={sw.id} onClick={() => { onPick(sw.id); setOpen(false); }} style={{ display: "block", width: "100%",
              textAlign: "left", padding: "12px 16px", background: sw.id === swimmer?.id ? c.blueDk : "transparent",
              color: sw.id === swimmer?.id ? "#fff" : c.text, border: "none", borderBottom: `1px solid ${c.line}`,
              cursor: "pointer", fontSize: 15 }}>
              {sw.name === "Noga" ? "🏊‍♀️ " : "🏊 "}{sw.name}
              <span style={{ color: c.dim, fontSize: 12, marginLeft: 8 }}>#{sw.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: "home", label: "Home", icon: "🏠" },
  { key: "meets", label: "Meets", icon: "🏁" },
  { key: "progress", label: "Progress", icon: "📈" },
  { key: "records", label: "Records", icon: "🏅" },
  { key: "seasons", label: "Seasons", icon: "🗓" },
  { key: "team", label: "Team", icon: "👥" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];
const ADMIN_TAB = { key: "admin", label: "Admin", icon: "🔑" };
function BottomNav({ tab, setTab, owner }) {
  const { c } = useUI();
  const tabs = owner ? TABS.concat([ADMIN_TAB]) : TABS;
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30, maxWidth: 540, margin: "0 auto",
      background: c.card, borderTop: `1px solid ${c.line}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, background: "none", border: "none",
          cursor: "pointer", padding: "9px 0 11px", color: tab === t.key ? c.blue : c.dim, fontWeight: 700 }}>
          <div style={{ fontSize: 19, filter: tab === t.key ? "none" : "grayscale(.4) opacity(.8)" }}>{t.icon}</div>
          <div style={{ fontSize: 10, marginTop: 1 }}>{t.label}</div>
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  HOME
// ════════════════════════════════════════════════════════════════════
function Stat({ n, l }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{n}</div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.7)", textTransform: "uppercase", letterSpacing: ".05em" }}>{l}</div>
    </div>
  );
}

function MiniLine({ data, color, unit, title }) {
  const { c } = useUI();
  if (data.length < 2) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: c.dim, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={c.line} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: c.dim, fontSize: 9 }} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: c.dim, fontSize: 9 }} width={32} />
            <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [v + " " + unit, title]} />
            <Line type="monotone" dataKey="y" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const ONE_YR = 365.25 * 24 * 3600 * 1000;
function ageYears(birthdate, ts) {
  const bd = parseDate(birthdate);
  return bd ? (ts - bd) / ONE_YR : null;
}
function ordinal(p) {
  const n = Math.round(p), m = n % 100;
  const suf = m >= 11 && m <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return n + suf;
}

function GrowthPercentile({ swimmer, D }) {
  const { c, s } = useUI();
  const [metric, setMetric] = useState("stature");
  const sex = swimmer?.sex === "male" ? 1 : swimmer?.sex === "female" ? 2 : null;
  const bd = swimmer?.birthdate;
  const META = { stature: { label: "Height", unit: "cm", color: c.blue }, weight: { label: "Weight", unit: "kg", color: c.amber }, bmi: { label: "BMI", unit: "", color: c.green } };
  const meta = META[metric];

  const toSeries = (arr) => (arr || []).map((e) => ({ t: parseDate(e.date), v: +e.value })).filter((p) => p.t && p.v).sort((a, b) => a.t - b.t);
  const H = toSeries(swimmer?.heights), W = toSeries(swimmer?.weights);
  const lastH = H[H.length - 1], lastW = W[W.length - 1];
  const lastBMI = lastH && lastW ? +(lastW.v / ((lastH.v / 100) ** 2)).toFixed(1) : null;
  const hasAnyMeas = H.length > 0 || W.length > 0;
  const missingProfile = !sex || !bd;

  // Measured points for the selected metric, as {age, value}.
  const pts = useMemo(() => {
    if (!bd) return [];
    const nearest = (arr, t) => arr.reduce((best, p) => (!best || Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), null);
    let raw = [];
    if (metric === "stature") raw = H.map((p) => ({ age: ageYears(bd, p.t), value: p.v }));
    else if (metric === "weight") raw = W.map((p) => ({ age: ageYears(bd, p.t), value: p.v }));
    else raw = W.map((p) => { const h = nearest(H, p.t); if (!h || Math.abs(h.t - p.t) > 220 * 24 * 3600 * 1000) return null; return { age: ageYears(bd, p.t), value: +(p.v / ((h.v / 100) ** 2)).toFixed(1) }; }).filter(Boolean);
    return raw.filter((p) => p.age >= CDC_AGE_MIN && p.age <= CDC_AGE_MAX);
  }, [swimmer, metric, bd]);

  const canPctl = sex && bd && pts.length;
  const last = pts[pts.length - 1];
  const cur = canPctl && last ? percentileFor(metric, sex, last.age, last.value) : null;

  // Percentile band curves across the swimmer's age window (clamped 5–19).
  const bandData = useMemo(() => {
    if (!sex || !pts.length) return [];
    const lo = Math.max(CDC_AGE_MIN, Math.floor(Math.min(...pts.map((p) => p.age)) - 0.5));
    const hi = Math.min(CDC_AGE_MAX, Math.ceil(Math.max(...pts.map((p) => p.age)) + 0.5));
    const rows = [];
    for (let a = lo; a <= hi + 1e-9; a += 0.5) {
      const row = { age: +a.toFixed(1) };
      PCTL_BANDS.forEach((b) => (row["p" + b] = +valueAtBand(metric, sex, a, b).toFixed(1)));
      rows.push(row);
    }
    return rows;
  }, [sex, metric, pts]);

  // Performance correlation: biggest growth interval vs PBs set in that window.
  const corr = useMemo(() => {
    if (!bd || H.length < 2) return null;
    let best = null;
    for (let i = 1; i < H.length; i++) {
      const cm = H[i].v - H[i - 1].v;
      if (cm > 0 && (!best || cm > best.cm)) best = { cm, t0: H[i - 1].t, t1: H[i].t, a0: ageYears(bd, H[i - 1].t), a1: ageYears(bd, H[i].t) };
    }
    if (!best) return null;
    const pb = computePBTimeline(D);
    const inWin = allResults(D).filter((r) => {
      const t = parseDate(r.date);
      return t && t >= best.t0 && t <= best.t1 && pb.has(r.event + "|" + poolNorm(r.pool) + "|" + (r.date || "") + "|" + r.seconds);
    });
    return { cm: best.cm, a0: best.a0, a1: best.a1, pbs: inWin.length };
  }, [swimmer, D, bd]);

  const warnStyle = { borderColor: c.amber, background: c.card };
  const hSeries = H.map((p) => ({ label: fmtDateShort(p.t), y: p.v }));
  const wSeries = W.map((p) => ({ label: fmtDateShort(p.t), y: p.v }));

  return (
    <>
      <div style={s.h2}>Growth & Percentiles</div>

      {!hasAnyMeas ? (
        <Card style={warnStyle}>
          <div style={{ color: c.amber, fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>⚠️ No growth data yet</div>
          <div style={{ color: c.dim, fontSize: 13, lineHeight: 1.6 }}>
            Add {swimmer?.name ? swimmer.name + "'s" : "the swimmer's"} <b>height</b> / <b>weight</b> (and <b>date of birth</b> + <b>sex</b>) in <b>Settings</b> to see growth charts and CDC percentiles.
          </div>
        </Card>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            {lastH && <KPI val={lastH.v + " cm"} lbl="Height" color={c.blue} />}
            {lastW && <KPI val={lastW.v + " kg"} lbl="Weight" color={c.amber} />}
            {lastBMI && <KPI val={lastBMI} lbl="BMI" color={c.green} />}
          </div>

          {missingProfile ? (
            <Card style={warnStyle}>
              <div style={{ color: c.amber, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                ⚠️ Add <b>date of birth</b>{!sex ? " & " : ""}{!sex ? <b>sex</b> : ""} in Settings to see CDC percentile curves. Showing raw measurements for now:
              </div>
              {hSeries.length > 1 && <MiniLine data={hSeries} color={c.blue} unit="cm" title="Height over time" />}
              {wSeries.length > 1 && <MiniLine data={wSeries} color={c.amber} unit="kg" title="Weight over time" />}
              {hSeries.length <= 1 && wSeries.length <= 1 && (
                <div style={{ color: c.dim, fontSize: 13 }}>Add at least two measurements to see a trend.</div>
              )}
            </Card>
          ) : (
            <>
              <PillRow active={metric} onPick={setMetric}
                items={[{ key: "stature", label: "Height" }, { key: "weight", label: "Weight" }, { key: "bmi", label: "BMI" }]} />
              <Card>
                {!pts.length ? (
                  <div style={{ color: c.dim, fontSize: 13 }}>No {meta.label.toLowerCase()} measurements in the 5–19y range yet — add some in Settings.</div>
                ) : (
                  <>
            {cur && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: meta.color }}>{ordinal(cur.pctl)}</span>
                <span style={{ color: c.dim, fontSize: 13 }}> percentile · {meta.label} {last.value}{meta.unit ? " " + meta.unit : ""} at age {last.age.toFixed(1)}</span>
              </div>
            )}
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={bandData} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke={c.line} />
                  <XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} tick={{ fill: c.dim, fontSize: 10 }}
                    tickFormatter={(v) => v + "y"} allowDecimals />
                  <YAxis tick={{ fill: c.dim, fontSize: 10 }} width={40} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={tooltipStyle(c)} labelFormatter={(v) => "Age " + v + "y"} />
                  {PCTL_BANDS.map((b) => (
                    <Line key={b} dataKey={"p" + b} stroke={b === 50 ? c.dim : c.line} strokeWidth={b === 50 ? 2 : 1}
                      strokeDasharray={b === 50 ? "5 4" : undefined} dot={false} isAnimationActive={false} name={b + "th"} />
                  ))}
                  <Scatter data={pts} dataKey="value" fill={meta.color} line={{ stroke: meta.color, strokeWidth: 3 }}
                    isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 11, color: c.dim, textAlign: "center", marginTop: 6 }}>
              Grey curves = CDC 3/10/25/50/75/90/97th percentiles · dashed = median · colored = {swimmer?.name}
            </div>
          </>
        )}
              </Card>

              {corr && corr.cm >= 1 && (
                <Card style={{ display: "flex", gap: 12, alignItems: "flex-start", borderLeft: `4px solid ${c.green}` }}>
                  <div style={{ fontSize: 22 }}>📈</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Growth vs performance</div>
                    <div style={{ fontSize: 12.5, color: c.dim, marginTop: 3, lineHeight: 1.5 }}>
                      Fastest growth: <b>+{corr.cm.toFixed(1)} cm</b> between age {corr.a0.toFixed(1)} and {corr.a1.toFixed(1)} —
                      {corr.pbs > 0 ? ` ${corr.pbs} personal best${corr.pbs !== 1 ? "s" : ""} set during that period.` : " no PBs recorded in that window."}
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
const INSIGHT_COLOR = { green: "green", blue: "blue", amber: "amber", red: "red" };
function HomeTab({ D, swimmer }) {
  const { c, s } = useUI();
  const ss = seasons(D);
  const ar = allResults(D);
  const pbKeys = useMemo(() => computePBTimeline(D), [D]);
  const totalPBs = ar.filter((r) => pbKeys.has(r.event + "|" + poolNorm(r.pool) + "|" + (r.date || "") + "|" + r.seconds)).length;
  const bestPoints = ar.reduce((m, r) => Math.max(m, r.points || 0), 0);
  const comps = new Set(ar.map((r) => (r.competition || "") + "|" + (r.date || ""))).size;
  const age = swimmer?.birthdate ? getAgeAt(swimmer.birthdate, "") : null;
  const ins = useMemo(() => insights(D), [D]);
  const recent = ar.slice().sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0)).slice(0, 10);
  const [shareMsg, setShareMsg] = useState("");
  async function onShare() {
    setShareMsg("Preparing…");
    const r = await shareProgress(swimmer, D);
    setShareMsg(r === "shared" ? "Shared!" : r === "fallback" ? "Opened WhatsApp + saved image" : "");
    if (r) setTimeout(() => setShareMsg(""), 3000);
  }

  return (
    <div style={s.pad}>
      <Card style={{ background: GRAD, border: "none" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{swimmer?.name}</div>
            <div style={{ color: "rgba(255,255,255,.85)", fontSize: 13, marginTop: 4 }}>
              ID {swimmer?.id}{age ? ` · Age ${Math.floor(age)} · ${ageGroupLabel(age)}` : ""}
            </div>
          </div>
          <button onClick={onShare} style={{ flexShrink: 0, background: "rgba(255,255,255,.18)", color: "#fff",
            border: "1px solid rgba(255,255,255,.35)", borderRadius: 10, padding: "8px 12px", fontSize: 13,
            fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📤 Share</button>
        </div>
        {shareMsg && <div style={{ color: "#fff", fontSize: 12, marginTop: 8, opacity: .9 }}>{shareMsg}</div>}
        <div style={{ display: "flex", gap: 18, marginTop: 16 }}>
          <Stat n={ss.length} l={"Season" + (ss.length !== 1 ? "s" : "")} />
          <Stat n={ar.length} l="Swims" />
          {ss.length > 1 && <Stat n={`${ss[0].slice(2, 4)}→${ss[ss.length - 1].slice(2, 4)}`} l="Range" />}
        </div>
      </Card>

      <div style={{ display: "flex", gap: 10 }}>
        <KPI val={totalPBs} lbl="Personal Bests" color={c.amber} />
        <KPI val={bestPoints || "—"} lbl="Best Points" color={c.green} />
        <KPI val={comps} lbl="Competitions" color={c.blue} />
      </div>

      {/* CDC growth percentiles only apply to ages 5–19 — skip for adults. */}
      {(age == null || age <= CDC_AGE_MAX) && <GrowthPercentile swimmer={swimmer} D={D} />}

      {ins.length > 0 && <>
        <div style={s.h2}>Insights</div>
        {ins.map((it, i) => (
          <div key={i} style={{ ...s.card, display: "flex", gap: 12, alignItems: "flex-start",
            borderLeft: `4px solid ${c[INSIGHT_COLOR[it.type]] || c.blue}` }}>
            <div style={{ fontSize: 22 }}>{it.ico}</div>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>{it.title}</div>
              {it.text && <div style={{ fontSize: 12.5, color: c.dim, marginTop: 3, lineHeight: 1.5 }}>{it.text}</div>}</div>
          </div>
        ))}
      </>}

      <div style={s.h2}>Recent swims</div>
      <Card style={{ padding: 6 }}>
        {recent.length === 0 && <div style={{ color: c.dim, padding: 14 }}>No results yet.</div>}
        {recent.map((r, i) => {
          const isPB = pbKeys.has(r.event + "|" + poolNorm(r.pool) + "|" + (r.date || "") + "|" + r.seconds);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px",
              borderBottom: i < recent.length - 1 ? `1px solid ${c.line}` : "none" }}>
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: getStrokeColor(r.event) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {isPB && <span style={{ color: c.amber }}>🏅 </span>}{r.event}</div>
                <div style={{ fontSize: 11.5, color: c.dim }}>{fmtDateShort(parseDate(r.date))} · {poolNorm(r.pool)}m{r.competition ? " · " + r.competition : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{fmtT(r.seconds)}</div>
                {r.points ? <div style={{ fontSize: 11, color: c.dim }}>{r.points} pts</div> : null}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  MEETS (Competitions)
// ════════════════════════════════════════════════════════════════════
function MeetsTab({ D, swimmer }) {
  const { c, s } = useUI();
  const { metrics, list } = useMemo(() => competitions(D), [D]);
  const pbKeys = useMemo(() => computePBTimeline(D), [D]);
  const ss = seasons(D);
  const [season, setSeason] = useState(() => ss[ss.length - 1] || "all");
  const shown = season === "all" ? list : list.filter((m) => m.season === season);

  return (
    <div style={s.pad}>
      <div style={s.h2}>Competitions</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
        <KPI val={metrics.totalComps} lbl="Meets" color={c.blue} />
        <KPI val={metrics.totalSwims} lbl="Swims" />
        <KPI val={metrics.avgEv} lbl="Avg / meet" color={c.green} />
      </div>
      {metrics.busiestName && (
        <Card style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 10.5, color: c.dim, fontWeight: 700, textTransform: "uppercase" }}>Busiest meet</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>{metrics.busiestName} <span style={{ color: c.dim, fontWeight: 400 }}>· {metrics.busiestCount} events</span></div>
        </Card>
      )}

      <PillRow label="Season" active={season} onPick={setSeason}
        items={[{ key: "all", label: "All" }, ...ss.map((x) => ({ key: x, label: x }))]} />

      {shown.length === 0 && <Card><div style={{ color: c.dim }}>No competition data for this filter.</div></Card>}
      {shown.map((m, i) => {
        const ageAt = swimmer?.birthdate ? Math.floor(getAgeAt(swimmer.birthdate, m.date) || 0) : null;
        return (
          <Card key={i} style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: c.dim, whiteSpace: "nowrap" }}>{m.date}</div>
            </div>
            <div style={{ fontSize: 11, color: c.dim, marginBottom: 8 }}>
              {m.season}{ageAt ? " · Age " + ageAt : ""} · {m.eventList.length} events
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {m.eventList.map((e, j) => {
                const isPB = pbKeys.has(e.event + "|" + (e.pool || "") + "|" + (m.date || "") + "|" + e.seconds);
                const col = getStrokeColor(e.event);
                return (
                  <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11,
                    border: `1.5px solid ${isPB ? c.amber : col + "55"}`, color: col, background: c.card2,
                    borderRadius: 7, padding: "3px 8px", whiteSpace: "nowrap" }}>
                    {e.event}{e.pool ? " " + e.pool + "m" : ""}{e.time ? " · " : ""}
                    {e.time && <strong style={{ color: c.text }}>{e.time}</strong>}
                    {isPB && <span style={{ background: c.amber, color: "#1a1a1a", fontSize: 9, fontWeight: 800, borderRadius: 3, padding: "0 4px" }}>PB</span>}
                  </span>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  PROGRESS (filtered event picker + line chart + points trend)
// ════════════════════════════════════════════════════════════════════
function ProgressTab({ D, swimmer, rudolphDoc, usaStandardsDoc }) {
  const { c, s } = useUI();
  const catalog = useMemo(() => eventCatalog(D), [D]);
  const dists = useMemo(() => Array.from(new Set(catalog.map((e) => e.dist))).filter(Boolean).sort((a, b) => a - b), [catalog]);

  const [pool, setPool] = useState("25");
  const [stroke, setStroke] = useState("all");
  const [dist, setDist] = useState("all");

  const filtered = catalog.filter((e) =>
    (pool === "all" || e.pool === pool) &&
    (stroke === "all" || e.stroke === stroke) &&
    (dist === "all" || e.dist === +dist));

  const [key, setKey] = useState(null);
  const activeKey = key && filtered.some((e) => e.key === key) ? key : (filtered[0]?.key || null);
  useEffect(() => { if (activeKey !== key) setKey(activeKey); }, [activeKey]); // keep selection valid

  const series = useMemo(() => (activeKey ? eventSeries(D, activeKey) : []), [D, activeKey]);
  const [evName, evPool] = (activeKey || "|").split("|");
  const improved = series.length >= 2 ? series[0].t - series[series.length - 1].t : 0;
  const color = getStrokeColor(evName);

  return (
    <div style={s.pad}>
      <div style={s.h2}>Progress by Event</div>

      <PillRow label="Pool" active={pool} onPick={setPool}
        items={[{ key: "all", label: "All" }, { key: "25", label: "25m SC" }, { key: "50", label: "50m LC" }]} />
      <PillRow label="Stroke" active={stroke} onPick={setStroke}
        items={[{ key: "all", label: "All" }, ...STROKES.map((st) => ({ key: st, label: st, color: STROKE_COLORS[st] }))]} />
      {dists.length > 1 && (
        <PillRow label="Dist" active={dist} onPick={setDist}
          items={[{ key: "all", label: "All" }, ...dists.map((d) => ({ key: String(d), label: d + "m" }))]} />
      )}

      <div style={{ fontSize: 11, color: c.dim, margin: "2px 4px 6px" }}>{filtered.length} event(s) match — pick one:</div>
      <PillRow active={activeKey} onPick={setKey}
        items={filtered.map((e) => ({ key: e.key, label: e.event + " · " + e.pool + "m" }))} />

      <Card>
        {!activeKey ? <Center>No events match these filters.</Center> : <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{evName} <span style={{ color: c.dim, fontSize: 13 }}>{evPool}m</span></div>
            {series.length >= 2 && (
              <div style={{ fontSize: 13, fontWeight: 800, color: improved > 0 ? c.green : c.red }}>
                {improved > 0 ? "▼ " : "▲ "}{Math.abs(improved).toFixed(2)}s
              </div>
            )}
          </div>
          <div style={{ height: 240 }}>
            {series.length < 2 ? <Center>Not enough data for this event.</Center> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 6, right: 10, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke={c.line} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: c.dim, fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: c.dim, fontSize: 10 }} tickFormatter={fmtT} width={50} />
                  <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [fmtT(v), "Time"]} labelStyle={{ color: c.dim }} />
                  <Line type="monotone" dataKey="t" stroke={color} strokeWidth={3} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ fontSize: 11, color: c.dim, textAlign: "center", marginTop: 6 }}>Lower = faster — the line drops as times improve</div>
        </>}
      </Card>

      <PointsTrend D={D} />
      <RudolphTrend D={D} swimmer={swimmer} rudolphDoc={rudolphDoc} />
      <UsaStandardsPanel D={D} swimmer={swimmer} usaStandardsDoc={usaStandardsDoc} />
    </div>
  );
}

function PointsTrend({ D }) {
  const { c, s } = useUI();
  const [pool, setPool] = useState("25");
  const [event, setEvent] = useState("all");
  const tr = useMemo(() => pointsTrend(D, { pool: pool === "all" ? null : pool, event: event === "all" ? null : event }), [D, pool, event]);
  const evColor = {}; tr.events.forEach((e, i) => (evColor[e] = COLORS[i % COLORS.length]));

  // attach trend-line y to each point (linear between endpoints)
  const data = tr.points.slice().sort((a, b) => a.x - b.x).map((p) => {
    let ty = null;
    if (tr.trend) { const [a, b] = tr.trend; ty = a.y + (b.y - a.y) * ((p.x - a.x) / (b.x - a.x || 1)); }
    return { ...p, ty };
  });

  return (
    <>
      <div style={s.h2}>Points Trend</div>
      <PillRow label="Pool" active={pool} onPick={setPool}
        items={[{ key: "all", label: "All" }, { key: "25", label: "25m" }, { key: "50", label: "50m" }]} />
      <PillRow label="Event" active={event} onPick={setEvent}
        items={[{ key: "all", label: "All" }, ...tr.events.map((e) => ({ key: e, label: e }))]} />
      <Card>
        <div style={{ height: 250 }}>
          {data.length < 2 ? <Center>Not enough points data.</Center> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={c.line} vertical={false} />
                <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} scale="time"
                  tickFormatter={(v) => fmtDateShort(v)} tick={{ fill: c.dim, fontSize: 10 }} />
                <YAxis tick={{ fill: c.dim, fontSize: 10 }} width={36} />
                <Tooltip contentStyle={tooltipStyle(c)} cursor={{ stroke: c.dim, strokeDasharray: "3 3", strokeWidth: 1, fill: "none" }}
                  labelFormatter={(v) => fmtDateShort(v)}
                  formatter={(v, _n, p) => {
                    if (p.dataKey !== "y") return null;
                    const d = p.payload;
                    return [
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: evColor[d.event] || c.blue, flex: "none" }} />
                        {d.event || ""}{d.time ? " · " + d.time : ""} · {v} pts
                      </span>,
                    ];
                  }} />
                {tr.trend && <Line dataKey="ty" stroke={c.dim} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
                <Scatter dataKey="y" isAnimationActive={false}>
                  {data.map((p, i) => <Cell key={i} fill={evColor[p.event] || c.blue} />)}
                </Scatter>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div style={{ fontSize: 11, color: c.dim, textAlign: "center", marginTop: 6 }}>Each dot = one swim · dashed line = overall trend</div>
      </Card>
    </>
  );
}

// Rudolph age-graded score trend — same shape as Points Trend, but each swim
// is scored 1-20 against Dr. Klaus Rudolph's German age-graded table for the
// swimmer's actual age on that swim date, so progress is comparable across
// age-group jumps (unlike the absolute FINA-style points above).
function RudolphTrend({ D, swimmer, rudolphDoc }) {
  const { c, s } = useUI();
  const [event, setEvent] = useState("all");
  const [showInfo, setShowInfo] = useState(false);
  const table = rudolphDoc && rudolphDoc.table;
  const sex = swimmer && swimmer.sex;
  const birthdate = swimmer && swimmer.birthdate;
  const currentAge = birthdate ? getAgeAt(birthdate) : null;
  // Rudolph's table is calibrated for long course (50m) only — 25m times are
  // systematically faster (more turns) and would score inflated/wrong here.
  const tr = useMemo(
    () => (table && birthdate ? rudolphTrend(D, table, sex, birthdate, { pool: "50", event: event === "all" ? null : event }) : { points: [], byEvent: {}, trend: null, events: [] }),
    [D, table, sex, birthdate, event]
  );
  const evColor = {}; tr.events.forEach((e, i) => (evColor[e] = COLORS[i % COLORS.length]));

  const data = tr.points.slice().sort((a, b) => a.x - b.x).map((p) => {
    let ty = null;
    if (tr.trend) { const [a, b] = tr.trend; ty = a.y + (b.y - a.y) * ((p.x - a.x) / (b.x - a.x || 1)); }
    return { ...p, ty };
  });

  // The table is aimed at youth development — not meaningful for adult swimmers.
  if (currentAge != null && currentAge > 20) return null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={s.h2}>Age Score (Rudolph)</div>
        <button onClick={() => setShowInfo(true)} title="What is the Rudolph score?"
          style={{ width: 26, height: 26, borderRadius: 999, border: `1px solid ${c.line}`, background: c.card2, color: c.dim, fontSize: 15, fontWeight: 800, lineHeight: "24px", padding: 0, cursor: "pointer" }}>?</button>
      </div>
      {showInfo && (
        <InfoModal title="What is the Rudolph score?" onClose={() => setShowInfo(false)}>
          <p style={{ margin: "0 0 10px" }}>
            The <strong>Rudolph table</strong> is a German age-graded scoring system (Dr. Klaus Rudolph) that turns a
            swim time into a <strong>1-20 point score</strong> — separately calibrated for every age (8 through 18+)
            and event.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            Unlike the regular Points Trend above (which is an absolute scale, so a 10-year-old can never score as
            high as a 16-year-old), the Rudolph score asks <em>"how good was this swim for this swimmer's age
            group?"</em> — so it stays meaningful as a swimmer moves through age groups, and lets swimmers of
            different ages be compared fairly.
          </p>
          <p style={{ margin: 0 }}>
            Each dot below is one swim, scored against the table for the swimmer's age group that swim counted
            toward (same age-group convention as elsewhere in the app — the calendar year of the swim minus birth
            year), not their exact age-in-years on that specific day. The dashed line is the overall trend. The
            table is only calibrated for <strong>long course (50m)</strong> — short course (25m) times aren't shown
            here since they'd score inflated against a 50m table.
          </p>
        </InfoModal>
      )}
      {!table ? (
        <Card><Center>Rudolph table not published yet — load it from the desktop app's Extract tab.</Center></Card>
      ) : !birthdate || !sex ? (
        <Card><Center>Set birthdate and sex in Settings to see the age score.</Center></Card>
      ) : (
        <>
          <div style={{ fontSize: 11, color: c.dim, margin: "0 4px 6px" }}>Long course (50m) only</div>
          <PillRow label="Event" active={event} onPick={setEvent}
            items={[{ key: "all", label: "All" }, ...tr.events.map((e) => ({ key: e, label: e }))]} />
          <Card>
            <div style={{ height: 250 }}>
              {data.length < 2 ? <Center>Not enough data to score against the Rudolph table.</Center> : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke={c.line} vertical={false} />
                    <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} scale="time"
                      tickFormatter={(v) => fmtDateShort(v)} tick={{ fill: c.dim, fontSize: 10 }} />
                    <YAxis tick={{ fill: c.dim, fontSize: 10 }} width={36} />
                    <Tooltip contentStyle={tooltipStyle(c)} cursor={{ stroke: c.dim, strokeDasharray: "3 3", strokeWidth: 1, fill: "none" }}
                      labelFormatter={(v) => fmtDateShort(v)}
                      formatter={(v, _n, p) => {
                        if (p.dataKey !== "y") return null;
                        const d = p.payload;
                        return [
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: evColor[d.event] || c.blue, flex: "none" }} />
                            {d.event || ""}{d.time ? " · " + d.time : ""} · {v} score{d.age ? " · age " + d.age : ""}
                          </span>,
                        ];
                      }} />
                    {tr.trend && <Line dataKey="ty" stroke={c.dim} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
                    <Scatter dataKey="y" isAnimationActive={false}>
                      {data.map((p, i) => <Cell key={i} fill={evColor[p.event] || c.blue} />)}
                    </Scatter>
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            <div style={{ fontSize: 11, color: c.dim, textAlign: "center", marginTop: 6 }}>1-20 scale, age-adjusted — how good each swim was for the swimmer's age that day</div>
          </Card>
        </>
      )}
    </>
  );
}

const USA_TIER_LABELS = ["—", ...USA_TIERS];

function UsaTierTable({ rows, c }) {
  if (!rows.length) return null;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 12 }}>
      <tbody>
        {rows.slice(0, 5).map((r, i) => (
          <tr key={i}>
            <td style={{ padding: "4px 6px", color: c.text }}>{r.event}</td>
            <td style={{ padding: "4px 6px", color: c.dim, textAlign: "right" }}>{r.time}</td>
            <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: c.blue }}>
              {USA_TIER_LABELS[r.tier]}{r.plus ? "+" : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UsaRadarCard({ title, tierMap, rows, color, c }) {
  const data = USA_STROKES.map((s) => ({ stroke: s, tier: tierMap[s] || 0 }));
  return (
    <Card>
      <div style={{ fontSize: 12, color: c.dim, textAlign: "center", marginBottom: 6, fontWeight: 700 }}>{title}</div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke={c.line} />
            <PolarAngleAxis dataKey="stroke" tick={{ fill: c.text, fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 6]} tickCount={7} tick={{ fill: c.dim, fontSize: 9 }}
              tickFormatter={(v) => USA_TIER_LABELS[v] || ""} />
            <Radar dataKey="tier" stroke={color} fill={color} fillOpacity={0.25} isAnimationActive={false} />
            <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => USA_TIER_LABELS[v] || "—"} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <UsaTierTable rows={rows} c={c} />
    </Card>
  );
}

function UsaStandardsPanel({ D, swimmer, usaStandardsDoc }) {
  const { c, s } = useUI();
  const [showInfo, setShowInfo] = useState(false);
  const [selAge, setSelAge] = useState(null);
  const table = usaStandardsDoc && usaStandardsDoc.table;
  const sex = swimmer && swimmer.sex;
  const birthdate = swimmer && swimmer.birthdate;
  // Age GROUP (calendar year − birth year) — same convention as Records/Rudolph,
  // not exact birthday age, since USA age-group standards are organised by age
  // group (a swimmer already in age-13 competition still shows "Age 13" here
  // even before their birthday).
  const ageInt = birthdate ? Math.floor(recordAge(birthdate, null)) : null;
  const ages = ageInt != null ? Array.from({ length: Math.max(0, ageInt - 10 + 1) }, (_, i) => 10 + i) : [];
  const activeAge = selAge != null && ages.includes(selAge) ? selAge : ageInt;

  const data = useMemo(
    () => (table && birthdate && activeAge != null ? usaStandardsForAge(D, table, sex, birthdate, activeAge) : null),
    [D, table, sex, birthdate, activeAge]
  );

  if (ageInt == null || ageInt < 10 || ageInt > 18) return null; // standards cover ages 10-18 only

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <div style={s.h2}>USA Age Group Standards</div>
        <button onClick={() => setShowInfo(true)} title="What are the USA Motivational Standards?"
          style={{ width: 26, height: 26, borderRadius: 999, border: `1px solid ${c.line}`, background: c.card2, color: c.dim, fontSize: 15, fontWeight: 800, lineHeight: "24px", padding: 0, cursor: "pointer" }}>?</button>
      </div>
      {showInfo && (
        <InfoModal title="USA Motivational Standards" onClose={() => setShowInfo(false)}>
          <p style={{ margin: "0 0 10px" }}>
            USA Swimming's junior age-group tiers — <strong>B / BB / A / AA / AAA / AAAA</strong> — rank a time
            against swimmers of the same age and sex nationally: roughly <strong>B</strong> top 55%,{" "}
            <strong>BB</strong> top 35%, <strong>A</strong> top 15%, <strong>AA</strong> top 8%,{" "}
            <strong>AAA</strong> top 6%, <strong>AAAA</strong> top 2%.
          </p>
          <p style={{ margin: 0 }}>
            Pick an age below to see progress over time, using the best time actually swum while in that age group
            (same age-group convention used elsewhere in the app). Each event is judged against its own course
            (25m → SCM table, 50m → LCM table). A "+" after a tier means the time is well inside that tier's range,
            closer to the next one up.
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: c.dim }}>
            Source: <a href="https://www.usaswimming.org/times/time-standards" target="_blank" rel="noopener" style={{ color: c.blue }}>usaswimming.org/times/time-standards</a>
          </p>
        </InfoModal>
      )}
      {!table ? (
        <Card><Center>USA standards not published yet — load them from the desktop app's Extract tab.</Center></Card>
      ) : !birthdate || !sex ? (
        <Card><Center>Set birthdate and sex in Settings to see standards.</Center></Card>
      ) : (
        <>
          <PillRow label="Age" active={activeAge} onPick={setSelAge}
            items={ages.map((a) => ({ key: a, label: "Age " + a }))} />
          <UsaRadarCard title="Short (50-100)" tierMap={data.shortTier} rows={data.shortRows} color={c.blue} c={c} />
          <UsaRadarCard title="Long (200+)" tierMap={data.longTier} rows={data.longRows} color={c.green} c={c} />
        </>
      )}
    </>
  );
}

// Small centered modal for short explanatory text (used by the "?" info buttons).
function InfoModal({ title, children, onClose }) {
  const { c } = useUI();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: c.card, borderRadius: 14, padding: "18px 20px", maxWidth: 420, width: "100%", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,.35)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 16, color: c.text }}>{title}</div>
          <button onClick={onClose} style={{ background: c.card2, border: `1px solid ${c.line}`, color: c.text, borderRadius: 999, width: 30, height: 30, fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: c.text }}>{children}</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  RECORDS (+ SC vs LC)
// ════════════════════════════════════════════════════════════════════
const GOLD = "#e0a52a";
function RecordsTab({ D, swimmer, recordsDoc, mastersRecordsDoc }) {
  const { c, s } = useUI();
  const [pool, setPool] = useState("25");
  const [showBrowser, setShowBrowser] = useState(false);
  const recs = useMemo(() => personalRecords(D, pool), [D, pool]);
  const sclc = useMemo(() => scLc(D), [D]);
  const clsColor = { good: c.green, warn: c.amber, bad: c.red };

  const records = recordsDoc && recordsDoc.records;
  const sex = sexNorm(swimmer && swimmer.sex);
  // Israeli age groups use year-end age (age on Dec 31 of the year).
  const age = swimmer && swimmer.birthdate ? recordAge(swimmer.birthdate) : null;
  const cat = recordCategory(age);
  const groupLabel = cat === "open" ? "National/Open" : cat ? "Age " + cat : null;
  const myName = swimmer && swimmer.recordName;
  // Israeli records >6 months old → gentle staleness note.
  const stale = recordsDoc && recordsDoc.loadedAt && (Date.now() - recordsDoc.loadedAt > 182 * 864e5);
  // Best time per event in EACH age group the swimmer swam it (year-end age). We
  // lead with the CURRENT group's best (what counts for this group's record) and
  // list earlier groups below.
  const byGroup = useMemo(
    () => (records && cat && swimmer && swimmer.birthdate) ? bestsByAgeGroup(D, pool, swimmer.birthdate) : {},
    [D, pool, records, cat, swimmer && swimmer.birthdate]
  );
  const shortCat = (k) => catLabel(k).replace("Masters ", "").replace("Age ", "");
  // Every record this swimmer holds, across all age groups (permanent achievements).
  const held = useMemo(() => (records && myName ? recordsHeldBy(records, myName) : []), [records, myName]);
  // Records the swimmer holds in the CURRENT group for THIS pool that aren't in the
  // loglig data at all (e.g. set at an international meet) — add them as rows too.
  const HE_STROKE = { Free: "חופשי", Back: "גב", Breast: "חזה", Fly: "פרפר", IM: "מעורב" };
  const listRows = useMemo(() => {
    const extra = [];
    if (records && sex && cat && myName) {
      const inList = new Set(recs.map((r) => recordKey(r.event)).filter(Boolean));
      const m = ((records[pool] || {})[sex] || {})[cat] || {};
      Object.keys(m).forEach((k) => {
        if (nameMatch(m[k].name, myName) && !inList.has(k)) {
          const [d, st] = k.split("|");
          extra.push({ event: d + " " + (HE_STROKE[st] || st), seconds: m[k].sec });
        }
      });
    }
    return [...recs, ...extra].sort((a, b) => extractDist(a.event) - extractDist(b.event) || getStroke(a.event).localeCompare(getStroke(b.event)));
  }, [recs, records, sex, cat, pool, myName]);

  return (
    <div style={s.pad}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={s.h2}>Personal Records</div>
        {records && <button onClick={() => setShowBrowser(true)} style={{ background: c.blue, border: "none", color: "#fff", borderRadius: 999, padding: "5px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📖 All records</button>}
      </div>
      <PillRow active={pool} onPick={setPool} items={[{ key: "25", label: "🏊 25m Pool" }, { key: "50", label: "🏊 50m Pool" }]} />

      {!records && <Card style={{ borderColor: c.amber }}><div style={{ fontSize: 12.5, color: c.dim }}>Israeli records not published yet — load them in the desktop app to see gaps.</div></Card>}
      {records && (!sex || !cat) && <Card style={{ borderColor: c.amber }}><div style={{ fontSize: 12.5, color: c.dim }}>Add {swimmer && swimmer.name}'s <strong>sex</strong> and <strong>birthdate</strong> in Settings to see the gap to each age record.</div></Card>}
      {records && sex && cat && (
        <div style={{ fontSize: 11.5, color: c.dim, margin: "0 4px 8px" }}>
          Gaps vs <strong>{groupLabel}</strong> records ({sex === "F" ? "girls/women" : "boys/men"}, age group by year-end age).
          {stale && <span style={{ color: c.amber }}> · ⚠ records over 6 months old</span>}
        </div>
      )}

      <Card style={{ padding: 6 }}>
        {listRows.length === 0 && <div style={{ color: c.dim, padding: 14 }}>No {pool}m records.</div>}
        {listRows.map((r, i) => {
          const rec = lookupRecord(records, sex, age, pool, r.event);
          const groups = byGroup[r.event] || [];
          const curBest = groups.find((g) => g.cat === cat) || null;   // best in the current age group
          const prev = groups.filter((g) => g.cat !== cat).slice().reverse(); // earlier groups, most-recent first
          // Compare on the current-age-group best (what actually counts for this record).
          const gap = rec && curBest ? +(curBest.seconds - rec.sec).toFixed(2) : null;
          const pct = gap != null ? +((gap / rec.sec) * 100).toFixed(1) : null;
          const nameOwn = !!rec && myName && nameMatch(rec.name, myName);
          const tiesRec = !!(rec && curBest && Math.abs(curBest.seconds - rec.sec) <= 0.005);
          const beatsRec = !!(rec && curBest && curBest.seconds < rec.sec - 0.005);
          const holdsIt = nameOwn || tiesRec;
          const own = holdsIt || beatsRec;
          // If he holds the record, his true in-group best IS the record time — which
          // may be an international swim missing from loglig. Use it as the headline
          // unless a documented time is actually faster.
          const headSec = (holdsIt && rec) ? (curBest ? Math.min(curBest.seconds, rec.sec) : rec.sec) : (curBest ? curBest.seconds : r.seconds);
          const headFromRecord = holdsIt && rec && (!curBest || rec.sec < curBest.seconds - 0.005);
          return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 10px",
            background: own ? hexA(GOLD, 0.12) : "transparent", borderRadius: own ? 8 : 0,
            borderBottom: i < listRows.length - 1 ? `1px solid ${c.line}` : "none" }}>
            <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: own ? GOLD : getStrokeColor(r.event) }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{own ? "🏅 " : ""}{r.event}
                {cat && !curBest && !holdsIt && <span style={{ fontSize: 11, color: c.dim, fontWeight: 400 }}> · no {groupLabel} time yet</span>}</div>
              {!records && <div style={{ fontSize: 11.5, color: c.dim }}>{fmtDateShort(parseDate(r.date))}{r.competition ? " · " + r.competition : ""}</div>}
              {rec && <div style={{ fontSize: 11, color: c.dim, marginTop: 2 }}>{groupLabel} record: {fmtT(rec.sec)} · {rec.name}</div>}
              {headFromRecord && <div style={{ fontSize: 10.5, color: GOLD, marginTop: 2 }}>★ record time — not in the meet data (e.g. international meet)</div>}
              {prev.length > 0 && <div style={{ fontSize: 10.5, color: c.dim, marginTop: 2, opacity: 0.85 }}>Earlier: {prev.map((g) => shortCat(g.cat) + " " + g.time).join(" · ")}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: (curBest || holdsIt) ? c.amber : c.dim }}>{fmtT(headSec)}</div>
              {rec && (holdsIt
                ? <div style={{ fontSize: 11, fontWeight: 800, color: GOLD }}>🏅 You hold this!</div>
                : beatsRec
                  ? <div style={{ fontSize: 11, fontWeight: 800, color: c.green }}>🏅 faster than record!</div>
                  : gap == null
                    ? null
                    : <div style={{ fontSize: 11, fontWeight: 700, color: pct <= 5 ? c.green : pct <= 15 ? c.amber : c.red }}>+{gap}s · {pct}%</div>)}
            </div>
          </div>
        ); })}
      </Card>
      {held.length > 0 && (
        <>
          <div style={s.h2}>🏅 Records Held ({held.length})</div>
          <Card style={{ padding: 6, borderColor: GOLD }}>
            {held.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: i < held.length - 1 ? `1px solid ${c.line}` : "none" }}>
                <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: GOLD }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.dist} {r.stroke}</div>
                  <div style={{ fontSize: 11, color: c.dim }}>{catLabel(r.cat)} · {r.pool}m {r.sex === "F" ? "♀" : "♂"}{r.date ? " · " + r.date : ""}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: GOLD }}>{fmtT(r.sec)}</div>
              </div>
            ))}
          </Card>
        </>
      )}
      {showBrowser && <AllRecordsModal records={records} defaultPool={pool} defaultSex={sex} myName={myName} onClose={() => setShowBrowser(false)} />}

      <div style={s.h2}>Short Course vs Long Course</div>
      <div style={{ fontSize: 11.5, color: c.dim, margin: "0 4px 8px" }}>Expected SC gain ≈ 1.5s per 50m. Green = on target.</div>
      {sclc.length === 0 ? <Card><div style={{ color: c.dim }}>Need events swum in both 25m and 50m to compare.</div></Card> : (
        <Card style={{ padding: 6 }}>
          {sclc.map((r, i) => (
            <div key={i} style={{ padding: "10px", borderBottom: i < sclc.length - 1 ? `1px solid ${c.line}` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.event}</div>
                <span style={{ fontSize: 11, fontWeight: 800, color: clsColor[r.cls], border: `1px solid ${clsColor[r.cls]}`, borderRadius: 999, padding: "2px 8px" }}>
                  {r.gap >= 0 ? "+" : ""}{r.gap.toFixed(2)}s
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: c.dim, marginTop: 3 }}>
                25m {r.scTime} · 50m {r.lcTime} · actual Δ {r.actual >= 0 ? "+" : ""}{r.actual.toFixed(2)}s (exp +{r.exp.toFixed(2)}s) · {r.note}
              </div>
            </div>
          ))}
        </Card>
      )}

      <MastersWrPanel D={D} swimmer={swimmer} mastersRecordsDoc={mastersRecordsDoc} />
    </div>
  );
}

function MastersWrPanel({ D, swimmer, mastersRecordsDoc }) {
  const { c, s } = useUI();
  const [showInfo, setShowInfo] = useState(false);
  const [selGroup, setSelGroup] = useState(null);
  const table = mastersRecordsDoc && mastersRecordsDoc.table;
  const sex = swimmer && swimmer.sex;
  const birthdate = swimmer && swimmer.birthdate;
  const curAge = birthdate ? recordAge(birthdate, null) : null; // age GROUP, matching World Aquatics' own convention
  const curGroup = curAge != null ? wrAgeGroup(curAge) : null;
  const S = sexNorm(sex);

  // Only offer age groups this swimmer actually has results (and WR matches)
  // in — not every published bracket, and never a future one they haven't
  // reached yet.
  const rowsByGroup = useMemo(() => {
    if (!table || !S || !birthdate) return {};
    const map = {};
    wrAvailableGroups(table, S).forEach((g) => {
      const r = wrGapRows(table, S, g, D, birthdate);
      if (r.length) map[g] = r;
    });
    return map;
  }, [D, table, S, birthdate]);
  const groups = Object.keys(rowsByGroup).sort((a, b) => parseInt(a) - parseInt(b));
  const defaultGroup = groups.includes(curGroup) ? curGroup : groups[groups.length - 1];
  const activeGroup = groups.includes(selGroup) ? selGroup : defaultGroup;
  const rows = rowsByGroup[activeGroup] || [];
  const chartData = rows.map((r) => ({ name: r.event, pct: +r.pct.toFixed(1), mine: r.mine, wrTime: r.wrTime, athlete: r.athlete }));

  if (curAge == null || curAge <= 30) return null; // only meaningful for masters-age swimmers

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <div style={s.h2}>Distance to World Record</div>
        <button onClick={() => setShowInfo(true)} title="What are the Masters World Records?"
          style={{ width: 26, height: 26, borderRadius: 999, border: `1px solid ${c.line}`, background: c.card2, color: c.dim, fontSize: 15, fontWeight: 800, lineHeight: "24px", padding: 0, cursor: "pointer" }}>?</button>
      </div>
      {showInfo && (
        <InfoModal title="Distance to World Record" onClose={() => setShowInfo(false)}>
          <p style={{ margin: "0 0 10px" }}>
            World Aquatics Masters World Records — the fastest-ever time by 5-year age bracket (25-29 through
            105-109), both sexes, long course (LCM) and short course meters (SCM).
          </p>
          <p style={{ margin: 0 }}>
            Your best time <strong>actually swum while in that age bracket</strong> is compared against the record
            for it — each event judged against its own course (25m → SCM, 50m → LCM). Only brackets you have real
            results in are shown. Bars are colour-coded by how close you are: green ≤5%, yellow ≤8%, orange ≤10%,
            red ≤15%, black beyond that.
          </p>
        </InfoModal>
      )}
      {!table ? (
        <Card><Center>Masters world records not published yet — load them from the desktop app's Extract tab.</Center></Card>
      ) : !birthdate || !sex ? (
        <Card><Center>Set birthdate and sex in Settings to see the gap.</Center></Card>
      ) : !groups.length ? (
        <Card><Center>No results yet in any published age group.</Center></Card>
      ) : (
        <>
          <PillRow label="Bracket" active={activeGroup} onPick={setSelGroup}
            items={groups.map((g) => ({ key: g, label: g + (g === curGroup ? " (current)" : "") }))} />
          {chartData.length === 0 ? (
            <Card><Center>No matching events for this bracket yet.</Center></Card>
          ) : (
            <Card>
              <div style={{ height: Math.max(160, chartData.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 6, right: 16, top: 0, bottom: 0 }}>
                    <CartesianGrid stroke={c.line} horizontal={false} />
                    <XAxis type="number" tick={{ fill: c.dim, fontSize: 10 }} tickFormatter={(v) => "+" + v + "%"} />
                    <YAxis type="category" dataKey="name" width={104} tick={{ fill: c.dim, fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, _n, p) => [
                      `${p.payload.mine} vs WR ${p.payload.wrTime} (${p.payload.athlete}) · +${v}%`, "Gap",
                    ]} />
                    <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                      {chartData.map((d, i) => <Cell key={i} fill={wrGapColor(d.pct)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 11, color: c.dim, textAlign: "center", marginTop: 6 }}>% slower than the world record — top 5 closest events</div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

// Full-screen browser for every published record, with pool / sex / group / search filters.
function AllRecordsModal({ records, defaultPool, defaultSex, myName, onClose }) {
  const { c, s } = useUI();
  const cats = useMemo(() => recordCategories(records || {}), [records]);
  const [pool, setPool] = useState(defaultPool || "50");
  const [sex, setSex] = useState(defaultSex || "M");
  const [cat, setCat] = useState(cats.includes("open") ? "open" : cats[0] || "open");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const m = (((records || {})[pool] || {})[sex] || {})[cat] || {};
    const qn = q.trim().toLowerCase();
    return Object.keys(m).map((k) => ({ dist: +k.split("|")[0], stroke: k.split("|")[1], ...m[k] }))
      .filter((r) => !qn || (r.dist + " " + r.stroke).toLowerCase().includes(qn) || (r.name || "").toLowerCase().includes(qn))
      .sort((a, b) => STROKES.indexOf(a.stroke) - STROKES.indexOf(b.stroke) || a.dist - b.dist);
  }, [records, pool, sex, cat, q]);

  return (
    <div style={{ position: "fixed", inset: 0, background: c.bg, zIndex: 1000, display: "flex", flexDirection: "column", maxWidth: 540, margin: "0 auto" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${c.line}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16, color: c.text }}>All Israeli Records</div>
        <button onClick={onClose} style={{ background: c.card, border: `1px solid ${c.line}`, color: c.text, borderRadius: 999, width: 32, height: 32, fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${c.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["25", "50"].map((p) => <button key={p} onClick={() => setPool(p)} style={s.pill(pool === p)}>{p}m</button>)}
          <div style={{ width: 6 }} />
          <button onClick={() => setSex("F")} style={s.pill(sex === "F")}>♀ Women</button>
          <button onClick={() => setSex("M")} style={s.pill(sex === "M")}>♂ Men</button>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {cats.map((k) => <button key={k} onClick={() => setCat(k)} style={s.pill(cat === k)}>{catLabel(k)}</button>)}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 search event or name…" style={s.input} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px 24px" }}>
        {rows.length === 0 && <div style={{ color: c.dim, padding: 16 }}>No records match.</div>}
        {rows.map((r, i) => {
          const own = myName && nameMatch(r.name, myName);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", background: own ? hexA(GOLD, 0.12) : "transparent", borderRadius: own ? 8 : 0, borderBottom: `1px solid ${c.line}` }}>
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: own ? GOLD : (STROKE_COLORS[r.stroke] || c.blue) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{own ? "🏅 " : ""}{r.dist} {r.stroke}</div>
                <div style={{ fontSize: 11, color: c.dim }}>{r.name}{r.date ? " · " + r.date : ""}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: c.text }}>{fmtT(r.sec)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  SEASONS (improvement + recap)
// ════════════════════════════════════════════════════════════════════
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function HeatmapSection({ D }) {
  const { c, s } = useUI();
  const ss = seasons(D);
  const [season, setSeason] = useState(ss[ss.length - 1]);
  const hm = useMemo(() => eventHeatmap(D, season), [D, season]);
  const cols = `52px repeat(${hm ? hm.dists.length : 1}, 1fr)`;
  return (
    <>
      <div style={s.h2}>Event Coverage</div>
      <PillRow label="Season" active={season} onPick={setSeason} items={ss.map((x) => ({ key: x, label: x }))} />
      <Card>
        {!hm || !hm.strokes.length ? <div style={{ color: c.dim }}>No event data for this season.</div> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4, marginBottom: 4 }}>
              <div />
              {hm.dists.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10.5, color: c.dim, fontWeight: 700 }}>{d}m</div>)}
            </div>
            {hm.strokes.map((st) => (
              <div key={st} style={{ display: "grid", gridTemplateColumns: cols, gap: 4, marginBottom: 4, alignItems: "center" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: STROKE_COLORS[st] }}>{st}</div>
                {hm.dists.map((d) => {
                  const v = (hm.counts[st] && hm.counts[st][d]) || 0;
                  const a = v ? 0.22 + 0.78 * (v / hm.max) : 0;
                  return (
                    <div key={d} style={{ height: 34, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                      background: v ? hexA(STROKE_COLORS[st], a) : c.card2, border: `1px solid ${c.line}`,
                      color: v ? (a > 0.55 ? "#fff" : c.text) : c.dim, fontSize: 12.5, fontWeight: 700 }}>{v || ""}</div>
                  );
                })}
              </div>
            ))}
            <div style={{ fontSize: 11, color: c.dim, marginTop: 8 }}>Number = swims that season · darker = more · color = stroke</div>
          </>
        )}
      </Card>
    </>
  );
}

function SeasonsTab({ D, swimmer, recordsDoc }) {
  const { c, s } = useUI();
  const ss = seasons(D);
  const [from, setFrom] = useState(ss.length >= 2 ? ss[ss.length - 2] : ss[0]);
  const [to, setTo] = useState(ss[ss.length - 1]);
  const rows = useMemo(() => strokeImprovement(D, from, to), [D, from, to]);
  const chartData = rows.slice(0, 12).map((r) => ({ name: r.event + " " + r.pool + "m", pct: r.pct, ev: r.event }));
  const recap = useMemo(() => seasonRecap(D, swimmer), [D, swimmer]);
  const [openSeason, setOpenSeason] = useState(null);
  const [reportSeason, setReportSeason] = useState(null);

  return (
    <div style={s.pad}>
      <HeatmapSection D={D} />

      <div style={s.h2}>Improvement (From → To)</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <Select label="From" value={from} options={ss} onChange={setFrom} />
        <Select label="To" value={to} options={ss} onChange={setTo} />
      </div>
      {chartData.length > 0 && (
        <Card>
          <div style={{ height: Math.max(160, chartData.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 6, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid stroke={c.line} horizontal={false} />
                <XAxis type="number" tick={{ fill: c.dim, fontSize: 10 }} tickFormatter={(v) => v + "%"} />
                <YAxis type="category" dataKey="name" width={104} tick={{ fill: c.dim, fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [(v > 0 ? "+" : "") + v + "% " + (v >= 0 ? "faster" : "slower"), "Δ"]} />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.pct >= 0 ? getStrokeColor(d.ev) : c.line} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <Card style={{ padding: 6 }}>
        {rows.length === 0 && <div style={{ color: c.dim, padding: 14 }}>No comparable events.</div>}
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
            borderBottom: i < rows.length - 1 ? `1px solid ${c.line}` : "none" }}>
            <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: getStrokeColor(r.event) }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.event} <span style={{ color: c.dim, fontSize: 11 }}>{r.pool}m</span></div>
              <div style={{ fontSize: 11.5, color: c.dim }}>{r.fromT} → {r.toT}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 14, color: r.pct > 0 ? c.green : r.pct < 0 ? c.red : c.dim }}>
              {r.pct > 0 ? "▼ " : r.pct < 0 ? "▲ " : ""}{Math.abs(r.pct)}%
            </div>
          </div>
        ))}
      </Card>

      <div style={s.h2}>Season Recap</div>
      {recap.map((r) => (
        <Card key={r.season} style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button onClick={() => setOpenSeason(openSeason === r.season ? null : r.season)} style={{ flex: 1, textAlign: "left",
              display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", background: "transparent", border: "none",
              color: c.text, cursor: "pointer" }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: "#fff", background: c.blue, padding: "3px 10px", borderRadius: 999 }}>{r.season}</span>
              <span style={{ flex: 1, fontSize: 11.5, color: c.dim }}>{r.nMeets} meets · {r.nSwims} swims · {r.nPBs} PBs</span>
              <span style={{ color: c.dim }}>{openSeason === r.season ? "▴" : "▾"}</span>
            </button>
            <button onClick={() => setReportSeason(r.season)} title="Season report" style={{ background: "none", border: "none", color: c.blue, fontSize: 17, cursor: "pointer", padding: "0 14px" }}>🖨️</button>
          </div>
          {openSeason === r.season && (
            <div style={{ padding: "0 16px 16px" }}>
              {r.ageLabel && <div style={{ fontSize: 12, color: c.dim, marginBottom: 8 }}>{r.ageLabel}</div>}
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <KPI val={r.nMeets} lbl="Meets" /><KPI val={r.nSwims} lbl="Swims" /><KPI val={r.nPBs} lbl="PBs" color={c.amber} />
              </div>
              {r.bestPts && <div style={{ fontSize: 12.5, marginBottom: 6 }}><b>Top swim:</b> {r.bestPts.points} pts — {r.bestPts.event}{r.bestPts.time ? " · " + r.bestPts.time : ""}</div>}
              {r.impEv && <div style={{ fontSize: 12.5, marginBottom: 8 }}><b>Most improved:</b> {r.impEv} ({r.impPct.toFixed(1)}% faster)</div>}
              {r.pbEvs.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {r.pbEvs.map((e, j) => <span key={j} style={{ fontSize: 11, background: c.card2, border: `1px solid ${c.amber}`, color: c.amber, borderRadius: 6, padding: "2px 8px" }}>{e}</span>)}
              </div>}
            </div>
          )}
        </Card>
      ))}
      {reportSeason && <SeasonReport season={reportSeason} recap={recap.find((x) => x.season === reportSeason)} D={D} swimmer={swimmer} recordsDoc={recordsDoc} onClose={() => setReportSeason(null)} />}
    </div>
  );
}

// Printable one-page season report (opens full-screen; Print → Save as PDF).
function SeasonReport({ season, recap, D, swimmer, recordsDoc, onClose }) {
  const rep = useMemo(() => seasonEventReport(D, swimmer, recordsDoc, season), [D, swimmer, recordsDoc, season]);
  const r = recap || {};
  const hasRec = rep.events.some((e) => e.rec);
  const th = { textAlign: "left", padding: "5px 8px", color: "#64748b", fontWeight: 700, fontSize: 11, borderBottom: "2px solid #e2e8f0" };
  const td = { padding: "5px 8px", borderBottom: "1px solid #eef2f7" };
  return (
    <div id="season-report" style={{ position: "fixed", inset: 0, background: "#fff", color: "#0f172a", zIndex: 2000, overflowY: "auto" }}>
      <style>{`@media print { body * { visibility: hidden !important; } #season-report, #season-report * { visibility: visible !important; } #season-report { position: absolute !important; inset: 0; } .sr-noprint { display: none !important; } }`}</style>
      <div className="sr-noprint" style={{ position: "sticky", top: 0, display: "flex", gap: 10, padding: "12px 16px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ flex: 1, fontWeight: 800, color: "#0f3d72" }}>Season Report</div>
        <button onClick={() => window.print()} style={{ background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, cursor: "pointer" }}>🖨️ Print / Save PDF</button>
        <button onClick={onClose} style={{ background: "#e2e8f0", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "22px 26px 40px", fontFamily: "system-ui, sans-serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "3px solid #0f3d72", paddingBottom: 10 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#0f3d72" }}>🏊 {swimmer?.name} — {season}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{r.ageLabel || (rep.seasonAge != null ? "Age " + rep.seasonAge : "")} · #{swimmer?.id}</div>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 24, margin: "16px 0", fontSize: 14 }}>
          <div><b style={{ fontSize: 22, color: "#185FA5" }}>{r.nMeets ?? "—"}</b> meets</div>
          <div><b style={{ fontSize: 22, color: "#185FA5" }}>{r.nSwims ?? "—"}</b> swims</div>
          <div><b style={{ fontSize: 22, color: "#EF9F27" }}>{r.nPBs ?? "—"}</b> new PBs</div>
          {r.bestPts && <div><b style={{ fontSize: 22, color: "#1D9E75" }}>{r.bestPts.points}</b> best pts</div>}
        </div>

        {/* Highlights */}
        <div style={{ background: "#f7fafc", borderRadius: 10, padding: "10px 14px", fontSize: 13, lineHeight: 1.9, marginBottom: 18 }}>
          {r.bestPts && <div><b>Top swim:</b> {r.bestPts.event} — {r.bestPts.points} pts{r.bestPts.time ? " (" + r.bestPts.time + ")" : ""}</div>}
          {rep.bestDrop && <div><b>Biggest drop:</b> {rep.bestDrop.event} {rep.bestDrop.pool}m — {rep.bestDrop.deltaPct}% faster than last season</div>}
          {r.impEv && !rep.bestDrop && <div><b>Most improved:</b> {r.impEv} ({r.impPct?.toFixed(1)}% faster)</div>}
          {rep.held.length > 0 && <div><b>🏅 Records held:</b> {rep.held.map((e) => e.event + " " + e.pool + "m").join(", ")}</div>}
        </div>

        {/* Per-event table */}
        <div style={{ fontWeight: 800, color: "#0f3d72", marginBottom: 6 }}>Best times this season</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Event</th><th style={th}>Pool</th><th style={{ ...th, textAlign: "right" }}>Best</th>
            <th style={{ ...th, textAlign: "right" }}>vs last</th>
            {hasRec && <th style={{ ...th, textAlign: "right" }}>Record</th>}
            {hasRec && <th style={{ ...th, textAlign: "right" }}>Gap</th>}
          </tr></thead>
          <tbody>
            {rep.events.map((e, i) => (
              <tr key={i}>
                <td style={{ ...td, fontWeight: 600 }}>{e.holds ? "🏅 " : ""}{e.event}</td>
                <td style={td}>{e.pool}m</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtT(e.seconds)}</td>
                <td style={{ ...td, textAlign: "right", color: e.deltaPct > 0 ? "#1D9E75" : e.deltaPct < 0 ? "#a32d2d" : "#94a3b8" }}>
                  {e.deltaPct == null ? "—" : (e.deltaPct > 0 ? "▼ " : e.deltaPct < 0 ? "▲ " : "") + Math.abs(e.deltaPct) + "%"}
                </td>
                {hasRec && <td style={{ ...td, textAlign: "right", color: "#64748b" }}>{e.rec ? fmtT(e.rec.sec) : "—"}</td>}
                {hasRec && <td style={{ ...td, textAlign: "right", fontWeight: 700, color: e.holds ? "#c8961f" : "#0f172a" }}>{e.rec ? (e.holds ? "🏅" : "+" + e.gap + "s") : "—"}</td>}
              </tr>
            ))}
            {rep.events.length === 0 && <tr><td colSpan={6} style={{ ...td, color: "#94a3b8" }}>No swims this season.</td></tr>}
          </tbody>
        </table>

        <div style={{ marginTop: 24, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>Generated {new Date().toLocaleDateString()} · SwimTrack</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  SETTINGS (theme, account, access, swimmer CRUD)
// ════════════════════════════════════════════════════════════════════
const DEFAULT_SEED = ["lhershey@gmail.com", "sharos88@gmail.com"];

function SettingsTab({ user, swimmers, reloadSwimmers }) {
  const { c, s, dark, setDark } = useUI();
  const owner = isOwner(user);

  return (
    <div style={s.pad}>
      <div style={s.h2}>Appearance</div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600 }}>Theme</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setDark(false)} style={s.pill(!dark)}>☀️ Day</button>
            <button onClick={() => setDark(true)} style={s.pill(dark)}>🌙 Dark</button>
          </div>
        </div>
      </Card>

      <div style={s.h2}>Account</div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 999, background: c.blueDk, color: "#fff", display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>
            {(user.displayName || user.email || "?")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{user.displayName || "Signed in"}</div>
            <div style={{ fontSize: 12.5, color: c.dim, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
          </div>
          {owner && <span style={{ fontSize: 11, fontWeight: 800, color: c.amber, border: `1px solid ${c.amber}`, borderRadius: 999, padding: "3px 9px" }}>OWNER</span>}
        </div>
        <button onClick={signOut} style={{ marginTop: 14, width: "100%", padding: 11, borderRadius: 12, border: `1px solid ${c.line}`,
          background: c.card2, color: c.text, fontWeight: 700, cursor: "pointer" }}>Sign out</button>
      </Card>

      <SwimmersManager swimmers={swimmers} reloadSwimmers={reloadSwimmers} coachUid={user.uid} coachEmail={user.email} />

      <TeamViewerManager user={user} swimmers={swimmers} />

      <AccessManager owner={owner} />

      <div style={s.h2}>About</div>
      <Card><div style={{ fontSize: 13, color: c.dim, lineHeight: 1.7 }}>
        Data is extracted on the desktop app and synced to the cloud; this phone app reads it and lets you manage swimmer profiles.
        {swimmers.length} swimmer{swimmers.length !== 1 ? "s" : ""} in the cloud.
      </div></Card>
    </div>
  );
}

function SwimmersManager({ swimmers, reloadSwimmers, coachUid, coachEmail }) {
  const { c, s } = useUI();
  const [editing, setEditing] = useState(null); // swimmer id
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");
  const [status, setStatus] = useState("");

  async function add() {
    const id = newId.trim().replace(/[^0-9]/g, "");
    const name = newName.trim();
    if (!name || !id) { setStatus("Enter a name and numeric Player ID."); return; }
    try {
      await createSwimmer(id, name, coachUid, coachEmail);
      setNewName(""); setNewId(""); setStatus("✅ Added " + name);
      reloadSwimmers();
    } catch (e) {
      setStatus("❌ " + (/permission/i.test(e.message) ? "That Player ID already belongs to another coach." : e.message));
    }
  }

  return (
    <>
      <div style={s.h2}>Swimmers</div>
      {swimmers.map((sw) => (
        <SwimmerEditor key={sw.id} sw={sw} open={editing === sw.id}
          onToggle={() => setEditing(editing === sw.id ? null : sw.id)} reloadSwimmers={reloadSwimmers} />
      ))}
      <Card>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Add a swimmer</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" style={{ ...s.input, flex: 1, minWidth: 110 }} />
          <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="Player ID" inputMode="numeric" style={{ ...s.input, flex: 1, minWidth: 110 }} />
          <button onClick={add} style={{ padding: "0 18px", borderRadius: 10, border: "none", background: c.blue, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Add</button>
        </div>
        {status && <div style={{ marginTop: 8, fontSize: 12.5, color: status[0] === "✅" ? c.green : c.amber }}>{status}</div>}
        <div style={{ fontSize: 11, color: c.dim, marginTop: 8 }}>Then sync this swimmer's data from the desktop app.</div>
      </Card>
    </>
  );
}

// Any coach — not just the owner — can invite someone to share (fully
// read/write) their OWN current roster, the same way sharos88 shares
// access with lhershey. Different from the owner-only "Invite a Coach"
// panel in Admin, which creates a brand-new, independent, empty roster.
function TeamViewerManager({ user, swimmers }) {
  const { c, s } = useUI();
  const [note, setNote] = useState("");
  const [codes, setCodes] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!swimmers.length) { setStatus("Add a swimmer first — there's nothing to share yet."); return; }
    setBusy(true); setStatus("");
    try {
      const code = await createInviteCode(user, note.trim(), { targetCoachUid: user.uid, swimmerIds: swimmers.map((sw) => sw.id) });
      setCodes((prev) => [{ code, note: note.trim() }, ...prev]);
      setNote(""); setStatus("✅ Code generated — copy it to your viewer.");
    } catch (e) { setStatus("❌ " + e.message); }
    setBusy(false);
  }

  const others = [...new Set(swimmers.flatMap((sw) => sw.coachEmails || []))]
    .filter((e) => e.toLowerCase() !== (user.email || "").toLowerCase());

  return (
    <>
      <div style={s.h2}>Add a Viewer</div>
      <Card>
        <div style={{ fontSize: 12, color: c.dim, marginBottom: 10 }}>
          Generate a one-time code for someone to see and manage the same {swimmers.length} swimmer{swimmers.length !== 1 ? "s" : ""} you do
          (like a co-coach or parent) — not a separate, independent account.
        </div>
        {others.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: c.dim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Current Team</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {others.map((e) => (
                <span key={e} style={{ fontSize: 12, color: c.green, background: c.chipBg, border: `1px solid ${c.line}`, borderRadius: 7, padding: "4px 10px" }}>{e}</span>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (e.g. their name) — optional"
            style={{ ...s.input, flex: 1 }} />
          <button onClick={generate} disabled={busy} style={{ padding: "0 18px", borderRadius: 10, border: "none",
            background: c.blue, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{busy ? "…" : "Generate"}</button>
        </div>
        {status && <div style={{ marginTop: 8, fontSize: 12.5, color: status[0] === "✅" ? c.green : c.amber }}>{status}</div>}
        {codes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {codes.map((c2, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderTop: i > 0 ? `1px solid ${c.line}` : "none" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 15 }}>{c2.code}</span>
                <span style={{ fontSize: 11.5, color: c.dim }}>{c2.note}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function SwimmerEditor({ sw, open, onToggle, reloadSwimmers }) {
  const { c, s } = useUI();
  const [name, setName] = useState(sw.name || "");
  const [dob, setDob] = useState(sw.birthdate || "");
  const [sex, setSex] = useState(sw.sex || "");
  const [recordName, setRecordName] = useState(sw.recordName || "");
  const [heights, setHeights] = useState(sw.heights || []);
  const [weights, setWeights] = useState(sw.weights || []);
  const [status, setStatus] = useState("");

  function addMeas(setArr, arr, date, value) {
    const v = parseFloat(value);
    if (!date.trim() || isNaN(v)) { setStatus("Enter a date (DD/MM/YYYY) and a number."); return; }
    const next = [...arr, { date: date.trim(), value: v }].sort((a, b) => (parseDate(a.date) || 0) - (parseDate(b.date) || 0));
    setArr(next); setStatus("");
  }
  async function save() {
    setStatus("Saving…");
    try {
      await saveSwimmerProfile(sw.id, { name: name.trim() || sw.name, birthdate: dob.trim(), sex, recordName: recordName.trim(), heights, weights });
      setStatus("✅ Saved"); reloadSwimmers();
    } catch (e) { setStatus("❌ " + (/permission/i.test(e.message) ? "Not allowed." : e.message)); }
  }
  async function del() {
    if (!confirm("Delete " + sw.name + " and all their cloud data?")) return;
    await deleteSwimmer(sw.id); reloadSwimmers();
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <button onClick={onToggle} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
        padding: "13px 16px", background: "transparent", border: "none", color: c.text, cursor: "pointer" }}>
        <span style={{ fontSize: 18 }}>{sw.name === "Noga" ? "🏊‍♀️" : "🏊"}</span>
        <span style={{ flex: 1, fontWeight: 700 }}>{sw.name} <span style={{ color: c.dim, fontWeight: 400, fontSize: 12 }}>#{sw.id}</span></span>
        <span style={{ color: c.dim }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} style={s.input} /></Field>
          <Field label="Date of birth (DD/MM/YYYY)"><input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="DD/MM/YYYY" style={s.input} /></Field>
          <Field label="Sex (for growth percentiles)">
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setSex("female")} style={s.pill(sex === "female")}>👧 Female</button>
              <button onClick={() => setSex("male")} style={s.pill(sex === "male")}>👦 Male</button>
            </div>
          </Field>
          <Field label="Name in records (Hebrew, optional)"><input value={recordName} onChange={(e) => setRecordName(e.target.value)} placeholder="e.g. הר-שי לירון — to flag records they hold" style={s.input} dir="rtl" /></Field>

          <MeasEditor title="📏 Height (cm)" unit="cm" color={c.blue} arr={heights} setArr={setHeights} onAdd={addMeas} />
          <MeasEditor title="⚖️ Weight (kg)" unit="kg" color={c.amber} arr={weights} setArr={setWeights} onAdd={addMeas} />

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={save} style={{ flex: 1, padding: 11, borderRadius: 12, border: "none", background: c.green, color: "#fff", fontWeight: 800, cursor: "pointer" }}>Save</button>
            <button onClick={del} style={{ padding: "11px 16px", borderRadius: 12, border: `1px solid ${c.red}`, background: "transparent", color: c.red, fontWeight: 700, cursor: "pointer" }}>Delete</button>
          </div>
          {status && <div style={{ marginTop: 8, fontSize: 12.5, color: status[0] === "✅" ? c.green : c.amber }}>{status}</div>}
        </div>
      )}
    </Card>
  );
}
function Field({ label, children }) {
  const { c } = useUI();
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, color: c.dim, fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
function MeasEditor({ title, unit, color, arr, setArr, onAdd }) {
  const { c, s } = useUI();
  const [date, setDate] = useState("");
  const [value, setValue] = useState("");
  const chart = arr.filter((e) => parseDate(e.date)).map((e) => ({ x: parseDate(e.date), y: e.value, label: fmtDateShort(parseDate(e.date)) })).sort((a, b) => a.x - b.x);
  return (
    <div style={{ marginTop: 8, padding: 12, background: c.card2, border: `1px solid ${c.line}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color, marginBottom: 8 }}>{title}</div>
      {arr.map((e, j) => (
        <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ flex: 1, fontSize: 12.5, color: c.dim }}>{e.date}</span>
          <span style={{ fontWeight: 700 }}>{e.value}<span style={{ fontSize: 10, color: c.dim }}> {unit}</span></span>
          <button onClick={() => setArr(arr.filter((_, k) => k !== j))} style={{ background: "none", border: "none", color: c.red, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD/MM/YYYY" style={{ ...s.input, flex: 1 }} />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={unit} inputMode="decimal" style={{ ...s.input, width: 70 }} />
        <button onClick={() => { onAdd(setArr, arr, date, value); setDate(""); setValue(""); }} style={{ padding: "0 14px", borderRadius: 10, border: "none", background: color, color: "#fff", fontWeight: 700, cursor: "pointer" }}>+</button>
      </div>
      {chart.length > 1 && (
        <div style={{ height: 130, marginTop: 10 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={c.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: c.dim, fontSize: 9 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: c.dim, fontSize: 9 }} width={32} />
              <Tooltip contentStyle={tooltipStyle(c)} formatter={(v) => [v + " " + unit, title]} />
              <Line type="monotone" dataKey="y" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// Owner-only: generate one-time invite codes for new coaches. Each code is
// good for exactly one signup (see redeemInviteCode in firebase.js).
function InviteCodeManager({ owner, user }) {
  const { c, s } = useUI();
  const [note, setNote] = useState("");
  const [codes, setCodes] = useState([]); // codes generated this session
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  if (!owner) return null;

  async function generate() {
    setBusy(true); setStatus("");
    try {
      const code = await createInviteCode(user, note.trim());
      setCodes((prev) => [{ code, note: note.trim() }, ...prev]);
      setNote(""); setStatus("✅ Code generated — copy it to the new coach.");
    } catch (e) { setStatus("❌ " + e.message); }
    setBusy(false);
  }

  return (
    <>
      <div style={s.h2}>Invite a Coach</div>
      <Card>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (e.g. coach's name) — optional"
            style={{ ...s.input, flex: 1 }} />
          <button onClick={generate} disabled={busy} style={{ padding: "0 18px", borderRadius: 10, border: "none",
            background: c.blue, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{busy ? "…" : "Generate"}</button>
        </div>
        {status && <div style={{ marginTop: 8, fontSize: 12.5, color: status[0] === "✅" ? c.green : c.amber }}>{status}</div>}
        {codes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {codes.map((c2, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderTop: i > 0 ? `1px solid ${c.line}` : "none" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 15 }}>{c2.code}</span>
                <span style={{ fontSize: 11.5, color: c.dim }}>{c2.note}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: c.dim, marginTop: 8 }}>
          Each code works once. The new coach signs in with Google, then enters the code to activate their account.
        </div>
      </Card>
    </>
  );
}

function AccessManager({ owner }) {
  const { c, s } = useUI();
  const [emails, setEmails] = useState(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAccessList().then((list) => setEmails(list.length ? list : owner ? DEFAULT_SEED : []))
      .catch(() => setEmails(owner ? DEFAULT_SEED : []));
  }, [owner]);

  function add() {
    const e = input.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setStatus("Enter a valid email."); return; }
    if (emails.includes(e)) { setStatus("Already on the list."); return; }
    setEmails([...emails, e]); setInput(""); setStatus("");
  }
  async function save() {
    setBusy(true); setStatus("");
    try { await saveAccessList(emails); setStatus("✅ Saved. New accounts can sign in now."); }
    catch (err) { setStatus("❌ " + (/permission/i.test(err.message) ? "Only an owner can change this." : err.message)); }
    setBusy(false);
  }

  return (
    <>
      <div style={s.h2}>Who can access</div>
      <Card>
        {emails === null ? <div style={{ color: c.dim }}>Loading…</div> : <>
          {!owner && <div style={{ fontSize: 12.5, color: c.dim, marginBottom: 10 }}>Only an owner can change this list.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: owner ? 12 : 0 }}>
            {emails.map((e) => (
              <div key={e} style={{ display: "flex", alignItems: "center", gap: 8, background: c.card2, border: `1px solid ${c.line}`, borderRadius: 10, padding: "9px 12px" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis" }}>{e}</span>
                {DEFAULT_SEED.indexOf(e) === 0 && <span style={{ fontSize: 10.5, color: c.dim }}>owner</span>}
                {owner && DEFAULT_SEED.indexOf(e) !== 0 && (
                  <button onClick={() => setEmails(emails.filter((x) => x !== e))} style={{ background: "none", border: "none", color: c.red, fontSize: 18, cursor: "pointer" }}>×</button>
                )}
              </div>
            ))}
            {emails.length === 0 && <div style={{ color: c.dim, fontSize: 13 }}>No accounts yet.</div>}
          </div>
          {owner && <>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="add email@gmail.com" inputMode="email" autoCapitalize="none" style={{ ...s.input, flex: 1 }} />
              <button onClick={add} style={{ padding: "0 16px", borderRadius: 10, border: "none", background: c.blue, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>
            <button onClick={save} disabled={busy} style={{ marginTop: 12, width: "100%", padding: 12, borderRadius: 12, border: "none",
              background: busy ? c.line : c.green, color: "#fff", fontWeight: 800, cursor: "pointer" }}>{busy ? "Saving…" : "Save access list"}</button>
          </>}
          {status && <div style={{ marginTop: 10, fontSize: 13, color: status[0] === "✅" ? c.green : c.amber }}>{status}</div>}
        </>}
      </Card>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
//  ROOT
// ════════════════════════════════════════════════════════════════════
export default function App() {
  const { s } = useUI();
  const [user, setUser] = useState(undefined);
  const [authErr, setAuthErr] = useState("");
  const [swimmers, setSwimmers] = useState([]);
  const [swimmerId, setSwimmerId] = useState(null);
  const [swimmer, setSwimmer] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTab] = useState("home");
  const [recordsDoc, setRecordsDoc] = useState(null);
  const [rudolphDoc, setRudolphDoc] = useState(null);
  const [usaStandardsDoc, setUsaStandardsDoc] = useState(null);
  const [mastersRecordsDoc, setMastersRecordsDoc] = useState(null);
  const [coachStatus, setCoachStatus] = useState("checking"); // "checking" | "needsInvite" | "ok"
  const unsubRef = useRef(null);

  useEffect(() => watchAuth((u) => { setUser(u); setAuthErr(""); }), []);
  // Gated on coachStatus (not just user): a brand-new coach's very first
  // sign-in fires these before their coaches/{uid} doc exists yet (they
  // haven't redeemed an invite code), so the first attempt legitimately
  // fails — re-firing once coachStatus flips to "ok" is what actually
  // populates these for them instead of leaving them permanently null.
  useEffect(() => { if (user && coachStatus === "ok") fetchRecords().then(setRecordsDoc).catch(() => setRecordsDoc(null)); }, [user, coachStatus]);
  useEffect(() => { if (user && coachStatus === "ok") fetchRudolph().then(setRudolphDoc).catch(() => setRudolphDoc(null)); }, [user, coachStatus]);
  useEffect(() => { if (user && coachStatus === "ok") fetchUsaStandards().then(setUsaStandardsDoc).catch(() => setUsaStandardsDoc(null)); }, [user, coachStatus]);
  useEffect(() => { if (user && coachStatus === "ok") fetchMastersRecords().then(setMastersRecordsDoc).catch(() => setMastersRecordsDoc(null)); }, [user, coachStatus]);

  function loadSwimmers() {
    return fetchSwimmers(user)
      .then((list) => {
        setSwimmers(list);
        setSwimmerId((prev) => prev || (list[0] && list[0].id) || null);
        setLoadErr(list.length ? "" : "No swimmers yet — add one in Settings.");
      })
      .catch((e) => setLoadErr(/permission/i.test(e.message)
        ? "Your account isn't recognized. Ask the owner for an invite code."
        : "Could not load data: " + e.message));
  }

  // Gate: owners always have access; everyone else needs a coaches/{uid} doc,
  // either from the one-time legacy-family bridge or from redeeming an
  // invite code (see InviteGate below). Runs before ever calling
  // loadSwimmers() so a brand-new coach never sees a raw permission error.
  useEffect(() => {
    if (!user) return;
    if (isOwner(user)) {
      setCoachStatus("ok");
      // Claims any pre-multi-coach swimmer that predates coachUids entirely
      // (e.g. the owner's own profile) — without this it's invisible even
      // to the owner's own (correctly-scoped) queries.
      claimOrphanedSwimmers(user).catch((e) => console.error("claimOrphanedSwimmers failed:", e)).then(loadSwimmers);
      return;
    }
    setCoachStatus("checking");
    migrateLegacyAccess(user)
      .then(() => fetchCoach(user.uid))
      .then((coach) => {
        if (coach) { setCoachStatus("ok"); loadSwimmers(); }
        else setCoachStatus("needsInvite");
      })
      .catch((e) => { console.error("Coach status check failed:", e); setCoachStatus("needsInvite"); });
  }, [user]);

  useEffect(() => {
    if (!user || !swimmerId) return;
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = subscribeSwimmer(swimmerId, setSwimmer);
    return () => unsubRef.current && unsubRef.current();
  }, [user, swimmerId]);

  async function handleSignIn() {
    try { await signInWithGoogle(); }
    catch (e) { setAuthErr(e.code === "auth/popup-closed-by-user" ? "Sign-in was cancelled." : e.message); }
  }

  if (user === undefined) return <div style={s.app}><Center>Loading…</Center></div>;
  if (!user) return <SignIn onSignIn={handleSignIn} error={authErr} />;
  if (coachStatus === "checking") return <div style={s.app}><Center>Checking your account…</Center></div>;
  if (coachStatus === "needsInvite") {
    return <InviteGate user={user} onSignOut={signOut}
      onRedeemed={() => { setCoachStatus("ok"); loadSwimmers(); }} />;
  }

  const D = swimmer?.seasons || {};
  const hasData = swimmer && Object.keys(D).length > 0;

  return (
    <div style={s.app}>
      <TopBar user={user} swimmer={swimmer} swimmers={swimmers} onPick={setSwimmerId} onSignOut={signOut} />
      {tab === "settings" ? (
        <SettingsTab user={user} swimmers={swimmers} reloadSwimmers={loadSwimmers} />
      ) : tab === "admin" ? (
        <AdminTab user={user} />
      ) : tab === "team" ? (
        <TeamTab swimmers={swimmers} rudolphDoc={rudolphDoc} usaStandardsDoc={usaStandardsDoc} />
      ) : (
        <>
          {loadErr && <div style={s.pad}><Card style={{ borderColor: "#ef4444" }}>{loadErr}</Card></div>}
          {!loadErr && !swimmer && <Center>Loading swimmer…</Center>}
          {!loadErr && swimmer && !hasData && (
            <Center><div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              No seasons synced for {swimmer.name} yet.<br />Run "Sync to cloud" in the desktop app.</Center>
          )}
          {hasData && <TabErrorBoundary key={tab + "-" + swimmerId}>
            {tab === "home" && <HomeTab D={D} swimmer={swimmer} />}
            {tab === "meets" && <MeetsTab D={D} swimmer={swimmer} />}
            {tab === "progress" && <ProgressTab D={D} swimmer={swimmer} rudolphDoc={rudolphDoc} usaStandardsDoc={usaStandardsDoc} />}
            {tab === "records" && <RecordsTab D={D} swimmer={swimmer} recordsDoc={recordsDoc} mastersRecordsDoc={mastersRecordsDoc} />}
            {tab === "seasons" && <SeasonsTab D={D} swimmer={swimmer} recordsDoc={recordsDoc} />}
          </TabErrorBoundary>}
        </>
      )}
      <BottomNav tab={tab} setTab={setTab} owner={isOwner(user)} />
    </div>
  );
}

function relTime(ts) {
  if (!ts) return "never";
  const diff = Date.now() - ts, day = 24 * 3600 * 1000;
  if (diff < 3600 * 1000) return "just now";
  if (diff < day) return Math.floor(diff / 3600000) + "h ago";
  const days = Math.floor(diff / day);
  if (days < 30) return days + "d ago";
  const months = Math.floor(days / 30);
  if (months < 12) return months + "mo ago";
  return Math.floor(months / 12) + "y ago";
}

// Cross-swimmer view of a coach's own roster: highlights, USA Standards /
// Rudolph performance split, and per-swimmer last-synced health. Visible to
// every coach (not owner-gated), unlike AdminTab below.
function TeamTab({ swimmers, rudolphDoc, usaStandardsDoc }) {
  const { c, s } = useUI();
  const roster = useMemo(() => swimmers.map((sw) => ({ swimmer: sw, D: sw.seasons || {} })), [swimmers]);
  const highlights = useMemo(() => teamHighlights(roster), [roster]);
  const usaSummary = useMemo(() => teamUsaTierSummary(roster, usaStandardsDoc && usaStandardsDoc.table), [roster, usaStandardsDoc]);
  const rudSummary = useMemo(() => teamRudolphSummary(roster, rudolphDoc && rudolphDoc.table), [roster, rudolphDoc]);
  const totalPBs = roster.reduce((sum, { swimmer, D }) => {
    if (!seasons(D).length) return sum;
    const recap = seasonRecap(D, swimmer)[0];
    return sum + (recap ? recap.nPBs : 0);
  }, 0);

  if (!swimmers.length) {
    return <div style={s.pad}><Card>No swimmers on your roster yet — add one in Settings.</Card></div>;
  }

  return (
    <div style={s.pad}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <KPI val={swimmers.length} lbl="Swimmers" color={c.blue} />
        <KPI val={totalPBs} lbl="PBs This Season" color={c.amber} />
      </div>

      {highlights.length > 0 && <>
        <div style={s.h2}>Highlights</div>
        {highlights.map((it, i) => (
          <div key={i} style={{ ...s.card, display: "flex", gap: 12, alignItems: "flex-start",
            borderLeft: `4px solid ${c[INSIGHT_COLOR[it.type]] || c.blue}`, marginBottom: 10 }}>
            <div style={{ fontSize: 22 }}>{it.ico}</div>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>{it.title}</div>
              {it.text && <div style={{ fontSize: 12.5, color: c.dim, marginTop: 3, lineHeight: 1.5 }}>{it.text}</div>}</div>
          </div>
        ))}
      </>}

      <div style={s.h2}>Performance Split</div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: c.dim, textTransform: "uppercase", marginBottom: 8 }}>USA Standards (ages 10-18)</div>
        {usaSummary.perSwimmer.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {USA_TIERS.filter((t) => usaSummary.histogram[t] > 0).map((t) => (
              <span key={t} style={{ fontSize: 12.5, fontWeight: 700, color: c.blue, background: c.chipBg, border: `1px solid ${c.line}`, borderRadius: 7, padding: "4px 10px" }}>
                {t}: {usaSummary.histogram[t]}
              </span>
            ))}
          </div>
        ) : <div style={{ fontSize: 12.5, color: c.dim }}>No swimmers ages 10-18 with standards data yet.</div>}

        <div style={{ fontSize: 11, fontWeight: 700, color: c.dim, textTransform: "uppercase", margin: "14px 0 8px" }}>Rudolph Age Score</div>
        {rudSummary.perSwimmer.length ? (
          <>
            <div style={{ fontSize: 13, marginBottom: 8 }}>Team average: <b>{rudSummary.avg.toFixed(1)}</b> pts</div>
            {rudSummary.perSwimmer.slice().sort((a, b) => b.score - a.score).map((p) => (
              <div key={p.swimmer.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${c.line}`, fontSize: 12.5 }}>
                <span>{p.swimmer.name}</span><span style={{ fontWeight: 700 }}>{p.score.toFixed(1)} pts</span>
              </div>
            ))}
          </>
        ) : <div style={{ fontSize: 12.5, color: c.dim }}>No Rudolph-scored swims yet.</div>}
      </Card>

      <div style={s.h2}>Roster Health</div>
      <Card style={{ padding: 6 }}>
        {swimmers.map((sw, i) => (
          <div key={sw.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "9px 10px", borderBottom: i < swimmers.length - 1 ? `1px solid ${c.line}` : "none" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{sw.name}</span>
            <span style={{ fontSize: 11.5, color: c.dim }}>{relTime(sw.updatedAt)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function AdminTab({ user }) {
  const { s } = useUI();
  const owner = isOwner(user);
  return (
    <div style={s.pad}>
      <AdminStatsPanel owner={owner} />
      <InviteCodeManager owner={owner} user={user} />
    </div>
  );
}

// Owner-only cross-coach view — deliberately separate from every other
// query in the app, which is always scoped to the signed-in account's own
// roster. This is the one place seeing "everyone" is the point.
// Groups coaches into "teams" — connected components of the graph where an
// edge exists between two coaches if they share at least one swimmer (e.g.
// lhershey + sharos88, who co-manage Noga/Gal). A coach with no shared
// swimmers is its own team of one. This matches how the app is actually
// used far better than one row per raw account/uid.
function groupCoachesIntoTeams(coaches, swimmers) {
  const parent = {};
  coaches.forEach((co) => { parent[co.uid] = co.uid; });
  const find = (x) => { while (parent[x] && parent[x] !== x) x = parent[x]; return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  swimmers.forEach((sw) => {
    const uids = (sw.coachUids || []).filter((uid) => uid in parent);
    for (let i = 1; i < uids.length; i++) union(uids[0], uids[i]);
  });
  const teamsByRoot = {};
  coaches.forEach((co) => { (teamsByRoot[find(co.uid)] = teamsByRoot[find(co.uid)] || []).push(co); });
  return Object.values(teamsByRoot).map((members) => {
    const memberUids = new Set(members.map((m) => m.uid));
    const swimmerCount = swimmers.filter((sw) => (sw.coachUids || []).some((uid) => memberUids.has(uid))).length;
    return { members, swimmerCount };
  }).sort((a, b) => b.swimmerCount - a.swimmerCount);
}

function AdminStatsPanel({ owner }) {
  const { c, s } = useUI();
  const [coaches, setCoaches] = useState(null);
  const [swimmers, setSwimmers] = useState(null);
  const [codes, setCodes] = useState(null);
  const [rudolphDoc, setRudolphDoc] = useState(null);
  const [usaStandardsDoc, setUsaStandardsDoc] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!owner) return;
    Promise.all([fetchAllCoaches(), fetchAllSwimmersAdmin(), fetchAllInviteCodes(), fetchRudolph(), fetchUsaStandards()])
      .then(([co, sw, cd, rud, usa]) => { setCoaches(co); setSwimmers(sw); setCodes(cd); setRudolphDoc(rud); setUsaStandardsDoc(usa); })
      .catch((e) => setErr(e.message));
  }, [owner]);

  if (!owner) return null;
  if (err) return <><div style={s.h2}>Stats</div><Card style={{ borderColor: c.red }}>Failed to load: {err}</Card></>;
  if (!coaches) return <><div style={s.h2}>Stats</div><Center>Loading…</Center></>;

  const teams = groupCoachesIntoTeams(coaches, swimmers);
  const openCodes = codes.filter((cd) => !cd.usedBy);
  const usedCodes = codes.filter((cd) => cd.usedBy);
  const roster = swimmers.map((sw) => ({ swimmer: sw, D: sw.seasons || {} }));
  const usaSummary = teamUsaTierSummary(roster, usaStandardsDoc && usaStandardsDoc.table);
  const rudSummary = teamRudolphSummary(roster, rudolphDoc && rudolphDoc.table);
  const stalest = swimmers.slice().sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0)).slice(0, 8);

  return (
    <>
      <div style={s.h2}>Stats</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <KPI val={teams.length} lbl="Teams" />
        <KPI val={swimmers.length} lbl="Swimmers" />
        <KPI val={openCodes.length} lbl="Open Codes" color={c.amber} />
      </div>
      <Card style={{ padding: 6 }}>
        {teams.map((team, i) => (
          <div key={team.members[0].uid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "9px 10px", borderBottom: i < teams.length - 1 ? `1px solid ${c.line}` : "none" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {team.members.map((m) => m.name || m.email).join(" + ")}
              </div>
              <div style={{ fontSize: 11, color: c.dim }}>{team.members.map((m) => m.email).join(" · ")}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: c.blue }}>{team.swimmerCount}</div>
          </div>
        ))}
      </Card>

      <div style={s.h2}>Invite Codes</div>
      <Card style={{ padding: 6 }}>
        {codes.length === 0 ? <div style={{ color: c.dim, padding: 10, fontSize: 13 }}>None generated yet.</div> : (
          [...openCodes, ...usedCodes].map((cd, i) => (
            <div key={cd.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "9px 10px", borderBottom: i < codes.length - 1 ? `1px solid ${c.line}` : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 13.5 }}>{cd.code}</div>
                {cd.note && <div style={{ fontSize: 11, color: c.dim }}>{cd.note}</div>}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: cd.usedBy ? c.green : c.amber }}>
                {cd.usedBy ? "✅ " + cd.usedBy : "Open"}
              </div>
            </div>
          ))
        )}
      </Card>

      <div style={s.h2}>Performance Split (all coaches)</div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: c.dim, textTransform: "uppercase", marginBottom: 8 }}>USA Standards (ages 10-18)</div>
        {usaSummary.perSwimmer.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {USA_TIERS.filter((t) => usaSummary.histogram[t] > 0).map((t) => (
              <span key={t} style={{ fontSize: 12.5, fontWeight: 700, color: c.blue, background: c.chipBg, border: `1px solid ${c.line}`, borderRadius: 7, padding: "4px 10px" }}>
                {t}: {usaSummary.histogram[t]}
              </span>
            ))}
          </div>
        ) : <div style={{ fontSize: 12.5, color: c.dim }}>No swimmers ages 10-18 with standards data yet.</div>}
        <div style={{ fontSize: 11, fontWeight: 700, color: c.dim, textTransform: "uppercase", margin: "14px 0 4px" }}>Rudolph Age Score</div>
        <div style={{ fontSize: 13 }}>{rudSummary.avg != null ? <>Average: <b>{rudSummary.avg.toFixed(1)}</b> pts across {rudSummary.perSwimmer.length} swimmer(s)</> : "No Rudolph-scored swims yet."}</div>
      </Card>

      <div style={s.h2}>Least Recently Synced</div>
      <Card style={{ padding: 6 }}>
        {stalest.map((sw, i) => (
          <div key={sw.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "9px 10px", borderBottom: i < stalest.length - 1 ? `1px solid ${c.line}` : "none" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{sw.name}</span>
            <span style={{ fontSize: 11.5, color: c.dim }}>{relTime(sw.updatedAt)}</span>
          </div>
        ))}
      </Card>
    </>
  );
}
