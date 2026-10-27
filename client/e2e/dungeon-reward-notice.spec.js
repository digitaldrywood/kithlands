import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  startNormalRoute,
  routeReady,
  chooseStoryAction,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";
const proof = path.resolve(`tmp/dungeon-reward-notice-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ hasTouch: true });
for (const [width, height, reduced] of [
  [1440, 900, false],
  [390, 844, false],
  [800, 600, true],
]) {
  test(`earned cache notice stays readable then clears at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    const touch = width < 600,
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await startNormalRoute(page, 24, touch);
    const trail = page.getByRole("button", {
      name: "Old Mill trail",
      exact: true,
    });
    await trail[touch ? "tap" : "click"]();
    await routeReady(page, "Dungeon");
    await chooseStoryAction(page, "heron-trail", touch);
    await chooseStoryAction(page, "pool-bramblehog", touch);
    await fightNormally(page, undefined, { touch });
    await routeReady(page, "Dungeon");
    await chooseStoryAction(page, "pool-smithing-cache", touch);
    const notice = () =>
      page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Dungeon");
        return {
          visible: s.statusText?.visible,
          alpha: s.statusText?.alpha,
          text: s.statusText?.text,
        };
      });
    await expect.poll(notice).toMatchObject({ visible: true, alpha: 1 });
    expect((await notice()).text).toContain("Recovered 8 ember iron ore");
    await page.screenshot({ path: path.join(proof, `${width}-notice.png`) });
    await page.waitForTimeout(3500);
    expect(await notice()).toMatchObject({ visible: true, alpha: 1 });
    await expect
      .poll(async () => (await notice()).visible, { timeout: 15000 })
      .toBe(false);
    await page.screenshot({ path: path.join(proof, `${width}-cleared.png`) });
    if (width === 1440) {
      // A later clue must survive the timer belonging to an earlier reward.
      await chooseStoryAction(page, "heron-cache", touch);
      expect((await notice()).visible).toBe(true);
      await chooseStoryAction(page, "heron-secret", touch);
      expect((await notice()).text).toContain("reed-shaped mark");
      await page.waitForTimeout(13000);
      expect(await notice()).toMatchObject({ visible: true, alpha: 1 });
      expect((await notice()).text).toContain("reed-shaped mark");
      await page.screenshot({ path: path.join(proof, `${width}-clue.png`) });
    }
    expect(errors).toEqual([]);
  });
}
