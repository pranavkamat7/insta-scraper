import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  console.log("🔑 ANTHROPIC_API_KEY loaded:", env.ANTHROPIC_API_KEY ? "YES ✓" : "MISSING ✗");

  const isDev = mode === "development";

  return {
    plugins: [react()],
    // Expose ANTHROPIC_API_KEY to the client ONLY in production
    // (in dev, the proxy handles it securely)
    define: isDev ? {} : {
      "import.meta.env.ANTHROPIC_API_KEY": JSON.stringify(env.ANTHROPIC_API_KEY),
    },
    server: {
      proxy: {
        "/api/claude": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          secure: true,
          rewrite: () => "/v1/messages",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.removeHeader("anthropic-dangerous-direct-browser-access");
              proxyReq.removeHeader("origin");
              proxyReq.removeHeader("referer");
              proxyReq.setHeader("x-api-key", env.ANTHROPIC_API_KEY);
              proxyReq.setHeader("anthropic-version", "2023-06-01");
              proxyReq.setHeader("content-type", "application/json");
            });
            proxy.on("proxyRes", (proxyRes) => {
              proxyRes.headers["access-control-allow-origin"] = "*";
            });
            proxy.on("error", (err) => {
              console.error("Proxy error:", err.message);
            });
          },
        },
      },
    },
  };
});
