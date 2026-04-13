// Playwright config for the visual regression suite introduced in #145.
// Kept intentionally minimal: one chromium project, no parallelism, no
// CI wiring. The harness runs locally via `make test-visual` which
// expects the server + client to already be up (KITHLANDS_DEBUG=1) on
// the worktree-isolated ports.

import { defineConfig, devices } from "@playwright/test";

const VITE_PORT = parseInt(process.env.VITE_PORT || "3000", 10);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.js",
  timeout: 30_000,
  expect: {
    // First run of every test captures the baseline; subsequent runs
    // fail on any pixel delta above this ratio.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${VITE_PORT}`,
    viewport: { width: 800, height: 600 },
    // Deterministic animations: disable scroll / tween smoothing where
    // we can. Phaser canvas work is still frame-dependent; visual.spec.js
    // inserts explicit waits where the scenes need them.
    reducedMotion: "reduce",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
