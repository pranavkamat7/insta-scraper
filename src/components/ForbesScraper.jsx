import { useState } from "react";
import * as XLSX from "xlsx";

const APIFY_KEY = import.meta.env.VITE_APIFY_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Scrape type definitions ───────────────────────────────────────────────────
const SCRAPE_TYPES = [
  {
    id: "articles",
    label: "Articles & News",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M5 6h8M5 9h8M5 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    desc: "Latest articles, headlines, authors, publication dates, and article URLs from Forbes.com",
    fields: ["Title", "Author", "Date", "Category", "URL", "Description"],
    actor: "natasha.lekh/forbes-scraper",
    inputBuilder: (cfg) => ({
      startUrls: [{ url: cfg.url || "https://www.forbes.com/news/" }],
      maxItems: parseInt(cfg.limit, 10),
    }),
  },
  {
    id: "billionaires",
    label: "Billionaires List",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M9 5v8M7 6.5h3a1.5 1.5 0 010 3H7M7 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    desc: "Forbes real-time billionaires: rank, name, net worth, country, industry, and wealth source",
    fields: ["Rank", "Name", "Net Worth ($B)", "Country", "Industry", "Source of Wealth", "Age", "Profile URL"],
    actor: "apify/web-scraper",
    inputBuilder: (cfg) => ({
      startUrls: [{ url: "https://www.forbes.com/real-time-billionaires/" }],
      pageFunction: `async function pageFunction(context) {
        const { $, request } = context;
        const rows = [];
        $('tr.listuser-row, .person-info').each((i, el) => {
          rows.push({
            rank: $(el).find('.rank').text().trim() || (i+1),
            name: $(el).find('.personName, .name').text().trim(),
            netWorth: $(el).find('.Net-Worth, .networth').text().trim(),
            country: $(el).find('.countryOfCitizenship, .country').text().trim(),
            industry: $(el).find('.industry').text().trim(),
            source: $(el).find('.source').text().trim(),
          });
        });
        return rows;
      }`,
      maxRequestsPerCrawl: 5,
    }),
  },
  {
    id: "forbes400",
    label: "Forbes 400 (Richest Americans)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 14l4-5 3 3 3-4 3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="14" cy="4" r="2" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
    desc: "Forbes 400 wealthiest Americans: rank, name, net worth, age, state, source, and biography excerpt",
    fields: ["Rank", "Name", "Net Worth ($B)", "Age", "State", "Source of Wealth", "Industry", "Profile URL"],
    actor: "apify/web-scraper",
    inputBuilder: (cfg) => ({
      startUrls: [{ url: "https://www.forbes.com/forbes-400/" }],
      maxRequestsPerCrawl: 10,
    }),
  },
  {
    id: "companies",
    label: "Forbes Global 2000",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="8" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="7" y="5" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="12" y="2" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
    desc: "Global 2000 companies: rank, company name, country, sales, profits, assets, and market value",
    fields: ["Rank", "Company", "Country", "Sales ($B)", "Profits ($B)", "Assets ($B)", "Market Value ($B)", "Industry"],
    actor: "apify/web-scraper",
    inputBuilder: (cfg) => ({
      startUrls: [{ url: "https://www.forbes.com/lists/global2000/" }],
      maxRequestsPerCrawl: 20,
    }),
  },
  {
    id: "30under30",
    label: "30 Under 30",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M3 15c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M13 3l1 1-1 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    desc: "Forbes 30 Under 30 honorees: name, age, category, company, description, and year featured",
    fields: ["Name", "Age", "Category", "Company", "Description", "Year", "Profile URL"],
    actor: "apify/web-scraper",
    inputBuilder: (cfg) => ({
      startUrls: [{ url: `https://www.forbes.com/30-under-30/${cfg.year || "2024"}/` }],
      maxRequestsPerCrawl: 15,
    }),
  },
  {
    id: "mostpowerful",
    label: "Most Powerful Women",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M9 9v7M7 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M5 4a4 4 0 014-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1 1.5"/>
      </svg>
    ),
    desc: "World's 100 most powerful women: rank, name, net worth, company, title, country, and category",
    fields: ["Rank", "Name", "Net Worth", "Title", "Company", "Country", "Category", "Profile URL"],
    actor: "apify/web-scraper",
    inputBuilder: (cfg) => ({
      startUrls: [{ url: "https://www.forbes.com/lists/power-women/" }],
      maxRequestsPerCrawl: 10,
    }),
  },
  {
    id: "innovators",
    label: "Most Innovative Companies",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2a5 5 0 014 8l-1 2H6l-1-2a5 5 0 014-8z" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M7 15h4M8 13h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
    desc: "Forbes most innovative companies: rank, company, innovation premium, CEO, sector, country",
    fields: ["Rank", "Company", "Innovation Premium", "CEO", "Sector", "Country", "Market Cap ($B)"],
    actor: "apify/web-scraper",
    inputBuilder: (cfg) => ({
      startUrls: [{ url: "https://www.forbes.com/innovative-companies/" }],
      maxRequestsPerCrawl: 10,
    }),
  },
  {
    id: "custom",
    label: "Custom Forbes URL",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 9h12M9 3l6 6-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    desc: "Scrape any Forbes.com page — articles, lists, profiles. Paste any Forbes URL and extract all text content.",
    fields: ["Title", "Text Content", "Author", "Date", "URL", "Meta Description"],
    actor: "natasha.lekh/forbes-scraper",
    inputBuilder: (cfg) => ({
      startUrls: [{ url: cfg.url }],
      maxItems: parseInt(cfg.limit, 10),
    }),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

// ── Mock data generators (for demo when actor is under maintenance) ───────────
function getMockData(typeId, limit = 20) {
  const n = Math.min(parseInt(limit, 10) || 20, 50);
  if (typeId === "billionaires") {
    const names = ["Elon Musk","Jeff Bezos","Bernard Arnault","Bill Gates","Larry Ellison","Warren Buffett","Larry Page","Sergey Brin","Mark Zuckerberg","Steve Ballmer","Carlos Slim","Mukesh Ambani","Rob Walton","Jim Walton","Alice Walton","Michael Dell","Jensen Huang","Phil Knight","Jack Ma","Zhong Shanshan"];
    return Array.from({length: Math.min(n, names.length)}, (_, i) => ({
      Rank: i+1, Name: names[i], "Net Worth ($B)": (280 - i*12).toFixed(1),
      Country: ["USA","USA","France","USA","USA","USA","USA","USA","USA","USA","Mexico","India","USA","USA","USA","USA","USA","USA","China","China"][i],
      Industry: ["Tech","Tech","Luxury","Tech","Tech","Finance","Tech","Tech","Tech","Tech","Telecom","Energy","Retail","Retail","Retail","Tech","Tech","Fashion","E-commerce","Beverages"][i],
      "Source of Wealth": ["Tesla/SpaceX","Amazon","LVMH","Microsoft","Oracle","Berkshire Hathaway","Google","Google","Meta","Microsoft","América Móvil","Reliance Industries","Walmart","Walmart","Walmart","Dell","Nvidia","Nike","Alibaba","Nongfu Spring"][i],
      Age: [52,60,75,68,79,93,51,50,40,67,84,66,80,76,74,59,61,86,59,69][i],
      "Profile URL": `https://forbes.com/profile/${names[i].toLowerCase().replace(/\s/g,"-")}/`,
    }));
  }
  if (typeId === "30under30") {
    const cats = ["Finance","Healthcare","Technology","Media","Energy","Education","Sports","Science","Art & Style","Social Entrepreneurs"];
    return Array.from({length: n}, (_, i) => ({
      Name: `Honoree ${i+1}`, Age: 22 + (i%8),
      Category: cats[i % cats.length],
      Company: `Company ${i+1}`, Description: "Innovator recognized for breakthrough contributions in their field.",
      Year: 2024, "Profile URL": `https://forbes.com/30-under-30/`,
    }));
  }
  if (typeId === "companies") {
    const cos = ["ICBC","JPMorgan Chase","Saudi Aramco","Berkshire Hathaway","Apple","Bank of America","Microsoft","China Construction Bank","Agricultural Bank of China","Amazon"];
    return Array.from({length: Math.min(n, cos.length)}, (_, i) => ({
      Rank: i+1, Company: cos[i],
      Country: ["China","USA","Saudi Arabia","USA","USA","USA","USA","China","China","USA"][i],
      "Sales ($B)": (250 - i*20).toFixed(1), "Profits ($B)": (50 - i*4).toFixed(1),
      "Assets ($B)": (5500 - i*300).toFixed(1), "Market Value ($B)": (2900 - i*200).toFixed(1),
      Industry: ["Banking","Banking","Oil & Gas","Finance","Technology","Banking","Technology","Banking","Banking","E-commerce"][i],
    }));
  }
  if (typeId === "articles") {
    return Array.from({length: n}, (_, i) => ({
      Title: `Forbes Article #${i+1}: Insights on Business & Innovation`,
      Author: `Author ${i+1}`, Date: new Date(Date.now() - i * 86400000).toLocaleDateString("en-GB"),
      Category: ["Business","Technology","Finance","Leadership","Lifestyle"][i % 5],
      URL: `https://forbes.com/article-${i+1}`,
      Description: "A comprehensive look at the latest trends shaping industries worldwide.",
    }));
  }
  return Array.from({length: n}, (_, i) => ({
    Rank: i+1, Name: `Entry ${i+1}`, Value: `$${(100-i*2).toFixed(1)}B`,
    Country: "USA", Industry: "Technology", URL: "https://forbes.com",
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ForbesScraper() {
  const [selected, setSelected]   = useState(null);
  const [limit, setLimit]         = useState("20");
  const [customUrl, setCustomUrl] = useState("");
  const [year, setYear]           = useState("2024");
  const [loading, setLoading]     = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [statusType, setStatusType] = useState("info");
  const [results, setResults]     = useState(null);
  const [usedMock, setUsedMock]   = useState(false);

  const setStatus = (msg, type = "info") => { setStatusMsg(msg); setStatusType(type); };

  async function runScrape() {
    if (!selected) { setStatus("Select a scrape type first.", "error"); return; }
    if (selected.id === "custom" && !customUrl.trim()) { setStatus("Enter a Forbes URL.", "error"); return; }

    setLoading(true); setResults(null); setUsedMock(false);

    // If no Apify key or actor under maintenance, use demo data
    if (!APIFY_KEY) {
      setStatus("No API key found — loading demo data…", "info");
      await sleep(1800);
      const mock = getMockData(selected.id, limit);
      setResults(mock);
      setUsedMock(true);
      setStatus(`Demo: ${mock.length} rows loaded (add VITE_APIFY_KEY for live data)`, "success");
      setLoading(false);
      return;
    }

    try {
      setStatus("Starting Apify run…", "info");
      const cfg = { url: selected.id === "custom" ? customUrl.trim() : `https://www.forbes.com/`, limit, year };
      const input = selected.inputBuilder(cfg);

      const runRes = await fetch(
        `https://api.apify.com/v2/acts/${selected.actor}/runs?token=${APIFY_KEY}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
      );

      if (!runRes.ok) {
        // Fallback to mock on actor error
        const mock = getMockData(selected.id, limit);
        setResults(mock); setUsedMock(true);
        setStatus(`Actor unavailable — showing demo data (${mock.length} rows)`, "success");
        setLoading(false); return;
      }

      const rd = await runRes.json();
      const runId = rd?.data?.id, dsId = rd?.data?.defaultDatasetId;
      if (!runId || !dsId) throw new Error("Invalid Apify response.");

      let elapsed = 0, done = false;
      while (elapsed < 300 && !done) {
        await sleep(5000); elapsed += 5;
        setStatus(`Scraping Forbes… ${elapsed}s elapsed`, "info");
        const st = (await (await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`)).json())?.data?.status;
        if (st === "SUCCEEDED") done = true;
        else if (["FAILED","ABORTED","TIMED-OUT"].includes(st)) throw new Error(`Run ${st.toLowerCase()}`);
      }
      if (!done) throw new Error("Timed out.");

      const items = await (await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${APIFY_KEY}&limit=500`)).json();
      if (!Array.isArray(items) || !items.length) throw new Error("No data returned.");
      setResults(items);
      setStatus(`Done — ${items.length} rows scraped`, "success");
    } catch (e) {
      const mock = getMockData(selected.id, limit);
      setResults(mock); setUsedMock(true);
      setStatus(`Error: ${e.message} — showing demo data`, "success");
    } finally {
      setLoading(false);
    }
  }

  function exportExcel() {
    if (!results?.length) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const colWidths = Object.keys(results[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 16) }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selected?.label?.slice(0,31) || "Forbes Data");
    XLSX.writeFile(wb, `forbes_${selected?.id || "data"}_${Date.now()}.xlsx`);
  }

  function exportJSON() {
    if (!results?.length) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `forbes_${selected?.id || "data"}_${Date.now()}.json`;
    a.click();
  }

  const stStyle = {
    info:    { bg: "var(--accent-pale)", ink: "var(--accent-dark)", border: "var(--accent-border)" },
    success: { bg: "var(--green-pale)",  ink: "var(--green)",       border: "var(--green-border)"  },
    error:   { bg: "var(--red-pale)",    ink: "var(--red)",         border: "var(--red-border)"    },
  }[statusType] || {};

  return (
    <div>
      {/* Page header */}
      <div className="page-head">
        <h1 className="page-title">Forbes <span>Data Scraper</span></h1>
        <p className="page-desc">
          Extract Forbes lists, articles, billionaires, Global 2000, 30 Under 30, and more.
          Download as Excel or JSON instantly.
        </p>
      </div>

      {/* Type selector grid */}
      <div className="scrape-card">
        <div className="scrape-card-head">
          <div>
            <div className="scrape-card-title">Choose what to scrape</div>
            <div className="scrape-card-sub">8 Forbes data types available</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
          {SCRAPE_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => { setSelected(type); setResults(null); setStatusMsg(null); }}
              style={{
                background: selected?.id === type.id ? "var(--accent-pale)" : "var(--surface2)",
                border: `1px solid ${selected?.id === type.id ? "var(--accent-border)" : "var(--border)"}`,
                borderRadius: "var(--r)", padding: "14px 16px", cursor: "pointer",
                textAlign: "left", transition: "all .14s", display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: selected?.id === type.id ? "var(--accent)" : "var(--ink2)" }}>
                  {type.icon}
                </span>
                {selected?.id === type.id && (
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "block" }} />
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: selected?.id === type.id ? "var(--accent-dark)" : "var(--ink)", letterSpacing: "-.01em" }}>
                {type.label}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink3)", lineHeight: 1.55 }}>
                {type.desc.length > 80 ? type.desc.slice(0, 78) + "…" : type.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Config panel */}
      {selected && (
        <div className="scrape-card aup">
          <div className="scrape-card-head">
            <div>
              <div className="scrape-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--accent)" }}>{selected.icon}</span>
                {selected.label}
              </div>
              <div className="scrape-card-sub">{selected.desc}</div>
            </div>
            {loading && <div className="live-badge"><div className="live-dot" />LIVE</div>}
          </div>

          {/* Fields preview */}
          <div style={{ marginBottom: 16 }}>
            <div className="field-label" style={{ marginBottom: 6 }}>Fields extracted</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {selected.fields.map(f => (
                <span key={f} style={{
                  fontSize: 11, fontFamily: "var(--mono)", padding: "3px 9px",
                  borderRadius: 99, background: "var(--green-pale)",
                  border: "1px solid var(--green-border)", color: "var(--green)",
                }}>{f}</span>
              ))}
            </div>
          </div>

          {/* Options row */}
          <div className="form-row">
            {selected.id === "custom" && (
              <div className="form-field" style={{ flex: 1 }}>
                <label className="field-label">Forbes URL</label>
                <input
                  className="inp"
                  placeholder="https://www.forbes.com/..."
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                />
              </div>
            )}

            {selected.id === "30under30" && (
              <div className="form-field">
                <label className="field-label">Year</label>
                <div className="sel-wrap">
                  <select value={year} onChange={e => setYear(e.target.value)}>
                    {["2024","2023","2022","2021","2020"].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}

            {["articles","custom"].includes(selected.id) && (
              <div className="form-field">
                <label className="field-label">Max items</label>
                <div className="sel-wrap">
                  <select value={limit} onChange={e => setLimit(e.target.value)}>
                    {[["10","10"],["20","20"],["50","50"],["100","100"]].map(([v,l]) => (
                      <option key={v} value={v}>{l} items</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              className="btn-primary"
              disabled={loading}
              onClick={runScrape}
              style={{ marginTop: "auto" }}
            >
              {loading
                ? <><div className="spin-w" />Scraping…</>
                : <>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1v6M4 3.5L6.5 1 9 3.5M1.5 10h10M1.5 12h10" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                    Start scrape
                  </>
              }
            </button>

            {results && (
              <button className="btn-ghost" style={{ marginTop: "auto" }} onClick={() => { setResults(null); setStatusMsg(null); }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Status bar */}
      {statusMsg && (
        <div className="status-bar aup" style={{ background: stStyle.bg, color: stStyle.ink, borderColor: stStyle.border }}>
          {loading && <div className="spin-a" style={{ borderTopColor: stStyle.ink }} />}
          {statusType === "success" && (
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {statusMsg}
          {usedMock && (
            <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "var(--mono)", opacity: .7 }}>
              DEMO DATA
            </span>
          )}
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div className="aup">
          {/* Summary row */}
          <div className="metrics-row" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="mcard hi">
              <div className="mcard-lbl">Rows scraped</div>
              <div className="mcard-val">{fmt(results.length)}</div>
              <div className="mcard-sub">{selected?.label}</div>
            </div>
            <div className="mcard hi">
              <div className="mcard-lbl">Columns</div>
              <div className="mcard-val">{Object.keys(results[0] || {}).length}</div>
              <div className="mcard-sub">Fields per row</div>
            </div>
            <div className="mcard">
              <div className="mcard-lbl">Data source</div>
              <div className="mcard-val" style={{ fontSize: 14 }}>Forbes.com</div>
              <div className="mcard-sub">{usedMock ? "Demo data" : "Live scrape"}</div>
            </div>
          </div>

          {/* Preview table */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--rl)",
            overflow: "hidden", marginBottom: 18,
          }}>
            <div style={{
              padding: "14px 20px", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                Preview — first {Math.min(results.length, 5)} rows
              </div>
              <span style={{
                fontSize: 9, fontFamily: "var(--mono)", padding: "2px 7px", borderRadius: 99,
                background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--ink3)",
              }}>
                {results.length} total
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface2)" }}>
                    {Object.keys(results[0] || {}).slice(0, 6).map(col => (
                      <th key={col} style={{
                        padding: "9px 16px", textAlign: "left", fontFamily: "var(--mono)",
                        fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em",
                        color: "var(--ink3)", fontWeight: 600, borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap",
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 5).map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      {Object.values(row).slice(0, 6).map((val, j) => (
                        <td key={j} style={{
                          padding: "10px 16px", color: "var(--ink2)", maxWidth: 180,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {String(val ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Export */}
          <div className="export-grid">
            <div className="ecard">
              <div className="ecard-icon" style={{ background: "var(--green-pale)", border: "1px solid var(--green-border)" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="var(--green)" strokeWidth="1.4"/>
                  <path d="M5.5 8.5l2 2 3-3" stroke="var(--green)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="ecard-title">Excel Workbook (.xlsx)</div>
              <div className="ecard-desc">
                All {results.length} rows with {Object.keys(results[0]||{}).length} columns, formatted for client reports.
              </div>
              <button className="btn-exp" onClick={exportExcel}
                style={{ background: "var(--green-pale)", color: "var(--green)", borderColor: "var(--green-border)" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Download .xlsx
              </button>
            </div>
            <div className="ecard">
              <div className="ecard-icon" style={{
                background: "var(--accent-pale)", border: "1px solid var(--accent-border)",
                fontSize: 13, fontFamily: "var(--mono)", color: "var(--accent-dark)", fontWeight: 700,
              }}>
                {"{}"}
              </div>
              <div className="ecard-title">JSON Data</div>
              <div className="ecard-desc">
                Raw array with all fields. Ready for data pipelines, APIs, and further processing.
              </div>
              <button className="btn-exp" onClick={exportJSON}
                style={{ background: "var(--accent-pale)", color: "var(--accent-dark)", borderColor: "var(--accent-border)" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Download .json
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!selected && !loading && (
        <div className="placeholder">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ opacity: .25, margin: "0 auto" }}>
            <rect x="4" y="4" width="32" height="32" rx="8" stroke="var(--ink)" strokeWidth="2"/>
            <path d="M12 20h16M12 14h16M12 26h10" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <div className="placeholder-title">Select a Forbes data type above</div>
          <div className="placeholder-sub">8 types available — billionaires, Global 2000, articles, 30 Under 30, and more</div>
        </div>
      )}
    </div>
  );
}
