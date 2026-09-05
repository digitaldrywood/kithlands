import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(`../tmp/all-menu-style-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 390]) {
  test(`all menu surfaces at ${width}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const capture = (name) =>
      page.screenshot({
        path: new URL(`${width}-${name}.png`, proof).pathname,
      });
    for (const [label, name] of [
      ["CHARACTER", "equipment"],
      ["ITEMS", "items"],
      ["MAGIC", "magic"],
      ["FORMATION", "formation"],
      ["QUEST LOG", "quests"],
      ["WORLD MAP", "map"],
      ["OPTIONS", "options"],
    ]) {
      await page.goto("/?noEncounters=1");
      await page.waitForFunction(
        () => window.__kithlandsTest?.activeSceneKey() === "Title",
      );
      await page.evaluate(() => window.__kithlandsTest.startQuickGame());
      await page.keyboard.press("m");
      await expect(
        page.getByRole("dialog", { name: "Your party", exact: true }),
      ).toBeVisible();
      await page.evaluate(
        (label) => window.__kithlandsTest.clickMenuButton(label, "World"),
        label,
      );
      await expect(
        page.getByRole("dialog", { name: "Your party", exact: true }),
      ).toBeHidden();
      await capture(name);
      await page.keyboard.press("Escape");
    }
    await page.reload();
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.keyboard.press("h");
    await expect(page.locator(".kith-codex")).toBeVisible();
    await capture("codex");
    await page.keyboard.press("Escape");
    // Presentation fixture only: promotion eligibility remains server-owned.
    await page.evaluate(() => {
      const gs = window.__kithlandsTest.gameState("World");
      window.__kithlandsTest.startScene("World", {
        gameState: { ...gs, phase: "promotion" },
      });
    });
    await expect(
      page.getByRole("dialog", { name: "Class Promotion" }),
    ).toBeVisible();
    await capture("promotion");
    expect(errors).toEqual([]);
  });
}
