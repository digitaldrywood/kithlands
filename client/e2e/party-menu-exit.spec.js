import { expect, test } from "@playwright/test";
const RUN_ID = Date.now();

async function start(page) {
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(
    (email) => window.__kithlandsTest.startQuickGame(email),
    `exit-${RUN_ID}-${Date.now()}@kithlands.dev`,
  );
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "World",
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
}
async function openExit(page, testInfo, suffix) {
  await page.keyboard.press("m");
  await expect(page.getByRole("dialog", { name: "Your party" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`exit-menu-${suffix}-${RUN_ID}.png`),
  });
  await page
    .getByRole("button", { name: "Exit to main menu", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Exit to main menu?" });
  await expect(dialog).toBeVisible();
  return dialog;
}
for (const width of [800, 390]) {
  test(`exit menu supports cancel, save failure and save-and-exit at ${width}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 600 });
    await start(page);
    let dialog = await openExit(page, testInfo, `${width}-cancel`);
    await page.screenshot({
      path: testInfo.outputPath(`exit-dialog-${width}-${RUN_ID}.png`),
    });
    await dialog
      .getByRole("button", { name: "Keep playing", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    expect(
      await page.evaluate(() => window.__kithlandsTest.activeSceneKey()),
    ).toBe("World");
    dialog = await openExit(page, testInfo, `${width}-save`);
    await page.route("**/api/game/*/save", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Save service unavailable" }),
      }),
    );
    await dialog
      .getByRole("button", { name: "Save and exit", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText("Could not save");
    expect(
      await page.evaluate(() => window.__kithlandsTest.activeSceneKey()),
    ).toBe("World");
    await page.unroute("**/api/game/*/save");
    await dialog
      .getByRole("button", { name: "Save and exit", exact: true })
      .click();
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Title",
    );
    await expect(dialog).toBeHidden();
    expect(
      await page.evaluate(() =>
        window.__kithlandsTest.logicalGameSize("Title"),
      ),
    ).toMatchObject({ width: 800, height: 600 });
    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    expect(saves.saves.length).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: /New game/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue/ })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`exit-title-${width}-${RUN_ID}.png`),
    });
    await page.evaluate(
      (id) => window.__kithlandsTest.loadSave(id),
      saves.saves[0].id,
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    dialog = await openExit(page, testInfo, `${width}-discard`);
    await dialog
      .getByRole("button", { name: "Exit without saving", exact: true })
      .click();
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Title",
    );
  });
}
