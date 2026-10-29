import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(`../tmp/save-adventures-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
test.setTimeout(90_000);
for (const [width, height] of [
  [1440, 900],
  [610, 837],
  [390, 844],
  [800, 600],
]) {
  test(`latest adventure and optional history ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    const email = `saves-${Date.now()}-${width}@kithlands.dev`;
    await page.evaluate(
      (address) => window.__kithlandsTest.startQuickGame(address),
      email,
    );
    const first = await page.evaluate(async () => {
      const api = await import("/src/api.js");
      const game = window.__kithlandsTest.gameState("World");
      for (let i = 0; i < 8; i++) {
        const receipt = await api.saveGame(game.id, "Cadott adventure");
        if (receipt.error) throw new Error(receipt.error);
      }
      const auto = await api.autosaveGame(game.id, "timed");
      if (auto.error) throw new Error(auto.error);
      return (await api.listSaves()).saves;
    });
    expect(first).toHaveLength(9);
    expect(new Set(first.map((save) => save.adventure_id)).size).toBe(1);
    const latest = first[0];
    expect(latest.save_type).toBe("autosave");
    await page.reload();
    await page.getByRole("button", { name: /^Continue/ }).click();
    const list = page.locator(".title-saves");
    await expect(list.locator(".title-adventure")).toHaveCount(1);
    await expect(
      list.locator(`button[data-save-id="${latest.id}"]`),
    ).toBeVisible();
    await expect(list.locator("time").first()).toHaveAttribute(
      "datetime",
      latest.updated_at,
    );
    await expect(list.locator(".save-label").first()).toContainText(
      "Most recent adventure · Autosave",
    );
    await expect(list.locator(".title-save:visible")).toHaveCount(1);
    await page.screenshot({
      path: new URL(`${width}-latest.png`, proof).pathname,
    });
    const summary = list.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(list.locator(".title-save:visible")).toHaveCount(9);
    await expect(summary).toContainText("8 older");
    await page.keyboard.press("Space");
    await expect(list.locator(".title-save:visible")).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(list.locator(".title-save:visible")).toHaveCount(9);
    await expect(list.locator("details .title-save").first()).toBeInViewport({
      ratio: 0.9,
    });
    await expect(list.locator("details .title-save").first()).toHaveAttribute(
      "aria-keyshortcuts",
      /Alt\+/,
    );
    await page.screenshot({
      path: new URL(`${width}-history.png`, proof).pathname,
    });
    await page.keyboard.press("Tab");
    const older = list.locator("details .title-save").first();
    await expect(older).toBeFocused();
    const olderID = await older.getAttribute("data-save-id");
    const loaded = page.waitForResponse(
      (r) =>
        r.url().includes(`/saves/${olderID}/load`) &&
        r.request().method() === "POST",
    );
    await page.keyboard.press("Enter");
    expect((await loaded).ok()).toBe(true);
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.reload();
    await page.getByRole("button", { name: /^Continue/ }).click();
    const newest = page.locator(`button[data-save-id="${latest.id}"]`);
    const resume = page.waitForResponse(
      (r) =>
        r.url().includes(`/saves/${latest.id}/load`) &&
        r.request().method() === "POST",
    );
    await page.keyboard.press(await newest.getAttribute("aria-keyshortcuts"));
    expect((await resume).ok()).toBe(true);
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    // A new campaign for this account must remain separate despite identical labels.
    await page.evaluate(
      (address) => window.__kithlandsTest.startQuickGame(address),
      email,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.saveGame("Cadott adventure"),
    );
    await page.reload();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await expect(page.locator(".title-adventure")).toHaveCount(2);
    await expect(page.locator(".title-save:visible")).toHaveCount(2);
    await page.screenshot({
      path: new URL(`${width}-two-adventures.png`, proof).pathname,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Player email")).toBeVisible();
  });
}
