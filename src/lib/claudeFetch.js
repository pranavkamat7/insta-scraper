// src/lib/claudeFetch.js
// In dev: uses Vite proxy (/api/claude) — key stays server-side
// In prod (Render): calls Anthropic directly with the key from env

const isDev = import.meta.env.DEV;

export async function claudeFetch(body) {
  if (isDev) {
    // Dev: go through Vite proxy, key injected server-side
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  } else {
    // Prod: call Anthropic directly with key from Render env vars
    const key = import.meta.env.ANTHROPIC_API_KEY;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    return res;
  }
}
