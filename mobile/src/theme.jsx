import React, { createContext, useContext, useEffect, useState } from "react";

// ── Palettes ────────────────────────────────────────────────────────
export const PALETTES = {
  dark: {
    name: "dark", bg: "#0b1220", card: "#121c2e", card2: "#172338", line: "#22324d",
    text: "#e7edf5", dim: "#8aa0bd", blue: "#3b82f6", blueDk: "#0f3d72", green: "#10b981",
    amber: "#f59e0b", red: "#ef4444", violet: "#a78bfa",
    shadow: "0 6px 20px rgba(0,0,0,.25)", chipBg: "transparent",
  },
  light: {
    name: "light", bg: "#eef2f7", card: "#ffffff", card2: "#f4f7fb", line: "#e2e8f0",
    text: "#0f172a", dim: "#64748b", blue: "#2563eb", blueDk: "#0f3d72", green: "#059669",
    amber: "#d97706", red: "#dc2626", violet: "#7c3aed",
    shadow: "0 4px 16px rgba(15,23,42,.08)", chipBg: "#ffffff",
  },
};

export const GRAD = "linear-gradient(135deg,#0f3d72 0%,#1d4ed8 55%,#0ea5e9 100%)";

// ── Style factory (depends on palette) ──────────────────────────────
export function mkS(c) {
  return {
    app: { maxWidth: 540, margin: "0 auto", minHeight: "100%", paddingBottom: 88,
      background: c.bg, color: c.text, transition: "background .2s" },
    pad: { padding: "16px 16px 0" },
    card: { background: c.card, border: `1px solid ${c.line}`, borderRadius: 18,
      padding: 16, marginBottom: 14, boxShadow: c.shadow },
    h2: { fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
      color: c.dim, margin: "20px 4px 10px" },
    pill: (on) => ({ padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 700,
      border: `1.5px solid ${on ? c.blue : c.line}`, background: on ? c.blue : c.chipBg,
      color: on ? "#fff" : c.dim, cursor: "pointer", whiteSpace: "nowrap" }),
    input: { width: "100%", padding: "10px 12px", borderRadius: 10, background: c.card2,
      color: c.text, border: `1px solid ${c.line}`, fontSize: 14, boxSizing: "border-box" },
  };
}

// ── Context ─────────────────────────────────────────────────────────
const ThemeCtx = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try { const v = localStorage.getItem("swimtrack:theme"); return v ? v === "dark" : true; }
    catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("swimtrack:theme", dark ? "dark" : "light"); } catch {}
    const c = dark ? PALETTES.dark : PALETTES.light;
    document.body.style.background = c.bg;
    document.body.style.color = c.text;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0f3d72" : "#2563eb");
  }, [dark]);
  const c = dark ? PALETTES.dark : PALETTES.light;
  return (
    <ThemeCtx.Provider value={{ dark, setDark, toggle: () => setDark((d) => !d), c, s: mkS(c) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useUI() {
  return useContext(ThemeCtx);
}
