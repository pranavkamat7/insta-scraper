import { useState, useRef } from "react";

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
const norm = (v = "") => v.trim().replace("@", "").toLowerCase();

const ACCENT_COLORS = ["var(--v)", "#0284c7", "#16a34a"];
const ACCENT_PALES = ["var(--v-pale)", "var(--sky-pale)", "var(--green-pale)"];
const ACCENT_BORDERS = ["var(--v-border)", "var(--sky-border)", "var(--green-border)"];

async function scrapeProfile(username, apifyKey, onStatus) {
  const user = norm(username);
  onStatus(`Scraping @${user}…`);
  const input = { directUrls: [`https://www.instagram.com/${user}/`], resultsType: "posts", resultsLimit: 20, addParentData: true };
  const runRes = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${apifyKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!runRes.ok) throw new Error(`Failed to start scrape for @${user}`);
  const rd = await runRes.json();
  const runId = rd?.data?.id, dsId = rd?.data?.defaultDatasetId;
  if (!runId) throw new Error("Invalid Apify response.");
  let elapsed = 0, done = false;
  while (elapsed < 240 && !done) {
    await sleep(5000); elapsed += 5;
    onStatus(`Scraping @${user}… ${elapsed}s`);
    const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyKey}`)).json())?.data?.status;
    if (st === "SUCCEEDED") done = true;
    else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) throw new Error(`@${user} run ${st.toLowerCase()}`);
  }
  if (!done) throw new Error(`Timed out on @${user}`);
  const items = await (await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${apifyKey}&limit=100`)).json();
  return items.filter(i => norm(i?.username || i?.ownerUsername || "") === user);
}

function buildStats(items, user) {
  const profile = items.find(i => norm(i?.username || i?.ownerUsername || "") === user) || items[0] || {};
  const followers = toN(profile?.followersCount || profile?.ownerFollowersCount || 0);
  const posts = items.filter(i => i?.caption !== undefined || i?.likesCount !== undefined);
  const n = posts.length;
  const tL = posts.reduce((s, p) => s + toN(p?.likesCount || 0), 0);
  const tC = posts.reduce((s, p) => s + toN(p?.commentsCount || 0), 0);
  const tV = posts.reduce((s, p) => s + toN(p?.videoViewCount || p?.videoPlayCount || 0), 0);
  const aL = n ? tL / n : 0;
  const aC = n ? tC / n : 0;
  const aV = n ? tV / n : 0;
  const erF = n && followers > 0 ? ((aL + aC) / followers) * 100 : 0;
  const erV = tV > 0 ? ((tL + tC) / tV) * 100 : 0;
  const collabs = posts.filter(p => p?.ownerUsername && p?.username && p.ownerUsername !== p.username).length;
  const videos = posts.filter(p => p?.type === "video" || p?.videoViewCount || p?.videoPlayCount).length;
  return {
    handle: profile?.username || profile?.ownerUsername || user,
    name: profile?.fullName || profile?.ownerFullName || user,
    followers, following: toN(profile?.followsCount || 0),
    profilePosts: toN(profile?.postsCount || 0),
    verified: profile?.verified || false,
    bio: (profile?.biography || "").slice(0, 100),
    n, aL: Math.round(aL), aC: Math.round(aC), aV: Math.round(aV),
    erF, erV, collabs, videos,
    collabRate: n ? (collabs / n) * 100 : 0,
    videoRate: n ? (videos / n) * 100 : 0,
  };
}

