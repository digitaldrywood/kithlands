import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();
const PROOF_DIR = path.resolve("tmp", "overworld-landmarks", `proof-${RUN_ID}`);
const VIEWPORTS = [
  { label: "1440x900", width: 1440, height: 900 },
  { label: "800x600", width: 800, height: 600 },
  { label: "390x844", width: 390, height: 844 },
];
const EXPECTED_FAMILIES = [
  "isolated_home",
  "natural_grove",
  "ruined_dungeon",
  "settlement_home",
  "temple",
];

mkdirSync(PROOF_DIR, { recursive: true });
test.use({ hasTouch: true });
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function startGame(page, label) {
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
  await page.evaluate(
    (email) => window.__kithlandsTest.startQuickGame(email),
    `overworld-landmarks-${label}-${RUN_ID}@kithlands.dev`,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
}

async function capture(page, label, stage) {
  await page.screenshot({
    path: path.join(PROOF_DIR, `issue-268-${label}-${stage}-${RUN_ID}.png`),
    fullPage: true,
  });
}

async function markerSnapshot(page) {
  return page.evaluate(() => window.__kithlandsTest.worldLandmarkSnapshot());
}

function markerFingerprint(markers) {
  return markers.map(({ nodeId, family, variantId, key, x, y, badges }) => ({
    nodeId,
    family,
    variantId,
    key,
    x,
    y,
    badges: badges.map(({ dungeonId, id, key: badgeKey, x: bx, y: by }) => ({
      dungeonId,
      id,
      key: badgeKey,
      x: bx,
      y: by,
    })),
  }));
}

async function focusMarker(page, marker) {
  await page.evaluate((nodeId) => {
    window.__kithlandsTest.approachWorldSpawn(nodeId);
    return window.__kithlandsTest.centerCameraOnPlayer("World");
  }, marker.nodeId);
  await page.waitForTimeout(120);
}

async function tapLogicalPoint(page, x, y) {
  const canvas = page.locator("canvas");
  const [box, size] = await Promise.all([
    canvas.boundingBox(),
    page.evaluate(() => window.__kithlandsTest.logicalGameSize("World")),
  ]);
  if (!box) throw new Error("Game canvas is missing");
  await page.touchscreen.tap(
    box.x + (x / size.width) * box.width,
    box.y + (y / size.height) * box.height,
  );
}

async function activateTouchControls(page) {
  const layout = await page.evaluate(() =>
    window.__kithlandsTest.gameplayViewportSnapshot("World"),
  );
  await tapLogicalPoint(page, layout.action.x, layout.action.y);
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("World")
      .some((entry) => entry.text === "A"),
  );
}

test("authored registry renders every family and both adventure badges", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startGame(page, "1440x900");

  const initial = await markerSnapshot(page);
  expect([...new Set(initial.map((marker) => marker.family))].sort()).toEqual(
    EXPECTED_FAMILIES,
  );
  expect(initial).toHaveLength(
    await page.evaluate(
      () => window.__kithlandsTest.worldNavigationSnapshot().spawns.length,
    ),
  );
  expect(
    initial.every((marker) => marker.width === 64 && marker.height === 64),
  ).toBe(true);
  expect(initial.every((marker) => marker.depth === 2)).toBe(true);

  const badges = initial.flatMap((marker) => marker.badges);
  expect(badges.map((badge) => badge.id).sort()).toEqual([
    "badge-forgotten-shrine",
    "badge-old-mill",
  ]);
  expect(badges.every((badge) => badge.depth === 3)).toBe(true);

  const redrawn = await page.evaluate(() => {
    window.__kithlandsTest.redrawWorldMap();
    return window.__kithlandsTest.redrawWorldMap();
  });
  expect(markerFingerprint(redrawn)).toEqual(markerFingerprint(initial));

  for (const family of EXPECTED_FAMILIES) {
    const marker = initial.find((candidate) => candidate.family === family);
    await focusMarker(page, marker);
    await capture(page, "1440x900", family.replaceAll("_", "-"));
  }
  expect(pageErrors).toEqual([]);
});

test("Cadott round trip and save reload preserve landmark identity", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 800, height: 600 });
  await startGame(page, "800x600");

  const before = markerFingerprint(await markerSnapshot(page));
  const central = (await markerSnapshot(page)).find(
    (marker) => marker.nodeId === "central",
  );
  await focusMarker(page, central);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.__kithlandsTest
          .visibleTexts("World")
          .map((entry) => entry.text)
          .find((text) => text.startsWith("[ ENTER ]")),
      ),
    )
    .toContain(central.name);
  await capture(page, "800x600", "named-cadott-prompt");

  await page.evaluate(() => window.__kithlandsTest.pressKey("Enter", "World"));
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Settlement"),
  );
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.settlementSnapshot().currentInteraction ===
      "south-exit",
  );
  await capture(page, "800x600", "cadott-exterior");
  await page.evaluate(() =>
    window.__kithlandsTest.pressKey("Enter", "Settlement"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  await expect
    .poll(async () => markerSnapshot(page))
    .toHaveLength(before.length);
  expect(markerFingerprint(await markerSnapshot(page))).toEqual(before);

  const saveName = `Landmark determinism ${RUN_ID}`;
  expect(
    await page.evaluate(
      (name) => window.__kithlandsTest.saveGame(name, "World"),
      saveName,
    ),
  ).toMatchObject({ status: "saved" });
  const save = await page.evaluate(async (name) => {
    const result = await window.__kithlandsTest.listSaves();
    return result.saves.find((entry) => entry.name === name);
  }, saveName);
  expect(save).toBeTruthy();
  await page.evaluate(
    (saveId) => window.__kithlandsTest.loadSave(saveId),
    save.id,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  expect(markerFingerprint(await markerSnapshot(page))).toEqual(before);
  await capture(page, "800x600", "world-round-trip-reload");
});

test("phone world shows an authored marker with a named touch prompt", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await startGame(page, "390x844");
  await activateTouchControls(page);
  const central = (await markerSnapshot(page)).find(
    (marker) => marker.nodeId === "central",
  );
  await focusMarker(page, central);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        window.__kithlandsTest
          .visibleTexts("World")
          .map((entry) => entry.text)
          .find((text) => text.startsWith("[ TAP A ]")),
      ),
    )
    .toContain(central.name);
  expect(
    await page.evaluate(
      () => window.__kithlandsTest.gameplayViewportSnapshot("World").portrait,
    ),
  ).toBe(true);
  await capture(page, "390x844", "named-cadott-touch-prompt");
});
