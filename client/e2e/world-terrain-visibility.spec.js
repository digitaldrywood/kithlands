import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
for (const width of [1440, 800, 645, 390])
  test(
    "normal world keeps terrain bounded while walking at " + width,
    async ({ page }, info) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 847 });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      let navigations = 0;
      page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) navigations++;
      });
      await page.route("**/src/main.js", async (route) => {
        const r = await route.fetch();
        await route.fulfill({
          response: r,
          body: (await r.text()) + "\nwindow.__reviewGame=game;",
        });
      });
      await page.goto("/?noEncounters=1");
      await page.waitForFunction(
        () => window.__kithlandsTest?.activeSceneKey() === "Title",
      );
      await page.evaluate(() => window.__kithlandsTest.startQuickGame());
      await page.waitForFunction(
        () => window.__kithlandsTest?.activeSceneKey() === "World",
      );
      await page.evaluate(() => {
        const b = window.__kithlandsTest;
        const a = b.findStraightAuditAnchor("right", 12, "World");
        b.setPlayerTile(a.x, a.y, "World");
        b.centerCameraOnPlayer("World");
        const g = window.__reviewGame,
          s = g.scene.getScene("World");
        window.__frames = [];
        g.events.on("postrender", () =>
          window.__frames.push({
            t: performance.now(),
            x: s.player.x,
            camera: s.cameras.main.scrollX,
            scene: g.scene.getScenes(true).map((s) => s.scene.key),
            hidden: s.explorationHUD?.root.hidden,
            visible: s.tileSprites.list.filter((t) => t.visible).length,
            total: s.tileSprites.list.length,
            rect: g.canvas.getBoundingClientRect().toJSON(),
          }),
        );
      });
      await page.keyboard.down("ArrowRight");
      await page.waitForTimeout(3000);
      await page.keyboard.up("ArrowRight");
      const frames = await page.evaluate(() => window.__frames);
      writeFileSync(
        info.outputPath("frames.json"),
        JSON.stringify({ frames, errors, navigations }),
      );
      await page.screenshot({
        path: info.outputPath("world-review-" + Date.now() + ".png"),
      });
      expect(errors).toEqual([]);
      expect(navigations).toBe(1);
      expect(frames.length).toBeGreaterThan(20);
      expect(frames.every((f) => f.visible < f.total / 2)).toBe(true);
      expect(new Set(frames.map((f) => JSON.stringify(f.rect))).size).toBe(1);
      expect(
        frames.every(
          (f) => !f.hidden && f.scene.length === 1 && f.scene[0] === "World",
        ),
      ).toBe(true);
      await page.evaluate(() =>
        window.__reviewGame.scene.getScene("World").cameras.main.setZoom(0.5),
      );
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        const s = window.__reviewGame.scene.getScene("World"),
          v = s.cameras.main.worldView;
        const missing = s.tileSprites.list.filter(
          (t) =>
            t.x >= v.x &&
            t.x < v.right &&
            t.y >= v.y &&
            t.y < v.bottom &&
            !t.visible,
        );
        if (missing.length) throw Error("Visible terrain missing after zoom");
      });
      await page.screenshot({
        path: info.outputPath("world-zoom-" + Date.now() + ".png"),
      });
    },
  );
