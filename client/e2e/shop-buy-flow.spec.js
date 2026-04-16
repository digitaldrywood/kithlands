import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.join(SPEC_DIR, "tmp");

mkdirSync(PROOF_DIR, { recursive: true });

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startShopGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [
        { name: "Coach Bell", relation: "friendly" },
        { name: "Ms Rivera", relation: "neutral" },
        { name: "Mallory", relation: "rival" },
      ],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
      ],
      difficulty: "normal",
      spawn_node_id: "shop",
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function visitShop(page) {
  await page.evaluate(() =>
    window.__kithlandsTest.startTownScene({
      node_id: "shop",
      name: "General Store",
      tags: ["commerce", "shop"],
    }),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Town"),
  );
  await page.waitForTimeout(200);

  const npc = await page.evaluate(
    () => window.__kithlandsTest.townNpcPositions("Town")[0],
  );
  await page.waitForFunction(
    ({ x, y }) =>
      window.__kithlandsTest.teleportTownPlayer(x, y + 1).nearNpcIndex === 0,
    npc,
  );

  await page.evaluate(() => window.__kithlandsTest.interact("Town"));
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Town")
      .some((entry) => entry.interactive && entry.text.includes("[BUY]")),
  );
}

async function addProofOverlay(page, details) {
  await page.evaluate((payload) => {
    const existing = document.getElementById("shop-buy-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "shop-buy-proof";
    panel.style.position = "fixed";
    panel.style.top = "8px";
    panel.style.left = "8px";
    panel.style.zIndex = "9999";
    panel.style.background = "rgba(15, 23, 42, 0.92)";
    panel.style.color = "#e2e8f0";
    panel.style.padding = "10px 12px";
    panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
    panel.style.borderRadius = "8px";
    panel.style.fontFamily = "monospace";
    panel.style.fontSize = "12px";
    panel.style.whiteSpace = "pre";
    panel.textContent = [
      payload.label,
      `Item: ${payload.itemID}`,
      `Request type: ${payload.requestType}`,
      `Response error: ${payload.error || "(none)"}`,
      `Gold: ${payload.gold}`,
      `Items: ${payload.itemNames.join(", ") || "(none)"}`,
      `Toast: ${payload.message || "(hidden)"}`,
    ].join("\n");
    document.body.appendChild(panel);
  }, details);
}

test.describe("shop buy flow", () => {
  test("buying a weapon from the default shop tab succeeds", async ({
    page,
  }) => {
    await startShopGame(page);
    await visitShop(page);

    const before = await page.evaluate(() => ({
      gold: window.__kithlandsTest.gameState("Town").gold,
      items: window.__kithlandsTest.gameState("Town").items || [],
    }));
    expect(before.gold).toBe(100);

    const buyRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/api/game/") && request.url().endsWith("/buy"),
    );
    const buyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/game/") &&
        response.url().endsWith("/buy"),
    );

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("[BUY]", "Town"),
    );

    const buyRequest = await buyRequestPromise;
    const buyResponse = await buyResponsePromise;
    const requestBody = JSON.parse(buyRequest.postData() || "{}");
    const responseBody = await buyResponse.json();

    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
      const gs = window.__kithlandsTest.gameState("Town");
      return {
        gold: gs.gold,
        items: gs.items || [],
        message: window.__kithlandsTest.messageState("Town").text,
      };
    });

    const screenshotState = responseBody.error ? "before" : "after";
    await addProofOverlay(page, {
      label:
        screenshotState === "before"
          ? "Original broken weapon buy path"
          : "Working weapon buy path",
      itemID: requestBody.item_id,
      requestType: requestBody.type,
      error: responseBody.error || "",
      gold: after.gold,
      itemNames: after.items.map((item) => item.name),
      message: after.message,
    });
    await page.screenshot({
      path: path.join(
        PROOF_DIR,
        `issue-203-shop-buy-${screenshotState}-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    expect(requestBody).toMatchObject({
      item_id: "short_bow",
      type: "weapon",
    });
    expect(responseBody.error).toBeFalsy();
    expect(after.gold).toBe(88);
    expect(after.items.some((item) => item.id === "wpn_short_bow")).toBe(true);
    expect(after.message).toContain("Bought: Short Bow!");
  });
});
