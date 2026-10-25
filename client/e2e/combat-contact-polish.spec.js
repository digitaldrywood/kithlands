import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { openShowcase } from "./battle-vfx-proof-helpers.js";
const proof = new URL(`../tmp/combat-contact-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const [width, height, reducedMotion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [800, 600, "reduce"],
]) {
  test(`melee contact, miss readability and transient cleanup ${width}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()) + "\nwindow.__contactGame=game;",
      });
    });
    await openShowcase(page, { width, height, reducedMotion });
    await page.evaluate(() => {
      const game = window.__contactGame,
        scene = game.scene.getScene("Battle");
      window.__contactFrames = [];
      const capture = () => {
        if (window.__contactFrames.length >= 8) return;
        const contact = scene.children.list.some(
          (o) => o.active && o._combatFxTag === "melee-contact",
        );
        if (contact)
          window.__contactFrames.push(game.canvas.toDataURL("image/png"));
      };
      game.events.on("postrender", capture);
      window.__contactCapture = capture;
    });
    await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("attack"),
    );
    await page.waitForFunction(() => window.__contactFrames.length >= 2);
    const frames = await page.evaluate(() => {
      window.__contactGame.events.off("postrender", window.__contactCapture);
      return window.__contactFrames;
    });
    for (const [index, frame] of frames.entries())
      writeFileSync(
        new URL(`${width}-melee-${index}.png`, proof),
        Buffer.from(frame.split(",")[1], "base64"),
      );
    await page.waitForFunction(
      () => !window.__contactGame.scene.getScene("Battle").animating,
    );
    const contactTags = ["melee-contact", "contact-detail", "fire-trail"];
    await expect
      .poll(() =>
        page.evaluate(
          (tags) =>
            window.__contactGame.scene
              .getScene("Battle")
              .children.list.filter(
                (o) => o.active && tags.includes(o._combatFxTag),
              ).length,
          contactTags,
        ),
      )
      .toBe(0);
    await page.screenshot({
      path: new URL(`${width}-recovered.png`, proof).pathname,
    });
    // A forced visual miss checks the renderer contract only, without mutating HP.
    await page.evaluate(() => {
      const scene = window.__contactGame.scene.getScene("Battle");
      const target = Object.values(scene.enemySprites).find((e) => !e.dead);
      return scene.hitFx(target.x, target.y, 0, false, false, "physical", {
        missed: true,
        entry: target,
      });
    });
    expect(
      await page.evaluate(() =>
        window.__contactGame.scene
          .getScene("Battle")
          .children.list.some(
            (o) => o.active && o._combatFxTag === "melee-contact",
          ),
      ),
    ).toBe(false);
  });
}
