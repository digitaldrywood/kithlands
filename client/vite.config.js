import { defineConfig } from "vite";

const vitePort = parseInt(process.env.VITE_PORT || "3000", 10);
const apiPort = parseInt(
  process.env.API_PORT || process.env.PORT || "8080",
  10,
);

export default defineConfig({
  server: {
    port: vitePort,
    host: "0.0.0.0",
    allowedHosts: ["prometheus"],
    // Playwright traces contain HTML snapshots. They are evidence, not app
    // source; exclude them from HMR notifications while tests and play coexist.
    watch: {
      ignored: ["**/tmp/**", "**/test-results/**", "**/playwright-report/**"],
    },
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
