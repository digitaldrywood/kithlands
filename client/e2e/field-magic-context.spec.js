import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const RUN_ID = Date.now();
const PROOF_DIR = path.join("tmp", `field-magic-context-${RUN_ID}`);

async function startFieldMagicGame(page) {
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
        { name: "Mira", class_id: "mender" },
        { name: "Ayla", class_id: "warrior" },
      ],
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  const updates = await page.evaluate(() =>
    window.__kithlandsTest.gameState("World").party.map((member, slot) => ({
      slot,
      hp: slot === 1 ? Math.max(1, Number(member.max_hp) - 8) : member.hp,
      mp: member.mp,
    })),
  );
  await page.evaluate(
    (vitals) => window.__kithlandsTest.setPartyVitals(vitals, "World"),
    updates,
  );
}

async function clickFieldMagicRow(page, label) {
  await page.waitForFunction(
    (text) => !!window.__kithlandsTest.fieldMagicRowPosition(text, "World"),
    label,
  );
  const position = await page.evaluate(
    (text) => window.__kithlandsTest.fieldMagicRowPosition(text, "World"),
    label,
  );
  expect(position).toBeTruthy();
  await page.mouse.click(position.x, position.y);
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

test("keeps spell cost, purpose, and target validity visible", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mkdir(PROOF_DIR, { recursive: true });
  await page.setViewportSize({ width: 800, height: 600 });
  await startFieldMagicGame(page);

  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("MAGIC", "World"),
  );
  await clickFieldMagicRow(page, "Mira");

  await expect.poll(() => visibleText(page, "SELECT SPELL")).toBe(true);
  await expect
    .poll(() => visibleText(page, "Restore ~16 HP to one ally"))
    .toBe(true);
  await expect.poll(() => visibleText(page, "MP · One ally")).toBe(true);
  await page.screenshot({
    path: path.join(PROOF_DIR, "field-magic-spell-context-800x600.png"),
    fullPage: true,
  });

  await clickFieldMagicRow(page, "Cure");
  await expect.poll(() => visibleText(page, "SELECT TARGET")).toBe(true);
  await expect.poll(() => visibleText(page, "Ayla: HP")).toBe(true);
  await expect.poll(() => visibleText(page, "valid target")).toBe(true);
  await page.screenshot({
    path: path.join(PROOF_DIR, "field-magic-target-context-800x600.png"),
    fullPage: true,
  });

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("MAGIC", "World"),
  );
  await clickFieldMagicRow(page, "Mira");
  await clickFieldMagicRow(page, "Cure");
  await expect.poll(() => visibleText(page, "SELECT TARGET")).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__kithlandsTest.menuOverlaySummary("magic", "World"),
      ),
    )
    .toMatchObject({
      layoutMode: "mobile",
      logicalSize: { width: 800, height: 1600 },
      panelBounds: { width: 760, height: 1460 },
      backBounds: { width: 680, height: 94 },
    });
  const targetSummary = await page.evaluate(() =>
    window.__kithlandsTest.menuOverlaySummary("magic", "World"),
  );
  expect(targetSummary.rows).toHaveLength(2);
  expect(targetSummary.rows.every((row) => row.bounds.height >= 80)).toBe(true);
  await page.screenshot({
    path: path.join(PROOF_DIR, "field-magic-target-mobile-390x844.png"),
    fullPage: true,
  });

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneFlags("World").menuOpen,
  );
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(() => window.__kithlandsTest.logicalGameSize("World")),
    )
    .toEqual({ width: 800, height: 600 });
});
