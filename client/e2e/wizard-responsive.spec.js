import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const proof = new URL(
  `../tmp/wizard-responsive-${Date.now()}/`,
  import.meta.url,
);
mkdirSync(proof, { recursive: true });

for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["default", 800, 600],
  ["phone", 390, 844],
  ["short-phone", 375, 667],
]) {
  test.describe(label, () => {
    test.use({ viewport: { width, height }, hasTouch: true });
    test("readable manual setup, keyboard classes, creation retry and real World handoff", async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const capture = async (name) => {
        await page.screenshot({
          path: new URL(`${label}-${name}.png`, proof).pathname,
        });
      };
      const dialog = page.getByRole("dialog");
      const checkLayout = async () => {
        const metrics = await dialog.evaluate((root) => {
          const panel = root.querySelector(".viewport-dialog-panel");
          const bounds = panel.getBoundingClientRect();
          const controls = [
            ...root.querySelectorAll("button, input[type=text], select"),
          ].filter((node) => node.getClientRects().length);
          return {
            overflow: root.scrollWidth > root.clientWidth,
            horizontalControlOverflow: controls.some((node) => {
              const rect = node.getBoundingClientRect();
              return rect.left < bounds.left || rect.right > bounds.right;
            }),
            bounds: {
              x: bounds.x,
              y: bounds.y,
              right: bounds.right,
              bottom: bounds.bottom,
            },
            fonts: controls.map((node) =>
              parseFloat(getComputedStyle(node).fontSize),
            ),
            heights: controls.map(
              (node) => node.getBoundingClientRect().height,
            ),
          };
        });
        expect(metrics.overflow).toBe(false);
        expect(metrics.horizontalControlOverflow).toBe(false);
        expect(metrics.bounds.x).toBeGreaterThanOrEqual(0);
        expect(metrics.bounds.y).toBeGreaterThanOrEqual(0);
        expect(metrics.bounds.right).toBeLessThanOrEqual(width);
        expect(metrics.bounds.bottom).toBeLessThanOrEqual(height);
        expect(Math.min(...metrics.fonts)).toBeGreaterThanOrEqual(16);
        expect(Math.min(...metrics.heights)).toBeGreaterThanOrEqual(46);
      };
      await page.goto("/");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page
        .locator("input[type=email]")
        .fill(`wizard-responsive-${label}-${Date.now()}@kithlands.dev`);
      await page.getByRole("button", { name: /^New game/ }).click();
      await expect(
        dialog.getByRole("heading", { name: "LOCALITY WIZARD" }),
      ).toBeVisible();
      await checkLayout();
      await capture("location");
      await page.getByLabel("Use real-world map data").uncheck();
      await expect(page.getByRole("slider")).toBeHidden();
      await page.getByLabel("Town name or address").fill("Cadott, WI");
      await page.keyboard.press("Enter");
      for (const [title, names] of [
        ["NAME YOUR NPCs", ["Rowan", "Mira", "Tobin"]],
        ["NAME YOUR PLACES", ["The School", "Old Mill", "Market"]],
        ["THE BIG BUILDING", ["Town Hall"]],
      ]) {
        await expect(
          dialog.getByRole("heading", { name: title }),
        ).toBeVisible();
        for (const [i, name] of names.entries())
          await dialog.locator("input[type=text]").nth(i).fill(name);
        await checkLayout();
        await capture(title.toLowerCase().replaceAll(" ", "-"));
        await dialog.getByRole("button", { name: /^NEXT/ }).click();
      }
      await expect(
        dialog.getByRole("heading", { name: "PICK YOUR PARTY" }),
      ).toBeVisible();
      const names = ["Ayla", "Mira", "Cato", "Nia"];
      for (const [i, name] of names.entries())
        await dialog.locator("input[type=text]").nth(i).fill(name);
      const first = dialog.locator("input[type=text]").first();
      const classes = dialog.getByRole("combobox", { name: "Character class" });
      await first.focus();
      await page.keyboard.press("Tab");
      await expect(classes.first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(classes.first()).toHaveValue("brawler");
      await expect(dialog.locator("img").first()).toHaveAttribute(
        "src",
        "/sprites/brawler.png",
      );
      await page.keyboard.press("Home");
      await expect(classes.first()).toHaveValue("warrior");
      await page.keyboard.press("Tab");
      await expect(dialog.locator("input[type=text]").nth(1)).toBeFocused();
      await checkLayout();
      await first.focus();
      await capture("party-top");
      await dialog.locator("input[type=text]").last().focus();
      await capture("party-bottom");
      // Escape and button cancellation preserve edits without submitting.
      await page.keyboard.press("Escape");
      await expect(
        dialog.getByRole("heading", { name: "THE BIG BUILDING" }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: /^NEXT/ }).click();
      await expect(first).toHaveValue("Ayla");
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const submissions = [];
      await page.route("**/api/game/new", async (route) => {
        submissions.push(route.request().postDataJSON());
        if (submissions.length === 1) {
          await gate;
          await route.fulfill({
            json: { error: "Creation temporarily unavailable. Please retry." },
          });
        } else await route.continue();
      });
      const create = dialog.getByRole("button", { name: /^CREATE GAME/ });
      if (width < 500) await create.tap();
      else await create.click();
      await expect(create).toBeDisabled();
      await expect(classes.first()).toBeDisabled();
      await expect(
        dialog.getByRole("button", { name: /^CANCEL/ }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Enter");
      expect(submissions).toHaveLength(1);
      await capture("creating");
      release();
      await expect(dialog.getByRole("status")).toContainText(
        "temporarily unavailable",
      );
      await expect(create).toBeEnabled();
      await expect(classes.first()).toBeEnabled();
      await capture("retry");
      await create.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() === "World",
      );
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("World"),
      );
      await expect(page.locator(".wizard-dialog")).toHaveCount(0);
      await expect(page.locator("input[type=text]")).toHaveCount(0);
      expect(submissions).toHaveLength(2);
      expect(submissions[1].party.map((member) => member.name)).toEqual(names);
      const state = await page.evaluate(() =>
        window.__kithlandsTest.gameState("World"),
      );
      expect(state.party.map((member) => member.name)).toEqual(names);
      expect(state.party[0].class_id).toBe("warrior");
      await capture("world");
      expect(errors).toEqual([]);
    });
  });
}

