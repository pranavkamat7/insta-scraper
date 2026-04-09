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

const NICHES = [
  { label: "Fitness", tags: ["fitness", "workout", "gym"] },
  { label: "Food", tags: ["food", "recipe", "foodie"] },
  { label: "Travel", tags: ["travel", "wanderlust", "explore"] },
  { label: "Fashion", tags: ["fashion", "ootd", "style"] },
  { label: "Beauty", tags: ["beauty", "makeup", "skincare"] },
  { label: "Tech", tags: ["tech", "technology", "gadgets"] },
  { label: "Business", tags: ["business", "entrepreneur", "startup"] },
  { label: "Comedy", tags: ["funny", "comedy", "memes"] },
];

function duration(sec) {
  if (!sec) return null;
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
}

function HookBadge({ cap }) {
  const lower = cap.toLowerCase();
  if (lower.startsWith("pov")) return <span style={badgeStyle("#f43f5e", "rgba(244,63,94,.1)", "rgba(244,63,94,.2)")}>POV</span>;
  if (lower.includes("?")) return <span style={badgeStyle("var(--amber)", "var(--amber-pale)", "var(--amber-border)")}>Question</span>;
  if (lower.includes("tutorial") || lower.includes("how to")) return <span style={badgeStyle("var(--green)", "var(--green-pale)", "var(--green-border)")}>Tutorial</span>;
  if (lower.includes("before") || lower.includes("after")) return <span style={badgeStyle("var(--sky)", "var(--sky-pale)", "var(--sky-border)")}>Before/After</span>;
  if (lower.startsWith("day in") || lower.includes("day in my life")) return <span style={badgeStyle("var(--v)", "var(--v-pale)", "var(--v-border)")}>Day in life</span>;
  return null;
}
function badgeStyle(ink, bg, border) {
  return { display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: ".02em", background: bg, border: `1px solid ${border}`, color: ink };
}

