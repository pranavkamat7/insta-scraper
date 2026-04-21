import { useState } from "react";

const sleep    = (ms) => new Promise((r) => setTimeout(r, ms));
const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;

// ── Actors per mode ───────────────────────────────────────────────────────────
const STORY_ACTORS = [
  { id: "louisdeconinck~instagram-story-details-scraper", input: (u) => ({ usernames: [u] }) },
  { id: "codenest~instagram-story-scraper",               input: (u) => ({ usernames: [u] }) },
  { id: "datavoyantlab~instagram-story-downloader",       input: (u) => ({ usernames: [u] }) },
  { id: "zuzka~instagram-story-scraper",                  input: (u) => ({ usernames: [u] }) },
];

// Dedicated highlight actors — correct actors that actually return highlights
const HIGHLIGHT_ACTORS = [
  // Best: dedicated highlights actor — returns title + coverUrl + stories inside each highlight
  { id: "scraper-engine~instagram-highlights-scraper", input: (u) => ({ username: u }) },
  // Fallback: general scraper with highlights resultsType
  { id: "muhammetakkurtt~instagram-scraper",           input: (u) => ({ usernames: [u], resultsType: "highlights", limit: 50 }) },
  // Fallback 2: louisdeconinck highlights
  { id: "louisdeconinck~instagram-story-details-scraper", input: (u) => ({ usernames: [u], resultsType: "highlights" }) },
];

// ── Media extraction — works across all actor field shapes ────────────────────
function extractMedia(item) {
  const isVideo =
    item.isVideo === true || item.mediaType === "video" || item.type === "Video" ||
    item.type === "video" || !!item.videoUrl || !!item.video_url || !!item.videoSrc ||
    !!(item.videos && item.videos[0]);

  const imgCandidates = [
    item.imageUrl, item.image_url, item.displayUrl, item.display_url,
    item.thumbnailUrl, item.thumbnail_url, item.thumbnail_src,
    item.previewUrl, item.coverUrl, item.cover_image_url,
    item.image, item.photo_url, item.mediaUrl,
    item.image_versions2?.candidates?.[0]?.url,
    item.images?.standard_resolution?.url,
    item.images?.low_resolution?.url,
    item.thumbnail_resources?.[0]?.src,
    item.resources?.[0]?.src,
    Array.isArray(item.images) ? (item.images[0]?.url || item.images[0]) : null,
  ].filter(Boolean);

  const vidCandidates = [
    item.videoUrl, item.video_url, item.videoSrc, item.video_src,
    item.videoVersions?.[0]?.url, item.video_versions?.[0]?.url,
    item.videos?.[0]?.url, item.videos?.[0]?.src,
    item.media?.video_url,
  ].filter(Boolean);

  return {
    isVideo,
    imageUrl:    imgCandidates[0] || null,
    videoUrl:    vidCandidates[0] || null,
    downloadUrl: isVideo ? (vidCandidates[0] || imgCandidates[0]) : imgCandidates[0],
  };
}

// For stories mode: flatten nested arrays into flat list of story objects
function flattenItems(items) {
  return items.flatMap(item => {
    if (Array.isArray(item?.items))   return item.items;
    if (Array.isArray(item?.data))    return item.data;
    return [item];
  });
}

// For highlights mode: keep each highlight as one object (don't flatten stories inside)
// Each highlight has: title, coverUrl/coverImageUrl, stories: [...] inside
function flattenHighlights(items) {
  return items.flatMap(item => {
    // Some actors return array of highlights directly
    if (Array.isArray(item?.highlights)) return item.highlights;
    if (Array.isArray(item?.data))       return item.data;
    // If item itself looks like a highlight (has title or highlightId), keep as-is
    if (item?.title || item?.highlightId || item?.id?.toString().startsWith("highlight:")) return [item];
    // Fallback
    return [item];
  });
}

