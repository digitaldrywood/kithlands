import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const RUN_ID = Date.now();
const PROOF_DIR = path.join("tmp", `formation-menu-responsive-${RUN_ID}`);

async function startFormationGame(page) {
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
      rng_seed: 288288,
      party: [
        { name: "Ayla", class_id: "warrior", row: "front" },
        { name: "Mira", class_id: "mender", row: "back" },
        { name: "Cato", class_id: "cinder", row: "back" },
        { name: "Nia", class_id: "rogue", row: "front" },
      ],
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function openFormation(page) {
  await page.keyboard.press("m");
  await page.waitForFunction(
    () => !!window.__kithlandsTest.partyMenuSummary("World"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("FORMATION", "World"),
  );
  await page.waitForFunction(
    () => !!window.__kithlandsTest.formationMenuSummary("World"),
  );
}

test("keeps formation order and row controls usable across screen shapes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mkdir(PROOF_DIR, { recursive: true });

  await page.setViewportSize({ width: 800, height: 600 });
  await startFormationGame(page);
  await openFormation(page);
  const desktop = await page.evaluate(() =>
    window.__kithlandsTest.formationMenuSummary("World"),
  );
  expect(desktop.rows).toHaveLength(4);
  expect(desktop).toMatchObject({
    layoutMode: "desktop",
    logicalSize: { width: 800, height: 600 },
    shellBounds: { width: 760, height: 540 },
    saveBounds: { width: 204, height: 34 },
  });
  await page.screenshot({
    path: path.join(PROOF_DIR, "formation-desktop-800x600.png"),
    fullPage: true,
  });

  await page.evaluate(() => window.__kithlandsTest.saveFormation("World"));
  await page.waitForFunction(
    () => !!window.__kithlandsTest.partyMenuSummary("World"),
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await openFormation(page);
  const mobile = await page.evaluate(() =>
    window.__kithlandsTest.formationMenuSummary("World"),
  );
  expect(mobile.rows).toHaveLength(4);
  expect(mobile).toMatchObject({
    layoutMode: "mobile",
    logicalSize: { width: 800, height: 1600 },
    shellBounds: { width: 760, height: 1460 },
    previewPanelBounds: { width: 680, height: 390 },
    listPanelBounds: { width: 680, height: 680 },
    saveBounds: { width: 680, height: 94 },
  });
  expect(mobile.rows.every((row) => row.rowBounds.height >= 130)).toBe(true);
  expect(mobile.rows.every((row) => row.badgeBounds.height >= 58)).toBe(true);
  await page.screenshot({
    path: path.join(PROOF_DIR, "formation-mobile-390x844.png"),
    fullPage: true,
  });

  const firstRow = await page.evaluate(() =>
    window.__kithlandsTest.formationRowPosition(0, "World"),
  );
  expect(firstRow).toBeTruthy();
  await page.mouse.click(firstRow.x, firstRow.y);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__kithlandsTest.formationMenuSummary("World").pickedIdx,
      ),
    )
    .toBe(0);
  await page.screenshot({
    path: path.join(PROOF_DIR, "formation-mobile-picked-390x844.png"),
    fullPage: true,
  });

  const thirdRow = await page.evaluate(() =>
    window.__kithlandsTest.formationRowPosition(2, "World"),
  );
  expect(thirdRow).toBeTruthy();
  await page.mouse.click(thirdRow.x, thirdRow.y);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__kithlandsTest.formationMenuSummary("World").reorder,
      ),
    )
    .toEqual([2, 1, 0, 3]);

  const thirdBadge = await page.evaluate(() =>
    window.__kithlandsTest.formationBadgePosition(2, "World"),
  );
  expect(thirdBadge).toBeTruthy();
  await page.mouse.click(thirdBadge.x, thirdBadge.y);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__kithlandsTest.formationMenuSummary("World").rows[2].row,
      ),
    )
    .toBe("back");

  await page.evaluate(() => window.__kithlandsTest.saveFormation("World"));
  await page.waitForFunction(
    () => !!window.__kithlandsTest.partyMenuSummary("World"),
  );
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(() => window.__kithlandsTest.logicalGameSize("World")),
    )
    .toEqual({ width: 800, height: 600 });
});
