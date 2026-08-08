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
  await page.waitForFunction(() => {
    const title = window.__kithlandsTest.sceneAuditInfo?.("Title");
    return title?.key === "Title" && title?.active;
  });
}

async function startShopInterior(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [{ name: "Coach Bell", relation: "friendly" }],
      places: ["General Store"],
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

  const npc = await page.evaluate(
    () => window.__kithlandsTest.townNpcPositions("Town")[0],
  );
  await page.waitForFunction(
    ({ x, y }) =>
      window.__kithlandsTest.teleportTownPlayer(x, y + 1).nearNpcIndex === 0,
    npc,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Town")
      .some((entry) => entry.text.includes("ENTER / SPACE")),
  );
}

test.describe("town keyboard interaction", () => {
  test("space starts NPC dialogue from the talk prompt", async ({ page }) => {
    await startShopInterior(page);

    await page.keyboard.press("Space");
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some(
          (entry) =>
            entry.text === "Merchant" ||
            entry.text.includes("Welcome") ||
            entry.text.includes("wares"),
        ),
    );

    const texts = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Town").map((entry) => entry.text),
    );
    expect(texts.some((text) => text === "Merchant")).toBe(true);

    await page.screenshot({
      path: path.join(PROOF_DIR, `town-space-dialog-${RUN_ID}.png`),
      fullPage: true,
    });
  });
});