export default function TrendingReels() {
  const [niche, setNiche] = useState(null);
  const [customTag, setCustomTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [reels, setReels] = useState([]);
  const [statusMsg, setStatusMsg] = useState(null);
  const [statusType, setStatusType] = useState("info");

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function fetchReels(tags) {
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }
    setLoading(true); setReels([]);
    try {
      setStatus("Fetching trending reels…", "info");
      const input = {
        hashtags: tags,
        resultsLimit: 15,
        resultsType: "posts",
      };
      const runRes = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/runs?token=${APIFY_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
      );
      if (!runRes.ok) throw new Error("Failed to start.");
      const rd = await runRes.json();
      const runId = rd?.data?.id, dsId = rd?.data?.defaultDatasetId;
      if (!runId) throw new Error("Invalid Apify response.");
      let elapsed = 0, done = false;
      while (elapsed < 180 && !done) {
        await sleep(5000); elapsed += 5;
        setStatus(`Fetching reels… ${elapsed}s`, "info");
        const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`)).json())?.data?.status;
        if (st === "SUCCEEDED") done = true;
        else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) throw new Error(`Run ${st.toLowerCase()}`);
      }
      if (!done) throw new Error("Timed out.");
      const items = await (await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=30`)).json();
      if (!Array.isArray(items) || !items.length) throw new Error("No reels found.");
      // filter to video-type posts
      const videoItems = items.filter(i => i.type === "video" || i.videoViewCount || i.videoPlayCount || i.videoDuration);
      const sorted = (videoItems.length ? videoItems : items).sort((a, b) => toN(b.videoViewCount || b.videoPlayCount) - toN(a.videoViewCount || a.videoPlayCount)).slice(0, 12);
      setReels(sorted);
      setStatus(`Found ${sorted.length} trending reels`, "success");
    } catch (e) {
      setStatus(e.message || "Something went wrong.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleNiche(n) {
    setNiche(n.label);
    fetchReels(n.tags);
  }

  function handleCustom() {
    const tags = customTag.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
    if (!tags.length) return;
    setNiche(customTag);
    fetchReels(tags);
  }

  const stStyle = {
    info:    { bg: "var(--sky-pale)", ink: "var(--sky)", border: "var(--sky-border)" },
    success: { bg: "var(--green-pale)", ink: "var(--green)", border: "var(--green-border)" },
    error:   { bg: "var(--red-pale)", ink: "var(--red)", border: "var(--red-border)" },
  }[statusType] || {};

  const topViews = reels[0] ? toN(reels[0].videoViewCount || reels[0].videoPlayCount) : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em", marginBottom: 6 }}>
          Trending Reels
        </h2>
        <p style={{ fontSize: 14, color: "var(--ink2)", lineHeight: 1.7 }}>
          Discover what's performing in your niche — video views, hook types, durations, and content patterns.
        </p>
      </div>

      {/* Niche picker */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 12 }}>Pick a niche</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {NICHES.map(n => (
            <button
              key={n.label}
              className="btn-sm"
              onClick={() => handleNiche(n)}
              style={{ borderRadius: 99, ...(niche === n.label ? { background: "var(--v)", color: "#fff", borderColor: "var(--v)" } : {}) }}
            >
              {n.label}
            </button>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", gap: 10 }}>
          <input
            className="inp"
            placeholder="Custom tags: skincare, wellness, glow…"
            value={customTag}
            onChange={e => setCustomTag(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && handleCustom()}
            style={{ flex: 1 }}
          />
          <button className="btn-primary" style={{ width: 110 }} disabled={loading} onClick={handleCustom}>
            {loading ? <><div className="spin-w" />Going…</> : "Search"}
          </button>
        </div>
      </div>

      {/* Status */}
      {statusMsg && (
        <div className="status-bar up" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
          {loading && <div className="spin-v" style={{ borderTopColor: stStyle.ink }} />}
          {statusMsg}
        </div>
      )}

      {/* Results */}
      {reels.length > 0 && (
        <div className="up">
          {/* Agg stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              ["Top views", fmt(topViews), "Highest reel"],
              ["Avg views", fmt(Math.round(reels.reduce((s, r) => s + toN(r.videoViewCount || r.videoPlayCount), 0) / reels.length)), "Per reel"],
              ["Avg likes", fmt(Math.round(reels.reduce((s, r) => s + toN(r.likesCount), 0) / reels.length)), "Per reel"],
              ["Reels fetched", reels.length, "In this niche"],
            ].map(([label, value, sub]) => (
              <div className="mcard" key={label}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 10 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.04em", color: "var(--ink)" }}>{value}</div>
                <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 5 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Reels list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reels.map((reel, i) => {
              const cap = reel.caption || reel.text || "(no caption)";
              const views = toN(reel.videoViewCount || reel.videoPlayCount);
              const likes = toN(reel.likesCount);
              const comments = toN(reel.commentsCount);
              const dur = duration(reel.videoDuration);
              const url = reel.url || (reel.shortCode ? `https://instagram.com/reel/${reel.shortCode}` : null);
              const hook = cap.slice(0, 80);
              const barW = topViews > 0 ? Math.max(4, (views / topViews) * 100) : 0;

              return (
                <div className="card" key={reel.id || i} style={{ padding: "18px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                  {/* rank */}
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: i < 3 ? "var(--v)" : "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: i < 3 ? "#fff" : "var(--ink3)", flexShrink: 0 }}>
                    {i + 1}
                  </div>

                  {/* content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
                      <HookBadge cap={cap} />
                      {dur && <span style={badgeStyle("var(--ink2)", "var(--surface2)", "var(--border2)")}>{dur}</span>}
                    </div>

                    <p style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.65, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {hook}
                    </p>

                    {/* views bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ height: 4, borderRadius: 99, background: "var(--surface3)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${barW}%`, background: "var(--v)", borderRadius: 99, transition: "width .4s" }} />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--ink2)", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--v)" }}>{fmt(views)} views</span>
                      <span>{fmt(likes)} likes</span>
                      <span>{fmt(comments)} comments</span>
                      {url && <a href={url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", color: "var(--v)", fontWeight: 700, textDecoration: "none", fontSize: 11 }}>Watch ↗</a>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && reels.length === 0 && !statusMsg && (
        <div style={{ padding: 60, textAlign: "center", fontSize: 14, color: "var(--ink3)", border: "1px dashed var(--border2)", borderRadius: 14, background: "var(--surface2)" }}>
          Choose a niche above to see what reels are trending right now.
        </div>
      )}
    </div>
  );
}
