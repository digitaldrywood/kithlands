import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { startNormalRoute } from "./helpers/normal-route.js";

test("HTML proof stays outside the app HMR watcher", async ({ page }) => {
  const proof = path.resolve(`tmp/dev-artifact-isolation-${Date.now()}`);
  mkdirSync(proof, { recursive: true });
  const snapshot = path.join(proof, "trace-snapshot.html");
  writeFileSync(snapshot, "<!doctype html><title>Initial proof</title>");
  await startNormalRoute(page);
  const before = await page.evaluate(
    () => window.__kithlandsTest.gameState().id,
  );
  await page.evaluate(async () => {
    const { createHotContext } = await import("/@vite/client");
    window.__proofReloadSignals = [];
    createHotContext("/proof-watcher-observer").on(
      "vite:beforeFullReload",
      (event) => {
        window.__proofReloadSignals.push(event.path);
      },
    );
  });
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  writeFileSync(
    snapshot,
    "<!doctype html><title>Updated proof artifact</title>",
  );
  // Observe the watcher/debounce window: no artifact reload signal or navigation.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__proofReloadSignals)).toEqual([]);
  expect(navigations).toBe(0);
  expect(
    await page.evaluate(() => window.__kithlandsTest.activeSceneKey()),
  ).toBe("World");
  expect(await page.evaluate(() => window.__kithlandsTest.gameState().id)).toBe(
    before,
  );
  await page.screenshot({ path: path.join(proof, "game-retained.png") });
});
