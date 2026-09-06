import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const monsters = JSON.parse(
  await readFile(
    new URL("../../shared/monsters.json", import.meta.url),
    "utf8",
  ),
);
const run = Date.now();
const proofDir = fileURLToPath(
  new URL(`../tmp/monster-scale-${run}/`, import.meta.url),
);

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 800, height: 600 },
  { width: 645, height: 847 },
  { width: 390, height: 844 },
]) {
  for (const kind of ["rats", "bramblehog", "humanoid", "boss"]) {
    test(`${kind} at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await mkdir(proofDir, { recursive: true });
      await page.setViewportSize(viewport);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/");
      await page.waitForFunction(
        () => window.__kithlandsTest?.activeSceneKey() === "Title",
        null,
        { timeout: 60_000 },
      );
      await page.evaluate(() => window.__kithlandsTest.startQuickGame());
      const encounter =
        kind === "rats"
          ? { monster_ids: ["giant_rat", "giant_rat"], level: 1 }
          : {
              monster_ids: [
                kind === "bramblehog"
                  ? "bramblehog"
                  : kind === "humanoid"
                    ? "skeleton"
                    : "elder_dragon",
              ],
              level: 1,
            };
      const expectedNames = encounter.monster_ids.map(
        (id) => monsters.find((m) => m.id === id).name,
      );
      // Existing authenticated, debug-gated server route creates the real
      // combatants; no client-only enemy injection or altered production pool.
      const response = await page.evaluate(
        (fight) =>
          window.__kithlandsTest.forceEncounter(fight.monster_ids, fight.level),
        encounter,
      );
      expect(response.phase).toBe("combat");
      expect(response.enemies.map((e) => e.name)).toEqual(expectedNames);
      expect(response.enemies.map((e) => e.monster_id)).toEqual(
        encounter.monster_ids,
      );
      expect(new Set(response.enemies.map((e) => e.id)).size).toBe(
        expectedNames.length,
      );
      await page.waitForFunction(
        (count) =>
          window.__kithlandsTest.battleVisibilitySnapshot().enemyMembers
            .length === count,
        expectedNames.length,
      );
      await page.waitForFunction(
        () =>
          window.__kithlandsTest.battleVisibilitySnapshot().actorCursors > 0,
      );
      // The boss banner fades for 200ms after command input becomes ready.
      // Capture the settled battlefield rather than that dim intro overlay.
      await page.waitForTimeout(350);
      const snapshot = await page.evaluate(() =>
        window.__kithlandsTest.battleVisibilitySnapshot(),
      );
      expect(snapshot.enemyMembers.map((e) => e.name)).toEqual(expectedNames);
      for (const enemy of snapshot.enemyMembers) {
        expect(enemy.spriteBounds.width).toBeGreaterThan(30);
        if (kind === "rats" || kind === "bramblehog") {
          expect(
            Math.max(enemy.spriteBounds.width, enemy.spriteBounds.height),
          ).toBeGreaterThanOrEqual(80);
          expect(
            Math.max(enemy.spriteBounds.width, enemy.spriteBounds.height),
          ).toBeLessThan(100);
        } else {
          expect(
            Math.max(enemy.spriteBounds.width, enemy.spriteBounds.height),
          ).toBeGreaterThan(100);
        }
        expect(enemy.spriteBounds.height).toBeGreaterThan(30);
        expect(enemy.spriteBounds.left).toBeGreaterThanOrEqual(0);
      }
      const stem = `${kind}-${viewport.width}x${viewport.height}-${run}`;
      await page.screenshot({
        path: resolve(proofDir, `${stem}.png`),
        fullPage: true,
      });
      await writeFile(
        resolve(proofDir, `${stem}.json`),
        JSON.stringify({ response, snapshot, errors }, null, 2),
      );
      expect(errors).toEqual([]);
    });
  }
}
