import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { startNormalRoute, walkNormally } from "./helpers/normal-route.js";

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
  await startNormalRoute(page, 24);
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
  const entrance = await page.evaluate(() =>
    window.__normalRouteGame.scene
      .getScene("World")
      .spawns.find((s) => s.node_id === "central"),
  );
  expect(await walkNormally(page, "World", entrance)).toBe("World");
  await expect(
    page.getByRole("button", { name: `Enter — ${central.name}`, exact: true }),
  ).toBeVisible();
  await capture(page, "800x600", "named-cadott-prompt");

  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneIsActive("Settlement"),
    null,
    { timeout: 15000 },
  );
  await page.evaluate(() =>
    window.__kithlandsTest.waitForSceneReady("Settlement"),
  );
  await capture(page, "800x600", "cadott-exterior");
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.settlementSnapshot().currentInteraction ===
      "south-exit",
  );
  await page.keyboard.press("Enter");
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
  const central = (await markerSnapshot(page)).find(
    (marker) => marker.nodeId === "central",
  );
  const entrance = await page.evaluate(() =>
    window.__normalRouteGame.scene
      .getScene("World")
      .spawns.find((s) => s.node_id === "central"),
  );
  expect(await walkNormally(page, "World", entrance)).toBe("World");
  await expect(
    page.getByRole("button", { name: `Enter — ${central.name}`, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => window.__kithlandsTest.gameplayViewportSnapshot("World").portrait,
    ),
  ).toBe(true);
  await capture(page, "390x844", "named-cadott-touch-prompt");
  await page
    .getByRole("button", { name: `Enter — ${central.name}`, exact: true })
    .tap();
  await page.waitForFunction(
    () => window.__kithlandsTest.sceneIsActive("Settlement"),
    null,
    { timeout: 15000 },
  );
  await page.evaluate(() =>
    window.__kithlandsTest.waitForSceneReady("Settlement"),
  );
  await capture(page, "390x844", "touch-entered-settlement");
});
