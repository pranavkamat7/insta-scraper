import { useState } from "react";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;

// Try multiple actors in order — first one with media URLs wins
// Dedicated story actors — apify~instagram-scraper returns posts not stories
const ACTORS = [
  {
    id: "louisdeconinck~instagram-story-details-scraper",
    input: (user) => ({ usernames: [user] }),
  },
  {
    id: "codenest~instagram-story-scraper",
    input: (user) => ({ usernames: [user] }),
  },
  {
    id: "datavoyantlab~instagram-story-downloader",
    input: (user) => ({ usernames: [user] }),
  },
  {
    id: "zuzka~instagram-story-scraper",
    input: (user) => ({ usernames: [user] }),
  },
];

// Extract a usable media URL regardless of which actor field names were used
function extractMedia(story) {
  const isVideo =
    story.isVideo === true ||
    story.mediaType === "video" ||
    story.type === "video" ||
    !!story.videoUrl || !!story.video_url || !!story.videoSrc ||
    !!(story.videos && story.videos[0]);

  const imgCandidates = [
    story.imageUrl, story.image_url, story.displayUrl, story.display_url,
    story.thumbnailUrl, story.thumbnail_url, story.thumbnail_src,
    story.previewUrl, story.coverUrl, story.cover_image_url,
    story.image, story.photo_url, story.mediaUrl,
    story.image_versions2?.candidates?.[0]?.url,
    story.images?.standard_resolution?.url,
    story.images?.low_resolution?.url,
    story.thumbnail_resources?.[0]?.src,
    story.resources?.[0]?.src,
    Array.isArray(story.images) ? (story.images[0]?.url || story.images[0]) : null,
  ].filter(Boolean);

  const vidCandidates = [
    story.videoUrl, story.video_url, story.videoSrc, story.video_src,
    story.videoVersions?.[0]?.url, story.video_versions?.[0]?.url,
    story.videos?.[0]?.url, story.videos?.[0]?.src,
    story.media?.video_url,
  ].filter(Boolean);

  return {
    isVideo,
    imageUrl:    imgCandidates[0] || null,
    videoUrl:    vidCandidates[0] || null,
    downloadUrl: isVideo ? (vidCandidates[0] || imgCandidates[0]) : imgCandidates[0],
  };
}

function flattenItems(items) {
  return items.flatMap(item => {
    if (Array.isArray(item?.stories)) return item.stories;
    if (Array.isArray(item?.items))   return item.items;
    if (Array.isArray(item?.data))    return item.data;
    return [item];
  });
}

