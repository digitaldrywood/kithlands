import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const proof = new URL(`../tmp/modern-shop-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 720]) {
  test(`shop catalog and purchase at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/src/main.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()) + "\nwindow.__keyboardGame = game;",
      });
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    const catalog = await page.evaluate(async () => {
      const api = await import("/src/api.js");
      let gs = window.__kithlandsTest.gameState("World");
      gs = await api.transitionLocation(
        gs.id,
        "enter-settlement",
        gs.settlement_entry_node_id,
      );
      if (gs.error) throw new Error(gs.error);
      const door = gs.settlement_map.layers
        .flatMap((l) => l.objects || [])
        .find((o) =>
          o.properties?.some(
            (p) => p.name === "building_type" && p.value === "shop",
          ),
        );
      gs = await api.transitionLocation(gs.id, door.name);
      if (gs.error) throw new Error(gs.error);
      window.__kithlandsTest.startScene("Town", {
        gameState: gs,
        spawn: gs.current_location.interior,
      });
      return api.getShop(gs.id, gs.current_location.map_id);
    });
    await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));
    await expect(
      page.getByRole("region", { name: "Exploration controls" }),
    ).toHaveCount(0);
    const npc = await page.evaluate(
      () => window.__kithlandsTest.townNpcPositions("Town")[0],
    );
    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.teleportTownPlayer(x, y + 1),
      npc,
    );
    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((t) => t.text === "Leave Shop"),
    );
    await page.screenshot({
      path: new URL(`${width}-catalog.png`, proof).pathname,
    });
    const before = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/buy") && r.request().method() === "POST",
    );
    const buyKey = await page
      .locator(".shop-purchase")
      .getAttribute("aria-keyshortcuts");
    await page.keyboard.press(buyKey);
    const receipt = await response;
    const request = receipt.request().postDataJSON();
    const offer = catalog.shop_items.find(
      (item) => item.stock_id === request.stock_id,
    );
    expect(offer).toBeTruthy();
    const after = await receipt.json();
    expect(after.error).toBeFalsy();
    expect(after.gold).toBeLessThan(before.gold);
    await page.screenshot({
      path: new URL(`${width}-purchased.png`, proof).pathname,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Supplies", "Town"),
    );
    const supplyBefore = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    let supplyRequests = 0;
    await page.route("**/buy", async (route) => {
      supplyRequests++;
      const response = await route.fetch();
      // Delayed acknowledgement reproduces rapid-repeat purchase input.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ response });
    });
    const supplyReceipt = page.waitForResponse((r) => r.url().endsWith("/buy"));
    await page.getByRole("button", { name: /^Smithing charcoal/ }).click();
    const supplyKey = await page
      .locator(".shop-purchase")
      .getAttribute("aria-keyshortcuts");
    await page.keyboard.press(supplyKey);
    await page.keyboard.press(supplyKey);
    const supplied = await (await supplyReceipt).json();
    await expect(page.locator(".kith-shop")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(supplied.error).toBeFalsy();
    expect(supplyRequests).toBe(1);
    expect(supplied.gold).toBe(supplyBefore.gold - 6);
    expect(supplied.materials.find((m) => m.id === "charcoal").count).toBe(1);
    await page.screenshot({
      path: new URL(`${width}-supplies-keyboard-purchase.png`, proof).pathname,
    });
    // Reusable supplies must keep their selection while receiving a fresh quote.
    await page.getByRole("button", { name: /^Forge flux/ }).click();
    const fluxReceipt = page.waitForResponse((r) => r.url().endsWith("/buy"));
    await page.locator(".shop-purchase").click();
    const flux = await (await fluxReceipt).json();
    expect(flux.error).toBeFalsy();
    expect(flux.gold).toBe(supplied.gold - 12);
    await expect(page.locator(".kith-shop")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.locator(".shop-preview h2")).toHaveText("Forge flux");
    expect(flux.materials.find((m) => m.id === "forge_flux").count).toBe(1);
    await page.getByRole("button", { name: /^Leave Shop/ }).click();
    await page.waitForFunction(
      () =>
        !window.__kithlandsTest.sceneFlags("Town").modalLocks.includes("shop"),
    );
  });
}
