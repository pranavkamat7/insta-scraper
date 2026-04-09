import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import HashtagExplorer from "./components/HashtagExplorer";
import TrendingReels from "./components/TrendingReels";
import CompetitorCompare from "./components/CompetitorCompare";
import PostingHeatmap from "./components/PostingHeatmap";
import AIInsights from "./components/AIInsights";

const ACTOR_ID = "apify~instagram-scraper";
const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;

const fmt = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (v = "") => v.trim().replace("@", "").toLowerCase();
const getUser = (item) => norm(item?.username || item?.ownerUsername || "");
const getTags = (cap = "") => (cap.match(/#[\w]+/g) || []).slice(0, 4);
const toN = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pct = (v) => (!Number.isFinite(v) || v <= 0 ? "—" : `${v.toFixed(2)}%`);
const calcM = (post, f) => {
  const likes = toN(post?.likesCount || post?.likes || 0);
  const comments = toN(post?.commentsCount || post?.comments || 0);
  const views = toN(post?.videoViewCount || post?.videoPlayCount || 0);
  const interactions = likes + comments;
  return { likes, comments, views, interactions, erByFollowers: f > 0 ? (interactions / f) * 100 : 0, erByViews: views > 0 ? (interactions / views) * 100 : 0 };
};

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const NAV = [
  {
    id: "scraper",
    label: "Profile Scraper",
    shortLabel: "Scraper",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="1.5" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="11" cy="4" r="1" fill="currentColor"/>
      </svg>
    ),
    badge: null,
  },
  {
    id: "hashtags",
    label: "Hashtag Explorer",
    shortLabel: "Hashtags",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M3 5h9M3 10h9M6 1.5v12M9 1.5v12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    badge: "New",
  },
  {
    id: "reels",
    label: "Trending Reels",
    shortLabel: "Reels",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2.5 3.5l10 4-10 4V3.5z" fill="currentColor"/>
      </svg>
    ),
    badge: "New",
  },
  {
    id: "compare",
    label: "Compare Accounts",
    shortLabel: "Compare",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="4" width="3.5" height="8" rx="1" fill="currentColor" opacity=".35"/>
        <rect x="5.75" y="2" width="3.5" height="10" rx="1" fill="currentColor" opacity=".65"/>
        <rect x="10" y="5" width="3.5" height="7" rx="1" fill="currentColor"/>
      </svg>
    ),
    badge: "New",
  },
  {
    id: "heatmap",
    label: "Posting Heatmap",
    shortLabel: "Heatmap",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M5 1.5v2M10 1.5v2M1.5 6.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <rect x="4" y="8.5" width="2" height="2" rx=".5" fill="currentColor"/>
        <rect x="8.5" y="8.5" width="2" height="2" rx=".5" fill="currentColor" opacity=".4"/>
      </svg>
    ),
    badge: null,
  },
  {
    id: "ai",
    label: "AI Insights",
    shortLabel: "AI",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 2a5.5 5.5 0 100 11A5.5 5.5 0 007.5 2z" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M5.5 8.5s.9 1.5 2 1.5 2-1.5 2-1.5M5.75 6h.01M9.25 6h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    badge: "AI",
  },
];

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const G = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --f:'Inter',sans-serif;--mono:'JetBrains Mono',monospace;
  --bg:#f6f8fb;--surface:#ffffff;--surface2:#f1f5fa;--surface3:#e8eef6;
  --border:rgba(15,23,42,0.08);--border2:rgba(15,23,42,0.12);--border3:rgba(15,23,42,0.20);
  --ink:#0f172a;--ink2:#475569;--ink3:#94a3b8;
  --v:#4f46e5;--v2:#6366f1;--v3:#3730a3;
  --v-glow:rgba(79,70,229,0.14);--v-pale:rgba(79,70,229,0.07);--v-border:rgba(79,70,229,0.20);
  --green:#16a34a;--green-pale:rgba(22,163,74,0.07);--green-border:rgba(22,163,74,0.20);
  --red:#dc2626;--red-pale:rgba(220,38,38,0.07);--red-border:rgba(220,38,38,0.20);
  --sky:#0284c7;--sky-pale:rgba(2,132,199,0.07);--sky-border:rgba(2,132,199,0.20);
  --amber:#d97706;--amber-pale:rgba(217,119,6,0.08);--amber-border:rgba(217,119,6,0.22);
  --nav-w:220px;
}
html{scroll-behavior:smooth}
body{font-family:var(--f);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;min-height:100vh;}
input,select,button,textarea{font-family:var(--f)}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border3);border-radius:99px}
input:focus,select:focus{outline:none;border-color:var(--v)!important;box-shadow:0 0 0 3px var(--v-glow)}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

