import { useState } from "react";

const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};
const toN = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pct = (v) => (!Number.isFinite(v) || v <= 0 ? "—" : `${v.toFixed(2)}%`);

const PRESET_TAGS = ["travel", "fitness", "food", "fashion", "tech", "beauty", "photography", "motivation"];

export default function HashtagExplorer() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [posts, setPosts] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [searched, setSearched] = useState("");

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function search(tag) {
    const t = tag.trim().replace(/^#/, "").toLowerCase();
    if (!t) { setStatus("Enter a hashtag.", "error"); return; }
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }
    setLoading(true); setPosts([]); setSearched(t);
    try {
      setStatus("Starting hashtag scrape…", "info");
      const input = {
        hashtags: [t],
        resultsLimit: 12,
        resultsType: "posts",
      };
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/runs?token=${APIFY_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
      );
      if (!runRes.ok) throw new Error("Failed to start scrape.");
      const rd = await runRes.json();
      const runId = rd?.data?.id, dsId = rd?.data?.defaultDatasetId;
      if (!runId) throw new Error("Invalid Apify response.");
      let elapsed = 0, done = false;
      while (elapsed < 180 && !done) {
        await sleep(5000); elapsed += 5;
        setStatus(`Scraping #${t}… ${elapsed}s`, "info");
        const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`)).json())?.data?.status;
        if (st === "SUCCEEDED") done = true;
        else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) throw new Error(`Run ${st.toLowerCase()}`);
      }
      if (!done) throw new Error("Timed out.");
      const items = await (await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=12`)).json();
      if (!Array.isArray(items) || !items.length) throw new Error("No posts found for this tag.");
      setPosts(items);
      setStatus(`Found ${items.length} posts for #${t}`, "success");
    } catch (e) {
      setStatus(e.message || "Something went wrong.", "error");
    } finally {
      setLoading(false);
    }
  }

  const totalLikes = posts.reduce((s, p) => s + toN(p.likesCount), 0);
  const totalComments = posts.reduce((s, p) => s + toN(p.commentsCount), 0);
  const avgLikes = posts.length ? Math.round(totalLikes / posts.length) : 0;
  const avgComments = posts.length ? Math.round(totalComments / posts.length) : 0;
  const avgInteractions = avgLikes + avgComments;

  const stStyle = {
    info:    { bg: "var(--sky-pale)", ink: "var(--sky)", border: "var(--sky-border)" },
    success: { bg: "var(--green-pale)", ink: "var(--green)", border: "var(--green-border)" },
    error:   { bg: "var(--red-pale)", ink: "var(--red)", border: "var(--red-border)" },
  }[statusType] || {};

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em", marginBottom: 6 }}>
          Hashtag Explorer
        </h2>
        <p style={{ fontSize: 14, color: "var(--ink2)", lineHeight: 1.7 }}>
          Search any hashtag and get real post data — engagement benchmarks, top content, and reach signals.
        </p>
      </div>

      {/* Search bar */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 15, fontWeight: 700, color: "var(--ink3)", pointerEvents: "none" }}>#</span>
            <input
              className="inp"
              style={{ paddingLeft: 26 }}
              placeholder="travel, fitness, food…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && search(query)}
            />
          </div>
          <button
            className="btn-primary"
            style={{ width: 120 }}
            disabled={loading}
            onClick={() => search(query)}
          >
            {loading
              ? <><div className="spin-w" />Searching</>
              : <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="white" strokeWidth="1.4"/><path d="M9 9l2.5 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Search
                </>
            }
          </button>
        </div>

        {/* Preset tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)" }}>Quick</span>
          {PRESET_TAGS.map(tag => (
            <button
              key={tag}
              className="btn-sm"
              onClick={() => { setQuery(tag); search(tag); }}
              style={{ borderRadius: 99 }}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      {statusMsg && (
        <div className="status-bar up" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
          {loading && <div className="spin-v" style={{ borderTopColor: stStyle.ink }} />}
          {statusMsg}
        </div>
      )}

      {/* Summary stats */}
      {posts.length > 0 && (
        <div className="up">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              ["Posts fetched", posts.length, "Sample size"],
              ["Avg likes", fmt(avgLikes), "Per post"],
              ["Avg comments", fmt(avgComments), "Per post"],
              ["Avg interactions", fmt(avgInteractions), "Likes + comments"],
            ].map(([label, value, sub]) => (
              <div className="mcard" key={label}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 10 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.04em", color: "var(--ink)" }}>{value}</div>
                <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 5 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Posts grid */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Top posts</span>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "var(--v-pale)", border: "1px solid var(--v-border)", color: "var(--v3)", fontWeight: 700 }}>#{searched}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {posts.map((post, i) => {
              const likes = toN(post.likesCount);
              const comments = toN(post.commentsCount);
              const cap = post.caption || post.text || "(no caption)";
              const ts = post.timestamp;
              const date = ts ? new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
              const url = post.url || (post.shortCode ? `https://instagram.com/p/${post.shortCode}` : null);

              return (
                <div className="pcard" key={post.id || i}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)" }}>#{i + 1}</span>
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)" }}>{date}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.65, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cap}</p>
                  <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--ink2)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f43f5e", display: "inline-block" }} />{fmt(likes)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sky)", display: "inline-block" }} />{fmt(comments)}
                    </span>
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 11, color: "var(--v)", fontWeight: 700, textDecoration: "none" }}>View ↗</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && posts.length === 0 && !statusMsg && (
        <div style={{ padding: 60, textAlign: "center", fontSize: 14, color: "var(--ink3)", border: "1px dashed var(--border2)", borderRadius: 14, background: "var(--surface2)" }}>
          Search a hashtag to see top posts and engagement data.
        </div>
      )}
    </div>
  );
}
