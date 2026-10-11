// Vitest config (#145 Part D). The Playwright visual suite under e2e/
// uses *.spec.js files and Vitest's default pattern matches those too,
// so without this exclude the unit-test runner would try to import
// Playwright fixtures and fail. Keep e2e/ strictly Playwright-only.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Scene imports expand large shared catalogs; cap workers on shared CI hosts.
    maxWorkers: 2,
    exclude: ["node_modules/**", "dist/**", "e2e/**"],
  },
});
