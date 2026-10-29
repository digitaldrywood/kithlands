import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const proof = new URL(`../tmp/wizard-back-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });

async function openWizard(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page
    .locator('input[type="email"]')
    .fill(`back-${Date.now()}@kithlands.dev`);
  await page.getByRole("button", { name: /^New game/ }).click();
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Wizard",
  );
  await expect(page.locator('input[type="range"]')).toHaveCount(1);
}

async function clickText(page, text) {
  const point = await page.evaluate(
    (label) => window.__kithlandsTest.interactiveTextPosition(label, "Wizard"),
    text,
  );
  await page.mouse.click(point.x, point.y);
}

async function expectTitle(page) {
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Title",
  );
  await expect(page.locator('input[type="range"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^New game/ })).toBeVisible();
}

for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["portrait", 390, 844],
  ["comment", 793, 837],
]) {
  test(`${label}: first-step Back returns to title and can reopen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await openWizard(page);
    await page.screenshot({
      path: new URL(`${label}-wizard.png`, proof).pathname,
    });
    await clickText(page, "Back");
    await expectTitle(page);
    await page.screenshot({
      path: new URL(`${label}-title.png`, proof).pathname,
    });
    await page.getByRole("button", { name: /^New game/ }).click();
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Wizard",
    );
    await clickText(page, "Back");
    await expectTitle(page);
  });
}

test("Escape exits while the address field has focus", async ({ page }) => {
  await openWizard(page);
  await page.locator('input[type="text"]').fill("Cadott, WI");
  await page.keyboard.press("Escape");
  await expectTitle(page);
});

for (const pending of ["geocode", "preview"]) {
  test(`Back ignores a late ${pending} response after reopening`, async ({
    page,
  }) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let arrived;
    const arrival = new Promise((resolve) => {
      arrived = resolve;
    });
    let finished;
    const completion = new Promise((resolve) => {
      finished = resolve;
    });
    await page.route("**/api/geocode", async (route) => {
      if (pending === "geocode") {
        arrived();
        await gate;
      }
      await route.fulfill({ json: { lat: 44.9475, lng: -91.1504 } });
      if (pending === "geocode") finished();
    });
    await page.route("**/api/osm/preview", async (route) => {
      if (pending === "preview") {
        arrived();
        await gate;
      }
      await route.fulfill({
        json: {
          nodes: [{ id: "old-poi", name: "Old Town Hall", importance: 9 }],
          radius_miles: 1.5,
        },
      });
      if (pending === "preview") finished();
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openWizard(page);
    await page.locator('input[type="text"]').fill("Cadott, WI");
    await clickText(page, "FIND & CONTINUE");
    await arrival;
    await page.screenshot({
      path: new URL(`${pending}-search.png`, proof).pathname,
    });
    await clickText(page, "Back");
    await expectTitle(page);
    await page.getByRole("button", { name: /^New game/ }).click();
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Wizard",
    );
    release();
    await completion;
    await page.waitForTimeout(250);
    await expect(page.locator('input[type="range"]')).toHaveCount(1);
    expect(
      await page.evaluate(() =>
        window.__kithlandsTest
          .visibleTexts("Wizard")
          .map((entry) => entry.text),
      ),
    ).toContain("LOCALITY WIZARD");
    expect(errors).toEqual([]);
    await clickText(page, "Back");
    await expectTitle(page);
  });
}

for (const [label, width, height] of [
  ["keyboard", 1440, 900],
  ["touch", 390, 844],
]) {
  test.describe(`party cancel ${label}`, () => {
    test.use({ hasTouch: label === "touch", viewport: { width, height } });
    test("Cancel returns to search, then Back exits without creating a game", async ({
      page,
    }) => {
      const creates = [];
      page.on("request", (request) => {
        if (request.url().endsWith("/api/game/new"))
          creates.push(request.url());
      });
      await page.route("**/api/geocode", (route) =>
        route.fulfill({ json: { lat: 44.9475, lng: -91.1504 } }),
      );
      await page.route("**/api/osm/preview", (route) =>
        route.fulfill({
          json: {
            radius_miles: 1.5,
            nodes: [
              {
                id: "library",
                name: "Town Library",
                kind: "landmark",
                importance: 9,
              },
            ],
          },
        }),
      );
      await openWizard(page);
      await page.locator('input[type="text"]').fill("Cadott, WI");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() =>
        window.__kithlandsTest
          .visibleTexts("Wizard")
          .some((entry) => entry.text === "PICK YOUR PARTY"),
      );
      await page.screenshot({
        path: new URL(`${label}-party-cancel.png`, proof).pathname,
      });
      if (label === "touch") {
        const point = await page.evaluate(() =>
          window.__kithlandsTest.interactiveTextPosition("CANCEL", "Wizard"),
        );
        await page.touchscreen.tap(point.x, point.y);
      } else {
        await page.locator('input[type="text"]').first().focus();
        await page.keyboard.press("Escape");
      }
      await expect(page.locator('input[type="range"]')).toHaveCount(1);
      await page.screenshot({
        path: new URL(`${label}-cancelled-to-search.png`, proof).pathname,
      });
      if (label === "touch") {
        const point = await page.evaluate(() =>
          window.__kithlandsTest.interactiveTextPosition("Back", "Wizard"),
        );
        await page.touchscreen.tap(point.x, point.y);
      } else await page.keyboard.press("Escape");
      await expectTitle(page);
      expect(creates).toHaveLength(0);
      await page.screenshot({
        path: new URL(`${label}-cancelled-to-title.png`, proof).pathname,
      });
    });
  });
}
