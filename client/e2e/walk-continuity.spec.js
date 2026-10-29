import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const proof = new URL(`../tmp/walk-continuity-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const speed of [2, 3]) {
  test(`held walking cadence at speed ${speed}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(
      (speed) =>
        localStorage.setItem(
          "kithlands_prefs",
          JSON.stringify({ walkSpeed: speed }),
        ),
      speed,
    );
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.__motionGame = game;`,
      });
    });
    const arrivals = [];
    page.on("requestfinished", (request) => {
      if (request.method() === "POST")
        arrivals.push({ url: request.url(), timing: request.timing() });
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    const anchor = await page.evaluate(() =>
      window.__kithlandsTest.findStraightAuditAnchor("right", 12, "World"),
    );
    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.setPlayerTile(x, y, "World"),
      anchor,
    );
    await page.evaluate(() => {
      const scene = window.__motionGame.scene.getScene("World");
      window.__motionTrace = [];
      scene.events.on("postupdate", () =>
        window.__motionTrace.push({
          t: performance.now(),
          x: scene.player.x,
          frame: scene.player.frame.name,
          moving: scene.animating,
        }),
      );
    });
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(1400);
    await page.keyboard.up("ArrowRight");
    const samples = await page.evaluate(() => window.__motionTrace);
    const requests = [];
    let plateauStart = null;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].x === samples[i - 1].x) plateauStart ??= samples[i - 1].t;
      else if (plateauStart != null) {
        requests.push(samples[i].t - plateauStart);
        plateauStart = null;
      }
    }
    const summary = {
      speed,
      frames: samples.length,
      moved: samples.at(-1).x - samples[0].x,
      pauses: requests,
    };
    writeFileSync(
      new URL(`speed-${speed}.json`, proof),
      JSON.stringify({ summary, samples, arrivals }, null, 2),
    );
    console.log("Motion", JSON.stringify(summary));
    expect(summary.moved).toBeGreaterThan(speed === 2 ? 240 : 320);
    expect(Math.max(0, ...summary.pauses)).toBeLessThan(100);
    await page.screenshot({
      path: new URL(`speed-${speed}.png`, proof).pathname,
    });
  });
}
