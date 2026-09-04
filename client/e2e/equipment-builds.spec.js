import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const proof = path.join("tmp", `equipment-builds-${Date.now()}`);
mkdirSync(proof, { recursive: true });

const authorization = new WeakMap();
async function api(page, method, ...args) {
  const id = await page.evaluate(
    () => window.__kithlandsTest.gameState("World").id,
  );
  const suffix = { getGame: "", equipItem: "/equip", unequipItem: "/unequip" }[
    method
  ];
  const data =
    method === "equipItem"
      ? {
          slot: args[0],
          item_id: args[1],
          type: args[2],
          equipment_slot: args[3],
        }
      : { slot: args[0], equipment_slot: args[1] };
  const result = await page.request.fetch(`/api/game/${id}${suffix}`, {
    method: method === "getGame" ? "GET" : "POST",
    headers: { Authorization: authorization.get(page) },
    ...(method === "getGame" ? {} : { data }),
  });
  const body = await result.text();
  expect(result.ok(), body).toBeTruthy();
  return JSON.parse(body);
}
async function start(page) {
  page.on("request", (request) => {
    const header = request.headers()["authorization"];
    if (header && new URL(request.url()).origin === new URL(page.url()).origin)
      authorization.set(page, header);
  });
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startQuickGame(`builds-${Date.now()}@test.dev`),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  await page.evaluate(() =>
    window.__kithlandsTest.debugGiveItem("copper_ring", 2, "World"),
  );
  await page.keyboard.press("m");
  await page.evaluate(() =>
    window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
  );
  await expect(
    page.getByRole("dialog", { name: "Character", exact: true }),
  ).toBeVisible();
}
async function openBuilds(page) {
  await page.getByRole("button", { name: "Saved Builds", exact: true }).click();
  await expect(page.locator(".equipment-build-dialog")).toBeVisible();
}
async function save(page, name) {
  await page.getByLabel("Build name", { exact: true }).fill(name);
  const save = page.getByRole("button", { name: "Save current build" });
  if (page.viewportSize().width === 390) await save.tap();
  else await save.click();
  await expect(page.locator(".equipment-build-status")).toContainText(
    "Current gear saved",
  );
}
async function closeBuilds(page) {
  await page.getByRole("button", { name: "Back to character" }).click();
  await expect(
    page.getByRole("button", { name: "Saved Builds", exact: true }),
  ).toBeFocused();
}
function row(page, name) {
  return page
    .locator(".equipment-build-row")
    .filter({ has: page.locator("strong", { hasText: name }) });
}
async function preview(page, name) {
  await row(page, name)
    .getByRole("button", { name: "Preview", exact: true })
    .click();
  await expect(page.locator(".equipment-build-review h3")).toHaveText(
    `Preview · ${name}`,
  );
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(proof, name), fullPage: true });
}

