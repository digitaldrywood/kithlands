import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const proofDir = path.join("tmp", `promotion-options-${Date.now()}`);
async function capture(page, name) {
  await mkdir(proofDir, { recursive: true });
  await page.screenshot({ path: path.join(proofDir, `${name}.png`) });
}
async function start(page, count = 4) {
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.evaluate(
    (count) =>
      window.__kithlandsTest.startCustomGame({
        town_name: "Cadott, WI",
        people: [{ name: "Coach Bell", relation: "friendly" }],
        places: ["General Store", "Library", "Fire Hall"],
        big_building: "Town Hall",
        difficulty: "normal",
        party: [
          { name: "Ayla", class_id: "warrior" },
          { name: "Mira", class_id: "mender" },
          { name: "Nia", class_id: "rogue" },
          { name: "Cato", class_id: "cinder" },
        ].slice(0, count),
      }),
    count,
  );
}
async function menuOpen(page, open) {
  await page.waitForFunction(
    (open) => !!window.__kithlandsTest.sceneFlags("World").menuOpen === open,
    open,
  );
}
async function options(page) {
  await page.keyboard.press("m");
  await menuOpen(page, true);
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("OPTIONS", "World"),
  );
  await expect(
    page.getByRole("dialog", { name: "Options", exact: true }),
  ).toBeVisible();
}
async function promotion(page, metadata = true) {
  // Real Go quest progression; existing debug helpers skip earlier quests
  // and resolve the guardian, but the UI submits real promotion requests.
  await page.evaluate(async () => {
    const api = await import("/src/api.js");
    let gs = window.__kithlandsTest.gameState("World");
    const index = gs.quests.findIndex((q) => q.is_promotion);
    if (index < 0) throw new Error("No promotion quest");
    gs = await api.debugWarpQuest(gs.id, index);
    for (let i = 0; i < 20 && gs.phase !== "promotion"; i++) {
      if (gs.phase === "combat") gs = await api.debugForceVictory(gs.id);
      else
        gs = await api.gameAction(
          gs.id,
          gs.phase === "quest_complete"
            ? { type: "advance" }
            : {
                type: "quest_advance",
                node_id: gs.quests[gs.current_quest].target_node_id,
              },
        );
      if (gs.error) throw new Error(gs.error);
    }
    if (gs.phase !== "promotion")
      throw new Error(`Unexpected phase ${gs.phase}`);
    window.__kithlandsTest.startScene("World", { gameState: gs });
  });
  await expect(
    page.getByRole("dialog", { name: "Class Promotion" }),
  ).toBeVisible();
  await expect(page.locator(".promotion-member").first()).toContainText(
    metadata ? "Knight" : "Advanced class",
  );
}
async function fits(page, selector) {
  const viewport = page.viewportSize();
  for (const node of await page.locator(selector).all()) {
    const box = await node.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    const body = await node.evaluate((node) => {
      const body = node.closest(".viewport-dialog-body");
      if (!body) return null;
      const rect = body.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    if (body) {
      expect(box.y).toBeGreaterThanOrEqual(body.top);
      expect(box.y + box.height).toBeLessThanOrEqual(body.bottom);
    }
  }
  expect(
    await page
      .locator(".viewport-dialog-panel")
      .evaluate((p) => p.scrollWidth <= p.clientWidth),
  ).toBe(true);
}
async function ready(page) {
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneAuditInfo("World").playerActive,
  );
}
for (const [width, height, count] of [
  [390, 844, 4],
  [375, 667, 4],
  [800, 600, 2],
  [1440, 900, 3],
]) {
  const size = `${width}x${height}`;
  test(`Options and promotion at ${size}`, async ({ browser, baseURL }) => {
    test.setTimeout(90000);
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height },
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await start(page, count);
    const canvasBounds = await page.locator("canvas").boundingBox();
    const before = await page
      .locator("canvas")
      .evaluate((c) => [c.width, c.height]);
    await options(page);
    await fits(page, ".options-row, .viewport-dialog-footer button");
    await capture(page, `options-${size}`);
    await page.evaluate(async () => {
      const p = await import("/src/systems/prefs.js");
      p.setBattleSpeed(3);
      p.setMessageSpeed(3);
    });
    const battle = page.locator('[data-option="battle"] output');
    await page.getByRole("button", { name: "Increase battle speed" }).tap();
    await expect(battle).toHaveText("4 / 6");
    await page.keyboard.press("ArrowLeft");
    await expect(battle).toHaveText("3 / 6");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-option="message"] output')).toHaveText(
      "4 / 6",
    );
    await page.keyboard.press("Escape");
    await menuOpen(page, true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await capture(page, `party-return-${size}`);
    await page.keyboard.press("Escape");
    await menuOpen(page, false);
    expect(
      await page.locator("canvas").evaluate((c) => [c.width, c.height]),
    ).toEqual(before);
    await options(page);
    await expect(battle).toHaveText("3 / 6");
    await page.getByRole("button", { name: "Back to Party" }).tap();
    await page.keyboard.press("Escape");
    await menuOpen(page, false);
    await expect
      .poll(() => page.locator("canvas").boundingBox())
      .toEqual(canvasBounds);
    await capture(page, `world-return-${size}`);
    await promotion(page);
    await expect(page.locator(".promotion-member")).toHaveCount(count);
    await fits(
      page,
      ".promotion-member, .promotion-effects, .dialog-actions button",
    );
    expect(
      await page
        .locator(".viewport-dialog-header p")
        .evaluate((p) => parseFloat(getComputedStyle(p).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    for (const button of await page.locator(".dialog-actions button").all())
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await capture(page, `promotion-${size}`);
    const accept = width !== 800;
    await page
      .getByRole("button", {
        name: accept ? "Claim Promotion" : "Skip",
        exact: true,
      })
      .tap();
    await expect(page.getByRole("dialog")).toHaveAccessibleName(
      accept ? "Promotion Claimed" : "Staying the Course",
    );
    expect(
      await page.evaluate(() =>
        window.__kithlandsTest
          .gameState("World")
          .party.every((m) => m.promoted),
      ),
    ).toBe(accept);
    await capture(page, `promotion-result-${size}`);
    await page.getByRole("button", { name: "Continue Journey" }).tap();
    await ready(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("m");
    await menuOpen(page, true);
    expect(errors).toEqual([]);
    await context.close();
  });
}
test("promotion retries server and network errors and reconciles a lost successful reply", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await promotion(page);
  const pattern = "**/api/game/*/promote";
  let posts = 0,
    release;
  await page.route(pattern, async (route) => {
    posts++;
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Promotion is temporarily unavailable." }),
    });
  });
  const claim = page.getByRole("button", { name: "Claim Promotion" });
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  await claim.click();
  await expect.poll(() => posts).toBe(1);
  await expect(claim).toBeDisabled();
  await expect(skip).toBeDisabled();
  await claim.dispatchEvent("click");
  expect(posts).toBe(1);
  release();
  await expect(page.getByRole("status")).toContainText("Try again");
  await expect(claim).toBeEnabled();
  await capture(page, "promotion-server-error-390x844");
  await page.unroute(pattern);
  await page.route(pattern, (route) => route.abort("failed"));
  await claim.click();
  await expect(page.getByRole("status")).toContainText("Try again");
  await expect(skip).toBeEnabled();
  await page.unroute(pattern);
  await page.route(pattern, async (route) => {
    posts++;
    await route.fetch();
    await route.abort("failed");
  });
  await claim.click();
  await expect(page.getByRole("status")).toContainText("Try again");
  await skip.click();
  await expect(
    page.getByRole("dialog", { name: "Promotion Claimed" }),
  ).toBeVisible();
  expect(posts).toBe(2);
  await capture(page, "promotion-recovered-390x844");
  await page.getByRole("button", { name: "Continue Journey" }).click();
  await ready(page);
});
test("Options orientation, focus, and scene shutdown cleanup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await start(page, 2);
  await options(page);
  await page.setViewportSize({ width: 667, height: 375 });
  await fits(page, ".viewport-dialog-footer button");
  await page.locator('[data-option="cinematics"]').scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Decrease long cinematics" }).click();
  await expect(page.locator('[data-option="cinematics"] output')).toHaveText(
    "ONCE",
  );
  await capture(page, "options-landscape-667x375");
  await page.getByRole("button", { name: "Back to Party" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-option="battle"]')).toBeFocused();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole("button", { name: "Back to Party" }).click();
  await page.keyboard.press("Escape");
  await options(page);
  await page.evaluate(() =>
    window.__kithlandsTest.startScene("World", {
      gameState: window.__kithlandsTest.gameState("World"),
    }),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await ready(page);
  await options(page);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await menuOpen(page, false);
});

test("promotion timeout restores actions and missing metadata does not block play", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 375, height: 667 });
  await start(page, 2);
  await page.route("**/api/data/classes", (route) => route.abort("failed"));
  await promotion(page, false);
  let stalled;
  await page.route("**/api/game/*/promote", (route) => {
    stalled = route;
  });
  await page.getByRole("button", { name: "Claim Promotion" }).click();
  await expect(page.getByRole("status")).toContainText(
    "connection took too long",
    { timeout: 15000 },
  );
  await expect(
    page.getByRole("button", { name: "Skip", exact: true }),
  ).toBeEnabled();
  await capture(page, "promotion-timeout-375x667");
  await stalled.abort("failed");
  await page.unroute("**/api/game/*/promote");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Staying the Course" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue Journey" }).click();
  await ready(page);
});
