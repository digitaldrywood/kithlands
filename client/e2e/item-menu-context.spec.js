import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const RUN_ID = Date.now();
const PROOF_DIR = path.join("tmp", `item-menu-context-${RUN_ID}`);

async function startItemGame(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [{ name: "Coach Bell", relation: "friendly" }],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      difficulty: "normal",
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
      ],
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.debugGiveItem("potion", 2, "World"),
  );
  const updates = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World").party.map((member, slot) => ({
      slot,
      hp: slot === 0 ? Math.max(1, Number(member.max_hp) - 8) : member.hp,
      mp: member.mp,
    })),
  );
  await page.evaluate(
    (vitals) => window.__kithlandsTest.setPartyVitals(vitals, "World"),
    updates,
  );
}

async function openItemMenu(page) {
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("ITEMS", "World"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "FIELD ITEMS"),
  );
}

async function visibleText(page, value) {
  return page.evaluate(
    (expected) =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((entry) => entry.text.includes(expected)),
    value,
  );
}

test("keeps item purpose visible and presents an explicit target step", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mkdir(PROOF_DIR, { recursive: true });
  await page.setViewportSize({ width: 800, height: 600 });
  await startItemGame(page);
  await openItemMenu(page);

  await expect
    .poll(() => visibleText(page, "Field · One injured ally"))
    .toBe(true);
  await expect
    .poll(() => visibleText(page, "Restores 30 HP to a single ally."))
    .toBe(true);
  await page.screenshot({
    path: path.join(PROOF_DIR, "item-field-detail-800x600.png"),
    fullPage: true,
  });

  await page.keyboard.press("Enter");
  await expect.poll(() => visibleText(page, "SELECT TARGET")).toBe(true);
  await expect.poll(() => visibleText(page, "Ayla")).toBe(true);
  await expect.poll(() => visibleText(page, "HP ")).toBe(true);
  await page.screenshot({
    path: path.join(PROOF_DIR, "item-target-picker-800x600.png"),
    fullPage: true,
  });

  await page.keyboard.press("Escape");
  await expect.poll(() => visibleText(page, "CHOOSE AN ITEM")).toBe(true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !window.__kithlandsTest.sceneFlags("World").menuOpen,
  );

  for (const [id, count] of [
    ["ether", 2],
    ["antidote", 1],
    ["phoenix_down", 1],
    ["tent", 1],
  ]) {
    await page.evaluate(
      ([itemID, quantity]) =>
        window.__kithlandsTest.debugGiveItem(itemID, quantity, "World"),
      [id, count],
    );
  }

  await openItemMenu(page);
  await expect.poll(() => visibleText(page, "5 usable items")).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(PROOF_DIR, "item-list-mobile-390x844.png"),
    fullPage: true,
  });
});
