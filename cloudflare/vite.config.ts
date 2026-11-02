import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, SITE_FAVICON } from "./shared/site.ts";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "web",
  publicDir: "static",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./web", import.meta.url)) },
  },
  plugins: [
    tailwindcss(),
    react(),
    {
      name: "site-meta",
      transformIndexHtml: (html: string) =>
        html
          .replace("%SITE_TITLE%", escapeHtml(`${SITE_NAME} · ${SITE_TAGLINE}`))
          .replace("%SITE_DESCRIPTION%", escapeHtml(SITE_DESCRIPTION))
          .replace("%SITE_FAVICON%", escapeHtml(SITE_FAVICON)),
    },
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, request) => {
            // Only translate this dev server's own origin; foreign origins
            // still reach the Worker unchanged and fail its CSRF check.
            if (request.headers.origin === "http://127.0.0.1:5173") {
              proxyReq.setHeader("Origin", "http://127.0.0.1:8787");
            }
          });
        },
      },
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
    cssMinify: true,
    // Hashed names let /assets/* be cached forever; index.html (rendered by
    // the Worker) always points at the current build.
    rollupOptions: {
      output: {
        entryFileNames: "assets/app-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
