import { useState, useRef } from "react";
import * as XLSX from "xlsx";

const ACTOR_ID = "apify~instagram-scraper";
const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;
console.log(import.meta.env.VITE_APIFY_KEY);

function fmt(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #05070f;
    --surface: #0d1117;
    --surface2: #161b27;
    --surface3: #1e2535;
    --border: rgba(99,120,255,0.12);
    --border-hover: rgba(99,120,255,0.3);
    --accent: #6378ff;
    --accent2: #a78bfa;
    --accent-glow: rgba(99,120,255,0.18);
    --text: #e8ecf8;
    --muted: #5a6480;
    --muted2: #8892b0;
    --danger: #ff5f6d;
    --success: #43e97b;
    --warn: #f8c56d;
    --font-display: 'Bricolage Grotesque', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
    --radius: 14px;
    --radius-sm: 8px;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-display);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  /* Grid bg */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(99,120,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(99,120,255,0.03) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    z-index: 0;
  }

  .app {
    position: relative;
    z-index: 1;
    max-width: 900px;
    margin: 0 auto;
    padding: 56px 24px 80px;
  }

  /* ── HEADER ── */
  .header {
    margin-bottom: 44px;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    background: var(--accent-glow);
    border: 1px solid rgba(99,120,255,0.25);
    padding: 4px 12px;
    border-radius: 100px;
    margin-bottom: 20px;
  }

  .eyebrow-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,100% { opacity:1; transform:scale(1); }
    50% { opacity:0.5; transform:scale(0.7); }
  }

  .title {
    font-size: clamp(38px, 6vw, 64px);
    font-weight: 800;
    line-height: 1.02;
    letter-spacing: -0.03em;
    color: var(--text);
  }

  .title-gradient {
    background: linear-gradient(135deg, #6378ff 0%, #a78bfa 50%, #38bdf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    margin-top: 14px;
    font-size: 15px;
    color: var(--muted2);
    line-height: 1.7;
    max-width: 500px;
    font-weight: 400;
  }

  /* ── CARD ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 32px;
    margin-bottom: 20px;
    position: relative;
    overflow: hidden;
  }

  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(99,120,255,0.4), transparent);
  }

  /* ── FORM ── */
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .form-row.single { grid-template-columns: 1fr; }

  @media (max-width: 560px) { .form-row { grid-template-columns: 1fr; } }

  .field { display: flex; flex-direction: column; }

  .field label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted2);
    margin-bottom: 8px;
    font-family: var(--font-mono);
  }

  .field input,
  .field select {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 11px 14px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    appearance: none;
    -webkit-appearance: none;
  }

  .field input:focus,
  .field select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  .field input::placeholder { color: var(--muted); }

  .field select {
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%235a6480' d='M5 7L0.5 2h9z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
  }

  /* ── BUTTON ── */
  .btn-primary {
    width: 100%;
    padding: 13px;
    background: linear-gradient(135deg, #6378ff, #8b5cf6);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s, box-shadow 0.2s;
    box-shadow: 0 4px 24px rgba(99,120,255,0.3);
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.92;
    box-shadow: 0 6px 32px rgba(99,120,255,0.45);
  }

  .btn-primary:active:not(:disabled) { transform: scale(0.99); }
  .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }

  /* ── STATUS ── */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-family: var(--font-mono);
    margin-bottom: 20px;
    border: 1px solid transparent;
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

  .status-bar.info  { background: rgba(99,120,255,0.08); border-color: rgba(99,120,255,0.25); color: #a0b0ff; }
  .status-bar.error { background: rgba(255,95,109,0.08); border-color: rgba(255,95,109,0.25); color: var(--danger); }
  .status-bar.success { background: rgba(67,233,123,0.08); border-color: rgba(67,233,123,0.25); color: var(--success); }

  .spinner {
    width: 13px; height: 13px;
    border: 2px solid rgba(160,176,255,0.3);
    border-top-color: #a0b0ff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── RESULTS ── */
  .results-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    animation: fadeUp 0.35s ease;
    position: relative;
  }

  .results-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(99,120,255,0.5), transparent);
  }

  @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

  /* ── PROFILE HERO ── */
  .profile-hero {
    padding: 28px 32px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: flex-start;
    gap: 20px;
  }

  .avatar-wrap { position: relative; }

  .avatar {
    width: 68px; height: 68px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(99,120,255,0.2), rgba(167,139,250,0.2));
    border: 2px solid rgba(99,120,255,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 800;
    color: var(--accent2);
    flex-shrink: 0;
    letter-spacing: -0.02em;
    box-shadow: 0 0 0 4px rgba(99,120,255,0.08);
  }

  .verified-dot {
    position: absolute;
    bottom: 2px; right: 2px;
    width: 18px; height: 18px;
    background: var(--accent);
    border-radius: 50%;
    border: 2px solid var(--surface);
    display: flex; align-items: center; justify-content: center;
    font-size: 9px;
  }

  .profile-info { flex: 1; min-width: 0; }

  .profile-name {
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
  }

  .profile-handle {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--muted2);
    margin-top: 3px;
  }

  .profile-bio {
    font-size: 13px;
    color: var(--muted2);
    margin-top: 10px;
    line-height: 1.65;
    font-weight: 400;
  }

  .profile-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--accent);
    text-decoration: none;
    margin-top: 8px;
    transition: color 0.15s;
    opacity: 0.8;
  }
  .profile-link:hover { opacity: 1; }

  /* ── STATS STRIP ── */
  .stats-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-bottom: 1px solid var(--border);
    background: var(--surface2);
  }

  .stat-cell {
    padding: 20px;
    text-align: center;
    border-right: 1px solid var(--border);
    position: relative;
  }
  .stat-cell:last-child { border-right: none; }

  .stat-val {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1;
  }

  .stat-lbl {
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    margin-top: 5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-family: var(--font-mono);
  }

  /* ── POSTS ── */
  .posts-section { padding: 24px 32px; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted2);
    font-family: var(--font-mono);
  }

  .section-count {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--muted);
    background: var(--surface2);
    padding: 3px 10px;
    border-radius: 100px;
    border: 1px solid var(--border);
  }

  .posts-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  @media (max-width: 560px) { .posts-grid { grid-template-columns: 1fr 1fr; } }

  .post-card {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    transition: border-color 0.2s, transform 0.2s;
    position: relative;
    overflow: hidden;
  }

  .post-card:hover {
    border-color: var(--border-hover);
    transform: translateY(-1px);
  }

  .post-num {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--muted);
    margin-bottom: 8px;
    letter-spacing: 0.05em;
  }

  .post-type-badge {
    display: inline-block;
    font-size: 10px;
    font-family: var(--font-mono);
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(99,120,255,0.1);
    border: 1px solid rgba(99,120,255,0.2);
    color: var(--accent);
    margin-bottom: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .post-caption {
    font-size: 12px;
    color: var(--muted2);
    line-height: 1.55;
    margin-bottom: 10px;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-weight: 400;
  }

  .post-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 10px;
  }

  .tag-chip {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--accent2);
    background: rgba(167,139,250,0.08);
    border: 1px solid rgba(167,139,250,0.15);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .post-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--muted);
  }

  .post-meta span { display: flex; align-items: center; gap: 4px; }
  .post-meta .likes { color: #ff7eb3; }
  .post-meta .comments { color: #7eb8ff; }

  .empty-posts {
    grid-column: 1/-1;
    padding: 32px;
    text-align: center;
    font-size: 13px;
    color: var(--muted);
    border: 1px dashed var(--border);
    border-radius: 10px;
    font-family: var(--font-mono);
  }

  /* ── EXPORT BAR ── */
  .export-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 18px 32px;
    border-top: 1px solid var(--border);
    background: var(--surface2);
  }

  .export-label {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-right: 4px;
  }

  .btn-export {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    background: transparent;
    border: 1px solid var(--border-hover);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    letter-spacing: 0.04em;
  }

  .btn-export:hover {
    background: rgba(99,120,255,0.1);
    border-color: var(--accent);
    color: var(--accent);
  }

  .btn-export.excel:hover {
    background: rgba(67,233,123,0.1);
    border-color: var(--success);
    color: var(--success);
  }

  .btn-export.json-btn:hover {
    background: rgba(248,197,109,0.1);
    border-color: var(--warn);
    color: var(--warn);
  }
`;

function extractTags(caption = "") {
  return (caption.match(/#[\w]+/g) || []).slice(0, 5);
}

export default function App() {
  const [username, setUsername] = useState("");
  const [maxPosts, setMaxPosts] = useState("20");
  const [resultType, setResultType] = useState("posts");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [data, setData] = useState(null);
  const abortRef = useRef(false);

  function setStatus(msg, type = "info") {
    setStatusMsg(msg);
    setStatusType(type);
  }

  async function startScrape() {
    const user = username.trim().replace("@", "");
    if (!user) { setStatus("Enter an Instagram username.", "error"); return; }

    setLoading(true);
    setData(null);
    abortRef.current = false;

    try {
      setStatus("Starting scrape...", "info");

      const input = {
        directUrls: [`https://www.instagram.com/${user}/`],
        resultsType: resultType === "profile" ? "details" : "posts",
        resultsLimit: parseInt(maxPosts),
        addParentData: true,
      };

      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
      );

      if (!runRes.ok) {
        const err = await runRes.json();
        throw new Error(err.error?.message || "Failed to start actor run");
      }

      const runData = await runRes.json();
      const runId = runData.data.id;
      const dsId = runData.data.defaultDatasetId;

      let elapsed = 0;
      let finished = false;

      while (elapsed < 300 && !finished && !abortRef.current) {
        await sleep(5000);
        elapsed += 5;
        setStatus(`Scraping posts... ${elapsed}s elapsed`, "info");

        const stRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`);
        const stData = await stRes.json();
        const st = stData.data.status;

        if (st === "SUCCEEDED") finished = true;
        else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) throw new Error(`Run ${st.toLowerCase()}`);
      }

      if (!finished) throw new Error("Timed out. Try fewer posts.");

      setStatus("Fetching results...", "info");
      const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=200`);
      const items = await itemsRes.json();

      if (!items?.length) throw new Error("No data returned. Account may be private or not found.");

      setData(items);
      setStatus(`Done — fetched ${items.length} item(s) for @${user}.`, "success");
    } catch (e) {
      setStatus(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function buildRows() {
    return (data || []).map((p, i) => {
      const caption = p.caption || p.text || "";
      const tags = extractTags(caption).join(" ");
      return {
        "Post #": i + 1,
        "Type": p.type || "post",
        "Caption": caption,
        "Hashtags": tags,
        "Likes": p.likesCount || p.likes || 0,
        "Comments": p.commentsCount || p.comments || 0,
        "Timestamp": p.timestamp || p.takenAtTimestamp || "",
        "URL": p.url || p.shortCode ? `https://instagram.com/p/${p.shortCode}` : "",
        "Video Views": p.videoViewCount || "",
        "Location": p.locationName || "",
      };
    });
  }

  function exportExcel() {
    if (!data) return;
    const rows = buildRows();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 8 }, { wch: 10 }, { wch: 60 }, { wch: 40 },
      { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 40 },
      { wch: 14 }, { wch: 25 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Posts");

    // Profile summary sheet
    if (data[0]) {
      const p = data[0];
      const summaryData = [
        ["Username", p.ownerUsername || p.username || username],
        ["Full Name", p.ownerFullName || p.fullName || ""],
        ["Followers", p.followersCount || p.ownerFollowersCount || ""],
        ["Following", p.followsCount || p.ownerFollowsCount || ""],
        ["Total Posts", p.postsCount || p.ownerPostsCount || ""],
        ["Biography", p.biography || p.ownerBiography || ""],
        ["Verified", p.verified || p.ownerVerified ? "Yes" : "No"],
        ["Scraped At", new Date().toISOString()],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
      ws2["!cols"] = [{ wch: 15 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Profile");
    }

    XLSX.writeFile(wb, `instagram_${username.replace("@", "")}_${Date.now()}.xlsx`);
  }

  function exportJSON() {
    if (!data) return;
    const rows = buildRows();
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `instagram_${username.replace("@", "")}.json`;
    a.click();
  }

  const profile = data?.[0];
  const profileName = profile?.ownerFullName || profile?.fullName || profile?.username || username;
  const profileHandle = profile?.ownerUsername || profile?.username || username;
  const bio = profile?.biography || profile?.ownerBiography || "";
  const followers = profile?.followersCount || profile?.ownerFollowersCount;
  const following = profile?.followsCount || profile?.ownerFollowsCount;
  const postsCount = profile?.postsCount || profile?.ownerPostsCount || data?.length;
  const isVerified = profile?.verified || profile?.ownerVerified;
  const initials = profileName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "IG";

  const posts = (data || []).filter(d => d.type || d.caption !== undefined).slice(0, 9);

  return (
    <>
      <style>{styles}</style>
      <div className="app">

        <div className="header">
          <div className="eyebrow">
            <div className="eyebrow-dot" />
            Melange digital
          </div>
          <h1 className="title">
            Profile &amp; Post<br />
            <span className="title-gradient">Data Scraper</span>
          </h1>
          <p className="subtitle">
            Fetch public profile data, recent posts, engagement metrics,
            and hashtags — export to Excel instantly.
          </p>
        </div>

        <div className="card">
          <div className="form-row single">
            <div className="field">
              <label>Instagram Username</label>
              <input
                type="text"
                placeholder="e.g. natgeo  (no @)"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && startScrape()}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Max Posts</label>
              <select value={maxPosts} onChange={e => setMaxPosts(e.target.value)}>
                <option value="10">10 posts</option>
                <option value="20">20 posts</option>
                <option value="50">50 posts</option>
                <option value="100">100 posts</option>
              </select>
            </div>
            <div className="field">
              <label>Scrape Type</label>
              <select value={resultType} onChange={e => setResultType(e.target.value)}>
                <option value="posts">Posts + Profile</option>
                <option value="profile">Profile Only</option>
              </select>
            </div>
          </div>
          <button className="btn-primary" onClick={startScrape} disabled={loading}>
            {loading ? (
              <><div className="spinner" style={{borderTopColor:"#fff",borderColor:"rgba(255,255,255,0.3)"}} /> Scraping...</>
            ) : (
              <> → Start Scrape</>
            )}
          </button>
        </div>

        {statusMsg && (
          <div className={`status-bar ${statusType}`}>
            {loading && <div className="spinner" />}
            {statusMsg}
          </div>
        )}

        {data && (
          <div className="results-card">
            <div className="profile-hero">
              <div className="avatar-wrap">
                <div className="avatar">{initials}</div>
                {isVerified && <div className="verified-dot">✓</div>}
              </div>
              <div className="profile-info">
                <div className="profile-name">{profileName}</div>
                <div className="profile-handle">@{profileHandle}</div>
                {bio && <div className="profile-bio">{bio.slice(0, 180)}{bio.length > 180 ? "…" : ""}</div>}
                <a
                  className="profile-link"
                  href={`https://instagram.com/${profileHandle}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  ↗ instagram.com/{profileHandle}
                </a>
              </div>
            </div>

            <div className="stats-strip">
              <div className="stat-cell">
                <div className="stat-val">{fmt(followers)}</div>
                <div className="stat-lbl">Followers</div>
              </div>
              <div className="stat-cell">
                <div className="stat-val">{fmt(following)}</div>
                <div className="stat-lbl">Following</div>
              </div>
              <div className="stat-cell">
                <div className="stat-val">{fmt(postsCount)}</div>
                <div className="stat-lbl">Posts</div>
              </div>
            </div>

            {posts.length > 0 && (
              <div className="posts-section">
                <div className="section-header">
                  <span className="section-title">Recent Posts</span>
                  <span className="section-count">{posts.length} shown</span>
                </div>
                <div className="posts-grid">
                  {posts.map((p, i) => {
                    const caption = p.caption || p.text || "(no caption)";
                    const likes = fmt(p.likesCount || p.likes || 0);
                    const comments = fmt(p.commentsCount || p.comments || 0);
                    const type = p.type || "post";
                    const tags = extractTags(caption);
                    return (
                      <div className="post-card" key={i}>
                        <div className="post-num">#{i + 1}</div>
                        <div className="post-type-badge">{type}</div>
                        <div className="post-caption">{caption}</div>
                        {tags.length > 0 && (
                          <div className="post-tags">
                            {tags.map((t, j) => <span className="tag-chip" key={j}>{t}</span>)}
                          </div>
                        )}
                        <div className="post-meta">
                          <span className="likes">♥ {likes}</span>
                          <span className="comments">💬 {comments}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {posts.length === 0 && (
              <div className="posts-section">
                <div className="posts-grid">
                  <div className="empty-posts">No post data — try "Posts + Profile" scrape type.</div>
                </div>
              </div>
            )}

            <div className="export-bar">
              <span className="export-label">Export</span>
              <button className="btn-export excel" onClick={exportExcel}>
                ⬇ Excel (.xlsx)
              </button>
              <button className="btn-export json-btn" onClick={exportJSON}>
                ⬇ JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
