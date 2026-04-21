import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import HashtagExplorer from "./components/HashtagExplorer";
import TrendingReels from "./components/TrendingReels";
import CompetitorCompare from "./components/CompetitorCompare";
import PostingHeatmap from "./components/PostingHeatmap";
import AIInsights from "./components/AIInsights";
import StoriesScraper from "./components/StoriesScraper"; // ← new

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

// ── Nav: added "stories" entry ────────────────────────────────────────────────
const NAV = [
  { id: "scraper",  label: "Profile Scraper",  badge: null  },
  { id: "stories",  label: "Stories Scraper",  badge: "New" }, // ← new
  { id: "hashtags", label: "Hashtag Explorer", badge: "New" },
  { id: "reels",    label: "Trending Reels",   badge: "New" },
  { id: "compare",  label: "Compare Accounts", badge: "New" },
  { id: "heatmap",  label: "Posting Heatmap",  badge: null  },
  { id: "ai",       label: "AI Insights",      badge: "AI"  },
];

const G = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --f:'Inter',sans-serif;--mono:'JetBrains Mono',monospace;
  --bg:#F8F8F7;--surface:#FFFFFF;--surface2:#F2F1EE;--surface3:#E8E7E3;
  --border:rgba(0,0,0,0.07);--border2:rgba(0,0,0,0.11);--border3:rgba(0,0,0,0.20);
  --ink:#111110;--ink2:#6F6D66;--ink3:#B5B3AD;
  --accent:#4F46E5;--accent-pale:#EEEDFD;--accent-border:#C4C1F9;--accent-dark:#3730A3;
  --green:#16A34A;--green-pale:#F0FDF4;--green-border:#BBF7D0;
  --amber:#D97706;--amber-pale:#FFFBEB;--amber-border:#FDE68A;
  --red:#DC2626;--red-pale:#FEF2F2;--red-border:#FECACA;
  --nav-w:220px;--r:10px;--rl:14px;
}
html{scroll-behavior:smooth}
body{font-family:var(--f);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;min-height:100vh}
input,select,button,textarea{font-family:var(--f)}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border3);border-radius:99px}
input:focus,select:focus{outline:none!important;border-color:var(--accent)!important;box-shadow:0 0 0 3px rgba(79,70,229,.10)!important}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}

.aup{animation:fadeUp .25s cubic-bezier(.16,1,.3,1) forwards}
.spin-w{width:13px;height:13px;border-radius:50%;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;animation:spin .7s linear infinite;flex-shrink:0}
.spin-a{width:12px;height:12px;border-radius:50%;border:1.5px solid var(--accent-border);border-top-color:var(--accent);animation:spin .7s linear infinite;flex-shrink:0}

/* Shell */
.shell{display:flex;min-height:100vh}

