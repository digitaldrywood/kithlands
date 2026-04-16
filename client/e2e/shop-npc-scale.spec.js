import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();
const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROOF_DIR = path.join(SPEC_DIR, "tmp");

mkdirSync(PROOF_DIR, { recursive: true });

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startQuickGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

test.describe("shop interior NPC scale", () => {
  test("renders shop NPCs at interior scale instead of overworld scale", async ({
    page,
  }) => {
    await startQuickGame(page);

    await page.locator("canvas").screenshot({
      path: path.join(PROOF_DIR, `issue-206-shop-before-${RUN_ID}.png`),
    });

    await page.evaluate(() =>
      window.__kithlandsTest.startTownScene({
        node_id: "issue-206-shop",
        name: "Drywood Goods",
        tags: ["shop", "commerce"],
      }),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest.sceneIsActive("Town"),
    );
    await page.waitForTimeout(200);

    const snapshot = await page.evaluate(() =>
      window.__kithlandsTest.townSnapshot("Town"),
    );

    expect(snapshot.buildingType).toBe("shop");
    expect(snapshot.npcScales.length).toBeGreaterThan(0);
    for (const scale of snapshot.npcScales) {
      expect(scale).toBeCloseTo(0.5, 5);
    }
    for (const height of snapshot.npcDisplayHeights) {
      expect(height).toBeLessThanOrEqual(64);
    }
    expect(snapshot.playerScale).toBeCloseTo(0.5, 5);

    await page.locator("canvas").screenshot({
      path: path.join(PROOF_DIR, `issue-206-shop-after-${RUN_ID}.png`),
    });
  });
});
