import { test, expect } from "@playwright/test";

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

test.describe("inn interior layout", () => {
  test("rest buildings get a roomy inn layout with distinct occupants", async ({
    page,
  }) => {
    await startQuickGame(page);

    await page.evaluate(() =>
      window.__kithlandsTest.startTownScene({
        node_id: "proof_inn",
        name: "Copper Kettle Inn",
        tags: ["rest"],
      }),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest.sceneIsActive("Town"),
    );

    const details = await page.evaluate(() =>
      window.__kithlandsTest.townSnapshot("Town"),
    );

    expect(details.roomW).toBe(20);
    expect(details.roomH).toBe(14);
    expect(details.npcKeys[0]).toBe("npc_innkeeper");
    expect(new Set(details.npcKeys).size).toBe(details.npcKeys.length);

    await page.screenshot({
      path: "tmp/inn-layout-proof.png",
      fullPage: true,
    });
  });
});