/* Sidebar */
.sidebar{width:var(--nav-w);min-height:100vh;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:20;overflow-y:auto}
.logo-area{padding:18px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.logo-mark{width:30px;height:30px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-name{font-size:13px;font-weight:700;color:var(--ink);letter-spacing:-.02em;line-height:1.1}
.logo-tag{font-size:9px;color:var(--ink3);font-family:var(--mono);letter-spacing:.08em;margin-top:2px}
.nsec{font-size:9px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.14em;color:var(--ink3);padding:14px 16px 5px}
.nitem{display:flex;align-items:center;gap:9px;padding:8px 12px;border-radius:8px;margin:1px 6px;font-size:13px;font-weight:500;color:var(--ink2);border:none;background:transparent;cursor:pointer;text-align:left;width:calc(100% - 12px);transition:color .12s,background .12s}
.nitem:hover{color:var(--ink);background:var(--surface2)}
.nitem.active{color:var(--accent);background:var(--accent-pale)}
.nitem svg{width:15px;height:15px;flex-shrink:0;opacity:.5}
.nitem.active svg{opacity:1}
.nbadge{margin-left:auto;font-size:8px;font-weight:600;padding:2px 6px;border-radius:99px;background:var(--accent-pale);border:1px solid var(--accent-border);color:var(--accent-dark);font-family:var(--mono);letter-spacing:.04em}
.nbadge.ai{background:var(--amber-pale);border-color:var(--amber-border);color:var(--amber)}
.nav-foot{margin-top:auto;padding:14px 16px;border-top:1px solid var(--border);display:flex;align-items:center;gap:7px}
.nav-foot span{font-size:11px;color:var(--ink3);font-family:var(--mono)}

/* Main */
.main{margin-left:var(--nav-w);flex:1;min-width:0;padding:32px 36px 80px;max-width:1000px}

/* Page title block */
.page-head{margin-bottom:28px}
.page-title{font-size:28px;font-weight:700;color:var(--ink);letter-spacing:-.04em;line-height:1.1}
.page-title span{color:var(--accent)}
.page-desc{font-size:14px;color:var(--ink2);line-height:1.75;margin-top:8px;}

/* Scrape card */
.scrape-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:22px;margin-bottom:24px}
.scrape-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.scrape-card-title{font-size:14px;font-weight:600;color:var(--ink)}
.scrape-card-sub{font-size:12px;color:var(--ink3);margin-top:2px}
.live-badge{display:flex;align-items:center;gap:5px;font-size:9px;font-family:var(--mono);color:var(--accent);font-weight:600;letter-spacing:.06em;background:var(--accent-pale);border:1px solid var(--accent-border);padding:3px 9px;border-radius:99px}
.live-dot{width:5px;height:5px;border-radius:50%;background:var(--accent);animation:blink 1.2s ease infinite}

/* Form layout */
.form-username{margin-bottom:12px}
.form-row{display:flex;gap:10px;align-items:flex-end}
.form-field{display:flex;flex-direction:column;gap:5px}
.field-label{font-size:9.5px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--ink3)}
.inp{width:100%;height:42px;border-radius:var(--r);border:1px solid var(--border2);background:var(--surface2);color:var(--ink);padding:0 13px;font-size:14px;font-weight:400;transition:border-color .13s,background .13s}
.inp::placeholder{color:var(--ink3)}
.inp:focus{background:var(--surface)}
.sel-wrap{position:relative}
.sel-wrap select{height:42px;border-radius:var(--r);border:1px solid var(--border2);background:var(--surface2);color:var(--ink);padding:0 32px 0 12px;font-size:13px;font-weight:400;appearance:none;cursor:pointer;transition:border-color .13s;white-space:nowrap}
.sel-wrap::after{content:'';position:absolute;right:10px;top:53%;transform:translateY(-50%);pointer-events:none;border-left:3.5px solid transparent;border-right:3.5px solid transparent;border-top:4.5px solid var(--ink3)}
.btn-primary{height:42px;padding:0 20px;border-radius:var(--r);border:none;background:var(--accent);color:#fff;font-size:13.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:opacity .13s,transform .1s;white-space:nowrap;flex-shrink:0}
.btn-primary:hover:not(:disabled){opacity:.88}
.btn-primary:active:not(:disabled){transform:scale(.98)}
.btn-primary:disabled{opacity:.3;cursor:not-allowed}
.btn-ghost{height:42px;padding:0 16px;border-radius:var(--r);border:1px solid var(--border2);background:transparent;color:var(--ink2);font-size:13px;font-weight:500;cursor:pointer;transition:background .12s;white-space:nowrap;flex-shrink:0}
.btn-ghost:hover:not(:disabled){background:var(--surface2)}

/* Status */
.status-bar{display:flex;align-items:center;gap:9px;padding:12px 15px;border-radius:var(--r);border:1px solid;font-size:13px;font-weight:500;margin-bottom:20px}

/* Metric cards */
.metrics-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:22px}
.mcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 17px;transition:border-color .14s}
.mcard:hover{border-color:var(--border2)}
.mcard.hi{border-color:var(--accent-border);background:var(--accent-pale)}
.mcard-lbl{font-size:9px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.11em;color:var(--ink3);margin-bottom:9px}
.mcard-val{font-size:21px;font-weight:700;letter-spacing:-.04em;color:var(--ink)}
.mcard.hi .mcard-val{color:var(--accent)}
.mcard-sub{font-size:11px;color:var(--ink3);margin-top:4px}