.up{animation:fadeUp .32s cubic-bezier(.16,1,.3,1) forwards}
.spin-w{width:13px;height:13px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;animation:spin .7s linear infinite;flex-shrink:0}
.spin-v{width:12px;height:12px;border-radius:50%;border:1.5px solid var(--v-border);border-top-color:var(--v);animation:spin .7s linear infinite;flex-shrink:0}
.pulse{animation:pulse 2s ease infinite}

/* layout */
.app-shell{display:flex;min-height:100vh}
.sidebar{
  width:var(--nav-w);min-height:100vh;
  background:var(--surface);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  position:fixed;top:0;left:0;bottom:0;
  z-index:10;overflow-y:auto;
}
.main-content{
  margin-left:var(--nav-w);
  flex:1;min-width:0;
  padding:32px 32px 80px;
  max-width:1100px;
}

/* nav items */
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:10px 14px;border-radius:10px;margin:2px 8px;
  font-size:13px;font-weight:600;color:var(--ink2);
  cursor:pointer;transition:color .14s,background .14s;
  border:none;background:transparent;width:calc(100% - 16px);text-align:left;
}
.nav-item:hover{color:var(--ink);background:var(--surface2)}
.nav-item.active{color:var(--v);background:var(--v-pale);}
.nav-item .nav-badge{
  margin-left:auto;font-size:9px;font-weight:800;padding:2px 6px;border-radius:99px;
  background:var(--v-pale);border:1px solid var(--v-border);color:var(--v3);letter-spacing:.04em;
}
.nav-item .nav-badge.ai{background:rgba(217,119,6,0.08);border-color:rgba(217,119,6,0.22);color:var(--amber)}
.nav-divider{height:1px;background:var(--border);margin:10px 14px}
.nav-section{font-size:9px;fontFamily:"var(--mono)";text-transform:uppercase;letter-spacing:.12em;color:var(--ink3);padding:12px 22px 4px;font-weight:700}

/* cards */
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:0 1px 3px rgba(15,23,42,0.06),0 4px 16px rgba(15,23,42,0.04)}
.card-sm{background:var(--surface2);border:1px solid var(--border);border-radius:12px}
.card-inner{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
.mcard{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;position:relative;overflow:hidden;transition:border-color .18s,transform .18s,box-shadow .18s;box-shadow:0 1px 3px rgba(15,23,42,0.05),0 4px 12px rgba(15,23,42,0.04)}
.mcard:hover{border-color:var(--v-border);transform:translateY(-1px);box-shadow:0 4px 20px rgba(79,70,229,0.10)}
.mcard-glow{border-top:2px solid var(--v)}

/* tabs (used inside scraper) */
.tabs-bar{display:flex;gap:4px;margin-bottom:24px;flex-wrap:wrap;background:var(--surface);padding:5px;border:1px solid var(--border);border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,0.05)}
.tab{padding:10px 18px;font-size:14px;font-weight:600;color:var(--ink2);background:transparent;border:none;cursor:pointer;transition:color .15s,background .15s;white-space:nowrap;border-radius:10px}
.tab:hover{color:var(--ink);background:var(--surface2)}
.tab.on{color:#fff;background:var(--v);box-shadow:0 2px 8px rgba(79,70,229,0.28)}

/* toggles */
.tog-track{width:40px;height:22px;border-radius:99px;background:var(--surface3);border:1px solid var(--border2);position:relative;cursor:pointer;transition:background .18s,border-color .18s;flex-shrink:0}
.tog-track.on{background:var(--v);border-color:var(--v)}
.tog-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .18s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 4px rgba(0,0,0,.25)}
.tog-track.on .tog-thumb{transform:translateX(18px)}

