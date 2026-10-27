import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { startNormalRoute } from "./helpers/normal-route.js";
const proof = path.resolve(`tmp/world-map-inspection-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test.describe(`map place inspection ${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch: width === 390 });
    test("named places highlight without moving or changing the tracked quest", async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await startNormalRoute(page, 6);
      const before = await page.evaluate(() =>
        window.__kithlandsTest.gameState("World"),
      );
      const activate = (node) => (width === 390 ? node.tap() : node.click());
      await activate(page.getByRole("button", { name: "Menu", exact: true }));
      await activate(page.getByRole("button", { name: /World map/i }));
      const dialog = page.getByRole("dialog", {
        name: "World map",
        exact: true,
      });
      const picker = dialog.getByRole("combobox", {
        name: "Inspect a place",
        exact: true,
      });
      const spawns = await page.evaluate(
        () => window.__normalRouteGame.scene.getScene("World").spawns,
      );
      writeFileSync(
        path.join(proof, `${width}-initial.json`),
        JSON.stringify({ before, spawns }, null, 2),
      );
      const target = spawns.find(
        (p) => p.node_id === before.quests[before.current_quest].target_node_id,
      );
      expect(target).toBeTruthy();
      await expect(picker).toHaveValue(target.node_id);
      await expect(dialog.getByRole("status")).toContainText(
        `Destination: ${target.name}`,
      );
      await expect(dialog.getByRole("img")).toHaveAttribute(
        "aria-label",
        new RegExp(target.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      await expect
        .poll(() =>
          dialog.getByRole("img").evaluate((node) => {
            const map = node.getBoundingClientRect(),
              body = node.parentElement.getBoundingClientRect();
            return map.bottom <= body.bottom + 1;
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: path.join(proof, `${width}-destination.png`),
      });
      const alternate = spawns.find((p) => p.node_id !== target.node_id);
      await picker.selectOption(alternate.node_id);
      await expect(dialog.getByRole("status")).toContainText(
        `Selected place: ${alternate.name}`,
      );
      await expect(picker).toBeInViewport();
      const bounds = await picker.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: path.join(proof, `${width}-inspected.png`),
      });
      // Native select keys must not leak through to world movement or menu actions.
      await picker.focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      await page.screenshot({
        path: path.join(proof, `${width}-keyboard.png`),
      });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      const after = await page.evaluate(() =>
        window.__kithlandsTest.gameState("World"),
      );
      expect(after).toEqual(before);
      await activate(page.getByRole("button", { name: "Menu", exact: true }));
      await activate(page.getByRole("button", { name: /World map/i }));
      await expect(
        page.getByRole("combobox", { name: "Inspect a place", exact: true }),
      ).toHaveValue(target.node_id);
      await page.screenshot({
        path: path.join(proof, `${width}-reopened.png`),
      });
      expect(errors).toEqual([]);
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify({ target, alternate, before, after, errors }, null, 2),
      );
    });
  });
}