test("a late successful create cannot reopen a wizard that has shut down", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/geocode", (route) =>
    route.fulfill({ json: { lat: 44.9475, lng: -91.1504 } }),
  );
  await page.route("**/api/osm/preview", (route) =>
    route.fulfill({
      json: {
        nodes: [
          { id: "hall", name: "Town Hall", kind: "landmark", importance: 9 },
        ],
        radius_miles: 1.5,
      },
    }),
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let ready;
  const responseReady = new Promise((resolve) => {
    ready = resolve;
  });
  let delivered;
  const responseDelivered = new Promise((resolve) => {
    delivered = resolve;
  });
  await page.route("**/api/game/new", async (route) => {
    const request = route.request().postDataJSON();
    // OSM is a deterministic presentation fixture; creation still uses Go.
    const response = await route.fetch({
      postData: JSON.stringify({ ...request, use_osm: false }),
    });
    expect(response.ok()).toBe(true);
    ready();
    await gate;
    await route.fulfill({ response });
    delivered();
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page
    .locator("input[type=email]")
    .fill(`wizard-stale-create-${Date.now()}@kithlands.dev`);
  await page.getByRole("button", { name: /^New game/ }).click();
  await page.getByLabel("Town name or address").fill("Cadott, WI");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^CREATE GAME/ }).click();
  await responseReady;
  // Lifecycle fault injection: normal player cancellation is locked while creating.
  await page.evaluate(() => window.__kithlandsTest.startScene("Title"));
  await expect(page.getByRole("button", { name: /^New game/ })).toBeVisible();
  release();
  await responseDelivered;
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => window.__kithlandsTest.activeSceneKey()),
  ).toBe("Title");
  await expect(page.locator(".wizard-dialog")).toHaveCount(0);
  await page.screenshot({
    path: new URL("stale-success-stays-title.png", proof).pathname,
  });
  expect(errors).toEqual([]);
});