/* Tabs */
.tabs-bar{display:flex;gap:3px;margin-bottom:20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:4px}
.tab{padding:8px 18px;font-size:13px;font-weight:500;color:var(--ink2);background:transparent;border:none;cursor:pointer;border-radius:9px;white-space:nowrap;transition:color .12s,background .12s}
.tab:hover{color:var(--ink);background:var(--surface2)}
.tab.on{color:#fff;background:var(--accent)}

/* Profile card */
.profile-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:18px}
.profile-top{display:flex;gap:16px;align-items:flex-start;padding:20px 22px;border-bottom:1px solid var(--border)}
.avatar{width:54px;height:54px;border-radius:13px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;flex-shrink:0;letter-spacing:-.01em}
.prof-name{font-size:18px;font-weight:700;color:var(--ink);letter-spacing:-.03em}
.prof-handle{font-size:11px;color:var(--ink3);font-family:var(--mono);margin-top:3px}
.prof-bio{font-size:13px;color:var(--ink2);line-height:1.7;margin-top:8px}
.prof-link{display:inline-flex;align-items:center;gap:5px;margin-top:9px;font-size:12px;color:var(--accent);font-weight:600;text-decoration:none}
.prof-link:hover{opacity:.75}
.profile-stats{display:grid;grid-template-columns:repeat(4,1fr)}
.pstat{padding:16px 20px;border-right:1px solid var(--border)}
.pstat:last-child{border-right:none}
.pstat-l{font-size:9px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--ink3);margin-bottom:6px}
.pstat-v{font-size:21px;font-weight:700;letter-spacing:-.04em;color:var(--ink)}

/* Summary */
.sec-h{font-size:11px;font-weight:600;color:var(--ink);margin-bottom:10px;margin-top:20px;letter-spacing:-.01em}
.sum-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.scard{background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px}
.scard-l{font-size:9px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--ink3);margin-bottom:7px}
.scard-v{font-size:20px;font-weight:700;letter-spacing:-.04em;color:var(--ink)}
.scard-s{font-size:11px;color:var(--ink3);margin-top:4px}

/* Filters */
.filters{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:10px 14px;border-radius:var(--r);background:var(--surface);border:1px solid var(--border);margin-bottom:14px}
.filter-lbl{font-size:9.5px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.12em;color:var(--ink3)}
.tog-wrap{display:flex;align-items:center;gap:7px;cursor:pointer}
.tog-track{width:36px;height:20px;border-radius:99px;background:var(--surface3);border:1px solid var(--border2);position:relative;cursor:pointer;transition:background .15s,border-color .15s;flex-shrink:0}
.tog-track.on{background:var(--accent);border-color:var(--accent)}
.tog-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s cubic-bezier(.4,0,.2,1);box-shadow:0 1px 3px rgba(0,0,0,.2)}
.tog-track.on .tog-thumb{transform:translateX(16px)}
.tog-lbl{font-size:12.5px;font-weight:500;color:var(--ink2)}