async function pollRun(runId, label, setStatus) {
  let elapsed = 0;
  while (elapsed < 120) {
    await sleep(4000); elapsed += 4;
    setStatus(`${label} … ${elapsed}s`, "info");
    const res  = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`);
    const data = await res.json();
    const st   = data?.data?.status;
    if (st === "SUCCEEDED") return data.data.defaultDatasetId;
    if (["FAILED","ABORTED","TIMED-OUT"].includes(st)) throw new Error(`Run ${st.toLowerCase()}`);
  }
  throw new Error("Timed out — try again.");
}

// ── Status bar ────────────────────────────────────────────────────────────────
function StatusBar({ msg, type, loading }) {
  const map = {
    info:    { bg: "var(--accent-pale)",  ink: "var(--accent-dark)", border: "var(--accent-border)" },
    success: { bg: "var(--green-pale)",   ink: "var(--green)",       border: "var(--green-border)"  },
    error:   { bg: "var(--red-pale)",     ink: "var(--red)",         border: "var(--red-border)"    },
    warn:    { bg: "var(--amber-pale)",   ink: "var(--amber)",       border: "var(--amber-border)"  },
  };
  const s = map[type] || map.info;
  return (
    <div className="status-bar aup" style={{ background: s.bg, color: s.ink, borderColor: s.border }}>
      {loading && <div className="spin-a" style={{ borderTopColor: s.ink }} />}
      {type === "success" && (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M2 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {msg}
    </div>
  );
}

// ── Debug panel — shows raw JSON so you can see what the actor returned ───────
function DebugPanel({ items }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  return (
    <div style={{ margin: "16px 0", border: "1px dashed var(--border2)", borderRadius: "var(--r)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "10px 14px", background: "var(--surface2)",
          border: "none", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontSize: 12, fontFamily: "var(--mono)", color: "var(--ink2)",
        }}
      >
        <span>🔍 Debug — raw fields returned by actor (first item)</span>
        <span>{open ? "▲ hide" : "▼ show"}</span>
      </button>
      {open && (
        <pre style={{
          padding: 14, fontSize: 10.5, fontFamily: "var(--mono)", color: "var(--ink2)",
          background: "var(--surface)", overflowX: "auto", maxHeight: 320,
          whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {JSON.stringify(items[0], null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Story card ────────────────────────────────────────────────────────────────
function StoryCard({ story, index }) {
  const { isVideo, imageUrl, downloadUrl } = extractMedia(story);

  const ts   = story.takenAt || story.timestamp || story.taken_at || story.takenAtTimestamp;
  const date = ts
    ? new Date(typeof ts === "number" ? ts * 1000 : ts).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "2-digit",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  const mentions = (story.mentions || story.usertags || story.reel_mentions || [])
    .map(m => (typeof m === "string" ? m : m?.username || m?.user?.username || ""))
    .filter(Boolean);

  async function handleDownload() {
    if (!downloadUrl) return;
    try {
      const res  = await fetch(downloadUrl);
      const blob = await res.blob();
      const ext  = isVideo ? "mp4" : "jpg";
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(blob);
      a.download = `story_${index + 1}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(downloadUrl, "_blank");
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r)", overflow: "hidden",
        display: "flex", flexDirection: "column", transition: "border-color .14s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-border)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      {/* Thumbnail */}
      <div style={{
        width: "100%", aspectRatio: "9/16", background: "var(--surface2)",
        position: "relative", overflow: "hidden", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {imageUrl ? (
          <img src={imageUrl} alt={`Story ${index + 1}`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { e.target.style.display = "none"; }}
          />
        ) : (
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="3" y="3" width="22" height="22" rx="5" stroke="var(--border3)" strokeWidth="1.5"/>
            <circle cx="10" cy="11" r="2" stroke="var(--ink3)" strokeWidth="1.3"/>
            <path d="M3 19l6-5 4 4 3-3 9 8" stroke="var(--ink3)" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        )}
        <div style={{
          position: "absolute", top: 8, left: 8, fontSize: 9,
          fontFamily: "var(--mono)", fontWeight: 600, padding: "3px 8px",
          borderRadius: 99, background: "rgba(0,0,0,.6)", color: "#fff",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {isVideo
            ? <><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 1.5l6 3-6 3V1.5z" fill="white"/></svg>VIDEO</>
            : <><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><rect x="1" y="1" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.2"/></svg>IMAGE</>
          }
        </div>
        <div style={{
          position: "absolute", top: 8, right: 8, fontSize: 9, fontFamily: "var(--mono)",
          padding: "3px 7px", borderRadius: 99, background: "rgba(0,0,0,.5)", color: "#fff",
        }}>#{index + 1}</div>
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        {date && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)" }}>{date}</div>}
        {mentions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {mentions.slice(0, 3).map((h, i) => (
              <span key={i} style={{
                fontSize: 10, fontFamily: "var(--mono)", padding: "2px 7px", borderRadius: 99,
                background: "var(--accent-pale)", color: "var(--accent-dark)", border: "1px solid var(--accent-border)",
              }}>@{h}</span>
            ))}
          </div>
        )}
        <button
          onClick={handleDownload}
          disabled={!downloadUrl}
          style={{
            marginTop: "auto", width: "100%", height: 36, borderRadius: "var(--r)",
            border: "1px solid var(--border2)", background: "var(--surface2)",
            color: downloadUrl ? "var(--ink)" : "var(--ink3)",
            fontSize: 12, fontWeight: 600, fontFamily: "var(--f)",
            cursor: downloadUrl ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "background .12s, border-color .12s, color .12s",
          }}
          onMouseEnter={e => { if (downloadUrl) { e.currentTarget.style.background = "var(--accent-pale)"; e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.color = "var(--accent-dark)"; }}}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = downloadUrl ? "var(--ink)" : "var(--ink3)"; }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v6M3 4.5L5.5 7 8 4.5M1 9.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {isVideo ? "Download video" : "Download image"}
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StoriesScraper() {
  const [username,   setUsername]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const [statusMsg,  setStatusMsg]  = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [stories,    setStories]    = useState([]);
  const [rawItems,   setRawItems]   = useState([]);
  const [filter,     setFilter]     = useState("all");

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function runScrape() {
    const user = username.trim().replace("@", "").toLowerCase();
    if (!user)      { setStatus("Enter an Instagram username.", "error"); return; }
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }

    setLoading(true); setStories([]); setRawItems([]);

    let lastRaw = [];
    for (let ai = 0; ai < ACTORS.length; ai++) {
      const actor = ACTORS[ai];
      try {
        setStatus(`Trying actor ${ai + 1}/${ACTORS.length}…`, "info");
        const runRes = await fetch(
          `https://api.apify.com/v2/acts/${actor.id}/runs?token=${APIFY_KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(actor.input(user)) }
        );
        if (!runRes.ok) {
          const e = await runRes.json().catch(() => ({}));
          throw new Error(e.error?.message || `HTTP ${runRes.status}`);
        }
        const rd    = await runRes.json();
        const runId = rd?.data?.id;
        if (!runId) throw new Error("No run ID.");

        const dsId = await pollRun(runId, `Actor ${ai + 1} running`, setStatus);

        const items = await (await fetch(
          `https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=200`
        )).json();

        if (!Array.isArray(items) || !items.length) throw new Error("Empty dataset.");

        console.log(`%c[Actor ${ai + 1}] Raw items (${items.length}):`, "color:#4F46E5;font-weight:bold", items);

        const flat = flattenItems(items);
        console.log(`%c[Actor ${ai + 1}] Flattened (${flat.length}):`, "color:#4F46E5;font-weight:bold", flat);
        if (flat[0]) {
          console.log(`%c[Actor ${ai + 1}] Keys on item[0]:`, "color:#D97706;font-weight:bold", Object.keys(flat[0]));
          // Print every top-level value so we can spot image/video URLs
          Object.entries(flat[0]).forEach(([k, v]) => {
            const str = typeof v === "string" ? v : JSON.stringify(v);
            console.log(`  ${k}: ${str?.slice(0, 200)}`);
          });
        }

        lastRaw = flat;
        setRawItems(flat);

        const withMedia = flat.filter(s => {
          const m = extractMedia(s);
          return m.imageUrl || m.videoUrl;
        });

        if (withMedia.length > 0) {
          setStories(withMedia);
          setStatus(`Done — ${withMedia.length} stor${withMedia.length === 1 ? "y" : "ies"} found for @${user}`, "success");
          setLoading(false);
          return;
        }

        setStatus(`Actor ${ai + 1} returned data but no media URLs. Trying next…`, "warn");
        await sleep(800);

      } catch (err) {
        console.warn(`Actor ${ai + 1} failed:`, err.message);
        if (ai < ACTORS.length - 1) {
          setStatus(`Actor ${ai + 1}: ${err.message}. Trying next…`, "warn");
          await sleep(600);
        }
      }
    }

    // All actors exhausted
    setRawItems(lastRaw);
    if (lastRaw.length) {
      setStatus(`Got ${lastRaw.length} items but couldn't find media URLs — expand the debug panel below to see raw data.`, "warn");
    } else {
      setStatus("No stories found. The account may be private or has no active stories right now.", "error");
    }
    setLoading(false);
  }

  async function downloadAll() {
    for (let i = 0; i < filtered.length; i++) {
      const { isVideo, downloadUrl } = extractMedia(filtered[i]);
      if (!downloadUrl) continue;
      try {
        const res  = await fetch(downloadUrl);
        const blob = await res.blob();
        const a    = document.createElement("a");
        a.href     = URL.createObjectURL(blob);
        a.download = `story_${i + 1}.${isVideo ? "mp4" : "jpg"}`;
        a.click();
        URL.revokeObjectURL(a.href);
        await sleep(350);
      } catch {
        window.open(downloadUrl, "_blank");
      }
    }
  }

  const imgCount = stories.filter(s => !extractMedia(s).isVideo).length;
  const vidCount = stories.length - imgCount;
  const filtered = stories.filter(s => {
    const { isVideo } = extractMedia(s);
    if (filter === "image") return !isVideo;
    if (filter === "video") return  isVideo;
    return true;
  });

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Stories <span>scraper</span></h1>
        <p className="page-desc">
          Pull active stories from any public Instagram profile. Download images and videos directly — no login required.
        </p>
      </div>

      <div className="scrape-card">
        <div className="scrape-card-head">
          <div>
            <div className="scrape-card-title">Scrape stories</div>
            <div className="scrape-card-sub">Public profiles only · stories expire after 24 h</div>
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
            onKeyDown={e => e.key === "Enter" && !loading && runScrape()}
          />
        </div>

        <div className="form-row">
          <button className="btn-primary" disabled={loading} onClick={runScrape} style={{ marginTop: "auto" }}>
            {loading
              ? <><div className="spin-w" />Scraping…</>
              : <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5" stroke="white" strokeWidth="1.4"/>
                    <path d="M4.5 6.5l1.5 1.5 2.5-2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Fetch stories
                </>
            }
          </button>
          <button className="btn-ghost" disabled={loading}
            onClick={() => { setUsername(""); setStories([]); setRawItems([]); setStatusMsg(null); }}
            style={{ marginTop: "auto" }}>Reset</button>
        </div>

        <div style={{
          marginTop: 14, padding: "10px 13px", borderRadius: "var(--r)",
          background: "var(--amber-pale)", border: "1px solid var(--amber-border)",
          fontSize: 12, color: "var(--amber)", display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M6.5 4v3M6.5 9h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span>Stories are ephemeral — they vanish after 24 hours. Only <strong>public</strong> accounts are supported.</span>
        </div>
      </div>

      {statusMsg && <StatusBar msg={statusMsg} type={statusType} loading={loading} />}

      {/* Debug panel — visible when actors returned data but no parseable media URLs */}
      {rawItems.length > 0 && stories.length === 0 && <DebugPanel items={rawItems} />}

      {stories.length > 0 && (
        <div className="aup">
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 10, marginBottom: 16,
          }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Total",  val: stories.length, color: "var(--ink)"    },
                { label: "Images", val: imgCount,        color: "var(--accent)" },
                { label: "Videos", val: vidCount,        color: "var(--green)"  },
              ].map(({ label, val, color }) => (
                <div key={label} style={{
                  padding: "6px 14px", borderRadius: 99,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  fontSize: 12, fontWeight: 600, color,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 14 }}>{val}</span>
                  <span style={{ color: "var(--ink3)", fontWeight: 400 }}>{label}</span>
                </div>
              ))}
            </div>
            <button
              onClick={downloadAll}
              style={{
                height: 38, padding: "0 16px", borderRadius: "var(--r)",
                border: "1px solid var(--green-border)", background: "var(--green-pale)",
                color: "var(--green)", fontSize: 13, fontWeight: 600, fontFamily: "var(--f)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                transition: "opacity .12s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = ".8"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Download all ({filtered.length})
            </button>
          </div>

          <div className="tabs-bar" style={{ marginBottom: 16 }}>
            {[
              { id: "all",   label: `All (${stories.length})` },
              { id: "image", label: `Images (${imgCount})` },
              { id: "video", label: `Videos (${vidCount})` },
            ].map(t => (
              <button key={t.id} className={`tab${filter === t.id ? " on" : ""}`}
                onClick={() => setFilter(t.id)}>{t.label}</button>
            ))}
          </div>

          {filtered.length > 0 ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 12,
            }}>
              {filtered.map((s, i) => <StoryCard key={s.id || i} story={s} index={i} />)}
            </div>
          ) : (
            <div className="empty">No {filter} stories in this batch.</div>
          )}
        </div>
      )}

      {!stories.length && !statusMsg && (
        <div className="placeholder">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" opacity=".25">
            <rect x="3" y="3" width="38" height="38" rx="9" stroke="var(--ink)" strokeWidth="1.8"/>
            <circle cx="22" cy="22" r="8" stroke="var(--ink)" strokeWidth="1.8"/>
            <circle cx="33" cy="11" r="3" fill="var(--ink)"/>
          </svg>
          <div className="placeholder-title">No stories yet</div>
          <div className="placeholder-sub">Enter a public Instagram username and hit Fetch stories</div>
        </div>
      )}
    </div>
  );
}
