import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const proof = new URL(`../tmp/walk-rendered-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const fps of [60, 20]) {
  for (const speed of [1, 2, 3]) {
    test(`rendered gait progresses across held-key steps at walk speed ${speed}, ${fps} FPS`, async ({
      page,
    }) => {
      // Expose the game only in this intercepted development module so sampling
      // observes postrender output, not calls to setFrame that may be overwritten.
      await page.route("**/src/main.js", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${(await response.text()).replace("const game = new Phaser.Game(config);", `config.fps = { target: ${fps}, forceSetTimeOut: true };\nconst game = new Phaser.Game(config);`)}\nwindow.__walkRenderGame = game;`,
        });
      });
      await page.addInitScript((walkSpeed) => {
        localStorage.setItem("kithlands_prefs", JSON.stringify({ walkSpeed }));
      }, speed);
      await page.goto("/?walkAudit=1&noEncounters=1");
      await page.waitForFunction(() =>
        window.__kithlandsTest?.sceneIsActive("World"),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("World"),
      );
      await page.evaluate(() => {
        const bridge = window.__kithlandsTest;
        const anchor = bridge.findStraightAuditAnchor("right", 12, "World");
        if (!anchor) throw new Error("No straight walk test path");
        bridge.setPlayerTile(anchor.x, anchor.y, "World");
        bridge.centerCameraOnPlayer("World");
        const game = window.__walkRenderGame,
          scene = game.scene.getScene("World");
        window.__walkRendered = [];
        game.events.on("postrender", () =>
          window.__walkRendered.push({
            frame: Number(scene.player.frame.name) % 6,
            x: scene.player.x,
            time: performance.now(),
          }),
        );
      });
      await page.keyboard.down("ArrowRight");
      await page.waitForFunction(() => {
        const frames = window.__walkRendered;
        return frames.length > 1 && frames.at(-1).x - frames[0].x >= 32 * 6;
      });
      await page.keyboard.up("ArrowRight");
      await page.waitForFunction(
        () => {
          const scene = window.__walkRenderGame.scene.getScene("World");
          return !scene.animating && Number(scene.player.frame.name) % 6 === 0;
        },
        undefined,
        { timeout: 3000 },
      );
      const frames = await page.evaluate(() => window.__walkRendered);
      writeFileSync(
        new URL(`speed-${speed}-${fps}fps.json`, proof),
        JSON.stringify(frames, null, 2),
      );
      const moving = frames.filter((f, i) => i && f.x > frames[i - 1].x);
      expect(new Set(moving.map((f) => f.frame)).size).toBeGreaterThanOrEqual(
        5,
      );
      expect(moving.map((f) => f.frame)).toContain(2);
      expect(moving.map((f) => f.frame)).toContain(5);
      // No reset to contact-A in the middle of a continuous gait. A wrap from
      // the final pose is legitimate; a mid-cycle 2/3 -> 0 snap is not.
      const transitions = moving.filter(
        (f, i) => i && f.frame !== moving[i - 1].frame,
      );
      expect(
        transitions.filter((f) => f.frame === 0).length,
      ).toBeLessThanOrEqual(3);
      expect(frames.at(-1).frame).toBe(0);
      await page.screenshot({
        path: new URL(`speed-${speed}-${fps}fps-stopped.png`, proof).pathname,
      });
    });
  }
}