function Bar({ value, max, color }) {
  const w = max > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div style={{ height: 6, borderRadius: 99, background: "var(--surface3)", overflow: "hidden", marginTop: 4 }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 99, transition: "width .5s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}

function StatRow({ label, values, format = v => v, maxes }) {
  const parsed = values.map(v => toN(v));
  const max = maxes ? Math.max(...maxes) : Math.max(...parsed);
  return (
    <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".09em", color: "var(--ink3)", marginBottom: 10 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${values.length}, 1fr)`, gap: 12 }}>
        {values.map((v, i) => (
          <div key={i}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.03em" }}>{format(v)}</div>
            <Bar value={toN(v)} max={max} color={ACCENT_COLORS[i]} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompetitorCompare() {
  const [inputs, setInputs] = useState(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [profiles, setProfiles] = useState([]);

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  function setInput(i, val) {
    setInputs(prev => { const n = [...prev]; n[i] = val; return n; });
  }

  async function run() {
    const users = inputs.map(norm).filter(Boolean);
    if (users.length < 2) { setStatus("Enter at least 2 usernames to compare.", "error"); return; }
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }
    setLoading(true); setProfiles([]);
    try {
      const results = [];
      for (const user of users) {
        const items = await scrapeProfile(user, APIFY_KEY, msg => setStatus(msg, "info"));
        if (items.length) results.push(buildStats(items, user));
      }
      if (!results.length) throw new Error("No data returned.");
      setProfiles(results);
      setStatus(`Compared ${results.length} profiles`, "success");
    } catch (e) {
      setStatus(e.message || "Something went wrong.", "error");
    } finally {
      setLoading(false);
    }
  }

  const stStyle = {
    info:    { bg: "var(--sky-pale)", ink: "var(--sky)", border: "var(--sky-border)" },
    success: { bg: "var(--green-pale)", ink: "var(--green)", border: "var(--green-border)" },
    error:   { bg: "var(--red-pale)", ink: "var(--red)", border: "var(--red-border)" },
  }[statusType] || {};

  const n = profiles.length;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em", marginBottom: 6 }}>Competitor Compare</h2>
        <p style={{ fontSize: 14, color: "var(--ink2)", lineHeight: 1.7 }}>Side-by-side analysis of up to 3 Instagram accounts — followers, ER, content mix, collab rate.</p>
      </div>

      {/* Input */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[0, 1, 2].map(i => (
            <div key={i}>
              <label style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6, display: "block", color: ACCENT_COLORS[i] }}>
                Account {i + 1}{i === 2 ? " (optional)" : ""}
              </label>
              <input
                className="inp"
                placeholder={`@username`}
                value={inputs[i]}
                onChange={e => setInput(i, e.target.value)}
                style={{ borderColor: inputs[i] ? ACCENT_BORDERS[i] : undefined }}
              />
            </div>
          ))}
        </div>
        <button className="btn-primary" disabled={loading} onClick={run} style={{ width: "100%" }}>
          {loading
            ? <><div className="spin-w" />Comparing profiles…</>
            : <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5h9M6.5 2l4.5 4.5L6.5 11" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Compare now
              </>}
        </button>
      </div>

      {statusMsg && (
        <div className="status-bar up" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
          {loading && <div className="spin-v" style={{ borderTopColor: stStyle.ink }} />}
          {statusMsg}
        </div>
      )}

      {profiles.length >= 2 && (
        <div className="up">
          {/* Profile headers */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 12, marginBottom: 20 }}>
            {profiles.map((p, i) => (
              <div key={i} className="card" style={{ padding: "18px 20px", borderTop: `3px solid ${ACCENT_COLORS[i]}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: ACCENT_PALES[i], border: `1px solid ${ACCENT_BORDERS[i]}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: ACCENT_COLORS[i], flexShrink: 0 }}>
                    {(p.name || p.handle).slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.02em" }}>{p.name || p.handle}</div>
                    <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--ink3)" }}>@{p.handle}</div>
                  </div>
                </div>
                {p.bio && <div style={{ fontSize: 12, color: "var(--ink2)", lineHeight: 1.6 }}>{p.bio}</div>}
                {p.verified && <div style={{ marginTop: 6, fontSize: 11, color: "#1d9bf0", fontWeight: 700 }}>✓ Verified</div>}
              </div>
            ))}
          </div>

          {/* Stats comparison */}
          <div className="card" style={{ padding: "22px 24px" }}>
            {/* Column labels */}
            <div style={{ display: "grid", gridTemplateColumns: `140px repeat(${n}, 1fr)`, gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              <div />
              {profiles.map((p, i) => (
                <div key={i} style={{ fontSize: 12, fontWeight: 700, color: ACCENT_COLORS[i] }}>@{p.handle}</div>
              ))}
            </div>

            {[
              { label: "Followers", vals: profiles.map(p => p.followers), format: fmt },
              { label: "Avg likes", vals: profiles.map(p => p.aL), format: fmt },
              { label: "Avg comments", vals: profiles.map(p => p.aC), format: fmt },
              { label: "Avg ER by followers", vals: profiles.map(p => p.erF), format: v => pct(toN(v)) },
              { label: "Avg video views", vals: profiles.map(p => p.aV), format: fmt },
              { label: "Collab rate", vals: profiles.map(p => p.collabRate), format: v => pct(toN(v)) },
              { label: "Video/reel rate", vals: profiles.map(p => p.videoRate), format: v => pct(toN(v)) },
              { label: "Posts analysed", vals: profiles.map(p => p.n), format: v => String(v) },
            ].map(({ label, vals, format }) => (
              <div key={label} style={{ display: "grid", gridTemplateColumns: `140px repeat(${n}, 1fr)`, gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "var(--ink2)", fontWeight: 600 }}>{label}</div>
                {vals.map((v, i) => {
                  const allN = vals.map(x => toN(x));
                  const max = Math.max(...allN);
                  const isWinner = toN(v) === max && max > 0;
                  return (
                    <div key={i}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: isWinner ? ACCENT_COLORS[i] : "var(--ink)", letterSpacing: "-.02em", display: "flex", alignItems: "center", gap: 5 }}>
                        {format(v)}
                        {isWinner && vals.filter(x => toN(x) === max).length === 1 && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 99, background: ACCENT_PALES[i], border: `1px solid ${ACCENT_BORDERS[i]}`, color: ACCENT_COLORS[i] }}>best</span>
                        )}
                      </div>
                      <Bar value={toN(v)} max={max} color={ACCENT_COLORS[i]} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && profiles.length === 0 && !statusMsg && (
        <div style={{ padding: 60, textAlign: "center", fontSize: 14, color: "var(--ink3)", border: "1px dashed var(--border2)", borderRadius: 14, background: "var(--surface2)" }}>
          Enter 2–3 Instagram usernames above to compare them side by side.
        </div>
      )}
    </div>
  );
}
