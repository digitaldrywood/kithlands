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
  await page.evaluate(() =>
    window.__kithlandsTest.setPartyLevels(
      [
        { slot: 0, level: 5 },
        { slot: 1, level: 5 },
        { slot: 2, level: 5 },
        { slot: 3, level: 5 },
      ],
      "World",
    ),
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
      .some((entry) => entry.text === "Leave Shop"),
  );
}

async function visibleTexts(page, sceneKey = "Town") {
  return page.evaluate(
    (key) =>
      window.__kithlandsTest.visibleTexts(key).map((entry) => entry.text),
    sceneKey,
  );
}

async function addProofOverlay(page, label) {
  await page.evaluate((stepLabel) => {
    const existing = document.getElementById("shop-compare-proof");
    if (existing) existing.remove();

    const state = window.__kithlandsTest.gameState("Town");
    const equip = state?.equipment || [];
    const toast = window.__kithlandsTest.messageState("Town");
    const texts = window.__kithlandsTest
      .visibleTexts("Town")
      .map((entry) => entry.text)
      .filter((text) =>
        [
          "General Store",
          "Silk Robe",
          "Mira · Mender · Lv.5",
          "Nia",
          "Abs +2",
          "MDef +3",
          "Leave Shop",
        ].includes(text),
      );

    const panel = document.createElement("div");
    panel.id = "shop-compare-proof";
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
      `Gold: ${state?.gold ?? "?"}`,
      `Mira armor: ${equip?.[1]?.armor_name || "(none)"}`,
      `Ayla weapon: ${equip?.[0]?.weapon_name || "(none)"}`,
      `Toast: ${toast.visible ? toast.text : "(hidden)"}`,
      `Visible: ${texts.join(" | ") || "(none)"}`,
    ].join("\n");
    document.body.appendChild(panel);
  }, label);
}

test.describe("shop compare flow", () => {
  test("shows per-member compare deltas, cycles members, buys, and keeps equip picker working", async ({
    page,
  }) => {
    await startShopGame(page);
    await visitShop(page);

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Wooden Staff", "Town"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text === "Ill suited to this path"),
    );
    let texts = await visibleTexts(page);
    expect(texts).toContain("Ayla · Warrior · Lv.5");
    expect(texts).toContain("May not wield");
    await page.screenshot({
      path: path.join(
        PROOF_DIR,
        `issue-202-shop-cycle-locked-before-${RUN_ID}.png`,
      ),
      fullPage: true,
    });

    const nextArrow = await page.evaluate(() =>
      window.__kithlandsTest.interactiveTextPosition(">", "Town"),
    );
    expect(nextArrow).toBeTruthy();
    await page.mouse.click(nextArrow.x + 24, nextArrow.y);
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text === "Mira · Mender · Lv.5"),
    );
    texts = await visibleTexts(page);
    expect(texts).toContain("May equip");
    expect(texts).toContain("Buy for Mira");
    await page.screenshot({
      path: path.join(PROOF_DIR, `issue-202-shop-cycle-locked-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Armor", "Town"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text.includes("Silk Robe")),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Silk Robe", "Town"),
    );

    texts = await visibleTexts(page);
    const indicatorCount = texts.filter((text) =>
      ["▲", "▼", "=", "-"].includes(text),
    ).length;
    expect(indicatorCount).toBeGreaterThanOrEqual(4);
    expect(texts).toContain("Silk Robe");

    texts = await visibleTexts(page);
    expect(texts).toContain("Mira · Mender · Lv.5");
    expect(texts).toContain("Current: Cloth Robe");
    expect(texts).toContain("Preview: Silk Robe");
    expect(texts).toContain("Absorb: 2 to 4");
    expect(texts).toContain("Abs +2");
    expect(texts).toContain("MagicDef: 2 to 5");
    expect(texts).toContain("MDef +3");

    await addProofOverlay(page, "Compare panel focused on Mira");
    await page.screenshot({
      path: path.join(PROOF_DIR, `issue-202-shop-compare-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Buy for Mira", "Town"),
    );
    await page.waitForFunction(() => {
      const state = window.__kithlandsTest.gameState("Town");
      return (
        state?.gold === 20 && state?.equipment?.[1]?.armor_name === "Silk Robe"
      );
    });

    const afterBuy = await page.evaluate(() => {
      const state = window.__kithlandsTest.gameState("Town");
      return {
        gold: state.gold,
        miraArmor: state.equipment?.[1]?.armor_name,
      };
    });
    expect(afterBuy.gold).toBe(20);
    expect(afterBuy.miraArmor).toBe("Silk Robe");

    const extraBuy = await page.evaluate(() =>
      window.__kithlandsTest.buyItem("hand_axe", "weapon", "Town"),
    );
    expect(extraBuy.error).toBeFalsy();

    await page.evaluate(() => window.__kithlandsTest.openCharacterDetail(0, "Town"));
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("Town").characterDetailOpen,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickCharacterDetailSlot("WEAPON", "Town"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text.includes("Hand Axe")),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Hand Axe", "Town"),
    );
    await page.waitForFunction(() => {
      const state = window.__kithlandsTest.gameState("Town");
      return state?.equipment?.[0]?.weapon_name === "Hand Axe";
    });

    const afterEquip = await page.evaluate(() => {
      const state = window.__kithlandsTest.gameState("Town");
      return {
        aylaWeapon: state.equipment?.[0]?.weapon_name,
      };
    });
    expect(afterEquip.aylaWeapon).toBe("Hand Axe");

    await addProofOverlay(page, "Character detail equip path still works");
    await page.screenshot({
      path: path.join(PROOF_DIR, `issue-202-shop-equip-path-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Town").characterDetailOpen,
    );
    texts = await visibleTexts(page);
    expect(texts).toContain("General Store");
    expect(texts).toContain("Leave Shop");
  });
});