/* Post cards */
.posts-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.pcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:15px;display:flex;flex-direction:column;gap:10px;transition:border-color .14s}
.pcard:hover{border-color:var(--accent-border)}
.pcard-top{display:flex;align-items:flex-start;justify-content:space-between}
.p-num{font-size:10px;font-family:var(--mono);color:var(--ink3)}
.p-type{font-size:10px;font-family:var(--mono);padding:2px 7px;border-radius:99px;background:var(--accent-pale);border:1px solid var(--accent-border);color:var(--accent-dark)}
.p-cap{font-size:12.5px;color:var(--ink2);line-height:1.72;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.p-tags{display:flex;flex-wrap:wrap;gap:4px}
.p-tag{font-size:10px;font-family:var(--mono);padding:2px 7px;border-radius:99px;background:var(--surface2);color:var(--ink2);border:1px solid var(--border2)}
.mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.mini{background:var(--surface2);border-radius:7px;padding:8px 10px}
.mini-l{font-size:8.5px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.09em;color:var(--ink3);margin-bottom:3px}
.mini-v{font-size:14px;font-weight:600;color:var(--ink);letter-spacing:-.02em}
.pcard-foot{display:flex;align-items:center;justify-content:space-between;padding-top:9px;border-top:1px solid var(--border)}
.p-counts{display:flex;gap:9px;font-size:12px;color:var(--ink2)}
.cdot{width:5px;height:5px;border-radius:50%;display:inline-block;margin-right:3px}
.p-date{font-size:10px;font-family:var(--mono);color:var(--ink3)}

/* Export */
.export-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ecard{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:20px}
.ecard-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
.ecard-title{font-size:14px;font-weight:600;color:var(--ink);margin-bottom:6px;letter-spacing:-.01em}
.ecard-desc{font-size:13px;color:var(--ink2);line-height:1.7;margin-bottom:16px}
.btn-exp{width:100%;height:40px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;border:1px solid;display:flex;align-items:center;justify-content:center;gap:7px;transition:opacity .12s}
.btn-exp:hover{opacity:.78}

.empty{padding:44px;text-align:center;font-size:13px;color:var(--ink3);border:1px dashed var(--border2);border-radius:var(--r);background:var(--surface2)}
.placeholder{padding:80px 40px;text-align:center;color:var(--ink3)}
.placeholder-title{font-size:15px;font-weight:600;color:var(--ink2);margin-bottom:6px;margin-top:14px}
.placeholder-sub{font-size:13px}

/* Responsive */
@media(max-width:900px){
  .sidebar{display:none}
  .main{margin-left:0;padding:20px 18px 60px}
  .metrics-row{grid-template-columns:repeat(2,1fr)}
  .posts-grid{grid-template-columns:1fr 1fr}
  .profile-stats{grid-template-columns:1fr 1fr}
  .pstat{border-right:none;border-bottom:1px solid var(--border)}
  .pstat:nth-child(even){border-right:none}
  .pstat:last-child,.pstat:nth-last-child(2):nth-child(odd){border-bottom:none}
  .form-row{flex-wrap:wrap}
}
@media(max-width:600px){
  .metrics-row{grid-template-columns:1fr 1fr}
  .sum-grid{grid-template-columns:1fr 1fr}
  .posts-grid{grid-template-columns:1fr}
  .export-grid{grid-template-columns:1fr}
  .form-row{flex-direction:column;align-items:stretch}
  .sel-wrap select,.btn-primary,.btn-ghost{width:100%}
}
@media(max-width:400px){
  .metrics-row{grid-template-columns:1fr}
  .sum-grid{grid-template-columns:1fr}
}
`;

const NavIcon = ({ id }) => {
  const p = {
    scraper:  <><rect x="1.5" y="1.5" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4"/><circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="11" cy="4" r="1" fill="currentColor"/></>,
    stories:  <><rect x="1.5" y="1.5" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M5 5.5h5M5 7.5h5M5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="11.5" cy="3.5" r="1.5" fill="currentColor" opacity=".7"/></>, // ← stories icon
    hashtags: <path d="M3 5h9M3 10h9M6 1.5v12M9 1.5v12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>,
    reels:    <path d="M2.5 3.5l10 4-10 4V3.5z" fill="currentColor"/>,
    compare:  <><rect x="1.5" y="4" width="3.5" height="8" rx="1" fill="currentColor" opacity=".3"/><rect x="5.75" y="2" width="3.5" height="10" rx="1" fill="currentColor" opacity=".65"/><rect x="10" y="5" width="3.5" height="7" rx="1" fill="currentColor"/></>,
    heatmap:  <><rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 1.5v2M10 1.5v2M1.5 6.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="4" y="8.5" width="2" height="2" rx=".5" fill="currentColor"/><rect x="8.5" y="8.5" width="2" height="2" rx=".5" fill="currentColor" opacity=".4"/></>,
    ai:       <><path d="M7.5 2a5.5 5.5 0 100 11A5.5 5.5 0 007.5 2z" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 8.5s.9 1.5 2 1.5 2-1.5 2-1.5M5.75 6h.01M9.25 6h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></>,
  };
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none">{p[id]}</svg>;
};

function Toggle({ on, onChange, label }) {
  return (
    <div className="tog-wrap" onClick={() => onChange(!on)}>
      <div className={`tog-track${on ? " on" : ""}`}><div className="tog-thumb" /></div>
      {label && <span className="tog-lbl">{label}</span>}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="mini">
      <div className="mini-l">{label}</div>
      <div className="mini-v">{value}</div>
    </div>
  );
}

function PostCard({ post, index, followers }) {
  const cap = post.caption || post.text || "(no caption)";
  const t = getTags(cap);
  const m = calcM(post, followers);
  const ts = post.timestamp || post.takenAtTimestamp;
  const date = ts ? new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : null;
  return (
    <div className="pcard">
      <div className="pcard-top">
        <span className="p-num">#{index + 1}</span>
        <span className="p-type">{post.type || "post"}</span>
      </div>
      <p className="p-cap">{cap}</p>
      {t.length > 0 && <div className="p-tags">{t.map((tag, i) => <span key={i} className="p-tag">{tag}</span>)}</div>}
      <div className="mini-grid">
        <MiniStat label="Interactions" value={fmt(m.interactions)} />
        <MiniStat label="Approx ER"    value={pct(m.erByFollowers)} />
        <MiniStat label="Views"        value={fmt(m.views)} />
        <MiniStat label="ER/views"     value={pct(m.erByViews)} />
      </div>
      <div className="pcard-foot">
        <div className="p-counts">
          <span><span className="cdot" style={{ background: "#F43F5E" }} />{fmt(m.likes)}</span>
          <span><span className="cdot" style={{ background: "var(--accent)" }} />{fmt(m.comments)}</span>
        </div>
        {date && <span className="p-date">{date}</span>}
      </div>
    </div>
  );
}

function Sidebar({ active, onNav }) {
  return (
    <aside className="sidebar">
      <div className="logo-area">
        <div className="logo-mark">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="3" stroke="white" strokeWidth="1.4"/>
            <circle cx="7" cy="7" r="2.3" stroke="white" strokeWidth="1.4"/>
            <circle cx="10.5" cy="3.5" r="1" fill="white"/>
          </svg>
        </div>
        <div>
          <div className="logo-name">Melange Digital</div>
          <div className="logo-tag">IG ANALYTICS</div>
        </div>
      </div>
      <nav style={{ padding: "8px 0", flex: 1 }}>
        <div className="nsec">Tools</div>
        {NAV.map(item => (
          <button key={item.id} className={`nitem${active === item.id ? " active" : ""}`} onClick={() => onNav(item.id)}>
            <NavIcon id={item.id} />
            <span>{item.label}</span>
            {item.badge && <span className={`nbadge${item.badge === "AI" ? " ai" : ""}`}>{item.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="nav-foot">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block", flexShrink: 0 }} />
        <span>Apify connected</span>
      </div>
    </aside>
  );
}

function ProfileScraper({ onDataScraped }) {
  const [username, setUsername]     = useState("");
  const [maxPosts, setMaxPosts]     = useState("20");
  const [resultType, setResultType] = useState("posts");
  const [loading, setLoading]       = useState(false);
  const [statusMsg, setStatusMsg]   = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [data, setData]             = useState(null);
  const [tab, setTab]               = useState("overview");
  const [showCollab, setShowCollab] = useState(false);
  const [showVideo, setShowVideo]   = useState(false);

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
  const profile   = (data || []).find(i => getUser(i) === cleanUser) || null;
  const followers = toN(profile?.followersCount || profile?.ownerFollowersCount || 0);
  const posts     = useMemo(() => (data || []).filter(i => getUser(i) === cleanUser && (i?.type || i?.caption !== undefined)), [data, cleanUser]);

  const A = useMemo(() => {
    const n   = posts.length;
    const tL  = posts.reduce((s, p) => s + toN(p?.likesCount || p?.likes || 0), 0);
    const tC  = posts.reduce((s, p) => s + toN(p?.commentsCount || p?.comments || 0), 0);
    const tV  = posts.reduce((s, p) => s + toN(p?.videoViewCount || p?.videoPlayCount || 0), 0);
    const tI  = tL + tC;
    const col = posts.filter(p => p?.ownerUsername && p?.username && p.ownerUsername !== p.username).length;
    const aL  = n ? tL / n : 0, aC = n ? tC / n : 0, aV = n ? tV / n : 0;
    const erF = n && followers > 0 ? ((aL + aC) / followers) * 100 : 0;
    const erV = tV > 0 ? (tI / tV) * 100 : 0;
    const ranked = posts.map(p => ({ ...p, ...calcM(p, followers) })).sort((a, b) => b.interactions - a.interactions);
    return { n, tL, tC, tV, tI, col, aL, aC, aV, erF, erV, best: ranked[0] || null, collabRate: n ? (col / n) * 100 : 0 };
  }, [posts, followers]);

  const filteredPosts = useMemo(() => {
    let p = posts;
    if (showCollab) p = p.filter(x => x?.ownerUsername && x?.username && x.ownerUsername !== x.username);
    if (showVideo)  p = p.filter(x => x?.type === "video" || x?.videoViewCount || x?.videoPlayCount);
    return p.slice(0, 9);
  }, [posts, showCollab, showVideo]);

  function buildRows() {
    return posts.map((p, i) => {
      const cap = p.caption || p.text || "";
      const m   = calcM(p, followers);
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

  const profileName   = profile?.fullName || profile?.ownerFullName || profile?.username || username;
  const profileHandle = profile?.username || profile?.ownerUsername || username;
  const bio           = profile?.biography || profile?.ownerBiography || "";
  const following     = profile?.followsCount || profile?.ownerFollowsCount;
  const postsCount    = profile?.postsCount || profile?.ownerPostsCount || posts.length || 0;
  const isVerified    = profile?.verified || profile?.ownerVerified;
  const initials      = (profileName || "IG").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const stStyle = {
    info:    { bg: "var(--accent-pale)", ink: "var(--accent-dark)", border: "var(--accent-border)" },
    success: { bg: "var(--green-pale)",  ink: "var(--green)",       border: "var(--green-border)"  },
    error:   { bg: "var(--red-pale)",    ink: "var(--red)",         border: "var(--red-border)"    },
  }[statusType] || {};

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "posts",    label: posts.length ? `Posts (${posts.length})` : "Posts" },
    { id: "export",   label: "Export" },
  ];

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Instagram <span>analytics</span></h1>
        <p className="page-desc">Pull real data from any public profile. Posts, engagement rates, collab detection — export clean reports instantly.</p>
      </div>

      <div className="scrape-card">
        <div className="scrape-card-head">
          <div>
            <div className="scrape-card-title">Run a scrape</div>
            <div className="scrape-card-sub">Public profiles · powered by Apify</div>
          </div>
          {loading && <div className="live-badge"><div className="live-dot" />LIVE</div>}
        </div>

        <div className="form-username">
          <label className="field-label" style={{ display: "block", marginBottom: 6 }}>Username</label>
          <input
            className="inp"
            placeholder="e.g. natgeo or @nasa"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && startScrape()}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="field-label">Max posts</label>
            <div className="sel-wrap">
              <select value={maxPosts} onChange={e => setMaxPosts(e.target.value)}>
                {[["10","10 posts"],["20","20 posts"],["50","50 posts"],["100","100 posts"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="form-field">
            <label className="field-label">Scrape type</label>
            <div className="sel-wrap">
              <select value={resultType} onChange={e => setResultType(e.target.value)}>
                <option value="posts">Posts + profile</option>
                <option value="profile">Profile only</option>
              </select>
            </div>
          </div>
          <button className="btn-primary" disabled={loading} onClick={startScrape} style={{ marginTop: "auto" }}>
            {loading
              ? <><div className="spin-w" />Scraping…</>
              : <><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v6M4 3.5L6.5 1 9 3.5M1.5 10h10M1.5 12h10" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>Start scrape</>
            }
          </button>
          <button className="btn-ghost" disabled={loading} onClick={() => { setUsername(""); setData(null); setStatusMsg(null); }} style={{ marginTop: "auto" }}>Reset</button>
        </div>
      </div>

      {statusMsg && (
        <div className="status-bar aup" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
          {loading && <div className="spin-a" style={{ borderTopColor: stStyle.ink }} />}
          {statusType === "success" && <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          {statusMsg}
        </div>
      )}

      {profile && (
        <div className="aup">
          <div className="metrics-row">
            <div className="mcard hi"><div className="mcard-lbl">Followers</div><div className="mcard-val">{fmt(followers)}</div><div className="mcard-sub">Public count</div></div>
            <div className="mcard hi"><div className="mcard-lbl">Avg ER</div><div className="mcard-val">{pct(A.erF)}</div><div className="mcard-sub">By followers</div></div>
            <div className="mcard"><div className="mcard-lbl">Total interactions</div><div className="mcard-val">{fmt(A.tI)}</div><div className="mcard-sub">Likes + comments</div></div>
            <div className="mcard"><div className="mcard-lbl">Avg views</div><div className="mcard-val">{fmt(Math.round(A.aV))}</div><div className="mcard-sub">Video & plays</div></div>
            <div className="mcard"><div className="mcard-lbl">Collab rate</div><div className="mcard-val">{pct(A.collabRate)}</div><div className="mcard-sub">Of posts</div></div>
          </div>

          <div className="tabs-bar">
            {TABS.map(t => <button key={t.id} className={`tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </div>

          {tab === "overview" && (
            <div>
              <div className="profile-card">
                <div className="profile-top">
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div className="avatar">{initials}</div>
                    {isVerified && <div style={{ position: "absolute", bottom: -3, right: -3, width: 17, height: 17, borderRadius: "50%", background: "#1D9BF0", border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: "#fff", fontWeight: 800 }}>✓</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="prof-name">{profileName}</div>
                    <div className="prof-handle">@{profileHandle}</div>
                    {bio && <div className="prof-bio">{bio.length > 200 ? bio.slice(0, 200) + "…" : bio}</div>}
                    <a href={`https://instagram.com/${profileHandle}`} target="_blank" rel="noreferrer" className="prof-link">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 8.5L8.5 1.5M8.5 1.5H4.5M8.5 1.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      instagram.com/{profileHandle}
                    </a>
                  </div>
                </div>
                <div className="profile-stats">
                  {[["Followers", fmt(followers)], ["Following", fmt(following)], ["Profile posts", fmt(postsCount)], ["Analysed", fmt(A.n)]].map(([l, v]) => (
                    <div key={l} className="pstat"><div className="pstat-l">{l}</div><div className="pstat-v">{v}</div></div>
                  ))}
                </div>
              </div>

              <div className="sec-h">Analytics summary</div>
              <div className="sum-grid">
                {[
                  ["Avg likes",    fmt(Math.round(A.aL)), "Per post"],
                  ["Avg comments", fmt(Math.round(A.aC)), "Per post"],
                  ["ER by views",  pct(A.erV),            "Interactions ÷ views"],
                  ["Best post",    A.best ? fmt(A.best.interactions) : "—", "Highest interactions"],
                  ["Avg views",    fmt(Math.round(A.aV)), "Video & plays"],
                  ["Collab posts", A.col,                 `of ${A.n} total`],
                ].map(([l, v, s]) => (
                  <div key={l} className="scard"><div className="scard-l">{l}</div><div className="scard-v">{v}</div><div className="scard-s">{s}</div></div>
                ))}
              </div>
            </div>
          )}

          {tab === "posts" && (
            <div>
              <div className="filters">
                <span className="filter-lbl">Filter</span>
                <Toggle on={showCollab} onChange={setShowCollab} label="Collab only" />
                <Toggle on={showVideo}  onChange={setShowVideo}  label="Video only" />
                {(showCollab || showVideo) && (
                  <button className="btn-ghost" style={{ height: 30, padding: "0 11px", fontSize: 12, marginLeft: "auto" }} onClick={() => { setShowCollab(false); setShowVideo(false); }}>Clear</button>
                )}
              </div>
              {filteredPosts.length > 0
                ? <div className="posts-grid">{filteredPosts.map((p, i) => <PostCard key={p.id || i} post={p} index={i} followers={followers} />)}</div>
                : <div className="empty">No posts match the current filters.</div>
              }
            </div>
          )}

          {tab === "export" && (
            <div className="export-grid">
              <div className="ecard">
                <div className="ecard-icon" style={{ background: "var(--green-pale)", border: "1px solid var(--green-border)" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2.5" stroke="var(--green)" strokeWidth="1.4"/><path d="M5.5 8.5l2 2 3-3" stroke="var(--green)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div className="ecard-title">Excel Workbook</div>
                <div className="ecard-desc">Formatted sheet with all post metrics. Perfect for client reports.</div>
                <button className="btn-exp" onClick={exportExcel} style={{ background: "var(--green-pale)", color: "var(--green)", borderColor: "var(--green-border)" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Download .xlsx
                </button>
              </div>
              <div className="ecard">
                <div className="ecard-icon" style={{ background: "var(--accent-pale)", border: "1px solid var(--accent-border)", fontSize: 13, fontFamily: "var(--mono)", color: "var(--accent-dark)", fontWeight: 700 }}>{"{}"}</div>
                <div className="ecard-title">JSON Data</div>
                <div className="ecard-desc">Raw post array with all computed metrics. Ready for pipelines.</div>
                <button className="btn-exp" onClick={exportJSON} style={{ background: "var(--accent-pale)", color: "var(--accent-dark)", borderColor: "var(--accent-border)" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Download .json
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [section, setSection]               = useState("scraper");
  const [scrapedPosts, setScrapedPosts]     = useState([]);
  const [scrapedProfile, setScrapedProfile] = useState(null);

  function handleDataScraped(data, user) {
    const profile = data.find(i => (i?.username || i?.ownerUsername || "").toLowerCase() === user) || data[0] || null;
    const posts   = data.filter(i => i?.caption !== undefined || i?.likesCount !== undefined);
    setScrapedPosts(posts);
    setScrapedProfile(profile);
  }

  const followers = toN(scrapedProfile?.followersCount || scrapedProfile?.ownerFollowersCount || 0);

  return (
    <>
      <style>{G}</style>
      <div className="shell">
        <Sidebar active={section} onNav={setSection} />
        <main className="main">
          {section === "scraper"  && <ProfileScraper onDataScraped={handleDataScraped} />}
          {section === "stories"  && <StoriesScraper />}
          {section === "hashtags" && <HashtagExplorer />}
          {section === "reels"    && <TrendingReels />}
          {section === "compare"  && <CompetitorCompare />}
          {section === "heatmap"  && <PostingHeatmap posts={scrapedPosts} followers={followers} />}
          {section === "ai"       && <AIInsights posts={scrapedPosts} profile={scrapedProfile} />}
        </main>
      </div>
    </>
  );
}
