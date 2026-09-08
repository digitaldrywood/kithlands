import { expect, test } from "@playwright/test";

const run = Date.now();
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 800, height: 600 },
  { width: 645, height: 847 },
  { width: 390, height: 844 },
]) {
  test(`stop auto after the submitted round at ${viewport.width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["giant_rat"], 1),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.activeSceneKey() === "Battle" &&
        !window.__kithlandsTest.battleVisibilitySnapshot().animating,
    );
    const state = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Battle"),
    );
    const actions = state.party.map((_, slot) => ({ slot, type: "defend" }));
    let rounds = 0;
    let release;
    await page.route("**/game/*/action", async (route) => {
      if (route.request().postDataJSON()?.type !== "combat_round")
        return route.continue();
      rounds++;
      if (rounds > 1)
        await new Promise((resolve) => {
          release = resolve;
        });
      await route.fulfill({
        json: {
          ...state,
          last_round_actions: actions,
          combat_log: [],
          combat_actions: [],
        },
      });
    });
    // Establish repeat actions through the normal round submission/restart path.
    await page.evaluate(
      (actions) => window.__kithlandsTest.playCombatRound(actions),
      actions,
    );
    await expect.poll(() => rounds, { timeout: 15000 }).toBe(1);
    await page.waitForFunction(
      () => !window.__kithlandsTest.battleVisibilitySnapshot().animating,
    );
    await page.waitForFunction(
      () =>
        !!window.__kithlandsTest.interactiveTextPosition("[Q] AUTO", "Battle"),
    );
    await page.screenshot({
      path: info.outputPath(`auto-${run}-${viewport.width}-before.png`),
    });
    await page.keyboard.press("q");
    await expect.poll(() => rounds, { timeout: 15000 }).toBe(2);
    // Let Auto cross two scene restarts without a stop request.
    release();
    await expect.poll(() => rounds, { timeout: 15000 }).toBe(3);
    release();
    await expect.poll(() => rounds, { timeout: 15000 }).toBe(4);
    const position = await page.evaluate(() =>
      window.__kithlandsTest.interactiveTextPosition("STOP AUTO (Q)", "Battle"),
    );
    expect(position).toBeTruthy();
    await page.screenshot({
      path: info.outputPath(`auto-${run}-${viewport.width}-running.png`),
    });
    await page.mouse.click(position.x, position.y);
    await page.screenshot({
      path: info.outputPath(`auto-${run}-${viewport.width}-stopping.png`),
    });
    // Neither repeated clicks nor Q can start another round while this one is pending.
    await page.mouse.click(position.x, position.y);
    await page.keyboard.press("q");
    release();
    await page.waitForFunction(
      () => !window.__kithlandsTest.battleVisibilitySnapshot().animating,
    );
    await page.waitForTimeout(1200);
    expect(rounds).toBe(4);
    await page.screenshot({
      path: info.outputPath(`auto-${run}-${viewport.width}-manual.png`),
    });
    // Auto can be resumed, and its keyboard stop works during the request too.
    await page.keyboard.press("q");
    await expect.poll(() => rounds, { timeout: 15000 }).toBe(5);
    await page.keyboard.press("q");
    release();
    await page.waitForFunction(
      () => !window.__kithlandsTest.battleVisibilitySnapshot().animating,
    );
    await page.waitForTimeout(1200);
    expect(rounds).toBe(5);
    expect(pageErrors).toEqual([]);
  });
}
