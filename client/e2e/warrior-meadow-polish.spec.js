import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const proof = new URL(`../tmp/warrior-meadow-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
test.use({ video: "on", reducedMotion: "no-preference" });
for (const [label, width, height] of [
  ["desktop", 1200, 900],
  ["portrait", 390, 844],
]) {
  test(`${label}: real Warrior walking and meadow-to-battle flow`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.addInitScript(() =>
      localStorage.setItem(
        "kithlands_prefs",
        JSON.stringify({ walkSpeed: 1, battleSpeed: 3 }),
      ),
    );
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.__polishGame = game;`,
      });
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    const origin = await page.evaluate(() => {
      const scene = window.__polishGame.scene.getScene("World");
      window.__fieldTrace = [];
      const sample = () =>
        window.__fieldTrace.push({
          x: scene.player.x,
          y: scene.player.y,
          frame: scene.player.frame.name,
          shadowX: scene.fieldShadow.x,
          shadowY: scene.fieldShadow.y,
        });
      window.__polishGame.events.on("postrender", sample);
      scene.events.once("shutdown", () =>
        window.__polishGame.events.off("postrender", sample),
      );
      return { x: scene.playerX + 3, y: scene.playerY };
    });
    await page.screenshot({
      path: new URL(`${label}-meadow.png`, proof).pathname,
    });
    for (const [direction, key] of [
      ["east", "ArrowRight"],
      ["south", "ArrowDown"],
      ["west", "ArrowLeft"],
      ["north", "ArrowUp"],
    ]) {
      await page.evaluate(({ x, y }) => {
        window.__kithlandsTest.setPlayerTile(x, y, "World");
        window.__kithlandsTest.centerCameraOnPlayer("World");
      }, origin);
      await page.keyboard.down(key);
      for (let frame = 0; frame < 6; frame++) {
        await page.waitForTimeout(100);
        await page.screenshot({
          path: new URL(`${label}-${direction}-${frame}.png`, proof).pathname,
        });
      }
      await page.keyboard.up(key);
      await page.waitForFunction(
        () => !window.__polishGame.scene.getScene("World").animating,
      );
      await page.waitForTimeout(120);
      await page.screenshot({
        path: new URL(`${label}-${direction}-idle.png`, proof).pathname,
      });
    }
    const trace = await page.evaluate(() => window.__fieldTrace);
    expect(new Set(trace.map((sample) => sample.frame)).size).toBeGreaterThan(
      12,
    );
    for (const sample of trace) {
      expect(sample.shadowX).toBeCloseTo(sample.x, 4);
      expect(sample.shadowY).toBeCloseTo(sample.y - 2, 4);
    }
    writeFileSync(
      new URL(`${label}-walk-trace.json`, proof),
      JSON.stringify(trace),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["goblin", "goblin", "goblin"], 1),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Battle",
    );
    expect(
      await page.evaluate(
        () =>
          window.__polishGame.scene.getScene("Battle").battlePresentation
            .backgroundKey,
      ),
    ).toBe("bg_meadow");
    await page.screenshot({
      path: new URL(`${label}-battle-entry.png`, proof).pathname,
    });
  });
}

test("Space cycles every class for visual regression review in the finished meadow", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.__polishGame = game;`,
    });
  });
  await page.goto("/?walkAudit=1&noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("World"),
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  const classes = await page.evaluate(() =>
    window.__kithlandsTest.walkSheetClassIds(),
  );
  const origin = await page.evaluate(() => {
    const scene = window.__polishGame.scene.getScene("World");
    return { x: scene.playerX + 3, y: scene.playerY };
  });
  for (const classId of classes) {
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneAuditInfo("World").leaderClass,
      ),
    ).toBe(classId);
    await page.evaluate(({ x, y }) => {
      window.__kithlandsTest.setPlayerTile(x, y, "World");
      window.__kithlandsTest.centerCameraOnPlayer("World");
    }, origin);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => {
      const scene = window.__polishGame.scene.getScene("World"),
        camera = scene.cameras.main;
      const rect = document.querySelector("canvas").getBoundingClientRect();
      const sx = rect.width / window.__polishGame.scale.width,
        sy = rect.height / window.__polishGame.scale.height;
      return {
        x:
          rect.x +
          ((scene.player.x - camera.scrollX) * camera.zoom + camera.x) * sx -
          64,
        y:
          rect.y +
          ((scene.player.y - camera.scrollY) * camera.zoom + camera.y) * sy -
          96,
        width: 128,
        height: 128,
      };
    });
    await page.screenshot({
      path: new URL(`${classId}-moving.png`, proof).pathname,
      clip,
    });
    await page.keyboard.up("ArrowRight");
    await page.waitForFunction(
      () => !window.__polishGame.scene.getScene("World").animating,
    );
    await page.waitForTimeout(120);
    await page.screenshot({
      path: new URL(`${classId}-stopped.png`, proof).pathname,
      clip,
    });
    await page.keyboard.press("Space");
    await page.waitForTimeout(100);
  }
  await page.goto("/sprites.html");
  await page.locator("#walk-grid canvas").first().waitFor();
  await page.screenshot({
    path: new URL("sprites-inspector.png", proof).pathname,
  });
  await page.locator("#walk-grid").screenshot({
    path: new URL("sprites-walk-grid.png", proof).pathname,
  });
});
