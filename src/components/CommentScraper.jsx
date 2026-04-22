import { useState, useMemo } from "react";
import * as XLSX from "xlsx";

const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;
const ACTOR_ID  = "apify~instagram-comment-scraper";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt   = (n) => { if (!n && n !== 0) return "—"; if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"; if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"; return String(n); };

function extractShortcode(raw) {
  raw = raw.trim();
  // Already a shortcode (no slash)
  if (!raw.includes("/")) return raw;
  // Try /p/, /reel/, /tv/
  const m = raw.match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/i);
  return m ? m[1] : null;
}

function parseDate(ts) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

export default function CommentScraper() {
  const [postUrl,    setPostUrl]    = useState("");
  const [maxComments, setMaxComments] = useState("100");
  const [loading,    setLoading]    = useState(false);
  const [statusMsg,  setStatusMsg]  = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [comments,   setComments]   = useState([]);
  const [search,     setSearch]     = useState("");
  const [sortBy,     setSortBy]     = useState("date");

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function startScrape() {
    const sc = extractShortcode(postUrl);
    if (!sc) { setStatus("Enter a valid Instagram post URL or shortcode.", "error"); return; }
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }
    setLoading(true); setComments([]);
    try {
      setStatus("Starting comment scrape…", "info");
      const input = {
        directUrls: [`https://www.instagram.com/p/${sc}/`],
        resultsLimit: parseInt(maxComments, 10),
      };
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
      );
      if (!runRes.ok) { let msg = "Failed to start"; try { const e = await runRes.json(); msg = e.error?.message || msg; } catch {} throw new Error(msg); }
      const rd    = await runRes.json();
      const runId = rd?.data?.id, dsId = rd?.data?.defaultDatasetId;
      if (!runId || !dsId) throw new Error("Invalid Apify response.");

      let elapsed = 0, done = false;
      while (elapsed < 300 && !done) {
        await sleep(5000); elapsed += 5;
        setStatus(`Scraping comments… ${elapsed}s`, "info");
        const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`)).json())?.data?.status;
        if (st === "SUCCEEDED") done = true;
        else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) throw new Error(`Run ${st.toLowerCase()}`);
      }
      if (!done) throw new Error("Timed out. Try fetching fewer comments.");

      setStatus("Fetching dataset…", "info");
      const items = await (await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=2000`)).json();
      if (!Array.isArray(items) || !items.length) throw new Error("No comments found. Post may be private or comments disabled.");
      setComments(items);
      setStatus(`Done — ${items.length} comments scraped`, "success");
    } catch (e) {
      setStatus(e.message || "Something went wrong.", "error");
    } finally {
      setLoading(false);
    }
  }

  // Stats
  const stats = useMemo(() => {
    if (!comments.length) return null;
    const uniqueUsers  = new Set(comments.map(c => c.ownerUsername || c.username)).size;
    const withLikes    = comments.filter(c => (c.likesCount || 0) > 0);
    const totalLikes   = comments.reduce((s, c) => s + (c.likesCount || 0), 0);
    const topComment   = [...comments].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0))[0];
    const replied      = comments.filter(c => c.repliesCount > 0).length;
    return { total: comments.length, uniqueUsers, withLikes: withLikes.length, totalLikes, topComment, replied };
  }, [comments]);

  // Filtered + sorted
  const displayed = useMemo(() => {
    let arr = comments;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(c =>
        (c.text || "").toLowerCase().includes(q) ||
        (c.ownerUsername || c.username || "").toLowerCase().includes(q)
      );
    }
    if (sortBy === "likes") arr = [...arr].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
    else if (sortBy === "date") arr = [...arr].sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
    return arr.slice(0, 200);
  }, [comments, search, sortBy]);

  function buildRows() {
    return comments.map((c, i) => ({
      "#":       i + 1,
      "Username": c.ownerUsername || c.username || "",
      "Comment":  c.text || "",
      "Likes":    c.likesCount || 0,
      "Replies":  c.repliesCount || 0,
      "Date":     parseDate(c.timestamp || c.createdAt),
      "Is Reply": c.repliedToId ? "Yes" : "No",
      "User URL": c.ownerUsername ? `https://instagram.com/${c.ownerUsername}` : "",
    }));
  }

  function exportExcel() {
    if (!comments.length) return;
    const ws = XLSX.utils.json_to_sheet(buildRows());
    ws["!cols"] = [5, 22, 80, 8, 8, 14, 10, 40].map(wch => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comments");
    XLSX.writeFile(wb, `ig_comments_${extractShortcode(postUrl) || "post"}_${Date.now()}.xlsx`);
  }

  function exportJSON() {
    if (!comments.length) return;
    const blob = new Blob([JSON.stringify(buildRows(), null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `ig_comments_${extractShortcode(postUrl) || "post"}.json`; a.click();
  }

  function exportCSV() {
    if (!comments.length) return;
    const rows  = buildRows();
    const keys  = Object.keys(rows[0]);
    const esc   = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv   = [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
    const blob  = new Blob([csv], { type: "text/csv" });
    const a     = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download  = `ig_comments_${extractShortcode(postUrl) || "post"}.csv`; a.click();
  }

  const stStyle = {
    info:    { bg: "var(--accent-pale)", ink: "var(--accent-dark)", border: "var(--accent-border)" },
    success: { bg: "var(--green-pale)",  ink: "var(--green)",       border: "var(--green-border)"  },
    error:   { bg: "var(--red-pale)",    ink: "var(--red)",         border: "var(--red-border)"    },
  }[statusType] || {};

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Comment <span>Scraper</span></h1>
        <p className="page-desc">Paste any public Instagram post link to extract all comments. Search, filter, and export to Excel, CSV, or JSON.</p>
      </div>

      {/* Input card */}
      <div className="scrape-card">
        <div className="scrape-card-head">
          <div>
            <div className="scrape-card-title">Scrape post comments</div>
            <div className="scrape-card-sub">Paste a post URL or shortcode · powered by Apify</div>
          </div>
          {loading && <div className="live-badge"><div className="live-dot" />LIVE</div>}
        </div>

        <div className="form-username">
          <label className="field-label" style={{ display: "block", marginBottom: 6 }}>Post URL or Shortcode</label>
          <input
            className="inp"
            placeholder="https://www.instagram.com/p/ABC123xyz/ or just ABC123xyz"
            value={postUrl}
            onChange={e => setPostUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && startScrape()}
          />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label className="field-label">Max comments</label>
            <div className="sel-wrap">
              <select value={maxComments} onChange={e => setMaxComments(e.target.value)}>
                {[["50","50 comments"],["100","100 comments"],["200","200 comments"],["500","500 comments"],["1000","1 000 comments"]].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-primary" disabled={loading} onClick={startScrape} style={{ marginTop: "auto" }}>
            {loading
              ? <><div className="spin-w" />Scraping…</>
              : <><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v6M4 3.5L6.5 1 9 3.5M1.5 10h10M1.5 12h10" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>Scrape comments</>
            }
          </button>
          <button className="btn-ghost" disabled={loading} onClick={() => { setPostUrl(""); setComments([]); setStatusMsg(null); setSearch(""); }} style={{ marginTop: "auto" }}>Reset</button>
        </div>
      </div>

      {/* Status */}
      {statusMsg && (
        <div className="status-bar aup" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
          {loading && <div className="spin-a" style={{ borderTopColor: stStyle.ink }} />}
          {statusType === "success" && <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          {statusMsg}
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="aup">
          <div className="metrics-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
            <div className="mcard hi"><div className="mcard-lbl">Total Comments</div><div className="mcard-val">{fmt(stats.total)}</div><div className="mcard-sub">Scraped</div></div>
            <div className="mcard hi"><div className="mcard-lbl">Unique Users</div><div className="mcard-val">{fmt(stats.uniqueUsers)}</div><div className="mcard-sub">Commenters</div></div>
            <div className="mcard"><div className="mcard-lbl">Total Likes</div><div className="mcard-val">{fmt(stats.totalLikes)}</div><div className="mcard-sub">On comments</div></div>
            <div className="mcard"><div className="mcard-lbl">With Replies</div><div className="mcard-val">{fmt(stats.replied)}</div><div className="mcard-sub">Comments</div></div>
            <div className="mcard"><div className="mcard-lbl">Top Comment</div><div className="mcard-val">{fmt(stats.topComment?.likesCount || 0)}</div><div className="mcard-sub">Likes on best</div></div>
          </div>

          {/* Top comment highlight */}
          {stats.topComment && (
            <div style={{ background: "var(--accent-pale)", border: "1px solid var(--accent-border)", borderRadius: "var(--r)", padding: "14px 18px", marginBottom: 18, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.5 3 3.5.5-2.5 2.5.6 3.5L7 9l-3.1 1.5.6-3.5L2 4.5 5.5 4z" fill="white"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--accent-dark)", marginBottom: 5 }}>Top comment · {fmt(stats.topComment.likesCount)} likes</div>
                <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 600, marginRight: 6 }}>@{stats.topComment.ownerUsername || stats.topComment.username}</span>
                  {(stats.topComment.text || "").slice(0, 200)}{(stats.topComment.text || "").length > 200 ? "…" : ""}
                </div>
              </div>
            </div>
          )}

          {/* Search + sort + export bar */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
              <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", opacity: .4 }} width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="var(--ink)" strokeWidth="1.4"/><path d="M8 8l2.5 2.5" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round"/></svg>
              <input
                className="inp"
                style={{ paddingLeft: 34 }}
                placeholder="Search comments or usernames…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="sel-wrap">
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ height: 42 }}>
                <option value="date">Latest first</option>
                <option value="likes">Most liked</option>
              </select>
            </div>
            {/* Export buttons */}
            <button className="btn-ghost" onClick={exportExcel} style={{ gap: 6, display: "flex", alignItems: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              .xlsx
            </button>
            <button className="btn-ghost" onClick={exportCSV} style={{ gap: 6, display: "flex", alignItems: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              .csv
            </button>
            <button className="btn-ghost" onClick={exportJSON} style={{ gap: 6, display: "flex", alignItems: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              .json
            </button>
          </div>

          {/* Comment count note */}
          {search && (
            <div style={{ fontSize: 12, color: "var(--ink3)", marginBottom: 10 }}>
              Showing {displayed.length} of {comments.length} comments
            </div>
          )}

          {/* Comments list */}
          {displayed.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {displayed.map((c, i) => {
                const user    = c.ownerUsername || c.username || "unknown";
                const text    = c.text || "(no text)";
                const likes   = c.likesCount || 0;
                const replies = c.repliesCount || 0;
                const date    = parseDate(c.timestamp || c.createdAt);
                const initial = user[0]?.toUpperCase() || "?";
                return (
                  <div key={c.id || i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "13px 16px", display: "flex", gap: 12, alignItems: "flex-start", transition: "border-color .13s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border2)"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                  >
                    {/* Avatar */}
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `hsl(${(user.charCodeAt(0) * 47) % 360},55%,65%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {initial}
                    </div>
                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>@{user}</span>
                        {c.repliedToId && <span style={{ fontSize: 9, fontFamily: "var(--mono)", padding: "1px 6px", borderRadius: 99, background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--ink3)" }}>reply</span>}
                        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)", marginLeft: "auto" }}>{date}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.7 }}>{text}</div>
                      {(likes > 0 || replies > 0) && (
                        <div style={{ display: "flex", gap: 12, marginTop: 7 }}>
                          {likes > 0 && (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink3)" }}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 8.5C5 8.5 1 6 1 3.5a2 2 0 014 0 2 2 0 014 0C9 6 5 8.5 5 8.5z" fill="#F43F5E" opacity=".8"/></svg>
                              {fmt(likes)}
                            </span>
                          )}
                          {replies > 0 && (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink3)" }}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 2.5h8M1 5h5M1 7.5h3" stroke="var(--ink3)" strokeWidth="1.3" strokeLinecap="round"/></svg>
                              {fmt(replies)} replies
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {comments.length > 200 && !search && (
                <div className="empty" style={{ marginTop: 8 }}>Showing first 200 comments. Download the full dataset using the export buttons above.</div>
              )}
            </div>
          ) : (
            <div className="empty">No comments match your search.</div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!stats && !loading && !statusMsg && (
        <div className="placeholder">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity=".25"><rect x="4" y="4" width="32" height="32" rx="8" stroke="var(--ink)" strokeWidth="2"/><path d="M12 15h16M12 20h12M12 25h8" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"/></svg>
          <div className="placeholder-title">No comments yet</div>
          <div className="placeholder-sub">Paste an Instagram post URL above and hit Scrape comments.</div>
        </div>
      )}
    </div>
  );
}