/* form elements */
.inp{width:100%;height:46px;border-radius:11px;border:1px solid var(--border2);background:var(--surface);color:var(--ink);padding:0 14px;font-size:15px;font-weight:500;transition:border-color .15s,box-shadow .15s}
.inp::placeholder{color:var(--ink3)}
.sel-wrap{position:relative}
.sel-wrap select{width:100%;height:46px;border-radius:11px;border:1px solid var(--border2);background:var(--surface);color:var(--ink);padding:0 38px 0 14px;font-size:14px;font-weight:500;appearance:none;cursor:pointer;transition:border-color .15s}
.sel-wrap::after{content:'';position:absolute;right:12px;top:52%;transform:translateY(-50%);pointer-events:none;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--ink3)}

/* buttons */
.btn-primary{height:46px;border-radius:11px;border:none;background:var(--v);color:#fff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .15s,transform .1s,box-shadow .15s}
.btn-primary:hover:not(:disabled){opacity:.88;box-shadow:0 4px 20px rgba(79,70,229,.32)}
.btn-primary:active:not(:disabled){transform:scale(.98)}
.btn-primary:disabled{opacity:.32;cursor:not-allowed}
.btn-ghost{height:46px;padding:0 18px;border-radius:11px;border:1px solid var(--border2);background:var(--surface);color:var(--ink);font-size:14px;font-weight:600;cursor:pointer;transition:background .12s,border-color .12s}
.btn-ghost:hover:not(:disabled){background:var(--surface2);border-color:var(--border3)}
.btn-sm{height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--border2);background:var(--surface);color:var(--ink);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background .12s,border-color .12s}
.btn-sm:hover{background:var(--surface2);border-color:var(--border3)}
.btn-action{width:100%;height:46px;border-radius:11px;font-size:14px;font-weight:700;cursor:pointer;border:1px solid;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .15s,transform .12s}
.btn-action:hover{opacity:.85;transform:translateY(-1px)}

/* misc */
.pill{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em}
.status-bar{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:12px;border:1px solid;font-size:14px;font-weight:600;margin-bottom:20px}
.filters-bar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--border);margin-bottom:16px}
.fold-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;cursor:pointer;user-select:none}
.fold-icon{width:26px;height:26px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--ink3);font-size:11px;transition:background .12s,transform .22s cubic-bezier(.4,0,.2,1)}
.fold-icon.open{transform:rotate(180deg);background:var(--surface3)}
.pcard{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px;transition:border-color .18s,box-shadow .18s,transform .18s;box-shadow:0 1px 3px rgba(15,23,42,0.05),0 4px 12px rgba(15,23,42,0.04)}
.pcard:hover{border-color:var(--v-border);box-shadow:0 4px 20px rgba(79,70,229,.08);transform:translateY(-1px)}

/* grids */
.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.g-posts{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}

