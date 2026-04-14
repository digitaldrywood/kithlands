import { test } from "@playwright/test";

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

async function addVitalsOverlay(page, label) {
  await page.evaluate((overlayLabel) => {
    const existing = document.getElementById("house-rest-proof");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "house-rest-proof";
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

    const gs =
      window.__kithlandsTest.gameState("Town") ||
      window.__kithlandsTest.gameState("World");
    const party = (gs?.party || []).slice(0, 2);
    panel.textContent = [
      overlayLabel,
      ...party.map(
        (member, idx) =>
          `P${idx + 1} ${member.name}: HP ${member.hp}/${member.max_hp}  MP ${member.mp}/${member.max_mp}`,
      ),
    ].join("\n");
    document.body.appendChild(panel);
  }, label);
}

test.describe("house rest flow", () => {
  test("house proprietor restores HP and MP with visual proof", async ({ page }) => {
    await startQuickGame(page);

    await page.evaluate(() =>
      window.__kithlandsTest.setPartyVitals(
        [
          { slot: 0, hp: 1, mp: 0 },
          { slot: 1, hp: 2, mp: 0 },
        ],
        "World",
      ),
    );

    await page.evaluate(() =>
      window.__kithlandsTest.startTownScene({
        node_id: "proof_house",
        name: "Home",
        tags: ["house"],
      }),
    );
    await page.waitForFunction(() => window.__kithlandsTest.sceneIsActive("Town"));

    const proprietor = await page.evaluate(
      () => window.__kithlandsTest.townNpcPositions("Town")[0],
    );
    await page.waitForFunction(
      ({ x, y }) => window.__kithlandsTest.teleportTownPlayer(x, y + 1).nearNpcIndex === 0,
      proprietor,
    );

    await addVitalsOverlay(page, "BEFORE: house rest");
    await page.screenshot({
      path: "tmp/house-rest-before.png",
      fullPage: true,
    });

    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    await page.waitForFunction(() => {
      const gs = window.__kithlandsTest.gameState("Town");
      return (
        gs.party[0].hp === gs.party[0].max_hp &&
        gs.party[0].mp === gs.party[0].max_mp &&
        gs.party[1].hp === gs.party[1].max_hp &&
        gs.party[1].mp === gs.party[1].max_mp
      );
    });
    await page.waitForFunction(() =>
      (window.__kithlandsTest.visibleTexts("Town") || []).some((entry) =>
        entry.text.includes("HP and spells restored!"),
      ),
    );

    await addVitalsOverlay(page, "AFTER: house rest");
    await page.screenshot({
      path: "tmp/house-rest-after.png",
      fullPage: true,
    });
  });
});
