import { useState } from "react";
import { claudeFetch } from "../lib/claudeFetch";

const toN = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

function buildPrompt(posts, profile) {
  const handle = profile?.username || profile?.ownerUsername || "this account";
  const followers = toN(profile?.followersCount || profile?.ownerFollowersCount || 0);
  const postSummaries = posts.slice(0, 15).map((p, i) => {
    const cap = (p.caption || p.text || "").slice(0, 200);
    const likes = toN(p.likesCount);
    const comments = toN(p.commentsCount);
    const views = toN(p.videoViewCount || p.videoPlayCount);
    const tags = (cap.match(/#\w+/g) || []).slice(0, 5).join(" ");
    return `Post ${i + 1}: "${cap.slice(0, 120)}" — ${likes} likes, ${comments} comments${views ? `, ${views} views` : ""}${tags ? ` | Tags: ${tags}` : ""}`;
  }).join("\n");

  return `You are an expert Instagram content strategist. Analyse this data for @${handle} (${fmt(followers)} followers).

POSTS ANALYSED:
${postSummaries}

Provide a structured analysis with these exact sections, using plain text (no markdown, no asterisks, no bullet symbols — just clean prose and numbered lists):

1. CONTENT THEMES — What are the 2-3 dominant content themes or topics? Be specific.

2. TONE & VOICE — How would you describe this account's tone? Formal, casual, inspirational, educational? Give examples from the captions.

3. TOP PERFORMING PATTERN — What do the highest-engagement posts have in common? Hook style, caption length, content type?

4. HASHTAG STRATEGY — Rate their hashtag usage (weak/average/strong) and explain why. What's working?

5. CONTENT GAPS — What 2 types of content are they NOT making that their audience would likely respond to?

6. QUICK WINS — Give 3 specific, actionable recommendations they can implement in the next 7 days.

Be direct, specific, and data-driven. Avoid generic advice. Reference actual patterns you see in the posts above.`;
}

function InsightSection({ title, content, accent }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {accent && <div style={{ width: 3, height: 16, borderRadius: 99, background: "var(--v)", flexShrink: 0 }} />}
        <div style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", fontWeight: 700 }}>{title}</div>
      </div>
      <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.8 }}>{content}</div>
    </div>
  );
}

function parseInsights(raw) {
  const sections = [
    { key: "themes",   pattern: /1\.\s*CONTENT THEMES[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "tone",     pattern: /2\.\s*TONE & VOICE[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "top",      pattern: /3\.\s*TOP PERFORMING PATTERN[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "hashtags", pattern: /4\.\s*HASHTAG STRATEGY[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "gaps",     pattern: /5\.\s*CONTENT GAPS[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
    { key: "wins",     pattern: /6\.\s*QUICK WINS[^\n]*\n([\s\S]*?)(?=\n\d\.|$)/ },
  ];
  const parsed = {};
  sections.forEach(({ key, pattern }) => {
    const match = raw.match(pattern);
    parsed[key] = match ? match[1].trim() : null;
  });
  if (Object.values(parsed).every(v => !v)) return { raw };
  return parsed;
}

export default function AIInsights({ posts = [], profile = null }) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState(null);
  const [error, setError] = useState(null);

  async function generate() {
    if (!posts.length) return;
    setLoading(true); setInsights(null); setError(null);
    try {
      const res = await claudeFetch({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        messages: [{ role: "user", content: buildPrompt(posts, profile) }],
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Server error ${res.status}`);
      }
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      if (!text) throw new Error("Empty response from Claude.");
      setInsights(parseInsights(text));
    } catch (e) {
      setError(e.message || "Failed to generate insights.");
    } finally {
      setLoading(false);
    }
  }

  const handle = profile?.username || profile?.ownerUsername || "this account";

  if (!posts.length) {
    return (
      <div style={{ padding: 60, textAlign: "center", fontSize: 14, color: "var(--ink3)", border: "1px dashed var(--border2)", borderRadius: 14, background: "var(--surface2)" }}>
        Scrape a profile first — AI Insights will analyse the posts and generate strategic recommendations.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em", marginBottom: 6 }}>AI Content Insights</h2>
        <p style={{ fontSize: 14, color: "var(--ink2)", lineHeight: 1.7 }}>
          Claude reads @{handle}'s posts and gives you tone analysis, content gaps, hashtag strategy, and actionable recommendations.
        </p>
      </div>

      {!insights && (
        <div className="card" style={{ padding: 28, marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--v-pale)", border: "1px solid var(--v-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 3a8 8 0 100 16A8 8 0 0011 3z" stroke="var(--v)" strokeWidth="1.5"/>
              <path d="M8.5 9.5C8.5 8.1 9.6 7 11 7s2.5 1.1 2.5 2.5c0 1.1-.7 2-1.7 2.3V13" stroke="var(--v)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="11" cy="15.5" r=".75" fill="var(--v)"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>Ready to analyse {posts.length} posts</div>
            <div style={{ fontSize: 13, color: "var(--ink2)", lineHeight: 1.7, maxWidth: 400 }}>
              Claude will identify content themes, tone, top-performing hooks, hashtag strategy, content gaps, and give you 3 quick wins.
            </div>
          </div>
          <button className="btn-primary" style={{ width: 200 }} onClick={generate} disabled={loading}>
            {loading
              ? <><div className="spin-w" />Analysing…</>
              : <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1l1.5 4h4l-3 2.5 1 4-3.5-2.5L3 11.5l1-4L1 5h4z" fill="white"/></svg>
                  Generate Insights
                </>}
          </button>
          {loading && <div style={{ fontSize: 12, color: "var(--ink3)", fontFamily: "var(--mono)" }}>Reading {posts.length} posts with Claude…</div>}
        </div>
      )}

      {error && (
        <div className="status-bar" style={{ background: "var(--red-pale)", color: "var(--red)", borderColor: "var(--red-border)", marginBottom: 20 }}>
          ⚠ {error}
        </div>
      )}

      {insights && !insights.raw && (
        <div className="up">
          <div className="card" style={{ padding: "24px 28px", marginBottom: 16 }}>
            {[
              { key: "themes",   title: "Content Themes",         accent: true  },
              { key: "tone",     title: "Tone & Voice",           accent: false },
              { key: "top",      title: "Top Performing Pattern", accent: true  },
              { key: "hashtags", title: "Hashtag Strategy",       accent: false },
              { key: "gaps",     title: "Content Gaps",           accent: true  },
            ].filter(s => insights[s.key]).map(s => (
              <InsightSection key={s.key} title={s.title} content={insights[s.key]} accent={s.accent} />
            ))}
          </div>
          {insights.wins && (
            <div className="card" style={{ padding: "22px 26px", borderTop: "3px solid var(--v)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--v)" }} />
                <div style={{ fontSize: 11, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--v)", fontWeight: 700 }}>Quick Wins — Do These This Week</div>
              </div>
              <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.9 }}>{insights.wins}</div>
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-sm" onClick={generate} disabled={loading}>
              {loading ? "Regenerating…" : "↻ Regenerate"}
            </button>
          </div>
        </div>
      )}

      {insights?.raw && (
        <div className="card up" style={{ padding: "24px 28px" }}>
          <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{insights.raw}</div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-sm" onClick={generate} disabled={loading}>↻ Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
}
