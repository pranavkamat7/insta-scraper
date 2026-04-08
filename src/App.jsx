import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

const ACTOR_ID = "apify~instagram-scraper";
const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;

/* ─── utils ─────────────────────────────────────────────────────────── */
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
  return {
    likes, comments, views, interactions,
    erByFollowers: f > 0 ? (interactions / f) * 100 : 0,
    erByViews: views > 0 ? (interactions / views) * 100 : 0,
  };
};

/* ─── global CSS ─────────────────────────────────────────────────────── */
const G = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --f:'Plus Jakarta Sans',sans-serif;
  --mono:'JetBrains Mono',monospace;

  --bg:#07080f;
  --bg2:#0b0d16;
  --surface:#0f1120;
  --surface2:#161828;
  --surface3:#1c1f33;

  --border:rgba(255,255,255,0.06);
  --border2:rgba(255,255,255,0.10);
  --border3:rgba(255,255,255,0.16);

  --ink:#eef0ff;
  --ink2:#8b8fbd;
  --ink3:#4a4e6e;

  --v:#7c6bff;
  --v2:#9d8fff;
  --v3:#c4baff;
  --v-glow:rgba(124,107,255,0.15);
  --v-pale:rgba(124,107,255,0.07);
  --v-border:rgba(124,107,255,0.22);

  --green:#22c55e;
  --green-pale:rgba(34,197,94,0.07);
  --green-border:rgba(34,197,94,0.18);
  --red:#f43f5e;
  --red-pale:rgba(244,63,94,0.07);
  --red-border:rgba(244,63,94,0.18);
  --sky:#38bdf8;
  --sky-pale:rgba(56,189,248,0.07);
  --sky-border:rgba(56,189,248,0.18);
  --amber:#f59e0b;
}

html{scroll-behavior:smooth}

body{
  font-family:var(--f);
  background:var(--bg);
  color:var(--ink);
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
  background-image:
    radial-gradient(ellipse 60% 40% at 70% -10%, rgba(124,107,255,0.07) 0%, transparent 60%),
    radial-gradient(ellipse 40% 30% at 0% 60%, rgba(56,189,248,0.04) 0%, transparent 50%);
}

input,select,button{font-family:var(--f)}

::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border3);border-radius:99px}

input:focus,select:focus{
  outline:none;
  border-color:var(--v) !important;
  box-shadow:0 0 0 3px var(--v-glow);
}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}

.up{animation:fadeUp .45s cubic-bezier(.16,1,.3,1) forwards}
.spin-w{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.15);border-top-color:#fff;animation:spin .7s linear infinite;flex-shrink:0}
.spin-v{width:13px;height:13px;border-radius:50%;border:1.5px solid var(--v-border);border-top-color:var(--v);animation:spin .7s linear infinite;flex-shrink:0}
.pulse{animation:pulse 2s ease infinite}

/* layout */
.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:14px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.g-posts{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}

@media(max-width:1060px){
  .g5{grid-template-columns:repeat(3,1fr)}
  .g4{grid-template-columns:repeat(2,1fr)}
  .g-posts{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:700px){
  .g5{grid-template-columns:repeat(2,1fr)}
  .g3,.g2{grid-template-columns:1fr}
  .g-posts{grid-template-columns:1fr}
}

/* card */
.card{
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:18px;
}
.card-sm{
  background:var(--surface2);
  border:1px solid var(--border);
  border-radius:12px;
}
.card-inner{
  background:var(--surface2);
  border:1px solid var(--border);
  border-radius:12px;
  padding:12px 14px;
}

/* metric card */
.mcard{
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:16px;
  padding:18px 20px;
  position:relative;overflow:hidden;
  transition:border-color .2s;
}
.mcard:hover{border-color:var(--border3)}
.mcard-glow::after{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--v),transparent);
}

/* tabs */
.tabs-bar{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:26px}
.tab{
  padding:12px 18px;font-size:13px;font-weight:600;
  color:var(--ink3);background:none;border:none;border-bottom:2px solid transparent;
  cursor:pointer;transition:color .18s,border-color .18s;white-space:nowrap;
  margin-bottom:-1px;border-radius:0;
}
.tab:hover{color:var(--ink2)}
.tab.on{color:var(--ink);border-bottom-color:var(--v)}

