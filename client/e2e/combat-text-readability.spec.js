import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { openShowcase } from "./battle-vfx-proof-helpers.js";
const proof = new URL(`../tmp/combat-text-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const [width, height, reducedMotion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [800, 600, "reduce"],
]) {
  test(`critical text stays readable and battle messages hold at Fast ${width}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(() =>
      localStorage.setItem(
        "kithlands_prefs",
        JSON.stringify({ battleSpeed: 1, messageSpeed: 6 }),
      ),
    );
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()) + "\nwindow.__textGame=game;",
      });
    });
    await openShowcase(page, { width, height, reducedMotion });
    // Presentation fixtures supply known crit/miss/heal values; no server HP changes.
    await page.evaluate(async () => {
      const scene = window.__textGame.scene.getScene("Battle");
      const { floatingTextAnchorForEntry } =
        await import("/src/scenes/battle_layout.js");
      const target = Object.values(scene.enemySprites)[0];
      const point = floatingTextAnchorForEntry(target, target);
      window.__critPoint = point;
      scene.floatingText.spawn(
        point.x,
        point.y,
        142,
        "crit",
        "readability-critical",
      );
      window.__critStart = performance.now();
    });
    await page.waitForTimeout(1100);
    const held = await page.evaluate(() => {
      const t = window.__textGame.scene
        .getScene("Battle")
        .floatingText.active.find(
          (t) => t._targetKey === "readability-critical",
        );
      return {
        text: t.text,
        alpha: t.alpha,
        size: t.style.fontSize,
        y: t.y,
        point: window.__critPoint,
      };
    });
    expect(held.text).toBe("CRITICAL\n-142!");
    expect(held.alpha).toBeGreaterThan(0.99);
    expect(parseInt(held.size)).toBeGreaterThanOrEqual(32);
    await page.screenshot({
      path: new URL(`${width}-critical-held.png`, proof).pathname,
    });
    await page.waitForFunction(
      () =>
        !window.__textGame.scene
          .getScene("Battle")
          .floatingText.active.some(
            (t) => t._targetKey === "readability-critical",
          ),
    );
    await page.evaluate(async () => {
      const scene = window.__textGame.scene.getScene("Battle");
      const { floatingTextAnchorForEntry } =
        await import("/src/scenes/battle_layout.js");
      const enemy = Object.values(scene.enemySprites)[0],
        ally = Object.values(scene.partySprites)[0];
      const e = floatingTextAnchorForEntry(enemy, enemy),
        a = floatingTextAnchorForEntry(ally, ally);
      scene.floatingText.spawn(e.x, e.y, 33, "magical", "enemy-damage", {
        element: "fire",
      });
      scene.floatingText.spawn(a.x, a.y, 28, "heal", "ally-heal");
      const other = Object.values(scene.enemySprites)[1];
      const m = floatingTextAnchorForEntry(other, other);
      scene.floatingText.spawn(m.x, m.y, 0, "miss", "enemy-miss");
    });
    await page.waitForTimeout(950);
    await page.screenshot({
      path: new URL(`${width}-damage-heal-miss-held.png`, proof).pathname,
    });
    await page.evaluate(() => {
      const scene = window.__textGame.scene.getScene("Battle");
      window.__readTrace = [];
      const reveal = scene.revealLine.bind(scene);
      scene.revealLine = (line, color) => {
        window.__readTrace.push({ line, t: performance.now() });
        return reveal(line, color);
      };
    });
    await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("attack"),
    );
    await page.waitForFunction(() => window.__readTrace.length >= 2);
    const trace = await page.evaluate(() => window.__readTrace);
    expect(trace[1].t - trace[0].t).toBeGreaterThanOrEqual(1450);
    writeFileSync(
      new URL(`${width}-read-timing.json`, proof),
      JSON.stringify(trace, null, 2),
    );
  });
}
