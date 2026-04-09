import { useState } from "react";
import { claudeFetch } from "../lib/claudeFetch";

const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};
const toN = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// More hashtag variations per niche = wider net = better trending posts
const NICHES = [
  { label: "Fitness",  tags: ["fitness", "gym", "workout", "fitnessmotivation", "bodybuilding"] },
  { label: "Food",     tags: ["food", "foodie", "recipe", "instafood", "cooking"] },
  { label: "Travel",   tags: ["travel", "wanderlust", "travelgram", "traveling", "explore"] },
  { label: "Fashion",  tags: ["fashion", "ootd", "style", "fashionblogger", "streetstyle"] },
  { label: "Beauty",   tags: ["beauty", "makeup", "skincare", "skincareroutine", "glowup"] },
  { label: "Tech",     tags: ["tech", "technology", "gadgets", "ai", "innovation"] },
  { label: "Business", tags: ["business", "entrepreneur", "startup", "motivation", "success"] },
  { label: "Comedy",   tags: ["funny", "comedy", "memes", "viral", "trending"] },
];

// Engagement score — weighted: views matter most, then likes, then comments
function engagementScore(r) {
  const views = toN(r.videoViewCount || r.videoPlayCount);
  const likes = toN(r.likesCount);
  const comments = toN(r.commentsCount);
  return views * 1 + likes * 5 + comments * 10;
}

function duration(sec) {
  if (!sec) return null;
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
}

function badgeStyle(ink, bg, border) {
  return { display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: ".02em", background: bg, border: `1px solid ${border}`, color: ink };
}

function HookBadge({ cap }) {
  const lower = cap.toLowerCase();
  if (lower.startsWith("pov")) return <span style={badgeStyle("#f43f5e", "rgba(244,63,94,.1)", "rgba(244,63,94,.2)")}>POV</span>;
  if (lower.includes("?")) return <span style={badgeStyle("var(--amber)", "var(--amber-pale)", "var(--amber-border)")}>Question</span>;
  if (lower.includes("tutorial") || lower.includes("how to")) return <span style={badgeStyle("var(--green)", "var(--green-pale)", "var(--green-border)")}>Tutorial</span>;
  if (lower.includes("before") || lower.includes("after")) return <span style={badgeStyle("var(--sky)", "var(--sky-pale)", "var(--sky-border)")}>Before/After</span>;
  if (lower.startsWith("day in") || lower.includes("day in my life")) return <span style={badgeStyle("var(--v)", "var(--v-pale)", "var(--v-border)")}>Day in life</span>;
  if (lower.includes("viral") || lower.includes("trending")) return <span style={badgeStyle("#f43f5e", "rgba(244,63,94,.08)", "rgba(244,63,94,.2)")}>Viral hook</span>;
  return null;
}

function buildReelsPrompt(reels, niche) {
  const summaries = reels.map((r, i) => {
    const cap = (r.caption || r.text || "").slice(0, 150);
    const views = toN(r.videoViewCount || r.videoPlayCount);
    const likes = toN(r.likesCount);
    const comments = toN(r.commentsCount);
    const dur = r.videoDuration ? `${r.videoDuration}s` : "unknown";
    return `Reel ${i + 1}: "${cap}" — ${fmt(views)} views, ${fmt(likes)} likes, ${fmt(comments)} comments, duration: ${dur}`;
  }).join("\n");

  return `You are an expert Instagram Reels strategist. Analyse these top trending reels in the "${niche}" niche.

REELS DATA:
${summaries}

Give a concise strategic analysis using plain text only (no markdown, no asterisks, no bullet symbols):

1. WINNING FORMATS — What content formats are dominating? POV, tutorials, transformations, etc? Be specific with examples.

2. HOOK PATTERNS — What types of opening hooks appear in the highest-viewed reels? What makes people stop scrolling?

3. OPTIMAL LENGTH — Based on the durations, what video length is performing best in this niche?

4. ENGAGEMENT DRIVERS — What causes high comments vs high views? What topics spark conversation?

5. CONTENT GAPS — What is missing from these trending reels that a creator could own right now?

6. 3 REEL IDEAS — Give 3 specific, ready-to-shoot reel ideas for this niche based on what is working. Include the hook line, format, and why it will perform.

Keep it sharp, specific, and actionable. Reference actual data from the reels above.`;
}