/* toggle */
.tog-track{
  width:38px;height:21px;border-radius:99px;
  background:var(--surface3);border:1px solid var(--border2);
  position:relative;cursor:pointer;
  transition:background .2s,border-color .2s;flex-shrink:0;
}
.tog-track.on{background:var(--v);border-color:var(--v)}
.tog-thumb{
  position:absolute;top:2px;left:2px;
  width:15px;height:15px;border-radius:50%;
  background:#fff;transition:transform .2s cubic-bezier(.4,0,.2,1);
  box-shadow:0 1px 3px rgba(0,0,0,.5);
}
.tog-track.on .tog-thumb{transform:translateX(17px)}

/* input/select */
.inp{
  width:100%;height:44px;border-radius:11px;
  border:1px solid var(--border2);background:var(--surface2);
  color:var(--ink);padding:0 14px;font-size:14px;
  transition:border-color .18s,box-shadow .18s;
}
.inp::placeholder{color:var(--ink3)}

.sel-wrap{position:relative}
.sel-wrap select{
  width:100%;height:44px;border-radius:11px;
  border:1px solid var(--border2);background:var(--surface2);
  color:var(--ink);padding:0 36px 0 14px;font-size:13.5px;
  appearance:none;cursor:pointer;transition:border-color .18s;
}
.sel-wrap::after{
  content:'';position:absolute;right:13px;top:52%;
  transform:translateY(-50%);pointer-events:none;
  border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--ink3);
}