@media(max-width:900px){
  .sidebar{display:none}
  .main-content{margin-left:0;padding:20px 16px 60px}
  .g5{grid-template-columns:repeat(2,1fr)}
  .g4{grid-template-columns:repeat(2,1fr)}
  .g-posts{grid-template-columns:1fr 1fr}
}
@media(max-width:600px){
  .g5,.g4,.g3,.g2{grid-template-columns:1fr}
  .g-posts{grid-template-columns:1fr}
}
`;

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function Pill({ children, color = "v" }) {
  const themes = {
    v: ["var(--v-pale)", "var(--v-border)", "var(--v3)"],
    g: ["var(--green-pale)", "var(--green-border)", "var(--green)"],
    sky: ["var(--sky-pale)", "var(--sky-border)", "var(--sky)"],
    ink: ["var(--surface2)", "var(--border2)", "var(--ink2)"],
    amber: ["var(--amber-pale)", "var(--amber-border)", "var(--amber)"],
  };
  const [bg, border, ink] = themes[color] || themes.ink;
  return <span className="pill" style={{ background: bg, border: `1px solid ${border}`, color: ink }}>{children}</span>;
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className={`mcard${accent ? " mcard-glow" : ""}`}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.04em", lineHeight: 1, color: accent ? "var(--v)" : "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 7, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <div className={`tog-track${on ? " on" : ""}`} onClick={() => onChange(!on)}>
        <div className="tog-thumb" />
      </div>
      {label && <span style={{ fontSize: 13, fontWeight: 500, color: on ? "var(--ink)" : "var(--ink3)", transition: "color .15s" }}>{label}</span>}
    </label>
  );
}

function FoldSection({ title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="fold-head" onClick={() => setOpen(o => !o)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em" }}>{title}</span>
          {badge && <Pill color="ink">{badge}</Pill>}
        </div>
        <div className={`fold-icon${open ? " open" : ""}`}>▾</div>
      </div>
      {open && <div className="up">{children}</div>}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="card-inner">
      <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".09em", color: "var(--ink3)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.02em" }}>{value}</div>
    </div>
  );
}

function PostCard({ post, index, followers }) {
  const cap = post.caption || post.text || "(no caption)";
  const t = getTags(cap);
  const m = calcM(post, followers);
  const isCollab = post?.ownerUsername && post?.username && post.ownerUsername !== post.username;
  const ts = post.timestamp || post.takenAtTimestamp;
  const date = ts ? new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : null;
  return (
    <div className="pcard">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)", paddingTop: 2 }}>#{index + 1}</span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Pill color="v">{post.type || "post"}</Pill>
          {isCollab && <Pill color="sky">collab</Pill>}
        </div>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.7, minHeight: 68, margin: 0, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cap}</p>
      {t.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {t.map((tag, i) => (
            <span key={i} style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "2px 7px", borderRadius: 99, background: "var(--v-pale)", color: "var(--v3)", border: "1px solid var(--v-border)" }}>{tag}</span>
          ))}
        </div>
      )}
      <div className="g2" style={{ gap: 6 }}>
        {[["Interactions", fmt(m.interactions)], ["Approx ER", pct(m.erByFollowers)], ["Views", fmt(m.views)], ["ER/views", pct(m.erByViews)]].map(([k, v]) => (
          <MiniStat key={k} label={k} value={v} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--ink2)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f43f5e", display: "inline-block" }} />{fmt(m.likes)}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sky)", display: "inline-block" }} />{fmt(m.comments)}</span>
        </div>
        {date && <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)" }}>{date}</span>}
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({ activeSection, onNavigate }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: "22px 20px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--v)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <rect x="1.5" y="1.5" width="12" height="12" rx="3" stroke="white" strokeWidth="1.4"/>
              <circle cx="7.5" cy="7.5" r="2.5" stroke="white" strokeWidth="1.4"/>
              <circle cx="11" cy="4" r="1" fill="white"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.02em", lineHeight: 1.1 }}>Melange Digital</div>
            <div style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "var(--mono)", letterSpacing: ".04em" }}>IG Analytics</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "10px 0", flex: 1 }}>
        <div className="nav-section">Tools</div>
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item${activeSection === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span style={{ opacity: activeSection === item.id ? 1 : 0.6 }}>{item.icon}</span>
            <span>{item.label}</span>
            {item.badge && (
              <span className={`nav-badge${item.badge === "AI" ? " ai" : ""}`}>{item.badge}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
          <span style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "var(--mono)" }}>Apify connected</span>
        </div>
      </div>
    </aside>
  );
}

// ─── PROFILE SCRAPER (original feature) ───────────────────────────────────────
function ProfileScraper({ onDataScraped }) {
  const [username, setUsername] = useState("");
  const [maxPosts, setMaxPosts] = useState("20");
  const [resultType, setResultType] = useState("posts");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [showCollab, setShowCollab] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function startScrape() {
    const user = norm(username);
    if (!user) { setStatus("Enter an Instagram username.", "error"); return; }
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }
    setLoading(true); setData(null);
    try {
      setStatus("Kicking off scrape…", "info");
      const input = { directUrls: [`https://www.instagram.com/${user}/`], resultsType: resultType === "profile" ? "details" : "posts", resultsLimit: parseInt(maxPosts, 10), addParentData: true };
      const runRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!runRes.ok) { let msg = "Failed to start"; try { const e = await runRes.json(); msg = e.error?.message || msg; } catch {} throw new Error(msg); }
      const rd = await runRes.json();
      const runId = rd?.data?.id, dsId = rd?.data?.defaultDatasetId;
      if (!runId || !dsId) throw new Error("Invalid Apify response.");
      let elapsed = 0, done = false;
      while (elapsed < 300 && !done) {
        await sleep(5000); elapsed += 5;
        setStatus(`Scraping profile… ${elapsed}s`, "info");
        const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`)).json())?.data?.status;
        if (st === "SUCCEEDED") done = true;
        else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) throw new Error(`Run ${st.toLowerCase()}`);
      }
      if (!done) throw new Error("Timed out. Try fewer posts.");
      setStatus("Fetching dataset…", "info");
      const items = await (await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=200`)).json();
      if (!Array.isArray(items) || !items.length) throw new Error("No data returned. Account may be private.");
      const matched = items.filter(i => getUser(i) === user);
      if (!matched.length) { const s = [...new Set(items.map(getUser).filter(Boolean))].slice(0, 4).map(u => `@${u}`).join(", "); throw new Error(s ? `Mismatch — got ${s}` : `No data for @${user}`); }
      setData(matched);
      onDataScraped && onDataScraped(matched, user);
      setStatus(`Done — ${matched.length} items for @${user}`, "success");
      setTab("overview");
    } catch (e) { setStatus(e.message || "Something went wrong.", "error"); }
    finally { setLoading(false); }
  }

  const cleanUser = norm(username);
  const profile = (data || []).find(i => getUser(i) === cleanUser) || null;
  const followers = toN(profile?.followersCount || profile?.ownerFollowersCount || 0);
  const posts = useMemo(() => (data || []).filter(i => getUser(i) === cleanUser && (i?.type || i?.caption !== undefined)), [data, cleanUser]);

  const A = useMemo(() => {
    const n = posts.length;
    const tL = posts.reduce((s, p) => s + toN(p?.likesCount || p?.likes || 0), 0);
    const tC = posts.reduce((s, p) => s + toN(p?.commentsCount || p?.comments || 0), 0);
    const tV = posts.reduce((s, p) => s + toN(p?.videoViewCount || p?.videoPlayCount || 0), 0);
    const tI = tL + tC;
    const col = posts.filter(p => p?.ownerUsername && p?.username && p.ownerUsername !== p.username).length;
    const aL = n ? tL / n : 0, aC = n ? tC / n : 0, aV = n ? tV / n : 0;
    const erF = n && followers > 0 ? ((aL + aC) / followers) * 100 : 0;
    const erV = tV > 0 ? (tI / tV) * 100 : 0;
    const ranked = posts.map(p => ({ ...p, ...calcM(p, followers) })).sort((a, b) => b.interactions - a.interactions);
    return { n, tL, tC, tV, tI, col, aL, aC, aV, erF, erV, best: ranked[0] || null, collabRate: n ? (col / n) * 100 : 0 };
  }, [posts, followers]);

  const filteredPosts = useMemo(() => {
    let p = posts;
    if (showCollab) p = p.filter(x => x?.ownerUsername && x?.username && x.ownerUsername !== x.username);
    if (showVideo) p = p.filter(x => x?.type === "video" || x?.videoViewCount || x?.videoPlayCount);
    return p.slice(0, 9);
  }, [posts, showCollab, showVideo]);

  function buildRows() {
    return posts.map((p, i) => {
      const cap = p.caption || p.text || "";
      const m = calcM(p, followers);
      return { "Post #": i + 1, "Type": p.type || "post", "Username": p.username || "", "Owner": p.ownerUsername || "", "Is Collab": (p.ownerUsername && p.username && p.ownerUsername !== p.username) ? "Yes" : "No", "Caption": cap, "Hashtags": getTags(cap).join(" "), "Likes": m.likes, "Comments": m.comments, "Interactions": m.interactions, "Video Views": p.videoViewCount || "", "ER by Followers": pct(m.erByFollowers), "ER by Views": pct(m.erByViews), "Timestamp": p.timestamp || p.takenAtTimestamp || "", "URL": p.url || (p.shortCode ? `https://instagram.com/p/${p.shortCode}` : "") };
    });
  }

  function exportExcel() {
    if (!posts.length) return;
    const ws = XLSX.utils.json_to_sheet(buildRows());
    ws["!cols"] = [6, 12, 20, 20, 10, 55, 22, 10, 10, 14, 12, 14, 20, 38].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Posts");
    XLSX.writeFile(wb, `ig_${norm(username) || "profile"}_${Date.now()}.xlsx`);
  }

  function exportJSON() {
    if (!posts.length) return;
    const blob = new Blob([JSON.stringify(buildRows(), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `ig_${norm(username) || "profile"}.json`; a.click();
  }

  const profileName = profile?.fullName || profile?.ownerFullName || profile?.username || username;
  const profileHandle = profile?.username || profile?.ownerUsername || username;
  const bio = profile?.biography || profile?.ownerBiography || "";
  const following = profile?.followsCount || profile?.ownerFollowsCount;
  const postsCount = profile?.postsCount || profile?.ownerPostsCount || posts.length || 0;
  const isVerified = profile?.verified || profile?.ownerVerified;
  const initials = (profileName || "IG").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const stStyle = {
    info: { bg: "var(--sky-pale)", ink: "var(--sky)", border: "var(--sky-border)" },
    success: { bg: "var(--green-pale)", ink: "var(--green)", border: "var(--green-border)" },
    error: { bg: "var(--red-pale)", ink: "var(--red)", border: "var(--red-border)" },
  }[statusType] || {};

  const TABS = [{ id: "overview", label: "Overview" }, { id: "posts", label: posts.length ? `Posts (${posts.length})` : "Posts" }, { id: "export", label: "Export" }];

  return (
    <div>
      {/* Hero + form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 28, marginBottom: 28, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "clamp(32px,4vw,52px)", fontWeight: 800, letterSpacing: "-.05em", lineHeight: 1.05, color: "var(--ink)", marginBottom: 14 }}>
            Instagram<br /><span style={{ color: "var(--v)" }}>analytics</span>
          </h1>
          <p style={{ fontSize: 15, color: "var(--ink2)", lineHeight: 1.8, maxWidth: 420 }}>
            Pull real data from any public profile. Posts, engagement rates, collab detection — export clean reports instantly.
          </p>
          {profile && (
            <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
              {[{ label: "Followers", value: fmt(followers) }, { label: "Avg ER", value: pct(A.erF) }, { label: "Posts analysed", value: fmt(A.n) }].map(({ label, value }) => (
                <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px" }}>
                  <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink3)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.03em" }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Run a scrape</div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 3 }}>Public profiles · powered by Apify</div>
            </div>
            {loading && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--v)", fontFamily: "var(--mono)", fontWeight: 600 }}><div className="spin-v" />LIVE</div>}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", display: "block", marginBottom: 6 }}>Username</label>
            <input className="inp" placeholder="e.g. natgeo or @nasa" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && startScrape()} />
          </div>

          <div className="g2" style={{ marginBottom: 16 }}>
            {[{ label: "Max posts", val: maxPosts, set: setMaxPosts, opts: [["10", "10 posts"], ["20", "20 posts"], ["50", "50 posts"], ["100", "100 posts"]] }, { label: "Scrape type", val: resultType, set: setResultType, opts: [["posts", "Posts + profile"], ["profile", "Profile only"]] }].map(({ label, val, set, opts }) => (
              <div key={label}>
                <label style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", display: "block", marginBottom: 6 }}>{label}</label>
                <div className="sel-wrap"><select value={val} onChange={e => set(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" disabled={loading} onClick={startScrape} style={{ flex: 1 }}>
              {loading ? <><div className="spin-w" />Scraping…</> : <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v6M4 3.5L6.5 1 9 3.5M1.5 10h10M1.5 12h10" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                Start scrape
              </>}
            </button>
            <button className="btn-ghost" disabled={loading} onClick={() => { setUsername(""); setData(null); setStatusMsg(null); }}>Reset</button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="status-bar up" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
          {loading && <div className="spin-v" style={{ borderTopColor: stStyle.ink }} />}
          {statusType === "success" && <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          {statusMsg}
        </div>
      )}

      {profile && (
        <div className="up">
          <div className="g5" style={{ marginBottom: 20 }}>
            <MetricCard label="Followers" value={fmt(followers)} sub="Public count" accent />
            <MetricCard label="Avg ER" value={pct(A.erF)} sub="By followers" accent />
            <MetricCard label="Total interactions" value={fmt(A.tI)} sub="Likes + comments" />
            <MetricCard label="Avg views" value={fmt(Math.round(A.aV))} sub="Video & plays" />
            <MetricCard label="Collab rate" value={pct(A.collabRate)} sub="Of selected posts" />
          </div>

          <div className="tabs-bar">
            {TABS.map(t => (
              <button key={t.id} className={`tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {tab === "overview" && (
            <div>
              <FoldSection title="Profile" badge={isVerified ? "✓ Verified" : undefined} defaultOpen>
                <div className="card" style={{ overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 18, alignItems: "flex-start", padding: "24px 26px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div style={{ width: 68, height: 68, borderRadius: 18, background: "var(--v)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff" }}>{initials}</div>
                      {isVerified && <div style={{ position: "absolute", bottom: -3, right: -3, width: 18, height: 18, borderRadius: "50%", background: "#1d9bf0", border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 800 }}>✓</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.03em" }}>{profileName}</div>
                      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--ink3)", marginTop: 5 }}>@{profileHandle}</div>
                      {bio && <div style={{ marginTop: 10, fontSize: 14, color: "var(--ink2)", lineHeight: 1.75, whiteSpace: "pre-line" }}>{bio.length > 200 ? bio.slice(0, 200) + "…" : bio}</div>}
                      <a href={`https://instagram.com/${profileHandle}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 13, color: "var(--v)", fontWeight: 700, textDecoration: "none" }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 8.5L8.5 1.5M8.5 1.5H4.5M8.5 1.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        instagram.com/{profileHandle}
                      </a>
                    </div>
                  </div>
                  <div className="g4" style={{ padding: "20px 26px" }}>
                    {[["Followers", fmt(followers)], ["Following", fmt(following)], ["Profile posts", fmt(postsCount)], ["Analysed", fmt(A.n)]].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink3)", marginBottom: 7 }}>{l}</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </FoldSection>

              <FoldSection title="Analytics summary" defaultOpen>
                <div className="g3" style={{ gap: 10 }}>
                  {[["Avg likes", fmt(Math.round(A.aL)), "Per post"], ["Avg comments", fmt(Math.round(A.aC)), "Per post"], ["ER by views", pct(A.erV), "Interactions ÷ views"], ["Best post", A.best ? fmt(A.best.interactions) : "—", "Highest interactions"], ["Avg views", fmt(Math.round(A.aV)), "Video & plays"], ["Collab posts", A.col, `of ${A.n} total`]].map(([l, v, n]) => (
                    <div className="card-sm" key={l} style={{ padding: "16px 18px" }}>
                      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink3)", marginBottom: 8 }}>{l}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em" }}>{v}</div>
                      <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 5 }}>{n}</div>
                    </div>
                  ))}
                </div>
              </FoldSection>
            </div>
          )}

          {tab === "posts" && (
            <div>
              <FoldSection title="Posts" badge={`${filteredPosts.length} shown`} defaultOpen>
                <div className="filters-bar">
                  <span style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", flexShrink: 0 }}>Filter</span>
                  <Toggle on={showCollab} onChange={setShowCollab} label="Collab only" />
                  <Toggle on={showVideo} onChange={setShowVideo} label="Video only" />
                  {(showCollab || showVideo) && <button className="btn-sm" onClick={() => { setShowCollab(false); setShowVideo(false); }} style={{ marginLeft: "auto" }}>Clear</button>}
                </div>
                {filteredPosts.length > 0 ? (
                  <div className="g-posts">
                    {filteredPosts.map((p, i) => <PostCard key={p.id || i} post={p} index={i} followers={followers} />)}
                  </div>
                ) : (
                  <div style={{ padding: 48, textAlign: "center", fontSize: 14, color: "var(--ink3)", border: "1px dashed var(--border2)", borderRadius: 12, background: "var(--surface2)" }}>
                    No posts match the current filters.
                  </div>
                )}
              </FoldSection>
            </div>
          )}

          {tab === "export" && (
            <div>
              <FoldSection title="Export data" defaultOpen>
                <div className="g2" style={{ gap: 12, marginBottom: 14 }}>
                  <div className="card" style={{ padding: 24 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--green-pale)", border: "1px solid var(--green-border)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2.5" stroke="var(--green)" strokeWidth="1.5"/><path d="M5.5 8l2 2 3-3" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>Excel Workbook</div>
                    <div style={{ fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.7, marginBottom: 20 }}>Formatted sheet with all post metrics. Perfect for client reports.</div>
                    <button className="btn-action" onClick={exportExcel} style={{ background: "var(--green-pale)", color: "var(--green)", borderColor: "var(--green-border)" }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M4 5.5L6.5 8.5l2.5-3M1.5 10h10M1.5 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                      Download .xlsx
                    </button>
                  </div>
                  <div className="card" style={{ padding: 24 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--v-pale)", border: "1px solid var(--v-border)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, fontSize: 13, fontFamily: "var(--mono)", color: "var(--v3)", fontWeight: 700 }}>{"{}"}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>JSON Data</div>
                    <div style={{ fontSize: 13.5, color: "var(--ink2)", lineHeight: 1.7, marginBottom: 20 }}>Raw post array with all computed metrics. Ready for pipelines.</div>
                    <button className="btn-action" onClick={exportJSON} style={{ background: "var(--v-pale)", color: "var(--v3)", borderColor: "var(--v-border)" }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v7M4 5.5L6.5 8.5l2.5-3M1.5 10h10M1.5 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                      Download .json
                    </button>
                  </div>
                </div>
              </FoldSection>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [section, setSection] = useState("scraper");
  // shared scraped data — passed from ProfileScraper to Heatmap & AI Insights
  const [scrapedPosts, setScrapedPosts] = useState([]);
  const [scrapedProfile, setScrapedProfile] = useState(null);

  function handleDataScraped(data, user) {
    const profile = data.find(i => (i?.username || i?.ownerUsername || "").toLowerCase() === user) || data[0] || null;
    const posts = data.filter(i => i?.caption !== undefined || i?.likesCount !== undefined);
    setScrapedPosts(posts);
    setScrapedProfile(profile);
  }

  const followers = toN(scrapedProfile?.followersCount || scrapedProfile?.ownerFollowersCount || 0);

  return (
    <>
      <style>{G}</style>
      <div className="app-shell">
        <Sidebar activeSection={section} onNavigate={setSection} />
        <main className="main-content">
          {section === "scraper" && <ProfileScraper onDataScraped={handleDataScraped} />}
          {section === "hashtags" && <HashtagExplorer />}
          {section === "reels" && <TrendingReels />}
          {section === "compare" && <CompetitorCompare />}
          {section === "heatmap" && <PostingHeatmap posts={scrapedPosts} followers={followers} />}
          {section === "ai" && <AIInsights posts={scrapedPosts} profile={scrapedProfile} />}
        </main>
      </div>
    </>
  );
}
