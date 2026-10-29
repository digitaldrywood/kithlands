import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { routeReady } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/public-trails-legacy-${Date.now()}`);
mkdirSync(proof, { recursive: true });
const viewports = [
  [1440, 900],
  [800, 600],
  [390, 844],
];
for (const [kind, width, height] of ["pre-trail", "pre-biome"].flatMap((kind) =>
  viewports.map(([width, height]) => [kind, width, height]),
)) {
  test.describe(`${width} ${kind} legacy save`, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 600 });
    test("Continue preserves an old harvest and exact checkpoint through migration", async ({
      page,
    }) => {
      test.setTimeout(120000);
      page.setDefaultTimeout(15000);
      const output = path.resolve(
        `tmp/legacy-${kind}-seed-${width}-${Date.now()}.json`,
      );
      execFileSync(
        "go",
        [
          "test",
          "-tags=integration",
          "./api",
          "-run",
          "^TestSeedLegacyTrailBrowserWorld$",
          "-count=1",
        ],
        {
          cwd: path.resolve("../server"),
          env: {
            ...process.env,
            KITHLANDS_LEGACY_TRAIL_PROOF_PATH: output,
            KITHLANDS_LEGACY_TRAIL_KIND: kind,
          },
        },
      );
      const fixture = JSON.parse(readFileSync(output, "utf8"));
      const activate = (locator) =>
        width < 600 ? locator.tap() : locator.click();
      const capture = (stage) =>
        page.screenshot({
          path: path.join(proof, `${kind}-${width}-${stage}.png`),
        });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/");
      await page.waitForFunction(
        () => window.__kithlandsTest?.activeSceneKey() === "Title",
      );
      await page.locator("input").fill(fixture.email);
      await activate(page.getByRole("button", { name: /^Continue Load/ }));
      await activate(
        page.getByRole("button", { name: /^Most recent adventure/ }),
      );
      await routeReady(page, "World");
      const loaded = await page.evaluate(() =>
        window.__kithlandsTest.gameState(),
      );
      expect(loaded.world_checkpoint.x).toBe(fixture.before.world_checkpoint.x);
      expect(loaded.world_checkpoint.y).toBe(fixture.before.world_checkpoint.y);
      expect(loaded.world_checkpoint.world_node_id).toBe(
        fixture.before.world_checkpoint.world_node_id,
      );
      expect(loaded.world_checkpoint.map_signature).not.toBe(
        fixture.before.world_checkpoint.map_signature,
      );
      for (const field of [
        "gold",
        "party",
        "items",
        "materials",
        "equipment",
        "gems",
      ])
        expect(loaded[field]).toEqual(fixture.before[field]);
      const harvest = loaded.resources.find(
        (n) => n.id === fixture.harvestedID,
      );
      expect(harvest.gathered).toBe(true);
      expect(harvest.ready_at).toBe(fixture.deadline);
      expect(loaded.resources.map((n) => n.id).sort()).toEqual(
        fixture.before.resources.map((n) => n.id).sort(),
      );
      await capture("migrated");
      await activate(page.getByRole("button", { name: "Menu", exact: true }));
      await activate(
        page.getByRole("button", { name: "Exit to main menu", exact: true }),
      );
      await activate(
        page.getByRole("button", { name: "Save and exit", exact: true }),
      );
      await activate(page.getByRole("button", { name: /^Continue Load/ }));
      await expect(
        page.getByRole("button", { name: /^Most recent adventure/ }),
      ).toBeVisible();
      await capture("newest-save");
      await activate(
        page.getByRole("button", { name: /^Most recent adventure/ }),
      );
      await routeReady(page, "World");
      const again = await page.evaluate(() =>
        window.__kithlandsTest.gameState(),
      );
      expect(again.world_checkpoint).toEqual(loaded.world_checkpoint);
      for (const field of [
        "gold",
        "party",
        "items",
        "materials",
        "equipment",
        "gems",
      ])
        expect(again[field]).toEqual(loaded[field]);
      expect(
        again.resources.map(({ id, ready_at, gathered, x, y }) => ({
          id,
          ready_at,
          gathered,
          x,
          y,
        })),
      ).toEqual(
        loaded.resources.map(({ id, ready_at, gathered, x, y }) => ({
          id,
          ready_at,
          gathered,
          x,
          y,
        })),
      );
      expect(again.tilemap.tiles).toEqual(loaded.tilemap.tiles);
      await capture("loaded-again");
      expect(errors).toEqual([]);
      writeFileSync(
        path.join(proof, `${kind}-${width}-audit.json`),
        JSON.stringify(
          {
            beforeCheckpoint: fixture.before.world_checkpoint,
            afterCheckpoint: loaded.world_checkpoint,
            harvestedID: fixture.harvestedID,
            deadline: fixture.deadline,
            resources: again.resources.map((n) => ({
              id: n.id,
              ready_at: n.ready_at,
              gathered: n.gathered,
            })),
            errors,
          },
          null,
          2,
        ),
      );
    });
  });
}