async function pollRun(runId, label, setStatus) {
  let elapsed = 0;
  while (elapsed < 180) {
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

async function runActors(actors, user, setStatus) {
  let lastRaw = [];
  for (let ai = 0; ai < actors.length; ai++) {
    const actor = actors[ai];
    try {
      setStatus(`Trying source ${ai + 1}/${actors.length}…`, "info");
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

      const dsId = await pollRun(runId, `Source ${ai + 1} running`, setStatus);
      const items = await (await fetch(
        `https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=200`
      )).json();

      if (!Array.isArray(items) || !items.length) throw new Error("Empty dataset.");

      // ── Console debug (highlights need special attention) ──
      console.log(`%c[Source ${ai + 1}] RAW dataset (${items.length} items):`, "color:#4F46E5;font-weight:bold;font-size:13px", items);

      // Print first 2 raw items in full detail
      items.slice(0, 2).forEach((item, idx) => {
        console.group(`%c[Source ${ai + 1}] RAW item[${idx}] — keys: ${Object.keys(item).join(", ")}`, "color:#D97706;font-weight:bold");
        Object.entries(item).forEach(([k, v]) => {
          const str = typeof v === "string" ? v : JSON.stringify(v);
          console.log(`  ${k}:`, str?.slice(0, 400));
        });
        // If item has a stories array inside (highlight), show first story too
        if (Array.isArray(item?.stories) && item.stories[0]) {
          console.group(`  → stories[0] inside this highlight:`);
          Object.entries(item.stories[0]).forEach(([k, v]) => {
            const str = typeof v === "string" ? v : JSON.stringify(v);
            console.log(`    ${k}:`, str?.slice(0, 300));
          });
          console.groupEnd();
        }
        console.groupEnd();
      });

      // Use appropriate flattener based on mode
      const isHighlightMode = actor.id.includes("highlight") || actor.input("x").resultsType === "highlights";
      const flat = isHighlightMode ? flattenHighlights(items) : flattenItems(items);
      console.log(`%c[Source ${ai + 1}] After flatten: ${flat.length} items (mode: ${isHighlightMode ? "highlights" : "stories"})`, "color:#16A34A;font-weight:bold", flat);

      lastRaw = flat;
      const withMedia = flat.filter(s => { const m = extractMedia(s); return m.imageUrl || m.videoUrl; });
      console.log(`%c[Source ${ai + 1}] Items WITH media URLs: ${withMedia.length}/${flat.length}`, withMedia.length > 0 ? "color:#16A34A;font-weight:bold" : "color:#DC2626;font-weight:bold");
      if (withMedia.length > 0) return { items: withMedia, raw: flat };

      setStatus(`Source ${ai + 1} returned data but no media URLs. Trying next…`, "warn");
      await sleep(800);
    } catch (err) {
      console.warn(`Source ${ai + 1} failed:`, err.message);
      if (ai < actors.length - 1) {
        setStatus(`Source ${ai + 1}: ${err.message}. Trying next…`, "warn");
        await sleep(600);
      }
    }
  }
  return { items: [], raw: lastRaw };
}

// ── Status bar ────────────────────────────────────────────────────────────────
function StatusBar({ msg, type, loading }) {
  const s = {
    info:    { bg: "var(--accent-pale)",  ink: "var(--accent-dark)", border: "var(--accent-border)" },
    success: { bg: "var(--green-pale)",   ink: "var(--green)",       border: "var(--green-border)"  },
    error:   { bg: "var(--red-pale)",     ink: "var(--red)",         border: "var(--red-border)"    },
    warn:    { bg: "var(--amber-pale)",   ink: "var(--amber)",       border: "var(--amber-border)"  },
  }[type] || {};
  return (
    <div className="status-bar aup" style={{ background: s.bg, color: s.ink, borderColor: s.border }}>
      {loading && <div className="spin-a" style={{ borderTopColor: s.ink }} />}
      {type === "success" && <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {msg}
    </div>
  );
}

// ── Highlight card (wider, shows cover + title) ───────────────────────────────
function HighlightCard({ item, index }) {
  const { isVideo, imageUrl, downloadUrl } = extractMedia(item);
  const title = item.title || item.highlightTitle || item.name || `Highlight ${index + 1}`;
  const count = item.mediaCount || item.storiesCount || item.count || null;

  async function handleDownload() {
    if (!downloadUrl) return;
    try {
      const res  = await fetch(downloadUrl);
      const blob = await res.blob();
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(blob);
      a.download = `highlight_${index + 1}.${isVideo ? "mp4" : "jpg"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { window.open(downloadUrl, "_blank"); }
  }

  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r)", overflow: "hidden", display: "flex",
        flexDirection: "column", transition: "border-color .14s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent-border)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
    >
      {/* Cover */}
      <div style={{
        width: "100%", aspectRatio: "1/1", background: "var(--surface2)",
        position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {imageUrl ? (
          <img src={imageUrl} alt={title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { e.target.style.display = "none"; }}
          />
        ) : (
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="11" stroke="var(--border3)" strokeWidth="1.5"/>
            <circle cx="14" cy="14" r="6" stroke="var(--ink3)" strokeWidth="1.3"/>
          </svg>
        )}
        {/* Highlight ring overlay */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,.55) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />
        {count && (
          <div style={{
            position: "absolute", top: 8, right: 8, fontSize: 9,
            fontFamily: "var(--mono)", padding: "3px 7px", borderRadius: 99,
            background: "rgba(0,0,0,.55)", color: "#fff",
          }}>{count} slides</div>
        )}
        <div style={{
          position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center",
          fontSize: 12, fontWeight: 600, color: "#fff",
          textShadow: "0 1px 4px rgba(0,0,0,.6)",
          padding: "0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{title}</div>
      </div>

      {/* Download */}
      <div style={{ padding: "10px 12px" }}>
        <button
          onClick={handleDownload}
          disabled={!downloadUrl}
          style={{
            width: "100%", height: 34, borderRadius: "var(--r)",
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
          Download cover
        </button>
      </div>
    </div>
  );
}

// ── Story card (9:16 portrait) ────────────────────────────────────────────────
function StoryCard({ story, index }) {
  const { isVideo, imageUrl, downloadUrl } = extractMedia(story);
  const ts   = story.takenAt || story.timestamp || story.taken_at || story.takenAtTimestamp;
  const date = ts
    ? new Date(typeof ts === "number" ? ts * 1000 : ts).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit",
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
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(blob);
      a.download = `story_${index + 1}.${isVideo ? "mp4" : "jpg"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { window.open(downloadUrl, "_blank"); }
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
      <div style={{
        width: "100%", aspectRatio: "9/16", background: "var(--surface2)",
        position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {imageUrl
          ? <img src={imageUrl} alt={`Story ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
          : <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="3" width="22" height="22" rx="5" stroke="var(--border3)" strokeWidth="1.5"/><circle cx="10" cy="11" r="2" stroke="var(--ink3)" strokeWidth="1.3"/><path d="M3 19l6-5 4 4 3-3 9 8" stroke="var(--ink3)" strokeWidth="1.3" strokeLinecap="round"/></svg>
        }
        <div style={{
          position: "absolute", top: 8, left: 8, fontSize: 9, fontFamily: "var(--mono)",
          fontWeight: 600, padding: "3px 8px", borderRadius: 99,
          background: "rgba(0,0,0,.6)", color: "#fff",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          {isVideo
            ? <><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 1.5l6 3-6 3V1.5z" fill="white"/></svg>VIDEO</>
            : <><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><rect x="1" y="1" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.2"/></svg>IMAGE</>
          }
        </div>
        <div style={{ position: "absolute", top: 8, right: 8, fontSize: 9, fontFamily: "var(--mono)", padding: "3px 7px", borderRadius: 99, background: "rgba(0,0,0,.5)", color: "#fff" }}>
          #{index + 1}
        </div>
      </div>

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        {date && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)" }}>{date}</div>}
        {mentions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {mentions.slice(0, 3).map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "2px 7px", borderRadius: 99, background: "var(--accent-pale)", color: "var(--accent-dark)", border: "1px solid var(--accent-border)" }}>@{h}</span>
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

// ── Results grid ──────────────────────────────────────────────────────────────
function ResultsGrid({ items, mode, onDownloadAll }) {
  const [filter, setFilter] = useState("all");

  const imgCount = items.filter(s => !extractMedia(s).isVideo).length;
  const vidCount = items.length - imgCount;

  const filtered = items.filter(s => {
    const { isVideo } = extractMedia(s);
    if (filter === "image") return !isVideo;
    if (filter === "video") return  isVideo;
    return true;
  });

  return (
    <div className="aup">
      {/* Summary + download all */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Total",  val: items.length, color: "var(--ink)"    },
            { label: "Images", val: imgCount,      color: "var(--accent)" },
            { label: "Videos", val: vidCount,      color: "var(--green)"  },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ padding: "6px 14px", borderRadius: 99, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14 }}>{val}</span>
              <span style={{ color: "var(--ink3)", fontWeight: 400 }}>{label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => onDownloadAll(filtered)}
          style={{ height: 38, padding: "0 16px", borderRadius: "var(--r)", border: "1px solid var(--green-border)", background: "var(--green-pale)", color: "var(--green)", fontSize: 13, fontWeight: 600, fontFamily: "var(--f)", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, transition: "opacity .12s" }}
          onMouseEnter={e => e.currentTarget.style.opacity = ".8"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Download all ({filtered.length})
        </button>
      </div>

      {/* Filter tabs */}
      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        {[
          { id: "all",   label: `All (${items.length})` },
          { id: "image", label: `Images (${imgCount})` },
          { id: "video", label: `Videos (${vidCount})` },
        ].map(t => (
          <button key={t.id} className={`tab${filter === t.id ? " on" : ""}`} onClick={() => setFilter(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${mode === "highlights" ? "160px" : "170px"}, 1fr))`, gap: 12 }}>
          {filtered.map((s, i) =>
            mode === "highlights"
              ? <HighlightCard key={s.id || i} item={s} index={i} />
              : <StoryCard     key={s.id || i} story={s} index={i} />
          )}
        </div>
      ) : (
        <div className="empty">No {filter} items in this batch.</div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StoriesScraper() {
  const [mode,       setMode]      = useState("stories");    // "stories" | "highlights"
  const [username,   setUsername]  = useState("");
  const [loading,    setLoading]   = useState(false);
  const [statusMsg,  setStatusMsg] = useState(null);
  const [statusType, setStatusType]= useState("info");
  const [stories,    setStories]   = useState([]);
  const [highlights, setHighlights]= useState([]);
  const [rawItems,   setRawItems]  = useState([]);

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function runScrape() {
    const user = username.trim().replace("@", "").toLowerCase();
    if (!user)      { setStatus("Enter an Instagram username.", "error"); return; }
    if (!APIFY_KEY) { setStatus("Missing VITE_APIFY_KEY.", "error"); return; }

    setLoading(true);
    setStories([]); setHighlights([]); setRawItems([]);

    const actors = mode === "highlights" ? HIGHLIGHT_ACTORS : STORY_ACTORS;
    const { items, raw } = await runActors(actors, user, setStatus);

    setRawItems(raw);
    if (items.length > 0) {
      if (mode === "highlights") setHighlights(items);
      else                       setStories(items);
      setStatus(`Done — ${items.length} ${mode === "highlights" ? "highlight" : "stor"}${items.length === 1 ? "y" : (mode === "highlights" ? "s" : "ies")} found for @${user}`, "success");
    } else if (raw.length) {
      setStatus(`Got ${raw.length} items but couldn't extract media URLs. Check console for raw data.`, "warn");
    } else {
      setStatus(`No ${mode} found. Account may be private or has no active ${mode}.`, "error");
    }
    setLoading(false);
  }

  async function downloadAll(list) {
    for (let i = 0; i < list.length; i++) {
      const { isVideo, downloadUrl } = extractMedia(list[i]);
      if (!downloadUrl) continue;
      try {
        const res  = await fetch(downloadUrl);
        const blob = await res.blob();
        const a    = document.createElement("a");
        a.href     = URL.createObjectURL(blob);
        a.download = `${mode === "highlights" ? "highlight" : "story"}_${i + 1}.${isVideo ? "mp4" : "jpg"}`;
        a.click();
        URL.revokeObjectURL(a.href);
        await sleep(350);
      } catch { window.open(downloadUrl, "_blank"); }
    }
  }

  const activeItems = mode === "highlights" ? highlights : stories;

  return (
    <div>
      {/* Header */}
      <div className="page-head">
        <h1 className="page-title">Stories <span>scraper</span></h1>
        <p className="page-desc">
          Pull active stories or highlight reels from any public Instagram profile. Download images and videos directly.
        </p>
      </div>

      {/* Mode switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          {
            id: "stories",
            label: "Current Stories",
            icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="10.5" cy="3.5" r="1" fill="currentColor"/></svg>,
            note: "Live · expires in 24h",
          },
          {
            id: "highlights",
            label: "Story Highlights",
            icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 1.5"/><circle cx="7" cy="7" r="2.5" fill="currentColor" opacity=".3"/><path d="M7 4.5v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
            note: "Permanent · saved reels",
          },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setStories([]); setHighlights([]); setStatusMsg(null); setRawItems([]); }}
            style={{
              flex: 1, padding: "14px 18px", borderRadius: "var(--rl)",
              border: `1.5px solid ${mode === m.id ? "var(--accent)" : "var(--border)"}`,
              background: mode === m.id ? "var(--accent-pale)" : "var(--surface)",
              cursor: "pointer", textAlign: "left",
              transition: "border-color .15s, background .15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, color: mode === m.id ? "var(--accent)" : "var(--ink2)" }}>
              {m.icon}
              <span style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</span>
            </div>
            <div style={{ fontSize: 11, color: mode === m.id ? "var(--accent-dark)" : "var(--ink3)", fontFamily: "var(--mono)" }}>{m.note}</div>
          </button>
        ))}
      </div>

      {/* Scrape card */}
      <div className="scrape-card">
        <div className="scrape-card-head">
          <div>
            <div className="scrape-card-title">{mode === "highlights" ? "Scrape highlights" : "Scrape stories"}</div>
            <div className="scrape-card-sub">
              {mode === "highlights"
                ? "Saved highlight circles from the profile · no expiry"
                : "Public profiles only · stories expire after 24 h"}
            </div>
          </div>
          {loading && <div className="live-badge"><div className="live-dot" />LIVE</div>}
        </div>

        <div className="form-username">
          <label className="field-label" style={{ display: "block", marginBottom: 6 }}>Username</label>
          <input
            className="inp"
            placeholder="e.g. chennaiipl or @natgeo"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && runScrape()}
          />
        </div>

        <div className="form-row">
          <button className="btn-primary" disabled={loading} onClick={runScrape} style={{ marginTop: "auto" }}>
            {loading
              ? <><div className="spin-w" />{mode === "highlights" ? "Fetching highlights…" : "Fetching stories…"}</>
              : <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5" stroke="white" strokeWidth="1.4"/>
                    <path d="M4.5 6.5l1.5 1.5 2.5-2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {mode === "highlights" ? "Fetch highlights" : "Fetch stories"}
                </>
            }
          </button>
          <button className="btn-ghost" disabled={loading}
            onClick={() => { setUsername(""); setStories([]); setHighlights([]); setRawItems([]); setStatusMsg(null); }}
            style={{ marginTop: "auto" }}>Reset</button>
        </div>

        {/* Contextual note */}
        <div style={{
          marginTop: 14, padding: "10px 13px", borderRadius: "var(--r)",
          background: "var(--amber-pale)", border: "1px solid var(--amber-border)",
          fontSize: 12, color: "var(--amber)", display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M6.5 4v3M6.5 9h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          {mode === "highlights"
            ? <span>Highlights are the saved circles on a profile. Only covers are returned — to get all slides inside a highlight you'd need the highlight's ID.</span>
            : <span>Current stories expire after 24 hours. Run the scraper while they're still live. Only <strong>public</strong> accounts are supported.</span>
          }
        </div>
      </div>

      {/* Status */}
      {statusMsg && <StatusBar msg={statusMsg} type={statusType} loading={loading} />}

      {/* Results */}
      {activeItems.length > 0 && (
        <ResultsGrid items={activeItems} mode={mode} onDownloadAll={downloadAll} />
      )}

      {/* Empty state */}
      {!activeItems.length && !statusMsg && (
        <div className="placeholder">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" opacity=".25">
            <rect x="3" y="3" width="38" height="38" rx="9" stroke="var(--ink)" strokeWidth="1.8"/>
            <circle cx="22" cy="22" r="8" stroke="var(--ink)" strokeWidth="1.8"/>
            <circle cx="33" cy="11" r="3" fill="var(--ink)"/>
          </svg>
          <div className="placeholder-title">
            {mode === "highlights" ? "No highlights yet" : "No stories yet"}
          </div>
          <div className="placeholder-sub">
            {mode === "highlights"
              ? "Enter a username and hit Fetch highlights"
              : "Enter a public Instagram username and hit Fetch stories"}
          </div>
        </div>
      )}
    </div>
  );
}
