import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 645, height: 847 },
  { width: 390, height: 844 },
]) {
  test(`map discovers and reaches both adventures ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(30_000);
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(String(error));
      console.log("BROWSER ERROR", String(error));
    });
    page.on("console", (message) => {
      if (message.type() === "error") console.log("CONSOLE", message.text());
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    for (const id of ["forgotten-shrine", "old-mill"]) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("button", { name: /WORLD MAP/i }).click();
      await expect(
        page.getByRole("heading", { name: "Adventures", exact: true }),
      ).toBeVisible();
      const entry = await page.evaluate(
        (id) =>
          window.__kithlandsTest
            .gameState("World")
            .dungeon_entries.find((entry) => entry.id === id),
        id,
      );
      if (id === "forgotten-shrine") {
        const mode = page.getByRole("button", {
          name: "Path mode: Off",
          exact: true,
        });
        await expect(mode).toHaveAttribute("aria-pressed", "false");
        await expect(
          page.getByRole("button", {
            name: `Follow route to ${entry.title}`,
            exact: true,
          }),
        ).toBeDisabled();
        await page
          .getByRole("button", {
            name: `Mark destination: ${entry.title}`,
            exact: true,
          })
          .click();
        await expect(mode).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`${Date.now()}-hint-mode-off.png`),
        });
        await mode.click();
        await expect(
          page.getByRole("button", { name: "Path mode: On", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      }
      const follow = page.getByRole("button", {
        name: `Follow route to ${entry.title}`,
        exact: true,
      });
      await page.screenshot({
        path: testInfo.outputPath(`${Date.now()}-${id}-map-overview.png`),
      });
      await page.getByRole("button", { name: /Find adventures/ }).click();
      await follow.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`${Date.now()}-${id}-map.png`),
      });
      if (viewport.width === 1440) {
        await follow.focus();
        await page.keyboard.press("Enter");
      } else if (viewport.width === 390) {
        await follow.tap();
      } else {
        await follow.click();
      }
      await expect(
        page.getByRole("heading", { name: "World map", exact: true }),
      ).toHaveCount(0);
      await page.waitForFunction(
        ({ node_id }) =>
          window.__kithlandsTest.gameState("World")?.current_location
            ?.world_node_id === node_id,
        entry,
        { timeout: 120_000 },
      );
      const entrance = page.getByRole("button", {
        name: entry.label,
        exact: true,
      });
      await expect(entrance).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${Date.now()}-${id}-entrance.png`),
      });
      await entrance.click();
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "Dungeon",
      );
      expect(
        await page.evaluate(
          () => window.__kithlandsTest.gameState("Dungeon").active_dungeon_id,
        ),
      ).toBe(id);
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("Dungeon"),
      );
      await page.screenshot({
        path: testInfo.outputPath(`${Date.now()}-${id}-inside.png`),
      });
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("Retreat", "Dungeon"),
      );
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "World",
      );
    }
    expect(errors).toEqual([]);
  });
}
