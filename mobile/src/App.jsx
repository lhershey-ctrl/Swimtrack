import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Cell,
} from "recharts";
import {
  watchAuth, signInWithGoogle, signOut, fetchSwimmers, subscribeSwimmer,
  isOwner, getAccessList, saveAccessList,
} from "./firebase.js";
import {
  fmtT, fmtDateShort, parseDate, poolNorm, allResults, seasons,
  personalRecords, computePBTimeline, getStroke, getStrokeColor, STROKE_COLORS,
  topEvents, extractDist, getAgeAt, ageGroupLabel, linReg,
} from "./analysis.js";

// ── Theme ───────────────────────────────────────────────────────────
const C = {
  bg: "#0b1220", card: "#121c2e", card2: "#172338", line: "#22324d",
  text: "#e7edf5", dim: "#8aa0bd", blue: "#3b82f6", blueDk: "#0f3d72",
  green: "#10b981", amber: "#f59e0b", red: "#ef4444", violet: "#a78bfa",
};
const grad = "linear-gradient(135deg,#0f3d72 0%,#1d4ed8 55%,#0ea5e9 100%)";

const s = {
  app: { maxWidth: 540, margin: "0 auto", minHeight: "100%", paddingBottom: 84,
    background: C.bg },
  pad: { padding: "16px 16px 0" },
  card: { background: C.card, border: `1px solid ${C.line}`, borderRadius: 18,
    padding: 16, marginBottom: 14, boxShadow: "0 6px 20px rgba(0,0,0,.25)" },
  h2: { fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
    color: C.dim, margin: "20px 4px 10px" },
  kpiVal: { fontSize: 26, fontWeight: 800, lineHeight: 1.05 },
  kpiLbl: { fontSize: 10.5, color: C.dim, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: ".05em", marginTop: 4 },
  pill: (on) => ({ padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700,
    border: `1.5px solid ${on ? C.blue : C.line}`, background: on ? C.blue : "transparent",
    color: on ? "#fff" : C.dim, cursor: "pointer", whiteSpace: "nowrap" }),
};

