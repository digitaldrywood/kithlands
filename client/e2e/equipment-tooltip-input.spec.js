import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startNormalRoute } from "./helpers/normal-route.js";

const proof = path.resolve(`tmp/equipment-tooltip-input-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test.describe(`${width} equipment tooltip input`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });
    test("only the current input's item has a tooltip and browsing spends nothing", async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await startNormalRoute(page, 24);
      await page.keyboard.press("m");
      await page.getByRole("button", { name: /^Character/i }).click();
      const screen = page.getByRole("dialog", {
        name: "Character",
        exact: true,
      });
      const snapshot = () =>
        page.evaluate(() => {
          const scene = window.__normalRouteGame.scene.getScene("World");
          return { state: scene.gameState, x: scene.playerX, y: scene.playerY };
        });
      const before = await snapshot();
      const requests = [];
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          /\/(equip|unequip|field-craft|socket)$/.test(request.url())
        )
          requests.push(request.url());
      });
      const weapon = screen.locator('[data-slot-id="main_hand"]');
      if (width === 390) await weapon.tap();
      else await weapon.click();
      const body = screen.locator('[data-slot-id="body"]');
      const hovered = width === 800 ? weapon : body;
      if (width !== 390) {
        await hovered.hover();
        await expect(hovered.locator(".equipment-tooltip")).toBeVisible();
      }
      await page.screenshot({ path: path.join(proof, `${width}-pointer.png`) });
      const choices = screen.locator(
        ".equipment-item-list .equipment-item-row",
      );
      await expect(choices.first()).toBeVisible();
      await choices.first().focus();
      await page.keyboard.press("Home");
      await expect(choices.first()).toBeFocused();
      await expect(body.locator(".equipment-tooltip")).toBeHidden();
      await expect(weapon.locator(".equipment-tooltip")).toBeHidden();
      if (width !== 390) {
        await expect(
          choices.first().locator(".equipment-tooltip"),
        ).toBeVisible();
        const tip = choices.first().locator(".equipment-tooltip");
        expect(
          await tip.evaluate((node) => {
            let opacity = 1;
            for (let parent = node; parent; parent = parent.parentElement)
              opacity *= Number(getComputedStyle(parent).opacity);
            return opacity;
          }),
        ).toBe(1);
        const readable = () =>
          tip.evaluate((node) => {
            const bounds = node.getBoundingClientRect();
            const name = node
              .querySelector(".tooltip-item-name")
              .getBoundingClientRect();
            const old = node.style.pointerEvents;
            node.style.pointerEvents = "auto";
            const hit = document.elementFromPoint(
              name.left + name.width / 2,
              name.top + name.height / 2,
            );
            const clear = [0.1, 0.3, 0.5, 0.7, 0.9].every((x) =>
              [0.1, 0.3, 0.5, 0.7, 0.9].every((y) =>
                node.contains(
                  document.elementFromPoint(
                    bounds.left + bounds.width * x,
                    bounds.top + bounds.height * y,
                  ),
                ),
              ),
            );
            node.style.pointerEvents = old;
            return (
              bounds.left >= 0 &&
              bounds.top >= 0 &&
              bounds.right <= innerWidth &&
              bounds.bottom <= innerHeight &&
              node.contains(hit) &&
              clear
            );
          });
        await expect.poll(readable).toBe(true);
        if (width === 1440) {
          await page.setViewportSize({ width: 1120, height: 700 });
          await expect.poll(readable).toBe(true);
          await page.screenshot({
            path: path.join(proof, "1440-keyboard-resized.png"),
          });
          await page.setViewportSize({ width, height });
          await expect.poll(readable).toBe(true);
        }
        await expect(screen.locator(".equipment-tooltip:visible")).toHaveCount(
          1,
        );
      } else
        await expect(screen.locator(".equipment-tooltip:visible")).toHaveCount(
          0,
        );
      await page.screenshot({
        path: path.join(proof, `${width}-keyboard.png`),
      });
      await page.keyboard.press("End");
      await page.keyboard.press("Tab");
      await expect(screen.locator(".equipment-tooltip:visible")).toHaveCount(0);
      await page.screenshot({
        path: path.join(proof, `${width}-keyboard-away.png`),
      });
      if (width !== 390) {
        await page.mouse.move(5, 5);
        await hovered.hover();
        await expect(hovered.locator(".equipment-tooltip")).toBeVisible();
        await expect(screen.locator(".equipment-tooltip:visible")).toHaveCount(
          1,
        );
        await page.screenshot({
          path: path.join(proof, `${width}-pointer-return.png`),
        });
      }
      expect(await snapshot()).toEqual(before);
      expect(requests).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(screen).toHaveCount(0);
      expect(errors).toEqual([]);
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify({ unchanged: true, requests, errors }),
      );
    });
  });
}
