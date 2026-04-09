import { useMemo } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const HOUR_LABELS = ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"];

const toN = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};
const pct = (v) => (!Number.isFinite(v) || v <= 0 ? "—" : `${v.toFixed(2)}%`);

function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
function heatColor(ratio) {
  const low = hexToRgb("#e8eef6"), high = hexToRgb("#4f46e5");
  const r = Math.round(lerp(low[0], high[0], ratio));
  const g = Math.round(lerp(low[1], high[1], ratio));
  const b = Math.round(lerp(low[2], high[2], ratio));
  return `rgb(${r},${g},${b})`;
}
function textColor(ratio) {
  return ratio > 0.55 ? "#fff" : "var(--ink2)";
}

export default function PostingHeatmap({ posts = [], followers = 0 }) {
  const { grid, dayStats, hourStats, bestDay, bestHour, totalPosts } = useMemo(() => {
    if (!posts.length) return { grid: {}, dayStats: [], hourStats: [], bestDay: null, bestHour: null, totalPosts: 0 };

    const cells = {}; // "day-bucketHour" -> { count, totalInteractions }

    posts.forEach(post => {
      const ts = post.timestamp || post.takenAtTimestamp;
      if (!ts) return;
      const d = new Date(ts);
      const day = d.getDay();
      const hour = d.getHours();
      const bucket = HOURS.reduce((prev, h) => (Math.abs(h - hour) < Math.abs(prev - hour) ? h : prev), HOURS[0]);
      const key = `${day}-${bucket}`;
      if (!cells[key]) cells[key] = { count: 0, totalInteractions: 0 };
      cells[key].count++;
      cells[key].totalInteractions += toN(post.likesCount) + toN(post.commentsCount);
    });

    // day stats
    const dayStats = DAYS.map((name, d) => {
      const dayPosts = posts.filter(p => {
        const ts = p.timestamp || p.takenAtTimestamp;
        return ts && new Date(ts).getDay() === d;
      });
      const n = dayPosts.length;
      const tI = dayPosts.reduce((s, p) => s + toN(p.likesCount) + toN(p.commentsCount), 0);
      return { name, count: n, avgInteractions: n ? tI / n : 0, er: n && followers > 0 ? (tI / n / followers) * 100 : 0 };
    });

    // hour stats (bucket of 3h)
    const hourStats = HOURS.map((h, idx) => {
      const postsInBucket = posts.filter(p => {
        const ts = p.timestamp || p.takenAtTimestamp;
        if (!ts) return false;
        const hr = new Date(ts).getHours();
        const bucket = HOURS.reduce((prev, bh) => (Math.abs(bh - hr) < Math.abs(prev - hr) ? bh : prev), HOURS[0]);
        return bucket === h;
      });
      const n = postsInBucket.length;
      const tI = postsInBucket.reduce((s, p) => s + toN(p.likesCount) + toN(p.commentsCount), 0);
      return { label: HOUR_LABELS[idx], count: n, avgInteractions: n ? tI / n : 0 };
    });

    const bestDay = [...dayStats].sort((a, b) => b.avgInteractions - a.avgInteractions)[0];
    const bestHour = [...hourStats].sort((a, b) => b.avgInteractions - a.avgInteractions)[0];

    const maxInteractions = Math.max(...Object.values(cells).map(c => c.totalInteractions / c.count || 0), 1);
    const grid = {};
    Object.entries(cells).forEach(([key, { count, totalInteractions }]) => {
      const avg = count ? totalInteractions / count : 0;
      grid[key] = { count, avg, ratio: avg / maxInteractions };
    });

    return { grid, dayStats, hourStats, bestDay, bestHour, totalPosts: posts.length };
  }, [posts, followers]);

  if (!posts.length) {
    return (
      <div style={{ padding: 60, textAlign: "center", fontSize: 14, color: "var(--ink3)", border: "1px dashed var(--border2)", borderRadius: 14, background: "var(--surface2)" }}>
        Scrape a profile first — the heatmap will appear here once posts are loaded.
      </div>
    );
  }

  const maxDayBar = Math.max(...dayStats.map(d => d.avgInteractions), 1);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em", marginBottom: 6 }}>Posting Heatmap</h2>
        <p style={{ fontSize: 14, color: "var(--ink2)", lineHeight: 1.7 }}>
          Based on {totalPosts} posts — when does this account get the most engagement?
        </p>
      </div>

      {/* Best time callouts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {bestDay && (
          <div className="mcard mcard-glow">
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 10 }}>Best day</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--v)", letterSpacing: "-.04em" }}>{bestDay.name}</div>
            <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 6 }}>{fmt(Math.round(bestDay.avgInteractions))} avg interactions · {bestDay.count} posts</div>
          </div>
        )}
        {bestHour && (
          <div className="mcard">
            <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: ".1em", color: "var(--ink3)", marginBottom: 10 }}>Best time slot</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em" }}>{bestHour.label}</div>
            <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 6 }}>{fmt(Math.round(bestHour.avgInteractions))} avg interactions · {bestHour.count} posts</div>
          </div>
        )}
      </div>

      {/* Heatmap grid */}
      <div className="card" style={{ padding: "22px 24px", marginBottom: 20, overflowX: "auto" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 16 }}>Avg interactions by day & time</div>

        {/* hour labels */}
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(8, 1fr)", gap: 6, marginBottom: 6 }}>
          <div />
          {HOUR_LABELS.map(h => (
            <div key={h} style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)", textAlign: "center" }}>{h}</div>
          ))}
        </div>

        {/* rows */}
        {DAYS.map((day, d) => (
          <div key={day} style={{ display: "grid", gridTemplateColumns: "56px repeat(8, 1fr)", gap: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink2)", display: "flex", alignItems: "center" }}>{day}</div>
            {HOURS.map(h => {
              const cell = grid[`${d}-${h}`];
              const ratio = cell?.ratio || 0;
              const bg = ratio > 0 ? heatColor(ratio) : "var(--surface2)";
              const ink = ratio > 0 ? textColor(ratio) : "var(--ink3)";
              return (
                <div
                  key={h}
                  title={cell ? `${cell.count} post${cell.count !== 1 ? "s" : ""} · avg ${fmt(Math.round(cell.avg))} interactions` : "No posts"}
                  style={{ height: 34, borderRadius: 7, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 600, color: ink, transition: "all .2s", cursor: cell ? "default" : "default" }}
                >
                  {cell ? fmt(Math.round(cell.avg)) : ""}
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "var(--mono)" }}>Low</span>
          <div style={{ display: "flex", gap: 3 }}>
            {[0, .15, .3, .5, .7, .85, 1].map((r, i) => (
              <div key={i} style={{ width: 20, height: 10, borderRadius: 3, background: r === 0 ? "var(--surface2)" : heatColor(r) }} />
            ))}
          </div>
          <span style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "var(--mono)" }}>High</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink3)" }}>Values = avg interactions</span>
        </div>
      </div>

      {/* Day breakdown bar chart */}
      <div className="card" style={{ padding: "22px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 16 }}>Day-by-day breakdown</div>
        {dayStats.map((d, i) => (
          <div key={d.name} style={{ display: "grid", gridTemplateColumns: "44px 1fr 80px 80px", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink2)" }}>{d.name}</div>
            <div style={{ height: 8, borderRadius: 99, background: "var(--surface3)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${maxDayBar > 0 ? Math.max(2, (d.avgInteractions / maxDayBar) * 100) : 0}%`, background: "var(--v)", borderRadius: 99, transition: "width .4s" }} />
            </div>
            <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--ink)", fontWeight: 600, textAlign: "right" }}>{fmt(Math.round(d.avgInteractions))}</div>
            <div style={{ fontSize: 11, color: "var(--ink3)", textAlign: "right" }}>{d.count} posts</div>
          </div>
        ))}
      </div>
    </div>
  );
}
