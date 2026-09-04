import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

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
  // Choose the visible action control. This is normal pointer navigation;
  // it follows server-validated tile steps even for offscreen mobile pins.
  for (let attempt = 0; attempt < 4; attempt++) {
    const texts = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Dungeon"),
    );
    if (texts.some((t) => t.text === a.label || t.text === `✓ ${a.label}`)) {
      await page.evaluate(
        (label) =>
          window.__kithlandsTest.clickInteractiveText(label, "Dungeon"),
        a.label,
      );
      return;
    }
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("More", "Dungeon"),
    );
  }
  throw new Error(`No visible control for ${id}`);
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
    if (
      (await state(page)).dungeon.actions.some((a) => a.id === "trail-bats")
    ) {
      await act(page, "trail-bats", viewport);
      await resolveBattle(page);
    }
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

async function act(page, id, viewport) {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/dungeon") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action_id === id,
  );
  await tapAction(page, id, viewport);
  const result = await (await response).json();
  expect(result.error, `action ${id}`).toBeUndefined();
  const scene =
    result.phase === "combat"
      ? "Battle"
      : result.current_location.kind === "dungeon"
        ? "Dungeon"
        : result.current_location.kind === "settlement"
          ? "Settlement"
          : "World";
  await page.waitForFunction(
    (key) => window.__kithlandsTest.activeSceneKey() === key,
    scene,
  );
  if (scene === "Battle") {
    await page.waitForFunction(
      () => window.__kithlandsTest.visibleTexts("Battle").length > 5,
    );
  } else {
    await page.evaluate(
      (key) => window.__kithlandsTest.waitForSceneReady(key),
      scene,
    );
  }
  return result;
}
// Automated combat inputs use the ordinary action endpoint and real damage,
// MP, consumables, XP and loot. No forced victory or enemy/party overrides.
async function resolveBattle(page) {
  for (let round = 0; round < 60; round++) {
    const s = await state(page);
    if (s.phase !== "combat") return s;
    let potions = s.potions,
      ethers = s.ethers;
    const actions = s.party.flatMap((p, slot) => {
      if (p.hp <= 0) return [];
      const target = s.enemies.find((e) => e.hp > 0).id;
      let lowest = slot;
      s.party.forEach((other, i) => {
        if (
          other.hp > 0 &&
          other.hp * s.party[lowest].max_hp < s.party[lowest].hp * other.max_hp
        )
          lowest = i;
      });
      if (s.party[lowest].hp * 3 < s.party[lowest].max_hp && potions > 0) {
        potions--;
        return [{ slot, type: "item", item_id: "potion", target_id: lowest }];
      }
      if (p.class_id === "cinder" && p.mp < 3 && ethers > 0) {
        ethers--;
        return [{ slot, type: "item", item_id: "ether", target_id: slot }];
      }
      const spell = p.spells?.find(
        (sp) =>
          sp.id === "spark" && sp.castable_in_combat && sp.mp_cost <= p.mp,
      );
      return [
        {
          slot,
          type: spell ? "spell" : "attack",
          spell_id: spell?.id,
          target_id: target,
        },
      ];
    });
    await page.evaluate(
      (action) => window.__kithlandsTest.submitAction(action, "Battle"),
      { type: "attack", actions },
    );
  }
  throw new Error("battle exceeded round limit");
}
const route = [
  "split-oak",
  "kingfisher-bend",
  "trail-bats",
  "mill-door",
  "ledger",
  "grain-door",
  "grain-spider",
  "spare-handle",
  "grain-loft",
  "loft-beetle",
  "loft-grain",
  "grain-return",
  "drying-door",
  "drying-beetle",
  "supply-potions",
  "supply-ethers",
  "drying-wheel",
  "wheel-slime",
  "wheel-handle",
  "wheel-gallery",
  "gallery-bats",
  "sluice-lever",
  "gallery-roots",
  "root-spider",
  "roots-tailrace",
  "tailrace-bar",
  "tailrace-workshop",
  "workshop-rest",
  "maintenance-shortcut",
  "tailrace-trail",
  "heron-trail",
  "heron-secret",
  "heron-cache",
  "pool-return",
  "trail-shortcut",
  "tailrace-roots",
  "roots-gallery",
  "gallery-loft",
  "loft-secret",
  "loft-gallery",
  "gallery-roots",
  "roots-heart",
  "warden",
  "miller-keepsake",
  "heart-return",
  "roots-tailrace",
  "tailrace-trail",
  "trail-home",
];
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`complete authored Old Mill route with real combat ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await page.setViewportSize(viewport);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Old Mill trail", "World"),
    );
    await room(page, "approach");
    const started = Date.now();
    const seen = new Set();
    let prePayoff;
    for (const id of route) {
      const before = await state(page);
      if (!seen.has(before.dungeon.room_id)) {
        seen.add(before.dungeon.room_id);
        await capture(page, `${viewport.width}-full-${before.dungeon.room_id}`);
      }
      if (id === "trail-home") prePayoff = before.gold;
      const result = await act(page, id, viewport);
      if (result.phase === "combat") {
        if (id === "warden") {
          await page.waitForTimeout(1500); // Let the existing boss entrance finish.
          await capture(page, `${viewport.width}-warden-battle`);
        }
        await resolveBattle(page);
        expect(
          (await state(page)).dungeon.actions.find((a) => a.id === id)
            ?.completed,
          `real combat victory for ${id}`,
        ).toBe(true);
      }
      if (
        id === "wheel-handle" ||
        id === "sluice-lever" ||
        id === "tailrace-bar" ||
        id === "miller-keepsake"
      )
        await capture(page, `${viewport.width}-${id}-complete`);
    }
    const end = await state(page);
    expect(seen.size).toBe(12);
    expect(end.dungeon_entry.completed).toBe(true);
    expect(end.gold).toBe(prePayoff + 80);
    expect(end.message).toContain("80 gold");
    expect(end.combat_log || []).toEqual([]);
    await capture(page, `${viewport.width}-return-payoff`);
    console.log(
      `Old Mill ${viewport.width}: automated actual-combat route ${((Date.now() - started) / 60000).toFixed(2)} minutes; this is not unassisted first-visit duration.`,
    );
    // Re-enter via the unlocked route: server state must still mark the boss,
    // reward, and shortcut complete, with no second town payout.
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Old Mill trail", "World"),
    );
    await room(page, "approach");
    await act(page, "trail-shortcut", viewport);
    await act(page, "tailrace-roots", viewport);
    await act(page, "roots-heart", viewport);
    const again = await state(page);
    expect(again.dungeon.actions.find((a) => a.id === "warden").completed).toBe(
      true,
    );
    expect(
      again.dungeon.actions.find((a) => a.id === "miller-keepsake").completed,
    ).toBe(true);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Retreat", "Dungeon"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    expect((await state(page)).gold).toBe(end.gold);
    expect(errors).toEqual([]);
  });
}

test("Old Mill keyboard, real defeat recovery and retry at 800x600", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const viewport = { width: 800, height: 600 };
  await page.setViewportSize(viewport);
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("Title"),
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  const entry = await page.evaluate(() =>
    window.__kithlandsTest.interactiveTextPosition("Old Mill trail", "World"),
  );
  await page.mouse.click(entry.x, entry.y);
  await room(page, "approach");
  const start = (await state(page)).dungeon.position;
  await page.keyboard.down("ArrowUp");
  await page.waitForFunction(
    (y) => window.__kithlandsTest.gameState()?.dungeon?.position.y < y,
    start.y,
  );
  await page.keyboard.up("ArrowUp");
  await page.evaluate(() =>
    window.__kithlandsTest.waitForSceneReady("Dungeon"),
  );
  await capture(page, "800-keyboard-approach");
  await act(page, "split-oak", viewport);
  const gold = (await state(page)).gold;
  await act(page, "trail-bats", viewport);
  await capture(page, "800-before-defeat");
  // Real enemies take ordinary wait turns until the party loses. No debug
  // damage, forced defeat, level grants or enemy overrides are used.
  for (
    let round = 0;
    round < 120 && (await state(page)).phase === "combat";
    round++
  ) {
    await page.evaluate(() =>
      window.__kithlandsTest.startAuthoritativeBattleRound("wait"),
    );
    await page.waitForFunction(
      () =>
        window.__kithlandsTest.activeSceneKey() === "Dungeon" ||
        !window.__kithlandsTest.battleVisibilitySnapshot().animating,
    );
    expect(
      await page.evaluate(() =>
        window.__kithlandsTest
          .visibleTexts("Battle")
          .some((t) => t.text === "VICTORY!"),
      ),
    ).toBe(false);
  }
  await room(page, "approach");
  const recovered = await state(page);
  expect(recovered.phase).toBe("world");
  expect(recovered.dungeon.recovered_from_defeat).toBe(true);
  expect(recovered.party.every((p) => p.hp === p.max_hp)).toBe(true);
  expect(recovered.gold).toBe(gold);
  expect(
    recovered.dungeon.actions.find((a) => a.id === "trail-bats").completed,
  ).toBe(false);
  expect(
    recovered.dungeon.actions.find((a) => a.id === "split-oak").completed,
  ).toBe(true);
  await capture(page, "800-defeat-recovered");
  await act(page, "trail-bats", viewport);
  // Drive the existing Smart key and let the real battle animation/results
  // flow run, then use its Continue control to return to exploration.
  for (
    let attempt = 0;
    attempt < 120 && (await state(page)).phase === "combat";
    attempt++
  ) {
    await page.keyboard.press("m");
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Battle")
      .some((t) => t.text === "Continue"),
  );
  await capture(page, "800-retry-victory-results");
  await page.keyboard.press("Enter");
  await room(page, "approach");
  expect(
    (await state(page)).dungeon.actions.find((a) => a.id === "trail-bats")
      .completed,
  ).toBe(true);
  await capture(page, "800-retry-victory");
  // The integrated bestiary must receive the discovery from a real authored
  // encounter through GameState, including after returning to the world.
  expect((await state(page)).discovered.mill_bat).toBe(true);
  await page.evaluate(() =>
    window.__kithlandsTest.clickInteractiveText("Retreat", "Dungeon"),
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("World"),
  );
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
  await page.keyboard.press("h");
  await expect(page.getByRole("dialog", { name: "Field codex" })).toBeVisible();
  await expect(page.locator(".bestiary-detail h2")).toHaveText("Mill Bat");
  await expect(page.locator(".bestiary-detail img")).toHaveAttribute(
    "alt",
    "Mill Bat",
  );
  await expect(page.locator(".bestiary-detail img")).toHaveJSProperty(
    "complete",
    true,
  );
  await capture(page, "800-mill-bat-discovery");
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Old Mill party menu map guard and input recovery ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(() =>
      window.__kithlandsTest.sceneIsActive("World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Old Mill trail", "World"),
    );
    await room(page, "approach");
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Party", "Dungeon"),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("Dungeon").menuOpen,
    );
    const summary = await page.evaluate(() =>
      window.__kithlandsTest.partyMenuSummary("Dungeon"),
    );
    const mapButton = summary.actionIcons.find(
      (action) => action.label === "WORLD MAP" && action.kind === "button",
    );
    expect(mapButton.interactive).toBe(false);
    await capture(page, `${viewport.width}-party-map-disabled`);
    await tapLogical(
      page,
      (mapButton.bounds.left + mapButton.bounds.right) / 2,
      (mapButton.bounds.top + mapButton.bounds.bottom) / 2,
      summary.logicalSize.width,
      summary.logicalSize.height,
    );
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("Dungeon").modalLocks,
      ),
    ).toEqual(["party_menu"]);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("CLOSE", "Dungeon"),
    );
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Dungeon").menuOpen,
    );
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("Dungeon").modalLocks,
      ),
    ).toEqual([]);
    const before = (await state(page)).dungeon.position;
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(180);
    await page.keyboard.up("ArrowUp");
    await page.waitForFunction((before) => {
      const position = window.__kithlandsTest.gameState().dungeon.position;
      return position.x !== before.x || position.y !== before.y;
    }, before);
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Dungeon").animating,
    );
    await capture(page, `${viewport.width}-party-closed-movement`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("Dungeon").menuOpen,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("Dungeon").menuOpen,
    );
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("Dungeon").modalLocks,
      ),
    ).toEqual([]);
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("Retreat", "Dungeon"),
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest.sceneIsActive("World"),
    );
    await page.evaluate(() =>
      window.__kithlandsTest.waitForSceneReady("World"),
    );
    await page.keyboard.press("m");
    await page.waitForFunction(
      () => window.__kithlandsTest.sceneFlags("World").menuOpen,
    );
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("WORLD MAP", "World"),
    );
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").modalLocks,
      ),
    ).toEqual(["world_map"]);
    await capture(page, `${viewport.width}-world-map-after-retreat`);
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").modalLocks,
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