// ── Tiny UI atoms ───────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ ...s.card, ...style }}>{children}</div>;
}
function KPI({ val, lbl, color }) {
  return (
    <div style={{ ...s.card, flex: 1, minWidth: 0, marginBottom: 0, padding: 14 }}>
      <div style={{ ...s.kpiVal, color: color || C.text }}>{val}</div>
      <div style={s.kpiLbl}>{lbl}</div>
    </div>
  );
}
function PillRow({ items, active, onPick }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 4px 6px",
      WebkitOverflowScrolling: "touch" }}>
      {items.map((it) => (
        <button key={it.key} style={s.pill(active === it.key)} onClick={() => onPick(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ── Sign-in screen ──────────────────────────────────────────────────
function SignIn({ onSignIn, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 28, background: grad }}>
      <div style={{ fontSize: 64, marginBottom: 8 }}>🏊‍♀️</div>
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-.5px", color: "#fff" }}>SwimTrack</div>
      <div style={{ color: "rgba(255,255,255,.8)", marginTop: 8, marginBottom: 36, textAlign: "center" }}>
        Swim times, records & progress
      </div>
      <button onClick={onSignIn}
        style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", color: "#1f2937",
          border: "none", borderRadius: 14, padding: "14px 22px", fontSize: 15, fontWeight: 700,
          cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
        <GoogleG /> Sign in with Google
      </button>
      {error && (
        <div style={{ color: "#fecaca", marginTop: 18, fontSize: 13, maxWidth: 320, textAlign: "center" }}>
          {error}
        </div>
      )}
    </div>
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

// ── Top bar ─────────────────────────────────────────────────────────
function TopBar({ user, swimmer, swimmers, onPick, onSignOut }) {
  const [open, setOpen] = useState(false);
  const icon = swimmer?.name === "Noga" ? "🏊‍♀️" : "🏊";
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 30, background: grad,
      padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 2px 14px rgba(0,0,0,.35)" }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <button onClick={() => setOpen((o) => !o)}
        style={{ flex: 1, textAlign: "left", background: "rgba(255,255,255,.12)", border: "none",
          color: "#fff", borderRadius: 12, padding: "8px 12px", display: "flex",
          alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{swimmer?.name || "Select swimmer"}</span>
        <span style={{ opacity: .8 }}>▾</span>
      </button>
      <button onClick={onSignOut} title={user?.email}
        style={{ width: 34, height: 34, borderRadius: 999, border: "none", cursor: "pointer",
          background: "rgba(255,255,255,.2)", color: "#fff", fontWeight: 700 }}>
        {(user?.displayName || user?.email || "?")[0].toUpperCase()}
      </button>
      {open && (
        <div style={{ position: "absolute", top: 60, left: 16, right: 16, background: C.card2,
          border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", zIndex: 40,
          boxShadow: "0 12px 30px rgba(0,0,0,.45)" }}>
          {swimmers.map((sw) => (
            <button key={sw.id} onClick={() => { onPick(sw.id); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 16px",
                background: sw.id === swimmer?.id ? C.blueDk : "transparent", color: C.text,
                border: "none", borderBottom: `1px solid ${C.line}`, cursor: "pointer", fontSize: 15 }}>
              {sw.name === "Noga" ? "🏊‍♀️ " : "🏊 "}{sw.name}
              <span style={{ color: C.dim, fontSize: 12, marginLeft: 8 }}>#{sw.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bottom nav ──────────────────────────────────────────────────────
const TABS = [
  { key: "home", label: "Home", icon: "🏠" },
  { key: "records", label: "Records", icon: "🏅" },
  { key: "progress", label: "Progress", icon: "📈" },
  { key: "seasons", label: "Seasons", icon: "🗓" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];
function BottomNav({ tab, setTab }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
      maxWidth: 540, margin: "0 auto", background: C.card, borderTop: `1px solid ${C.line}`,
      display: "flex", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {TABS.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer",
            padding: "10px 0 12px", color: tab === t.key ? C.blue : C.dim, fontWeight: 700 }}>
          <div style={{ fontSize: 20, filter: tab === t.key ? "none" : "grayscale(.4) opacity(.8)" }}>{t.icon}</div>
          <div style={{ fontSize: 11, marginTop: 2 }}>{t.label}</div>
        </button>
      ))}
    </div>
  );
}

// ── Empty / loading states ──────────────────────────────────────────
function Center({ children }) {
  return (
    <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", color: C.dim, padding: 30, textAlign: "center" }}>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  TAB VIEWS
// ════════════════════════════════════════════════════════════════════
function HomeTab({ D, swimmer }) {
  const ss = seasons(D);
  const ar = allResults(D);
  const pbKeys = useMemo(() => computePBTimeline(D), [D]);
  const totalPBs = ar.filter((r) =>
    pbKeys.has(r.event + "|" + poolNorm(r.pool) + "|" + (r.date || "") + "|" + r.seconds)).length;
  const bestPoints = ar.reduce((m, r) => Math.max(m, r.points || 0), 0);
  const comps = new Set(ar.map((r) => (r.competition || "") + "|" + (r.date || ""))).size;
  const age = swimmer?.birthdate ? getAgeAt(swimmer.birthdate, "") : null;
  const recent = ar
    .slice()
    .sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0))
    .slice(0, 12);

  return (
    <div style={s.pad}>
      <Card style={{ background: grad, border: "none" }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{swimmer?.name}</div>
        <div style={{ color: "rgba(255,255,255,.85)", fontSize: 13, marginTop: 4 }}>
          ID {swimmer?.id}
          {age ? ` · Age ${Math.floor(age)} · ${ageGroupLabel(age)}` : ""}
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 16 }}>
          <Stat n={ss.length} l={"Season" + (ss.length !== 1 ? "s" : "")} />
          <Stat n={ar.length} l="Swims" />
          {ss.length > 1 && <Stat n={`${ss[0].slice(2, 4)}→${ss[ss.length - 1].slice(2, 4)}`} l="Range" />}
        </div>
      </Card>

      <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
        <KPI val={totalPBs} lbl="Personal Bests" color={C.amber} />
        <KPI val={bestPoints || "—"} lbl="Best Points" color={C.green} />
        <KPI val={comps} lbl="Competitions" color={C.blue} />
      </div>

      <div style={s.h2}>Recent swims</div>
      <Card style={{ padding: 6 }}>
        {recent.length === 0 && <div style={{ color: C.dim, padding: 14 }}>No results yet.</div>}
        {recent.map((r, i) => {
          const isPB = pbKeys.has(r.event + "|" + poolNorm(r.pool) + "|" + (r.date || "") + "|" + r.seconds);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px",
              borderBottom: i < recent.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: getStrokeColor(r.event) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden",
                  textOverflow: "ellipsis" }}>
                  {isPB && <span style={{ color: C.amber }}>🏅 </span>}{r.event}
                </div>
                <div style={{ fontSize: 11.5, color: C.dim }}>
                  {fmtDateShort(parseDate(r.date))} · {poolNorm(r.pool)}m
                  {r.competition ? " · " + r.competition : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{fmtT(r.seconds)}</div>
                {r.points ? <div style={{ fontSize: 11, color: C.dim }}>{r.points} pts</div> : null}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
function Stat({ n, l }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{n}</div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.7)", textTransform: "uppercase",
        letterSpacing: ".05em" }}>{l}</div>
    </div>
  );
}

function RecordsTab({ D }) {
  const [pool, setPool] = useState("25");
  const recs = useMemo(() => personalRecords(D, pool), [D, pool]);
  return (
    <div style={s.pad}>
      <div style={s.h2}>Personal Records</div>
      <PillRow items={[{ key: "25", label: "🏊 25m Pool" }, { key: "50", label: "🏊 50m Pool" }]}
        active={pool} onPick={setPool} />
      <Card style={{ padding: 6 }}>
        {recs.length === 0 && <div style={{ color: C.dim, padding: 14 }}>No {pool}m records.</div>}
        {recs.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 10px",
            borderBottom: i < recs.length - 1 ? `1px solid ${C.line}` : "none" }}>
            <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: getStrokeColor(r.event) }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.event}</div>
              <div style={{ fontSize: 11.5, color: C.dim }}>
                {fmtDateShort(parseDate(r.date))}{r.competition ? " · " + r.competition : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: C.amber }}>{fmtT(r.seconds)}</div>
              {r.points ? <div style={{ fontSize: 11, color: C.dim }}>{r.points} pts</div> : null}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ProgressTab({ D }) {
  const tops = useMemo(() => topEvents(D, 8), [D]);
  const [key, setKey] = useState(tops[0] || null);
  useEffect(() => { if (!key && tops[0]) setKey(tops[0]); }, [tops, key]);
  const [evName, pool] = (key || "|").split("|");

  const data = useMemo(() => {
    return allResults(D)
      .filter((r) => r.event === evName && poolNorm(r.pool) === pool)
      .map((r) => ({ x: parseDate(r.date), t: r.seconds, label: fmtDateShort(parseDate(r.date)) }))
      .filter((p) => p.x)
      .sort((a, b) => a.x - b.x);
  }, [D, evName, pool]);

  const improved = data.length >= 2 ? data[0].t - data[data.length - 1].t : 0;
  const color = getStrokeColor(evName);

  return (
    <div style={s.pad}>
      <div style={s.h2}>Progress by Event</div>
      <PillRow items={tops.map((k) => ({ key: k, label: k.split("|")[0] + " · " + k.split("|")[1] + "m" }))}
        active={key} onPick={setKey} />
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{evName} <span style={{ color: C.dim, fontSize: 13 }}>{pool}m</span></div>
          {data.length >= 2 && (
            <div style={{ fontSize: 13, fontWeight: 800, color: improved > 0 ? C.green : C.red }}>
              {improved > 0 ? "▼ " : "▲ "}{Math.abs(improved).toFixed(2)}s
            </div>
          )}
        </div>
        <div style={{ height: 240 }}>
          {data.length < 2 ? (
            <Center>Not enough data for this event.</Center>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={{ fill: C.dim, fontSize: 10 }}
                  tickFormatter={fmtT} width={52} />
                <Tooltip contentStyle={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 10, color: C.text }}
                  formatter={(v) => [fmtT(v), "Time"]} labelStyle={{ color: C.dim }} />
                <Line type="monotone" dataKey="t" stroke={color} strokeWidth={3}
                  dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.dim, textAlign: "center", marginTop: 6 }}>
          Lower on the chart = faster — the line drops as times improve
        </div>
      </Card>
    </div>
  );
}

function SeasonsTab({ D }) {
  const ss = seasons(D);
  const [from, setFrom] = useState(ss[ss.length - 2] || ss[0]);
  const [to, setTo] = useState(ss[ss.length - 1]);

  const rows = useMemo(() => {
    const evs = new Set();
    [from, to].forEach((sk) => (D[sk]?.bests || []).forEach((b) => {
      if (b.event && b.seconds > 0) evs.add(b.event + "|" + poolNorm(b.pool));
    }));
    return Array.from(evs).map((k) => {
      const [ev, pool] = k.split("|");
      const bestIn = (sk) => {
        const hits = (D[sk]?.bests || []).filter((b) => b.event === ev && poolNorm(b.pool) === pool && b.seconds > 0);
        return hits.length ? Math.min(...hits.map((h) => h.seconds)) : null;
      };
      const a = bestIn(from), b = bestIn(to);
      return { ev, pool, a, b, delta: a != null && b != null ? a - b : null };
    }).filter((r) => r.a != null || r.b != null)
      .sort((x, y) => extractDist(x.ev) - extractDist(y.ev) || x.ev.localeCompare(y.ev));
  }, [D, from, to]);

  const chartData = rows.filter((r) => r.delta != null)
    .map((r) => ({ name: r.ev.replace(/\s+/g, " "), delta: +r.delta.toFixed(2), pool: r.pool }));

  return (
    <div style={s.pad}>
      <div style={s.h2}>Season Comparison</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <Select label="From" value={from} options={ss} onChange={setFrom} />
        <Select label="To" value={to} options={ss} onChange={setTo} />
      </div>

      {chartData.length > 0 && (
        <Card>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Improvement (seconds)</div>
          <div style={{ height: Math.max(160, chartData.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 6, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.line} horizontal={false} />
                <XAxis type="number" tick={{ fill: C.dim, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fill: C.dim, fontSize: 10 }} />
                <Tooltip contentStyle={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 10, color: C.text }}
                  formatter={(v) => [v + "s " + (v > 0 ? "faster" : "slower"), "Δ"]} />
                <Bar dataKey="delta" radius={[0, 6, 6, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.delta >= 0 ? C.green : C.red} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card style={{ padding: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px",
            borderBottom: i < rows.length - 1 ? `1px solid ${C.line}` : "none" }}>
            <div style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: getStrokeColor(r.ev) }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.ev} <span style={{ color: C.dim, fontSize: 11 }}>{r.pool}m</span></div>
              <div style={{ fontSize: 11.5, color: C.dim }}>{fmtT(r.a)} → {fmtT(r.b)}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 14,
              color: r.delta == null ? C.dim : r.delta > 0 ? C.green : r.delta < 0 ? C.red : C.dim }}>
              {r.delta == null ? "—" : (r.delta > 0 ? "▼ " : r.delta < 0 ? "▲ " : "") + Math.abs(r.delta).toFixed(2) + "s"}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
function Select({ label, value, options, onChange }) {
  return (
    <label style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10.5, color: C.dim, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "9px 10px", borderRadius: 10, background: C.card2,
          color: C.text, border: `1px solid ${C.line}`, fontSize: 14 }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const DEFAULT_SEED = ["lhershey@gmail.com", "sharos88@gmail.com"];

function SettingsTab({ user, swimmers }) {
  const owner = isOwner(user);
  const [emails, setEmails] = useState(null);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAccessList()
      .then((list) => setEmails(list.length ? list : owner ? DEFAULT_SEED : []))
      .catch(() => setEmails(owner ? DEFAULT_SEED : []));
  }, [owner]);

  function add() {
    const e = input.trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setStatus("Enter a valid email."); return; }
    if (emails.includes(e)) { setStatus("Already on the list."); return; }
    setEmails([...emails, e]); setInput(""); setStatus("");
  }
  function remove(e) { setEmails(emails.filter((x) => x !== e)); }
  async function save() {
    setBusy(true); setStatus("");
    try { await saveAccessList(emails); setStatus("✅ Saved. New accounts can sign in now."); }
    catch (err) { setStatus("❌ " + (/* permission */ /permission/i.test(err.message)
      ? "Only an owner can change the access list." : err.message)); }
    setBusy(false);
  }

  return (
    <div style={s.pad}>
      <div style={s.h2}>Account</div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 999, background: C.blueDk, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>
            {(user.displayName || user.email || "?")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{user.displayName || "Signed in"}</div>
            <div style={{ fontSize: 12.5, color: C.dim, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
          </div>
          {owner && <span style={{ fontSize: 11, fontWeight: 800, color: C.amber,
            border: `1px solid ${C.amber}`, borderRadius: 999, padding: "3px 9px" }}>OWNER</span>}
        </div>
        <button onClick={signOut}
          style={{ marginTop: 14, width: "100%", padding: "11px", borderRadius: 12, border: `1px solid ${C.line}`,
            background: C.card2, color: C.text, fontWeight: 700, cursor: "pointer" }}>Sign out</button>
      </Card>

      <div style={s.h2}>Who can access</div>
      <Card>
        {emails === null ? (
          <div style={{ color: C.dim }}>Loading…</div>
        ) : (
          <>
            {!owner && (
              <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 10 }}>
                Only an owner can change this list.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: owner ? 12 : 0 }}>
              {emails.map((e) => (
                <div key={e} style={{ display: "flex", alignItems: "center", gap: 8, background: C.card2,
                  border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis" }}>{e}</span>
                  {DEFAULT_SEED.indexOf(e) === 0 && <span style={{ fontSize: 10.5, color: C.dim }}>owner</span>}
                  {owner && DEFAULT_SEED.indexOf(e) !== 0 && (
                    <button onClick={() => remove(e)} style={{ background: "none", border: "none", color: C.red,
                      fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
                  )}
                </div>
              ))}
              {emails.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>No accounts yet.</div>}
            </div>
            {owner && (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()} placeholder="add email@gmail.com"
                    inputMode="email" autoCapitalize="none"
                    style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, background: C.card2,
                      color: C.text, border: `1px solid ${C.line}`, fontSize: 14 }} />
                  <button onClick={add} style={{ padding: "0 16px", borderRadius: 10, border: "none",
                    background: C.blue, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Add</button>
                </div>
                <button onClick={save} disabled={busy}
                  style={{ marginTop: 12, width: "100%", padding: "12px", borderRadius: 12, border: "none",
                    background: busy ? C.line : C.green, color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                  {busy ? "Saving…" : "Save access list"}
                </button>
              </>
            )}
            {status && <div style={{ marginTop: 10, fontSize: 13, color: status[0] === "✅" ? C.green : C.amber }}>{status}</div>}
          </>
        )}
      </Card>

      <div style={s.h2}>About</div>
      <Card>
        <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.7 }}>
          Data is extracted on the desktop app and synced to the cloud. This phone app is read-only
          analysis. {swimmers.length} swimmer{swimmers.length !== 1 ? "s" : ""} in the cloud.
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  ROOT
// ════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking
  const [authErr, setAuthErr] = useState("");
  const [swimmers, setSwimmers] = useState([]);
  const [swimmerId, setSwimmerId] = useState(null);
  const [swimmer, setSwimmer] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTab] = useState("home");
  const unsubRef = useRef(null);

  // Auth state
  useEffect(() => watchAuth((u) => { setUser(u); setAuthErr(""); }), []);

  // Load swimmer list once signed in
  useEffect(() => {
    if (!user) return;
    fetchSwimmers()
      .then((list) => {
        setSwimmers(list);
        setSwimmerId((prev) => prev || (list[0] && list[0].id) || null);
        if (!list.length) setLoadErr("No swimmer data in the cloud yet. Sync from the desktop app first.");
      })
      .catch((e) => setLoadErr(
        /permission/i.test(e.message)
          ? "Your account isn't on the access list. Ask the owner to add your email."
          : "Could not load data: " + e.message
      ));
  }, [user]);

  // Live subscribe to the selected swimmer
  useEffect(() => {
    if (!user || !swimmerId) return;
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = subscribeSwimmer(swimmerId, setSwimmer);
    return () => unsubRef.current && unsubRef.current();
  }, [user, swimmerId]);

  async function handleSignIn() {
    try { await signInWithGoogle(); }
    catch (e) {
      setAuthErr(e.code === "auth/popup-closed-by-user" ? "Sign-in was cancelled." : e.message);
    }
  }

  if (user === undefined) {
    return <div style={s.app}><Center>Loading…</Center></div>;
  }
  if (!user) return <SignIn onSignIn={handleSignIn} error={authErr} />;

  const D = swimmer?.seasons || {};
  const hasData = swimmer && Object.keys(D).length > 0;

  return (
    <div style={s.app}>
      <TopBar user={user} swimmer={swimmer} swimmers={swimmers}
        onPick={setSwimmerId} onSignOut={signOut} />

      {tab === "settings" ? (
        <SettingsTab user={user} swimmers={swimmers} />
      ) : (
        <>
          {loadErr && <div style={s.pad}><Card style={{ borderColor: C.red, color: "#fecaca" }}>{loadErr}</Card></div>}

          {!loadErr && !swimmer && <Center>Loading swimmer…</Center>}
          {!loadErr && swimmer && !hasData && (
            <Center>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              No seasons synced for {swimmer.name} yet.<br />Run "Sync to cloud" in the desktop app.
            </Center>
          )}

          {hasData && (
            <>
              {tab === "home" && <HomeTab D={D} swimmer={swimmer} />}
              {tab === "records" && <RecordsTab D={D} />}
              {tab === "progress" && <ProgressTab D={D} />}
              {tab === "seasons" && <SeasonsTab D={D} />}
            </>
          )}
        </>
      )}

      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}
