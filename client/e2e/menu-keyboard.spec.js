import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const proof = new URL(`../tmp/menu-keyboard-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
test.setTimeout(90_000);
const capture = (page, name) =>
  page.screenshot({ path: new URL(`${name}.png`, proof).pathname });
async function shortcut(page, button) {
  const key = await button.getAttribute("aria-keyshortcuts");
  expect(key).toBeTruthy();
  await page.keyboard.press(key);
}

for (const [width, height] of [
  [1440, 900],
  [610, 837],
  [390, 844],
  [800, 600],
]) {
  test(`menus support keyboard and visible hints ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await expect(
      page.getByRole("button", { name: /^Quick start/ }),
    ).toHaveAttribute("aria-keyshortcuts", /Alt\+/);
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    await page.keyboard.press("m");
    await expect(page.locator(".modern-party-menu")).toBeVisible();
    await page.keyboard.press("r");
    const craft = page.locator(".field-crafting");
    await expect(craft).toBeVisible();
    const sword = craft.getByRole("button", {
      name: "Forge Iron Sword",
      exact: true,
    });
    await page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "¡",
          code: "Digit1",
          altKey: true,
          bubbles: true,
        }),
      ),
    );
    await expect(
      craft.getByRole("button", { name: "Brew Potion", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await shortcut(page, sword);
    await expect(sword).toHaveAttribute("aria-pressed", "true");
    await expect(craft.locator(".craft-confirm")).toBeDisabled();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
      expect(
        await craft.evaluate((root) => root.contains(document.activeElement)),
      ).toBe(true);
    }
    await capture(page, `${width}-crafting-keys`);
    await shortcut(
      page,
      craft.getByRole("button", { name: "Gem workshop", exact: true }),
    );
    const gems = page.locator(".kith-gem-workshop");
    await expect(gems).toBeVisible();
    await page.keyboard.press("Tab");
    expect(
      await gems.evaluate((root) => root.contains(document.activeElement)),
    ).toBe(true);
    await capture(page, `${width}-gems-keys`);
    await page.keyboard.press("Escape");
    await expect(craft).toBeVisible();
    await expect(
      craft.getByRole("button", { name: "Forge Iron Sword", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await page.keyboard.press("c");
    const equipment = page.locator(".kith-equipment-screen");
    await expect(equipment).toBeVisible();
    await page.keyboard.press("Tab");
    expect(
      await equipment.evaluate((root) => root.contains(document.activeElement)),
    ).toBe(true);
    await capture(page, `${width}-equipment-keys`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("o");
    await expect(page.getByRole("dialog", { name: /Options/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  });

  test(`battle choices trap focus and show number keys ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startShowcase());
    await expect(page.locator(".kith-equipment-screen")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".kith-equipment-screen")).toHaveCount(0);
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .battleVisibilitySnapshot()
        ?.messageWindow.text.includes("choose an action"),
    );
    await capture(page, `${width}-battle-command-keys`);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const panel = page.locator(".battle-choice-panel");
    await expect(panel).toContainText("Choose enemy");
    await expect(panel.locator(".battle-choice").first()).toHaveAttribute(
      "aria-keyshortcuts",
      "1",
    );
    await expect(
      panel.locator(".battle-choice-back .menu-shortcut"),
    ).toHaveText("Esc");
    await page.keyboard.press("Shift+Tab");
    await expect(panel.locator(".battle-choice-back")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(panel.locator(".battle-choice").first()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(panel.locator(".battle-choice").nth(1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(panel.locator(".battle-choice-back")).toBeFocused();
    await capture(page, `${width}-battle-target-keys`);
    await page.keyboard.press("Space");
    await expect(panel).toHaveCount(0);
    await page.keyboard.press("a");
    await page.keyboard.press("1");
    await expect(panel).toHaveCount(0);
    await page.keyboard.press("s");
    await expect(panel).toContainText("Magic");
    await capture(page, `${width}-battle-spell-keys`);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(panel).toHaveCount(0);
  });
}

test("wizard native pickers support arrow keys and Tab", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()) + "\nwindow.__keyboardGame = game;",
    });
  });
  await page.goto("/");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page
    .locator('input[type="email"]')
    .fill(`keyboard-${Date.now()}@kithlands.dev`);
  await page.locator('input[type="email"]').press("Tab");
  await shortcut(page, page.getByRole("button", { name: /^New game/ }));
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Wizard",
  );
  await capture(page, "800-wizard-search-keys");
  // Seed the legacy location-picker screen, which the streamlined OSM flow skips.
  await page.evaluate(() => {
    const scene = window.__keyboardGame.scene.getScene("Wizard");
    scene.wizardData.use_osm = true;
    scene.wizardData.osm_preview = [
      { id: "library", name: "Library", importance: 2 },
      { id: "mill", name: "Old Mill", importance: 1 },
    ];
    scene.step = 1;
    scene.showStep();
  });
  const picker = page.getByRole("listbox", { name: "Starting location" });
  await picker.focus();
  await page.keyboard.press("ArrowDown");
  await expect(picker).toHaveValue("1");
  expect(
    await page.evaluate(
      () =>
        window.__keyboardGame.scene.getScene("Wizard").wizardData.spawn_node_id,
    ),
  ).toBe("mill");
  await capture(page, "800-wizard-location-keys");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Wizard")
      .some((t) => t.text === "NAME YOUR NPCs"),
  );
  // Verify the party selector independently of locality network responses.
  await page.evaluate(() => {
    const scene = window.__keyboardGame.scene.getScene("Wizard");
    scene.step = 5;
    scene.showStep();
  });
  const classes = page.getByRole("combobox", { name: "Character class" });
  const original = await classes.first().inputValue();
  await classes.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(classes.first()).not.toHaveValue(original);
  await page.keyboard.press("Tab");
  await capture(page, "800-wizard-party-keys");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Wizard")
      .some((t) => t.text === "LOCALITY WIZARD"),
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "Title",
  );
});
