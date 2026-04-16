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
        { name: "Cato", class_id: "cinder" },
        { name: "Nia", class_id: "rogue" },
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
      .some((entry) => entry.text === "[ LEAVE SHOP (ESC) ]"),
  );
}

async function addProofOverlay(page, label) {
  await page.evaluate((stepLabel) => {
    const existing = document.getElementById("issue-205-proof");
    if (existing) existing.remove();

    const flags = window.__kithlandsTest.sceneFlags("Town");
    const visible = window.__kithlandsTest
      .visibleTexts("Town")
      .map((entry) => entry.text)
      .filter((text) =>
        [
          "General Store",
          "PARTY MENU",
          "Weapons",
          "Armor",
          "Items",
          "Spells",
          "Cloth Robe",
          "Choose a party member.",
          "[ LEAVE SHOP (ESC) ]",
        ].includes(text),
      );

    const panel = document.createElement("div");
    panel.id = "issue-205-proof";
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
      stepLabel,
      `menuOpen: ${flags.menuOpen}`,
      `characterDetailOpen: ${flags.characterDetailOpen}`,
      `visible: ${visible.join(" | ") || "(none)"}`,
    ].join("\n");
    document.body.appendChild(panel);
  }, label);
}

function visibleTexts(page) {
  return page.evaluate(() =>
    window.__kithlandsTest.visibleTexts("Town").map((entry) => entry.text),
  );
}

test.describe("shop overlay party menu", () => {
  test("keeps the shop open while party and character menus are used on top", async ({
    page,
  }) => {
    await startShopGame(page);
    await visitShop(page);

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Armor", "Town"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text.includes("Cloth Robe")),
    );

    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("Town").menuOpen,
    );

    let texts = await visibleTexts(page);
    expect(texts).toContain("PARTY MENU");
    expect(texts).toContain("General Store");
    expect(texts.some((text) => text.includes("Cloth Robe"))).toBe(true);

    await addProofOverlay(page, "Shop with party menu open");
    await page.screenshot({
      path: path.join(
        PROOF_DIR,
        `issue-205-shop-party-menu-open-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CHARACTER", "Town"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("Town").characterDetailOpen,
    );

    texts = await visibleTexts(page);
    expect(texts).toContain("Ayla");
    expect(texts).toContain("General Store");

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Town").characterDetailOpen,
    );

    texts = await visibleTexts(page);
    expect(texts).not.toContain("PARTY MENU");
    expect(texts).toContain("General Store");
    expect(texts.some((text) => text.includes("Cloth Robe"))).toBe(true);
    expect(texts).toContain("[ LEAVE SHOP (ESC) ]");

    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("Town").menuOpen,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Town").menuOpen,
    );

    texts = await visibleTexts(page);
    expect(texts).toContain("General Store");
    expect(texts.some((text) => text.includes("Cloth Robe"))).toBe(true);

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Items", "Town"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text.includes("Potion")),
    );
    texts = await visibleTexts(page);
    expect(texts.some((text) => text.includes("Potion"))).toBe(true);
    expect(texts.some((text) => text.includes("Cloth Robe"))).toBe(false);

    await addProofOverlay(page, "Shop still usable after menu close");
    await page.screenshot({
      path: path.join(
        PROOF_DIR,
        `issue-205-shop-party-menu-closed-${RUN_ID}.png`,
      ),
      fullPage: true,
    });
  });
});
