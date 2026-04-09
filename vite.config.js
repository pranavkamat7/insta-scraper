import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  console.log("🔑 ANTHROPIC_API_KEY loaded:", env.ANTHROPIC_API_KEY ? "YES ✓" : "MISSING ✗");

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/claude": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          secure: true,
          rewrite: () => "/v1/messages",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              // Remove ALL browser-set headers that Anthropic rejects
              proxyReq.removeHeader("anthropic-dangerous-direct-browser-access");
              proxyReq.removeHeader("origin");
              proxyReq.removeHeader("referer");

              // Set the correct auth headers
              proxyReq.setHeader("x-api-key", env.ANTHROPIC_API_KEY);
              proxyReq.setHeader("anthropic-version", "2023-06-01");
              proxyReq.setHeader("content-type", "application/json");
            });
            proxy.on("proxyRes", (proxyRes) => {
              // Allow the browser to read the response
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