function AISection({ title, content, highlight }) {
  return (
    <div style={{ marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {highlight && <div style={{ width: 3, height: 14, borderRadius: 99, background: "var(--v)", flexShrink: 0 }} />}
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", fontWeight: 700 }}>{title}</div>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.8 }}>{content}</div>
    </div>
  );
}

function parseReelsInsights(raw) {
  const sections = [
    { key: "formats", pattern: /1\.\s*WINNING FORMATS[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "hooks",   pattern: /2\.\s*HOOK PATTERNS[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "length",  pattern: /3\.\s*OPTIMAL LENGTH[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "drivers", pattern: /4\.\s*ENGAGEMENT DRIVERS[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "gaps",    pattern: /5\.\s*CONTENT GAPS[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "ideas",   pattern: /6\.\s*3 REEL IDEAS[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
  ];
  const parsed = {};
  sections.forEach(({ key, pattern }) => {
    const match = raw.match(pattern);
    parsed[key] = match ? match[1].trim() : null;
  });
  if (Object.values(parsed).every(v => !v)) return { raw };
  return parsed;
}

export default function TrendingReels() {
  const [niche, setNiche] = useState(null);
  const [customTag, setCustomTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [reels, setReels] = useState([]);
  const [filtered, setFiltered] = useState([]); // after quality filter
  const [statusMsg, setStatusMsg] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [totalFetched, setTotalFetched] = useState(0);

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function fetchReels(tags) {
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }
    setLoading(true); setReels([]); setFiltered([]); setAiInsights(null); setAiError(null); setTotalFetched(0);
    try {
      setStatus("Starting scrape — fetching 50 posts across hashtags…", "info");

      // Fetch more posts (50) to get a better pool to filter from
      const input = {
        hashtags: tags,
        resultsLimit: 50,   // ← more posts = better chance of high performers
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
      while (elapsed < 240 && !done) {
        await sleep(6000); elapsed += 6;
        setStatus(`Scraping ${tags.slice(0,3).map(t=>`#${t}`).join(", ")}… ${elapsed}s`, "info");
        const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`)).json())?.data?.status;
        if (st === "SUCCEEDED") done = true;
        else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) throw new Error(`Run ${st.toLowerCase()}`);
      }
      if (!done) throw new Error("Timed out.");

      const items = await (await fetch(
        `https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=100`
      )).json();

      if (!Array.isArray(items) || !items.length) throw new Error("No posts found.");

      setTotalFetched(items.length);

      // Step 1: keep only video/reel posts
      const videos = items.filter(i =>
        i.type === "video" ||
        toN(i.videoViewCount) > 0 ||
        toN(i.videoPlayCount) > 0 ||
        i.videoDuration
      );

      const pool = videos.length >= 5 ? videos : items;

      // Step 2: sort by engagement score (views + weighted likes/comments)
      const scored = pool
        .map(r => ({ ...r, _score: engagementScore(r) }))
        .sort((a, b) => b._score - a._score);

      // Step 3: filter — remove posts with basically zero engagement
      // Use median as baseline, keep top performers
      const scores = scored.map(r => r._score);
      const median = scores[Math.floor(scores.length / 2)] || 0;
      const threshold = Math.max(median * 0.5, 100); // at least above half the median

      const quality = scored.filter(r => r._score >= threshold);
      const final = (quality.length >= 6 ? quality : scored).slice(0, 12);

      setReels(final);
      setFiltered(final);

      const topScore = final[0]?._score || 0;
      const topViews = toN(final[0]?.videoViewCount || final[0]?.videoPlayCount);
      setStatus(
        `Found ${final.length} top posts from ${items.length} scraped — best: ${fmt(topViews)} views`,
        "success"
      );
    } catch (e) {
      setStatus(e.message || "Something went wrong.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function analyseWithAI() {
    if (!reels.length) return;
    setAiLoading(true); setAiInsights(null); setAiError(null);
    try {
      const res = await claudeFetch({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        messages: [{ role: "user", content: buildReelsPrompt(reels, niche || "general") }],
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Server error ${res.status}`);
      }
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      if (!text) throw new Error("Empty response from Claude.");
      setAiInsights(parseReelsInsights(text));
    } catch (e) {
      setAiError(e.message || "Failed to analyse reels.");
    } finally {
      setAiLoading(false);
    }
  }

  function handleNiche(n) { setNiche(n.label); fetchReels(n.tags); }
  function handleCustom() {
    const tags = customTag.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
    if (!tags.length) return;
    setNiche(customTag);
    fetchReels(tags);
  }

  const stStyle = {
    info:    { bg: "var(--sky-pale)",   ink: "var(--sky)",   border: "var(--sky-border)" },
    success: { bg: "var(--green-pale)", ink: "var(--green)", border: "var(--green-border)" },
    error:   { bg: "var(--red-pale)",   ink: "var(--red)",   border: "var(--red-border)" },
  }[statusType] || {};

  const topViews = reels[0] ? toN(reels[0].videoViewCount || reels[0].videoPlayCount) : 0;
  const topScore = reels[0]?._score || 1;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em", marginBottom: 6 }}>Trending Reels</h2>
        <p style={{ fontSize: 14, color: "var(--ink2)", lineHeight: 1.7 }}>
          Scrapes 50 posts per niche, filters by engagement score, surfaces the real top performers.
        </p>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 12 }}>Pick a niche</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {NICHES.map(n => (
            <button key={n.label} className="btn-sm" onClick={() => handleNiche(n)}
              style={{ borderRadius: 99, ...(niche === n.label ? { background: "var(--v)", color: "#fff", borderColor: "var(--v)" } : {}) }}>
              {n.label}
            </button>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", gap: 10 }}>
          <input className="inp" placeholder="Custom tags: skincare, wellness, glow…" value={customTag}
            onChange={e => setCustomTag(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && handleCustom()} style={{ flex: 1 }} />
          <button className="btn-primary" style={{ width: 110 }} disabled={loading} onClick={handleCustom}>
            {loading ? <><div className="spin-w" />Going…</> : "Search"}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="status-bar up" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
          {loading && <div className="spin-v" style={{ borderTopColor: stStyle.ink }} />}
          {statusMsg}
        </div>
      )}

      {reels.length > 0 && (
        <div className="up">
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              ["Top views",      fmt(topViews), "Best reel"],
              ["Avg views",      fmt(Math.round(reels.reduce((s, r) => s + toN(r.videoViewCount || r.videoPlayCount), 0) / reels.length)), "Per reel"],
              ["Avg likes",      fmt(Math.round(reels.reduce((s, r) => s + toN(r.likesCount), 0) / reels.length)), "Per reel"],
              ["Pool scraped",   totalFetched || reels.length, "Posts analysed"],
            ].map(([label, value, sub]) => (
              <div className="mcard" key={label}>
                <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 10 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.04em", color: "var(--ink)" }}>{value}</div>
                <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 5 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* AI trigger */}
          {!aiInsights && (
            <div className="card" style={{ padding: 20, marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Analyse with Claude AI</div>
                <div style={{ fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 }}>
                  Get winning formats, hook patterns, content gaps and 3 ready-to-shoot reel ideas for <strong>{niche}</strong>.
                </div>
              </div>
              <button className="btn-primary" style={{ width: 170, flexShrink: 0 }} onClick={analyseWithAI} disabled={aiLoading}>
                {aiLoading
                  ? <><div className="spin-w" />Analysing…</>
                  : <><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1l1.5 4h4l-3 2.5 1 4-3.5-2.5L3 11.5l1-4L1 5h4z" fill="white"/></svg>Analyse Reels</>}
              </button>
            </div>
          )}

          {aiError && (
            <div className="status-bar" style={{ background: "var(--red-pale)", color: "var(--red)", borderColor: "var(--red-border)", marginBottom: 20 }}>⚠ {aiError}</div>
          )}

          {aiInsights && !aiInsights.raw && (
            <div className="up" style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--v)" }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>Claude's Analysis — {niche} Reels</span>
                </div>
                <button className="btn-sm" onClick={analyseWithAI} disabled={aiLoading}>
                  {aiLoading ? "Regenerating…" : "↻ Regenerate"}
                </button>
              </div>
              <div className="card" style={{ padding: "22px 26px", marginBottom: 14 }}>
                {[
                  { key: "formats", title: "Winning Formats",    highlight: true  },
                  { key: "hooks",   title: "Hook Patterns",      highlight: false },
                  { key: "length",  title: "Optimal Length",     highlight: false },
                  { key: "drivers", title: "Engagement Drivers", highlight: true  },
                  { key: "gaps",    title: "Content Gaps",       highlight: false },
                ].filter(s => aiInsights[s.key]).map(s => (
                  <AISection key={s.key} title={s.title} content={aiInsights[s.key]} highlight={s.highlight} />
                ))}
              </div>
              {aiInsights.ideas && (
                <div className="card" style={{ padding: "22px 26px", borderTop: "3px solid var(--v)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.5 4h4l-3.2 2.5 1.1 4L7 9l-3.4 2.5 1.1-4L1.5 5h4z" fill="var(--v)"/></svg>
                    <div style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--v)", fontWeight: 700 }}>3 Ready-to-Shoot Reel Ideas</div>
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.9 }}>{aiInsights.ideas}</div>
                </div>
              )}
            </div>
          )}

          {aiInsights?.raw && (
            <div className="card up" style={{ padding: "22px 26px", marginBottom: 24 }}>
              <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{aiInsights.raw}</div>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button className="btn-sm" onClick={analyseWithAI} disabled={aiLoading}>↻ Regenerate</button>
              </div>
            </div>
          )}

          {/* Reels list */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
              Top {reels.length} reels by engagement score
            </div>
            <div style={{ fontSize: 11, color: "var(--ink3)", fontFamily: "var(--mono)" }}>
              sorted: views × 1 + likes × 5 + comments × 10
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {reels.map((reel, i) => {
              const cap = reel.caption || reel.text || "(no caption)";
              const views = toN(reel.videoViewCount || reel.videoPlayCount);
              const likes = toN(reel.likesCount);
              const comments = toN(reel.commentsCount);
              const dur = duration(reel.videoDuration);
              const url = reel.url || (reel.shortCode ? `https://instagram.com/reel/${reel.shortCode}` : null);
              const barW = topScore > 0 ? Math.max(4, (reel._score / topScore) * 100) : 0;

              return (
                <div className="card" key={reel.id || i} style={{ padding: "18px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: i < 3 ? "var(--v)" : "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: i < 3 ? "#fff" : "var(--ink3)", flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
                      <HookBadge cap={cap} />
                      {dur && <span style={badgeStyle("var(--ink2)", "var(--surface2)", "var(--border2)")}>{dur}</span>}
                      {views > 100000 && <span style={badgeStyle("var(--green)", "var(--green-pale)", "var(--green-border)")}>🔥 High reach</span>}
                    </div>
                    <p style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.65, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {cap.slice(0, 100)}
                    </p>
                    {/* Engagement score bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ height: 4, borderRadius: 99, background: "var(--surface3)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${barW}%`, background: i < 3 ? "var(--v)" : "var(--border3)", borderRadius: 99, transition: "width .5s" }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--ink2)", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 600, color: views > 10000 ? "var(--v)" : "var(--ink2)" }}>{fmt(views)} views</span>
                      <span>{fmt(likes)} likes</span>
                      <span>{fmt(comments)} comments</span>
                      {url && <a href={url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", color: "var(--v)", fontWeight: 700, textDecoration: "none", fontSize: 11 }}>Watch ↗</a>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--ink3)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--ink2)" }}>Note:</strong> Instagram doesn't expose a public "trending" API. This tool fetches the most recent 50 posts for these hashtags and surfaces the top performers by engagement score. Results reflect recent high-engagement posts, not Instagram's internal trending algorithm.
          </div>
        </div>
      )}

      {!loading && reels.length === 0 && !statusMsg && (
        <div style={{ padding: 60, textAlign: "center", fontSize: 14, color: "var(--ink3)", border: "1px dashed var(--border2)", borderRadius: 14, background: "var(--surface2)" }}>
          Choose a niche above to see what reels are performing best right now.
        </div>
      )}
    </div>
  );
}
