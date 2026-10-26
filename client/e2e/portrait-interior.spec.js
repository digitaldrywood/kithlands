import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  startNormalRoute,
  routeReady,
  walkNormally,
} from "./helpers/normal-route.js";
import { fightNormally } from "./helpers/native-combat.js";
const proof = path.resolve(`tmp/portrait-interior-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const width of [1440, 800, 390, 375, 540]) {
  test.describe(`${width} interior`, () => {
    test.use({
      viewport: {
        width,
        height: { 1440: 900, 800: 600, 390: 844, 375: 667, 540: 720 }[width],
      },
      hasTouch: width <= 600,
    });
    test("room framing keeps native movement, dialogue and menus aligned", async ({
      page,
    }) => {
      test.setTimeout(300000);
      const capture = async (stage) =>
        page.screenshot({ path: path.join(proof, `${width}-${stage}.png`) });
      const walk = async (key, target) => {
        while ((await walkNormally(page, key, target)) === "Battle")
          await fightNormally(page);
      };
      const approachQuestNpc = async () => {
        const target = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Town"),
            grid = s.tileData || s.tiles,
            npc = s.npcs[0],
            queue = [{ x: s.playerX, y: s.playerY }],
            seen = new Set();
          for (let i = 0; i < queue.length; i++) {
            const p = queue[i],
              id = `${p.x},${p.y}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const distance = (n) => Math.abs(n.x - p.x) + Math.abs(n.y - p.y);
            if (
              distance(npc) <= 2 &&
              !s.npcs.slice(1).some((n) => distance(n) < distance(npc)) &&
              !(s.chests || []).some((n) => distance(n) <= 1) &&
              !(s.hiddenItems || []).some((n) => distance(n) <= 1)
            )
              return p;
            for (const [dx, dy] of [
              [1, 0],
              [0, 1],
              [-1, 0],
              [0, -1],
            ]) {
              const n = { x: p.x + dx, y: p.y + dy },
                tile = grid[n.y]?.[n.x];
              if (
                Number.isInteger(tile) &&
                s.canWalkTile(tile) &&
                !s.npcs.some((p) => p.x === n.x && p.y === n.y)
              )
                queue.push(n);
            }
          }
          throw Error("No reachable quest NPC interaction tile");
        });
        await walk("Town", target);
      };

      await startNormalRoute(page, 4);
      const node = await page.evaluate(() => {
        const s = window.__kithlandsTest.gameState();
        return s.quests[s.current_quest].actions[0].location;
      });
      const spawn = await page.evaluate(
        (node) =>
          window.__normalRouteGame.scene
            .getScene("World")
            .spawns.find((s) => s.node_id === node),
        node,
      );
      await walk("World", spawn);
      await page
        .getByRole("button")
        .filter({ hasText: `— ${spawn.name}` })
        [width <= 600 ? "tap" : "click"]();
      await routeReady(page, "Town");
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await capture("room");
      const geometry = await page.evaluate(() => {
        const s = window.__normalRouteGame.scene.getScene("Town"),
          c = s.cameras.main,
          r = s.game.canvas.getBoundingClientRect();
        const project = (x, y) =>
          c.matrix.transformPoint(x - c.scrollX, y - c.scrollY);
        const a = project(s.offsetX, s.offsetY),
          b = project(s.offsetX + s.roomW * 32, s.offsetY + s.roomH * 32);
        return {
          zoom: c.zoom,
          scrollY: c.scrollY,
          roomWidth: ((b.x - a.x) * r.width) / s.scale.gameSize.width,
          left: (a.x * r.width) / s.scale.gameSize.width,
          right: (b.x * r.width) / s.scale.gameSize.width,
          uiCamera: !!s.interiorUICamera,
          help: !!s.helpStrip,
        };
      });
      writeFileSync(
        path.join(proof, `${width}-geometry.json`),
        JSON.stringify(geometry, null, 2),
      );
      if (width <= 600) {
        expect(geometry.roomWidth).toBeGreaterThan(width * 0.88);
        expect(geometry.left).toBeGreaterThan(0);
        expect(geometry.right).toBeLessThan(width);
        expect(geometry.uiCamera).toBe(true);
        expect(geometry.help).toBe(false);
      } else {
        expect(geometry.zoom).toBe(1);
        expect(geometry.uiCamera).toBe(false);
      }
      if (width <= 600) {
        const canvas = await page.locator("canvas").boundingBox();
        await page.touchscreen.tap(canvas.x + 4, canvas.y + 4);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const target = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Town"),
            c = s.cameras.main,
            r = s.game.canvas.getBoundingClientRect();
          const x = s.playerX,
            y = s.playerY - 2;
          if (!s.canWalkTile(s.tiles[y]?.[x]))
            throw Error("No entrance floor target");
          const p = c.matrix.transformPoint(
            s.offsetX + x * 32 + 16 - c.scrollX,
            s.offsetY + y * 32 + 16 - c.scrollY,
          );
          return {
            x,
            y,
            cx: r.x + (p.x * r.width) / s.scale.gameSize.width,
            cy: r.y + (p.y * r.height) / s.scale.gameSize.height,
          };
        });
        await page.touchscreen.tap(target.cx, target.cy);
        await page.waitForFunction(
          ({ x, y }) => {
            const s = window.__normalRouteGame.scene.getScene("Town");
            return s.playerX === x && s.playerY === y && !s.animating;
          },
          target,
          { timeout: 15000 },
        );
        await capture("touch-floor");
      }
      await approachQuestNpc();
      if (width <= 600) {
        const prompt = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Town"),
            bounds = s.interactPrompt.getBounds();
          return {
            top: bounds.top,
            bottom: bounds.bottom,
            roomBottom: s.cameras.main.y + s.cameras.main.height,
            controlsTop: s.gameplayLayout.controlArea.dpadTop,
          };
        });
        expect(prompt.top).toBeGreaterThan(prompt.roomBottom);
        expect(prompt.bottom).toBeLessThan(prompt.controlsTop);
        await capture("keeper-prompt");
      }
      if (width === 540) {
        const scrollY = await page.evaluate(
          () =>
            window.__normalRouteGame.scene.getScene("Town").cameras.main
              .scrollY,
        );
        expect(Math.abs(scrollY - geometry.scrollY)).toBeGreaterThan(8);
        await capture("panned-to-keeper");
      }
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "quest_action",
        { timeout: 15000 },
      );
      if (width <= 600) {
        const a = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Town"),
            r = s.game.canvas.getBoundingClientRect();
          return {
            x:
              r.x +
              (s.gameplayLayout.action.x * r.width) / s.scale.gameSize.width,
            y:
              r.y +
              (s.gameplayLayout.action.y * r.height) / s.scale.gameSize.height,
          };
        });
        await page.touchscreen.tap(a.x, a.y);
      } else await page.keyboard.press("Enter");
      const result = await (await response).json();
      expect(result.error).toBeUndefined();
      await page.waitForFunction(() =>
        window.__normalRouteGame.scene
          .getScene("Town")
          ._modalLocks?.has("dialogue"),
      );
      if (width <= 600)
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                window.__normalRouteGame.scene.getScene("Town").interactPrompt
                  ?.visible,
            ),
          )
          .toBe(false);
      await capture("dialogue");
      const text = await page.evaluate((message) => {
        const s = window.__normalRouteGame.scene.getScene("Town"),
          t = s.children.list.find(
            (o) => o.type === "Text" && o.text === message,
          );
        return t
          ? {
              font:
                (parseFloat(t.style.fontSize) *
                  s.game.canvas.getBoundingClientRect().width) /
                s.scale.gameSize.width,
              mask: t.cameraFilter,
              main: s.cameras.main.id,
            }
          : null;
      }, result.message);
      expect(text).toBeTruthy();
      if (width <= 600) {
        expect(text.font).toBeGreaterThanOrEqual(16);
        expect(text.mask & text.main).not.toBe(0);
      }
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () =>
          !window.__normalRouteGame.scene.getScene("Town")._modalLocks?.size,
      );
      await capture("after-dialogue");
      if (width <= 600) {
        const clearance = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Town");
          return s.cameras.main.y - s.objectiveText.getBounds().bottom;
        });
        expect(
          clearance,
          "room leaves space for the updated objective and custody",
        ).toBeGreaterThanOrEqual(19);
      }
      const entry = page.getByRole("button", { name: "Menu M", exact: true });
      await expect(entry).toBeVisible();
      if (width <= 600) {
        await entry.focus();
        await page.keyboard.press("Enter");
      } else await page.keyboard.press("m");
      await expect(
        page.getByRole("dialog", { name: "Your party" }),
      ).toBeVisible();
      await capture("party-menu");
      if (width <= 600) {
        const sound = page.getByRole("button", { name: /^Sound:/ });
        const initial = await sound.textContent();
        await page.keyboard.press("v");
        await expect(sound).not.toHaveText(initial);
        await page.keyboard.press("v");
        await expect(sound).toHaveText(initial);
        await page.getByRole("button", { name: /^Help & controls/ }).tap();
        await expect(page.locator(".kith-codex")).toBeVisible();
        await capture("help");
        await page.keyboard.press("Escape");
        await expect(page.locator(".kith-codex")).toHaveCount(0);
        await entry.tap();
        await expect(
          page.getByRole("dialog", { name: "Your party" }),
        ).toBeVisible();
      }

      await page
        .getByRole("button", { name: "Back to game", exact: true })
        .first()
        .click();
      await page.keyboard.press("Escape");
      await routeReady(page, "World");
      expect(
        await page.evaluate(
          () =>
            window.__normalRouteGame.scene.getScene("World").cameras.main.zoom,
        ),
      ).toBe(width <= 600 ? 2 : 1);
      await expect(page.locator(".interior-controls")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Menu", exact: true }),
      ).toHaveCount(1);
      await capture("returned-world");
    });
  });
}
