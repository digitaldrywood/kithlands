import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";

const proof = path.resolve(`tmp/resource-route-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ video: "on" });
for (const width of [1440, 390]) {
  test.describe(`${width} resource route`, () => {
    test.use({
      viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width === 390,
    });
    test("native habitats and real offline respawn retain saved resource identities", async ({
      page,
      context,
    }) => {
      test.setTimeout(900000);
      page.setDefaultTimeout(15000);
      const receipts = [],
        requests = [],
        errors = [],
        milestones = [];
      context.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/api/game/"))
          requests.push({
            path: new URL(r.url()).pathname,
            body: r.postDataJSON(),
          });
      });
      context.on("response", async (response) => {
        if (response.url().endsWith("/gather"))
          receipts.push({
            status: response.status(),
            body: await response.json(),
          });
      });
      const watchErrors = (p) =>
        p.on("pageerror", (e) => errors.push(e.message));
      watchErrors(page);
      const state = () =>
        page.evaluate(() => window.__kithlandsTest.gameState());
      const capture = async (stage) => {
        milestones.push({ stage, state: await state() });
        await page.screenshot({
          path: path.join(
            proof,
            `${width}-${String(milestones.length).padStart(2, "0")}-${stage}.png`,
          ),
        });
      };
      const input = (locator) =>
        width === 390 ? locator.tap() : locator.click();
      const walk = async (target) => {
        while ((await walkNormally(page, "World", target)) === "Battle")
          await fightNormally(page);
      };
      const resource = (s, id) => s.resources.find((r) => r.id === id);
      const material = (s, id) =>
        s.materials.find((m) => m.id === id)?.count || 0;
      const stable = (s) => ({
        party: s.party,
        gold: s.gold,
        materials: s.materials,
        resources: s.resources.map(
          ({
            id,
            x,
            y,
            habitat,
            habitat_tiles,
            surface_tile,
            respawn_seconds,
            ready_at,
          }) => ({
            id,
            x,
            y,
            habitat,
            habitat_tiles,
            surface_tile,
            respawn_seconds,
            ready_at: ready_at || 0,
          }),
        ),
      });
      try {
        await startNormalRoute(page, 24);
        const initial = await state();
        expect(initial.party.every((p) => p.level === 1)).toBe(true);
        const origin = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("World");
          return { x: s.playerX, y: s.playerY };
        });
        const distance = (n) =>
          Math.abs(n.x - origin.x) + Math.abs(n.y - origin.y);
        const nodes = ["ember_ore", "hardwood", "meadow_herb"].map(
          (id) =>
            initial.resources
              .filter((n) => n.material_id === id)
              .sort((a, b) => distance(a) - distance(b))[0],
        );
        expect(nodes.every(Boolean)).toBe(true);
        await capture("route-arrival");
        for (const node of nodes) {
          const approach = await page.evaluate((node) => {
            const s = window.__normalRouteGame.scene.getScene("World");
            return (
              [
                { x: node.x - 1, y: node.y },
                { x: node.x + 1, y: node.y },
                { x: node.x, y: node.y + 1 },
              ].find((p) => s.canWalkTile(s.tileData[p.y]?.[p.x])) || node
            );
          }, node);
          await walk(approach);
          await capture(`${node.habitat}-before-harvest`);
          await input(
            page.getByRole("button", {
              name: `Gather — ${node.name}`,
              exact: true,
            }),
          );
          await expect
            .poll(async () => resource(await state(), node.id).gathered)
            .toBe(true);
          const gathered = resource(await state(), node.id);
          expect(gathered.ready_at).toBeGreaterThan(Date.now() / 1000);
          expect(
            material(await state(), node.material_id) -
              material(initial, node.material_id),
          ).toBe(node.quantity);
          await capture(`${node.habitat}-depleted`);
        }
        const harvested = await state(),
          herb = nodes[2],
          deadline = resource(harvested, herb.id).ready_at;
        const retained = stable(harvested);
        await input(page.getByRole("button", { name: "Menu", exact: true }));
        await input(
          page.getByRole("button", { name: "Exit to main menu", exact: true }),
        );
        await input(
          page.getByRole("button", { name: "Save and exit", exact: true }),
        );
        await expect(
          page.getByRole("main", { name: "Kithlands main menu" }),
        ).toBeVisible();
        await page.close();
        // The game page is genuinely closed. Wait for Go's actual saved Unix
        // deadline: no fake clock, timer edits, shortened data or status calls.
        while (Date.now() < (deadline + 1) * 1000) {
          const remaining = (deadline + 1) * 1000 - Date.now();
          console.log(
            "resource-offline-deadline",
            width,
            Math.ceil(remaining / 1000),
          );
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(30000, remaining)),
          );
        }
        page = await context.newPage();
        watchErrors(page);
        await page.route("**/src/main.js*", async (route) => {
          const response = await route.fetch();
          await route.fulfill({
            response,
            body: `${await response.text()}\nwindow.__normalRouteGame=game;`,
          });
        });
        await page.goto("/");
        await input(page.getByRole("button", { name: /^Continue/ }));
        await expect(
          page.locator(".title-adventure > .title-save"),
        ).toHaveCount(1);
        await input(page.locator(".title-adventure > .title-save"));
        await routeReady(page, "World");
        const loaded = await state();
        expect(stable(loaded)).toEqual(retained);
        expect(resource(loaded, herb.id).gathered).toBe(false);
        expect(resource(loaded, nodes[0].id).gathered).toBe(true);
        await capture("reopened-herb-renewed-ore-still-depleted");
        await input(
          page.getByRole("button", {
            name: `Gather — ${herb.name}`,
            exact: true,
          }),
        );
        await expect
          .poll(async () => material(await state(), herb.material_id))
          .toBe(material(initial, herb.material_id) + herb.quantity * 2);
        const renewed = await state();
        expect(resource(renewed, herb.id).ready_at).toBeGreaterThan(deadline);
        expect(resource(renewed, nodes[0].id).ready_at).toBe(
          resource(harvested, nodes[0].id).ready_at,
        );
        await capture("second-harvest-new-deadline");
        expect(
          requests.some(
            (r) => r.path.includes("debug") || r.body?.debug_no_encounters,
          ),
        ).toBe(false);
        expect(errors).toEqual([]);
      } finally {
        const final = !page.isClosed()
          ? await page
              .evaluate(() => {
                const key = window.__kithlandsTest.activeSceneKey();
                const s = window.__normalRouteGame.scene.getScene(key);
                return {
                  key,
                  x: s.playerX,
                  y: s.playerY,
                  animating: s.animating,
                  encounterPending: s.encounterPending,
                  phase: s.gameState?.phase,
                  flags: window.__kithlandsTest.sceneFlags(key),
                };
              })
              .catch(() => null)
          : null;
        writeFileSync(
          path.join(proof, `${width}-audit.json`),
          JSON.stringify(
            { requests, receipts, errors, milestones, final },
            null,
            2,
          ),
        );
        if (!page.isClosed())
          await page
            .screenshot({ path: path.join(proof, `${width}-final.png`) })
            .catch(() => {});
        console.log("resource-route-proof", proof);
      }
    });
  });
}