/* buttons */
.btn-primary{
  height:46px;border-radius:11px;border:none;
  background:linear-gradient(135deg,var(--v),#a78bfa);
  color:#fff;font-size:14px;font-weight:700;
  cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;
  transition:opacity .18s,transform .1s;letter-spacing:.01em;
  box-shadow:0 0 0 0 rgba(124,107,255,0);
}
.btn-primary:hover:not(:disabled){opacity:.9;box-shadow:0 4px 24px rgba(124,107,255,.3)}
.btn-primary:active:not(:disabled){transform:scale(.98)}
.btn-primary:disabled{opacity:.35;cursor:not-allowed}

.btn-ghost{
  height:46px;padding:0 18px;border-radius:11px;
  border:1px solid var(--border2);background:transparent;
  color:var(--ink2);font-size:13.5px;font-weight:600;
  cursor:pointer;transition:background .15s,border-color .15s;
}
.btn-ghost:hover:not(:disabled){background:var(--surface2);border-color:var(--border3)}

.btn-sm{
  height:36px;padding:0 14px;border-radius:9px;
  border:1px solid var(--border2);background:var(--surface2);
  color:var(--ink2);font-size:12px;font-weight:700;
  cursor:pointer;display:inline-flex;align-items:center;gap:6px;
  transition:background .15s,border-color .15s,transform .12s;
}
.btn-sm:hover{background:var(--surface3);border-color:var(--border3);transform:translateY(-1px)}

.btn-action{
  width:100%;height:46px;border-radius:11px;font-size:14px;font-weight:700;
  cursor:pointer;border:1px solid;display:flex;align-items:center;justify-content:center;gap:8px;
  transition:transform .15s,box-shadow .15s;
}
.btn-action:hover{transform:translateY(-2px)}

/* fold */
.fold-head{
  display:flex;align-items:center;justify-content:space-between;
  padding-bottom:14px;cursor:pointer;user-select:none;
}
.fold-icon{
  width:26px;height:26px;border-radius:8px;
  background:var(--surface2);border:1px solid var(--border);
  display:flex;align-items:center;justify-content:center;
  color:var(--ink3);font-size:12px;
  transition:background .15s,transform .25s cubic-bezier(.4,0,.2,1);
}
.fold-icon.open{transform:rotate(180deg);background:var(--surface3)}

/* post card */
.pcard{
  background:var(--surface);border:1px solid var(--border);
  border-radius:15px;padding:16px;
  display:flex;flex-direction:column;gap:12px;
  transition:border-color .2s,box-shadow .2s,transform .2s;
}
.pcard:hover{border-color:var(--v-border);box-shadow:0 8px 32px rgba(124,107,255,.08);transform:translateY(-2px)}

/* pill/badge */
.pill{
  display:inline-flex;align-items:center;gap:4px;
  padding:3px 9px;border-radius:99px;
  font-size:10.5px;font-weight:700;letter-spacing:.03em;
}

/* status */
.status-bar{
  display:flex;align-items:center;gap:10px;
  padding:13px 16px;border-radius:12px;border:1px solid;
  font-size:13px;font-weight:600;margin-bottom:20px;
  backdrop-filter:blur(8px);
}

/* filters bar */
.filters-bar{
  display:flex;align-items:center;gap:20px;flex-wrap:wrap;
  padding:13px 18px;border-radius:12px;
  background:var(--surface2);border:1px solid var(--border);
  margin-bottom:18px;
}
`;

/* ─── tiny components ────────────────────────────────────────────────── */
function Pill({ children, color = "v" }) {
  const themes = {
    v:   ["var(--v-pale)",   "var(--v-border)",   "var(--v3)"],
    g:   ["var(--green-pale)","var(--green-border)","var(--green)"],
    sky: ["var(--sky-pale)", "var(--sky-border)",  "var(--sky)"],
    ink: ["var(--surface3)", "var(--border2)",     "var(--ink2)"],
  };
  const [bg, border, ink] = themes[color] || themes.ink;
  return <span className="pill" style={{ background: bg, border: `1px solid ${border}`, color: ink }}>{children}</span>;
}

function MetricCard({ label, value, sub, glow }) {
  return (
    <div className={`mcard${glow ? " mcard-glow" : ""}`}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.04em", lineHeight: 1, color: glow ? "var(--v3)" : "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 8, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
      <div className={`tog-track${on ? " on" : ""}`} onClick={() => onChange(!on)}>
        <div className="tog-thumb" />
      </div>
      {label && <span style={{ fontSize: 13, fontWeight: 500, color: on ? "var(--ink)" : "var(--ink3)", transition: "color .2s" }}>{label}</span>}
    </label>
  );
}

function FoldSection({ title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="fold-head" onClick={() => setOpen(o => !o)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em" }}>{title}</span>
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
      <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".09em", color: "var(--ink3)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.02em" }}>{value}</div>
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
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Pill color="v">{post.type || "post"}</Pill>
          {isCollab && <Pill color="sky">collab</Pill>}
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.65, minHeight: 54, margin: 0, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {cap}
      </p>

      {t.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {t.map((tag, i) => (
            <span key={i} style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "3px 8px", borderRadius: 99, background: "var(--v-pale)", color: "var(--v3)", border: "1px solid var(--v-border)" }}>{tag}</span>
          ))}
        </div>
      )}

      <div className="g2" style={{ gap: 7 }}>
        {[["Interactions", fmt(m.interactions)], ["Approx ER", pct(m.erByFollowers)], ["Views", fmt(m.views)], ["ER/views", pct(m.erByViews)]].map(([k, v]) => (
          <MiniStat key={k} label={k} value={v} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--ink3)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "#f43f5e" }}>♥</span>{fmt(m.likes)}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ color: "var(--sky)" }}>◯</span>{fmt(m.comments)}</span>
        </div>
        {date && <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)" }}>{date}</span>}
      </div>
    </div>
  );
}

/* ─── app ────────────────────────────────────────────────────────────── */
export default function App() {
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
  const abortRef = useRef(false);

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function startScrape() {
    const user = norm(username);
    if (!user) { setStatus("Enter an Instagram username.", "error"); return; }
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }
    setLoading(true); setData(null); abortRef.current = false;
    try {
      setStatus("Kicking off scrape…", "info");
      const input = { directUrls: [`https://www.instagram.com/${user}/`], resultsType: resultType === "profile" ? "details" : "posts", resultsLimit: parseInt(maxPosts, 10), addParentData: true };
      const runRes = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!runRes.ok) { let msg = "Failed to start"; try { const e = await runRes.json(); msg = e.error?.message || msg; } catch {} throw new Error(msg); }
      const rd = await runRes.json();
      const runId = rd?.data?.id, dsId = rd?.data?.defaultDatasetId;
      if (!runId || !dsId) throw new Error("Invalid Apify response.");
      let elapsed = 0, done = false;
      while (elapsed < 300 && !done && !abortRef.current) {
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
      return { "Post #": i + 1, "Type": p.type || "post", "Username": p.username || "", "Owner": p.ownerUsername || "", "Is Collab": (p.ownerUsername && p.username && p.ownerUsername !== p.username) ? "Yes" : "No", "Caption": cap, "Hashtags": getTags(cap).join(" "), "Likes": m.likes, "Comments": m.comments, "Interactions": m.interactions, "Video Views": p.videoViewCount || "", "Plays": p.videoPlayCount || "", "Duration (sec)": p.videoDuration || "", "ER by Followers": pct(m.erByFollowers), "ER by Views": pct(m.erByViews), "Timestamp": p.timestamp || p.takenAtTimestamp || "", "URL": p.url || (p.shortCode ? `https://instagram.com/p/${p.shortCode}` : ""), "Location": p.locationName || "" };
    });
  }

  function exportExcel() {
    if (!posts.length) return;
    const rows = buildRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [6, 12, 20, 20, 10, 55, 22, 10, 10, 14, 12, 10, 14, 14, 20, 38, 18].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Posts");
    if (profile) {
      const sd = [["Username", profile.username || ""], ["Full Name", profile.fullName || profile.ownerFullName || ""], ["Followers", followers], ["Following", profile.followsCount || ""], ["Profile Posts", profile.postsCount || ""], ["Posts Analysed", A.n], ["Avg ER by Followers", pct(A.erF)], ["ER by Views", pct(A.erV)], ["Avg Likes", Math.round(A.aL)], ["Avg Comments", Math.round(A.aC)], ["Avg Views", Math.round(A.aV)], ["Collab Rate", pct(A.collabRate)], ["Verified", profile.verified ? "Yes" : "No"], ["Bio", profile.biography || ""], ["Scraped At", new Date().toISOString()]];
      const ws2 = XLSX.utils.aoa_to_sheet(sd);
      ws2["!cols"] = [{ wch: 22 }, { wch: 80 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Profile Summary");
      if (A.best) {
        const ins = [["Metric", "Value"], ["Best Post by Interactions", A.best.url || A.best.caption || "—"], ["Best Post Interactions", A.best.interactions ?? "—"], ["Best Post ER by Followers", pct(A.best.erByFollowers)]];
        const ws3 = XLSX.utils.aoa_to_sheet(ins);
        ws3["!cols"] = [{ wch: 28 }, { wch: 90 }];
        XLSX.utils.book_append_sheet(wb, ws3, "Insights");
      }
    }
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
    info:    { bg: "rgba(56,189,248,.06)", ink: "var(--sky)", border: "var(--sky-border)" },
    success: { bg: "var(--green-pale)", ink: "var(--green)", border: "var(--green-border)" },
    error:   { bg: "var(--red-pale)", ink: "var(--red)", border: "var(--red-border)" },
  }[statusType] || {};

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "posts",    label: posts.length ? `Posts (${posts.length})` : "Posts" },
    { id: "export",   label: "Export" },
  ];

  return (
    <>
      <style>{G}</style>

      {/* noise texture overlay */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.018, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "256px 256px" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1160, margin: "0 auto", padding: "40px 24px 100px" }}>

        {/* ── top bar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#7c6bff,#a78bfa,#38bdf8)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(124,107,255,.35)" }}>
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <rect x="2.5" y="2.5" width="12" height="12" rx="3.5" stroke="white" strokeWidth="1.5"/>
                <circle cx="8.5" cy="8.5" r="2.5" stroke="white" strokeWidth="1.5"/>
                <circle cx="12" cy="5" r="1" fill="white"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.02em" }}>Melange Digital</div>
              <div style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "var(--mono)", letterSpacing: ".04em" }}>IG Analytics</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Pill color="v">
              <span className="pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--v)", display: "inline-block" }} />
              Live
            </Pill>
          </div>
        </div>

        {/* ── hero ── */}
        <div style={{ marginBottom: 48, maxWidth: 600 }}>
          <h1 style={{ fontSize: "clamp(38px,6vw,66px)", fontWeight: 800, letterSpacing: "-.05em", lineHeight: 1.02, color: "var(--ink)", marginBottom: 18 }}>
            Instagram<br />
            <span style={{ background: "linear-gradient(135deg,var(--v) 0%,#a78bfa 50%,var(--sky) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              analytics
            </span>
          </h1>
          <p style={{ fontSize: 16, color: "var(--ink2)", lineHeight: 1.8, fontWeight: 400 }}>
            Pull real data from any public Instagram profile. Posts, engagement rates, collab detection. Export clean reports instantly.
          </p>
        </div>

        {/* ── input panel ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 14, marginBottom: 18, alignItems: "start" }}>

          <div className="card" style={{ padding: 26 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.02em" }}>Run a scrape</p>
                <p style={{ fontSize: 12, color: "var(--ink3)", marginTop: 3 }}>Public profiles only · powered by Apify</p>
              </div>
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--v3)", fontFamily: "var(--mono)" }}>
                  <div className="spin-v" />LIVE
                </div>
              )}
            </div>

            <label style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", display: "block", marginBottom: 7 }}>Instagram username</label>
            <input className="inp" type="text" placeholder="e.g. natgeo or @nasa" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && startScrape()} style={{ marginBottom: 14 }} />

            <div className="g2" style={{ marginBottom: 20 }}>
              {[
                { label: "Max posts", val: maxPosts, set: setMaxPosts, opts: [["10","10 posts"],["20","20 posts"],["50","50 posts"],["100","100 posts"]] },
                { label: "Scrape type", val: resultType, set: setResultType, opts: [["posts","Posts + profile"],["profile","Profile only"]] },
              ].map(({ label, val, set, opts }) => (
                <div key={label}>
                  <label style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", display: "block", marginBottom: 7 }}>{label}</label>
                  <div className="sel-wrap"><select value={val} onChange={e => set(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-primary" disabled={loading} onClick={startScrape} style={{ flex: 1 }}>
                {loading
                  ? <><div className="spin-w" />Scraping…</>
                  : <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v7M4.5 4l2.5-2.5L9.5 4M2 10.5h10M2 12.5h10" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                      Start scrape
                    </>}
              </button>
              <button className="btn-ghost" disabled={loading} onClick={() => { setUsername(""); setData(null); setStatusMsg(null); }}>Reset</button>
            </div>
          </div>

          {/* features sidebar */}
          <div className="card" style={{ padding: 22 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "var(--mono)" }}>Includes</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["↗", "Engagement rate", "By followers & views, per post"],
                ["◈", "Best post finder", "Top interactions & best ER"],
                ["⟳", "Collab detection", "Flagged in UI + export"],
                ["▤", "Excel export", "3-sheet workbook, clean layout"],
                ["{ }", "JSON export", "Raw data for pipelines"],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{ display: "flex", gap: 11, padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 14, color: "var(--v3)", fontWeight: 700, flexShrink: 0, marginTop: 1, fontFamily: "var(--mono)" }}>{icon}</span>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>{title}</p>
                    <p style={{ fontSize: 11, color: "var(--ink3)", lineHeight: 1.5 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── status ── */}
        {statusMsg && (
          <div className="status-bar up" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
            {loading && <div className="spin-v" style={{ borderTopColor: stStyle.ink }} />}
            {statusType === "success" && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3.5 3.5 5.5-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            {statusMsg}
          </div>
        )}

        {/* ── results ── */}
        {profile && (
          <div className="up">

            {/* top 5 metrics */}
            <div className="g5">
              <MetricCard label="Followers" value={fmt(followers)} sub="Public count" glow />
              <MetricCard label="Avg ER" value={pct(A.erF)} sub="By followers" glow />
              <MetricCard label="Total interactions" value={fmt(A.tI)} sub="Likes + comments" />
              <MetricCard label="Avg views" value={fmt(Math.round(A.aV))} sub="Video & plays" />
              <MetricCard label="Collab rate" value={pct(A.collabRate)} sub="Of selected posts" />
            </div>

            {/* ── tabs ── */}
            <div className="tabs-bar">
              {TABS.map(t => (
                <button key={t.id} className={`tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
              ))}
            </div>

            {/* OVERVIEW TAB */}
            {tab === "overview" && (
              <div>
                <FoldSection title="Profile" badge={isVerified ? "✓ Verified" : undefined} defaultOpen>
                  <div className="card" style={{ overflow: "hidden" }}>
                    {/* hero row */}
                    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", padding: "24px 26px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,var(--v),#a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", boxShadow: "0 8px 24px rgba(124,107,255,.3)" }}>
                          {initials}
                        </div>
                        {isVerified && <div style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%", background: "#1d9bf0", border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", fontWeight: 800 }}>✓</div>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.03em", lineHeight: 1.1 }}>{profileName}</div>
                        <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--ink3)", marginTop: 5 }}>@{profileHandle}</div>
                        {bio && <div style={{ marginTop: 10, fontSize: 13, color: "var(--ink2)", lineHeight: 1.7, whiteSpace: "pre-line" }}>{bio.length > 200 ? bio.slice(0, 200) + "…" : bio}</div>}
                        <a href={`https://instagram.com/${profileHandle}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: "var(--v2)", fontWeight: 700, textDecoration: "none" }}>
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 9.5L9.5 1.5M9.5 1.5H4.5M9.5 1.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          instagram.com/{profileHandle}
                        </a>
                      </div>
                    </div>
                    {/* profile stats */}
                    <div className="g4" style={{ padding: "20px 26px" }}>
                      {[["Followers", fmt(followers)], ["Following", fmt(following)], ["Profile posts", fmt(postsCount)], ["Analysed", fmt(A.n)]].map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink3)", marginBottom: 8 }}>{l}</div>
                          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em" }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </FoldSection>

                <FoldSection title="Analytics summary" defaultOpen>
                  <div className="g3" style={{ gap: 12 }}>
                    {[
                      ["Avg likes", fmt(Math.round(A.aL)), "Per post"],
                      ["Avg comments", fmt(Math.round(A.aC)), "Per post"],
                      ["ER by views", pct(A.erV), "Interactions ÷ views"],
                      ["Best post", A.best ? fmt(A.best.interactions) : "—", "Highest interactions"],
                      ["Avg views", fmt(Math.round(A.aV)), "Video & plays"],
                      ["Collab posts", A.col, `of ${A.n} total`],
                    ].map(([l, v, n]) => (
                      <div className="card-sm" key={l} style={{ padding: "16px 18px" }}>
                        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink3)", marginBottom: 10 }}>{l}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em" }}>{v}</div>
                        <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 6 }}>{n}</div>
                      </div>
                    ))}
                  </div>
                </FoldSection>
              </div>
            )}

            {/* POSTS TAB */}
            {tab === "posts" && (
              <div>
                <FoldSection title="Posts" badge={`${filteredPosts.length} shown`} defaultOpen>
                  <div className="filters-bar">
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", flexShrink: 0 }}>Filter</span>
                    <Toggle on={showCollab} onChange={setShowCollab} label="Collab only" />
                    <Toggle on={showVideo} onChange={setShowVideo} label="Video only" />
                    {(showCollab || showVideo) && (
                      <button className="btn-sm" onClick={() => { setShowCollab(false); setShowVideo(false); }} style={{ marginLeft: "auto" }}>Clear filters</button>
                    )}
                  </div>

                  {filteredPosts.length > 0 ? (
                    <div className="g-posts">
                      {filteredPosts.map((p, i) => <PostCard key={p.id || i} post={p} index={i} followers={followers} />)}
                    </div>
                  ) : (
                    <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: "var(--ink3)", border: "1px dashed var(--border2)", borderRadius: 14, background: "var(--surface2)" }}>
                      No posts match the current filters.
                    </div>
                  )}
                </FoldSection>
              </div>
            )}

            {/* EXPORT TAB */}
            {tab === "export" && (
              <div>
                <FoldSection title="Export data" defaultOpen>
                  <div className="g2" style={{ gap: 14, marginBottom: 16 }}>
                    <div className="card" style={{ padding: 24 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.18)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, fontSize: 20 }}>📊</div>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", marginBottom: 8, letterSpacing: "-.02em" }}>Excel Workbook</p>
                      <p style={{ fontSize: 12, color: "var(--ink3)", lineHeight: 1.65, marginBottom: 20 }}>3 formatted sheets: Posts with all metrics, Profile Summary, and Insights. Perfect for client reports.</p>
                      <button className="btn-action" onClick={exportExcel} style={{ background: "var(--green-pale)", color: "var(--green)", borderColor: "var(--green-border)" }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v7M4.5 5.5L7 8.5l2.5-3M2 10.5h10M2 12.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        Download .xlsx
                      </button>
                    </div>

                    <div className="card" style={{ padding: 24 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--v-pale)", border: "1px solid var(--v-border)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, fontSize: 16, fontFamily: "var(--mono)", color: "var(--v3)", fontWeight: 700 }}>{"{}"}</div>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", marginBottom: 8, letterSpacing: "-.02em" }}>JSON Data</p>
                      <p style={{ fontSize: 12, color: "var(--ink3)", lineHeight: 1.65, marginBottom: 20 }}>Raw post array with all computed metrics. Ready for pipelines, databases, or further processing.</p>
                      <button className="btn-action" onClick={exportJSON} style={{ background: "var(--v-pale)", color: "var(--v3)", borderColor: "var(--v-border)" }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v7M4.5 5.5L7 8.5l2.5-3M2 10.5h10M2 12.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        Download .json
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--ink3)", lineHeight: 1.7 }}>
                    <span style={{ color: "var(--ink2)", fontWeight: 700 }}>Fields included: </span>
                    post #, type, username, owner, collab flag, caption, hashtags, likes, comments, interactions, video views, plays, duration, ER by followers, ER by views, timestamp, URL, location
                  </div>
                </FoldSection>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
