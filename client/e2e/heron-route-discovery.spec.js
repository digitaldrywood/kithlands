import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  startNormalRoute,
  routeReady,
  clickRouteText,
} from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/heron-route-discovery-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ hasTouch: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test(`optional route is discoverable from the trail at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    const touch = width < 600;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await startNormalRoute(page, 24);
    const trail = page.getByRole("button", {
      name: "Old Mill trail",
      exact: true,
    });
    await expect(trail).toBeVisible();
    if (touch) await trail.tap();
    else await trail.click();
    await routeReady(page, "Dungeon");
    for (const label of [
      "Read the trail carving",
      "Clear the roosting bats",
      "Heron Pool (optional)",
    ]) {
      expect(
        await page.evaluate(
          (text) =>
            window.__kithlandsTest.interactiveTextPosition(text, "Dungeon"),
          label,
        ),
      ).toBeTruthy();
    }
    await page.screenshot({
      path: path.join(proof, `${width}-first-page.png`),
    });
    await clickRouteText(page, "More routes 1/3", "Dungeon", touch);
    expect(
      await page.evaluate(() =>
        window.__kithlandsTest.interactiveTextPosition(
          "Listen at the river bend",
          "Dungeon",
        ),
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: path.join(proof, `${width}-river-hint.png`),
    });
    await clickRouteText(page, "More routes 2/3", "Dungeon", touch);
    await clickRouteText(page, "More routes 3/3", "Dungeon", touch);
    const state = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Dungeon"),
    );
    expect(state.dungeon.room_id).toBe("approach");
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/dungeon") &&
        r.request().postDataJSON()?.action_id === "heron-trail",
    );
    await clickRouteText(page, "Heron Pool (optional)", "Dungeon", touch);
    expect((await (await response).json()).error).toBeUndefined();
    await routeReady(page, "Dungeon");
    expect(
      (await page.evaluate(() => window.__kithlandsTest.gameState("Dungeon")))
        .dungeon.room_id,
    ).toBe("heron-pool");
    const notice = await page.evaluate(() => {
      const scene = window.__normalRouteGame.scene.getScene("Dungeon");
      const bounds = scene.statusText.getBounds();
      return {
        visible: scene.statusText.visible,
        bottom: bounds.bottom,
        actionTop: scene.layout.actionY - scene.layout.buttonHeight / 2,
      };
    });
    expect(notice.visible).toBe(true);
    expect(notice.bottom).toBeLessThanOrEqual(notice.actionTop);
    await page.screenshot({
      path: path.join(proof, `${width}-heron-pool.png`),
    });
    expect(errors).toEqual([]);
  });
}