for (const [width, height] of [
  [1440, 900],
  [800, 600],
  [390, 844],
]) {
  test.describe(`viewport ${width}x${height}`, () => {
    test.use({ hasTouch: width === 390 });
    test(`saved build lifecycle at ${width}x${height}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height });
      await start(page);
      await capture(page, `${width}-character.png`);
      await openBuilds(page);
      await save(page, "Travel");
      // Typing arrows never cycles the underlying party.
      await page.getByLabel("Build name", { exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".equipment-build-dialog h2")).toContainText(
        "Hero",
      );
      await page.getByRole("button", { name: "Back to character" }).focus();
      await page.keyboard.press("Shift+Tab");
      await expect(
        row(page, "Travel").getByRole("button", {
          name: "Delete",
          exact: true,
        }),
      ).toBeFocused();
      await closeBuilds(page);
      // Equip both distinct rings through the existing character-sheet controls.
      for (const slot of ["ring_1", "ring_2"]) {
        await page.locator(`[data-slot-id="${slot}"]`).click();
        await page
          .locator(".equipment-item-row:not(.is-disabled)")
          .filter({
            hasText: "Copper Ring",
            hasNot: page.locator(".equipment-worn-by"),
          })
          .first()
          .click();
        await page
          .getByRole("button", {
            name: slot === "ring_1" ? "Equip in Ring I" : "Equip in Ring II",
            exact: true,
          })
          .click();
        await expect(page.locator(".equipment-status")).toContainText(
          "equipped in",
        );
      }
      await openBuilds(page);
      await save(page, "Lucky");
      const initial = await api(page, "getGame");
      const ringSlot = initial.equipment[0].loadout.find(
        (s) => s.id === "ring_1",
      );
      const ring = ringSlot.instance_id;
      const ringName = ringSlot.item.name;
      expect(
        initial.equipment[0].loadout.find((s) => s.id === "ring_2").instance_id,
      ).not.toBe(ring);
      let releasePreview;
      const pendingPreview = new Promise((resolve) => {
        releasePreview = resolve;
      });
      let previewRequested;
      const requested = new Promise((resolve) => {
        previewRequested = resolve;
      });
      await page.route(
        "**/equipment/builds/preview",
        async (route) => {
          previewRequested();
          await pendingPreview;
          await route.continue();
        },
        { times: 1 },
      );
      await row(page, "Travel")
        .getByRole("button", { name: "Preview", exact: true })
        .click();
      await requested;
      await expect(page.locator(".equipment-build-dialog")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(page.locator(".equipment-build-dialog")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.locator(".equipment-build-dialog")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.locator(".equipment-build-dialog")).toBeVisible();
      releasePreview();
      await expect(page.locator(".equipment-build-dialog")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect(
        row(page, "Travel").getByRole("button", {
          name: "Preview",
          exact: true,
        }),
      ).toBeFocused();
      await expect(page.locator(".equipment-build-review h3")).toHaveText(
        "Preview · Travel",
      );
      expect((await api(page, "getGame")).equipment).toEqual(initial.equipment);
      await expect(page.locator(".equipment-build-moves")).toContainText(
        `Ring I: ${ringName} → Empty`,
      );
      await page
        .getByRole("button", { name: "Apply Build", exact: true })
        .click();
      await expect(page.locator(".equipment-build-status")).toContainText(
        "Travel” applied",
      );
      const travel = await api(page, "getGame");
      expect(
        travel.equipment[0].loadout.find((s) => s.id === "ring_1").item,
      ).toBeUndefined();
      // A real independent server mutation makes the open review stale.
      await preview(page, "Lucky");
      const transfer = await api(
        page,
        "equipItem",
        1,
        ring,
        "accessory",
        "ring_1",
      );
      expect(transfer.error).toBeUndefined();
      await page
        .getByRole("button", { name: "Apply Build", exact: true })
        .click();
      await expect(page.locator(".equipment-build-status")).toContainText(
        "stale",
      );
      expect((await api(page, "getGame")).equipment).toEqual(
        transfer.equipment,
      );
      await page.locator(".equipment-build-status").scrollIntoViewIfNeeded();
      await capture(page, `${width}-stale.png`);
      await preview(page, "Lucky");
      await expect(page.locator(".equipment-build-moves")).toContainText(
        `${initial.party[1].name} · Ring I: ${ringName} → Empty`,
      );
      await expect(
        page.getByRole("button", { name: "Apply Build", exact: true }),
      ).toBeDisabled();
      const approve = page.getByLabel(
        "I approve the listed item transfers from other party members.",
      );
      await approve.scrollIntoViewIfNeeded();
      await capture(page, `${width}-transfer.png`);
      await approve.check();
      await page
        .getByRole("button", { name: "Apply Build", exact: true })
        .click();
      await expect(page.locator(".equipment-build-status")).toContainText(
        "Lucky” applied",
      );
      const lucky = await api(page, "getGame");
      expect(
        lucky.equipment[0].loadout.find((s) => s.id === "ring_1").instance_id,
      ).toBe(ring);
      expect(
        lucky.equipment[1].loadout.find((s) => s.id === "ring_1").item,
      ).toBeUndefined();
      await capture(page, `${width}-saved.png`);
      const travelID = lucky.equipment_builds[0].find(
        (b) => b.name === "Travel",
      ).id;
      await row(page, "Travel")
        .getByRole("button", { name: "Overwrite", exact: true })
        .click();
      await expect(page.locator(".equipment-build-delete")).toContainText(
        "Overwrite “Travel” with Hero’s current equipment?",
      );
      await page
        .getByRole("button", { name: "Confirm overwrite", exact: true })
        .click();
      await expect(page.locator(".equipment-build-status")).toContainText(
        "overwritten with current gear. Gear unchanged.",
      );
      const overwritten = await api(page, "getGame");
      expect(overwritten.equipment).toEqual(lucky.equipment);
      expect(
        overwritten.equipment_builds[0].find((b) => b.id === travelID).slots
          .ring_1.instance_id,
      ).toBe(ring);

      // Delete modifies the recipe for a loadout only.
      await row(page, "Travel")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm delete" }).click();
      await expect(page.locator(".equipment-build-status")).toContainText(
        "Build deleted",
      );
      expect((await api(page, "getGame")).equipment).toEqual(lucky.equipment);
      await save(page, "Travel again");
      await closeBuilds(page);
      await page.getByRole("button", { name: "Close equipment" }).click();
      expect(
        await page.evaluate(() =>
          window.__kithlandsTest.saveGame("Saved builds proof"),
        ),
      ).toMatchObject({ status: "saved" });
      const saves = await page.evaluate(() =>
        window.__kithlandsTest.listSaves(),
      );
      const saved = saves.saves.find((s) => s.name === "Saved builds proof");
      expect(saved).toBeTruthy();
      await page.evaluate(
        (id) => window.__kithlandsTest.loadSave(id),
        saved.id,
      );
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("World"),
      );
      const restored = await api(page, "getGame");
      expect(restored.equipment_builds[0].map((b) => b.name)).toEqual([
        "Lucky",
        "Travel again",
      ]);
      expect(restored.equipment).toEqual(lucky.equipment);
      await page.keyboard.press("m");
      await page.evaluate(() =>
        window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
      );
      await openBuilds(page);
      await preview(page, "Lucky");
      await page.locator(".equipment-build-slots").scrollIntoViewIfNeeded();
      await capture(page, `${width}-reloaded.png`);
      // Build references can outlive an item. Model an old save with a sold or
      // deleted bag item in the isolated DB, then exercise the real load/preview.
      await closeBuilds(page);
      await page.getByRole("button", { name: "Close equipment" }).click();
      await api(page, "unequipItem", 0, "ring_1");
      expect(
        await page.evaluate(() =>
          window.__kithlandsTest.saveGame("Unavailable build fixture"),
        ),
      ).toMatchObject({ status: "saved" });
      const fixtureSaves = await page.evaluate(() =>
        window.__kithlandsTest.listSaves(),
      );
      const fixture = fixtureSaves.saves.find(
        (s) => s.name === "Unavailable build fixture",
      );
      expect(process.env.DATABASE_URL).toBeTruthy();
      execFileSync(
        "psql",
        [
          process.env.DATABASE_URL,
          "-v",
          "ON_ERROR_STOP=1",
          "-v",
          `fixture_id=${fixture.id}`,
          "-v",
          `instance_id=${ring}`,
        ],
        {
          input:
            "UPDATE saves SET inventory = inventory #- ARRAY['instances', :'instance_id'] WHERE id = :'fixture_id';",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      await page.evaluate(
        (id) => window.__kithlandsTest.loadSave(id),
        fixture.id,
      );
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("World"),
      );
      const missingBefore = await api(page, "getGame");
      await page.keyboard.press("m");
      await page.evaluate(() =>
        window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
      );
      await openBuilds(page);
      await preview(page, "Lucky");
      await expect(page.locator(".equipment-build-reasons")).toContainText(
        "missing or sold",
      );
      await expect(
        page.getByRole("button", { name: "Apply Build", exact: true }),
      ).toBeDisabled();
      expect((await api(page, "getGame")).equipment).toEqual(
        missingBefore.equipment,
      );
      await page.locator(".equipment-build-reasons").scrollIntoViewIfNeeded();
      await capture(page, `${width}-missing.png`);
      // Mobile/compact panel stays within viewport and all actions are scrollable.
      const box = await page.locator(".equipment-build-dialog").boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Saved Builds", exact: true }),
      ).toBeFocused();
      expect(
        await page.evaluate(
          () => window.__kithlandsTest.sceneFlags("World").modalLocks,
        ),
      ).toContain("equipment_screen");
      await page.locator('[data-slot-id="main_hand"]').click();
      await page.getByRole("button", { name: "Socket", exact: true }).click();
      await page.waitForFunction(() =>
        window.__kithlandsTest
          .visibleTexts("World")
          .some((t) => t.text === "GEM WORKSHOP"),
      );
      await page.evaluate(() =>
        window.__kithlandsTest.clickInteractiveText("CLOSE", "World"),
      );
      await expect(
        page.getByRole("dialog", { name: "Character", exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-slot-id="main_hand"]')).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator(".equipment-character")).toHaveText(
        initial.party[0].name,
      );
      await capture(page, `${width}-workshop-return.png`);
    });
  });
}
