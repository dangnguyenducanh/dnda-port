import { defineConfig } from "vite";

// dev: `npm run dev` on :18450, API (uvicorn api.index:app) on :18451
export default defineConfig({
  server: { port: 18450, proxy: { "/api": "http://127.0.0.1:18451" } },
});
