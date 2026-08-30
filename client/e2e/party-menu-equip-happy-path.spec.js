import { test, expect } from "@playwright/test";

const RUN_ID = Date.now();
const SLOT = 0;

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startPartyMenuGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [
        { name: "Coach Bell", relation: "friendly" },
        { name: "Ms Rivera", relation: "neutral" },
        { name: "Mallory", relation: "rival" },
      ],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
        { name: "Cato", class_id: "cinder" },
        { name: "Nia", class_id: "rogue" },
      ],
      difficulty: "normal",
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

async function addProofOverlay(page, stepLabel) {
  await page.evaluate(
    ({ label, slot }) => {
      const existing = document.getElementById("party-menu-equip-proof");
      if (existing) existing.remove();

      const panel = document.createElement("div");
      panel.id = "party-menu-equip-proof";
      panel.style.position = "fixed";
      panel.style.top = "8px";
      panel.style.left = "8px";
      panel.style.zIndex = "9999";
      panel.style.background = "rgba(15, 23, 42, 0.92)";
      panel.style.color = "#e2e8f0";
      panel.style.padding = "10px 12px";
      panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
      panel.style.borderRadius = "8px";
      panel.style.fontFamily = "monospace";
      panel.style.fontSize = "12px";
      panel.style.whiteSpace = "pre";

      const state = window.__kithlandsTest.gameState("World");
      const member = state?.party?.[slot];
      const equip = state?.equipment?.[slot];
      const toast = window.__kithlandsTest.messageState("World");
      panel.textContent = [
        label,
        `Member: ${member?.name || "?"}`,
        `ATK: ${(member?.str ?? 0) + (equip?.weapon_power ?? 0)}`,
        `Weapon: ${equip?.weapon_name || "(none)"}`,
        `Toast: ${toast.visible ? toast.text : "(hidden)"}`,
      ].join("\n");
      document.body.appendChild(panel);
    },
    { label: stepLabel, slot: SLOT },
  );
}

test.describe("party menu equip happy path", () => {
  test("opens party menu, equips a bought weapon, and persists the stat change", async ({
    page,
  }) => {
    await startPartyMenuGame(page);

    const before = await page.evaluate((slot) => {
      const state = window.__kithlandsTest.gameState("World");
      return {
        member: state.party[slot],
        equip: state.equipment[slot],
        attack:
          state.party[slot].str + (state.equipment[slot].weapon_power || 0),
      };
    }, SLOT);
    expect(before.equip.weapon_name).not.toBe("Iron Sword");

    const buyResult = await page.evaluate(() =>
      window.__kithlandsTest.buyItem("iron_sword", "weapon", "World"),
    );
    expect(buyResult.error).toBeFalsy();

    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );

    const layout = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuLayout("World"),
    );
    expect(layout.panelBounds).toEqual({
      left: 20,
      right: 780,
      top: 30,
      bottom: 570,
      width: 760,
      height: 540,
    });
    expect(layout.outOfBounds).toEqual([]);
    expect(layout.barCounts.track).toBeGreaterThanOrEqual(10);
    expect(layout.labelCounts.hp).toBeGreaterThanOrEqual(4);
    expect(layout.labelCounts.xp).toBeGreaterThanOrEqual(4);
    expect(layout.labelCounts.mp).toBeGreaterThanOrEqual(2);

    await addProofOverlay(page, "Party menu open");
    await page.screenshot({
      path: `tmp/issue-103-party-menu-open-${RUN_ID}.png`,
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
    );
    await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();
    await expect(page.locator(".equipment-character")).toHaveText(
      before.member.name,
    );

    await page.locator('[data-slot-id="main_hand"]').click();
    const ironSword = page
      .locator(".equipment-item-row:not(.is-disabled)")
      .filter({ hasText: "Iron Sword" })
      .first();
    await expect(ironSword).toBeVisible();
    await ironSword.click();
    await page.getByRole("button", { name: /^Equip in / }).click();
    await page.waitForFunction(
      ({ slot }) =>
        window.__kithlandsTest.gameState("World").equipment[slot]
          .weapon_name === "Iron Sword",
      { slot: SLOT },
    );
    await expect(page.locator('[data-slot-id="main_hand"]')).toContainText(
      "Iron Sword",
    );

    const afterEquip = await page.evaluate((slot) => {
      const state = window.__kithlandsTest.gameState("World");
      return {
        member: state.party[slot],
        equip: state.equipment[slot],
        attack:
          state.party[slot].str + (state.equipment[slot].weapon_power || 0),
        toast: window.__kithlandsTest.messageState("World"),
      };
    }, SLOT);
    expect(afterEquip.equip.weapon_name).toBe("Iron Sword");
    expect(afterEquip.equip.weapon_power).toBe(12);
    expect(afterEquip.attack).toBeGreaterThan(before.attack);
    await expect(page.locator(".character-summary-panel")).toContainText(
      String(afterEquip.attack),
    );

    await addProofOverlay(page, "After equip");
    await page.screenshot({
      path: `tmp/issue-103-party-menu-equipped-${RUN_ID}.png`,
      fullPage: true,
    });

    await page.getByRole("button", { name: "Close equipment" }).click();
    await expect(page.getByRole("dialog", { name: "Character" })).toBeHidden();

    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickMenuButton("CHARACTER", "World"),
    );
    await expect(page.getByRole("dialog", { name: "Character" })).toBeVisible();

    const reopened = await page.evaluate((slot) => {
      const state = window.__kithlandsTest.gameState("World");
      return {
        member: state.party[slot],
        equip: state.equipment[slot],
        attack:
          state.party[slot].str + (state.equipment[slot].weapon_power || 0),
      };
    }, SLOT);
    expect(reopened.equip.weapon_name).toBe("Iron Sword");
    expect(reopened.attack).toBe(afterEquip.attack);
    await expect(page.locator('[data-slot-id="main_hand"]')).toContainText(
      "Iron Sword",
    );
    await expect(page.locator(".character-summary-panel")).toContainText(
      String(afterEquip.attack),
    );

    await addProofOverlay(page, "Reopened detail persists");
    await page.screenshot({
      path: `tmp/issue-103-party-menu-persist-${RUN_ID}.png`,
      fullPage: true,
    });

    await page.getByRole("button", { name: "Close equipment" }).click();
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
  });
});
