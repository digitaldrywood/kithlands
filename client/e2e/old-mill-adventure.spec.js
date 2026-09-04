import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { dungeonLayout } from "../src/scenes/dungeonView.js";

const run = Date.now();
const proof = path.resolve(`tmp/old-mill-${run}`);
mkdirSync(proof, { recursive: true });

async function state(page) {
  return page.evaluate(() => window.__kithlandsTest.gameState());
}
async function tapLogical(page, x, y, width = 800, height = 600) {
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.click(
    box.x + (x / width) * box.width,
    box.y + (y / height) * box.height,
  );
}
async function tapAction(page, id, viewport) {
  const gs = await state(page);
  const d = gs.dungeon;
  const a = d.actions.find((a) => a.id === id);
  expect(a, `action ${id} in ${d.room_id}`).toBeTruthy();
  const portrait = viewport.width <= 600 && viewport.height > viewport.width;
  const size = {
    width: 800,
    height: portrait
      ? Math.round((800 * viewport.height) / viewport.width)
      : 600,
    portrait,
  };
  const layout = dungeonLayout(size, {
    width: d.map.width,
    height: d.map.height,
  });
  await tapLogical(
    page,
    layout.offsetX + (a.x + 0.5) * layout.tile,
    layout.offsetY + (a.y + 0.5) * layout.tile,
    size.width,
    size.height,
  );
}
async function room(page, id) {
  await page.waitForFunction(
    (id) =>
      window.__kithlandsTest.activeSceneKey() === "Dungeon" &&
      window.__kithlandsTest.gameState()?.dungeon?.room_id === id,
    id,
  );
  await page.waitForTimeout(350);
}
async function capture(page, label) {
  await page.screenshot({
    path: path.join(proof, `${label}.png`),
    fullPage: true,
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Old Mill entry, exploration and saved return ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.waitForTimeout(400);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Old Mill trail", "World"),
    );
    await room(page, "approach");
    await capture(page, `${viewport.width}-approach`);
    await tapAction(page, "split-oak", viewport);
    await page.waitForFunction(
      () =>
        window.__kithlandsTest
          .gameState()
          ?.dungeon?.actions.find((a) => a.id === "split-oak")?.completed,
    );
    await tapAction(page, "mill-door", viewport);
    await room(page, "receiving");
    await tapAction(page, "ledger", viewport);
    await page.waitForFunction(
      () =>
        window.__kithlandsTest
          .gameState()
          ?.dungeon?.actions.find((a) => a.id === "ledger")?.completed,
    );
    await capture(page, `${viewport.width}-receiving`);
    const before = await state(page);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Save", "Dungeon"),
    );
    await page.waitForTimeout(400);
    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    const save = saves.saves.find((s) => s.name.includes("Mill"));
    expect(save).toBeTruthy();
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Retreat", "Dungeon"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate((id) => window.__kithlandsTest.loadSave(id), save.id);
    await room(page, "receiving");
    const resumed = await state(page);
    expect(resumed.dungeon.position).toEqual(before.dungeon.position);
    expect(resumed.dungeon.journal).toEqual(before.dungeon.journal);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Journal", "Dungeon"),
    );
    await capture(page, `${viewport.width}-saved-journal`);
    await page.keyboard.press("Escape");
    await tapAction(page, "receiving-exit", viewport);
    await room(page, "approach");
    await tapAction(page, "trail-home", viewport);
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    expect((await state(page)).gold).toBe(before.gold);
    expect(errors).toEqual([]);
  });
}
