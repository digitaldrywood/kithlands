import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const proofDir = `tmp/cadott-inn-${Date.now()}`;
mkdirSync(proofDir, { recursive: true });
test.use({ hasTouch: true });

async function move(page, scene, directions) {
  for (const direction of directions) {
    const samples = await page.evaluate(
      ({ scene, direction }) =>
        window.__kithlandsTest.sampleMovePlayer(direction, scene),
      { scene, direction },
    );
    expect(
      samples[0].moved,
      `${scene}: ${direction} at ${samples[0].x},${samples[0].y}`,
    ).toBe(true);
  }
}
async function ready(page, scene) {
  await page.waitForFunction(
    (key) => window.__kithlandsTest.activeSceneKey() === key,
    scene,
  );
  await page.evaluate(
    (key) => window.__kithlandsTest.waitForSceneReady(key),
    scene,
  );
}
async function tap(page, x, y) {
  const box = await page.locator("canvas").boundingBox();
  const size = await page.evaluate(() =>
    window.__kithlandsTest.logicalGameSize("Town"),
  );
  await page.touchscreen.tap(
    box.x + (x * box.width) / size.width,
    box.y + (y * box.height) / size.height,
  );
}
async function dialogueOpen(page) {
  await page.waitForFunction(() =>
    window.__kithlandsTest
      .visibleTexts("Town")
      .some(
        ({ text }) => text === "Enter" || text === "Tap" || text === "Close",
      ),
  );
}
async function closeDialogue(page, mobile) {
  for (let i = 0; i < 12; i++) {
    const open = await page.evaluate(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some(
          ({ text }) => text === "Enter" || text === "Tap" || text === "Close",
        ),
    );
    if (!open) return;
    if (mobile) {
      const layout = await page.evaluate(() =>
        window.__kithlandsTest.gameplayViewportSnapshot("Town"),
      );
      await tap(page, 400, layout.playfieldBottom - 160);
    } else await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
  throw new Error("Dialogue did not close");
}
const persistent = (s) => ({
  gold: s.gold,
  party: s.party,
  items: s.items,
  equipment: s.equipment,
  flags: s.triggered_flags,
});

for (const viewport of [
  { width: 800, height: 600 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  const label = `${viewport.width}x${viewport.height}`;
  test(`Riverlight Inn complete visit at ${label}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const mobile = viewport.width === 390;
    const capture = async (stage) =>
      page.screenshot({
        path: `${proofDir}/${label}-${stage}.png`,
        fullPage: true,
      });
    const requests = [];
    page.on("request", (request) => {
      if (request.method() === "POST") requests.push(request.url());
    });
    await page.goto("/?noEncounters=1");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await ready(page, "World");
    await page.evaluate(() =>
      window.__kithlandsTest.setPartyVitals(
        [
          { slot: 0, hp: 1, mp: 0 },
          { slot: 1, hp: 2, mp: 0 },
        ],
        "World",
      ),
    );
    await move(page, "World", ["up"]);
    await page.keyboard.press("Enter");
    await ready(page, "Settlement");
    await move(page, "Settlement", [
      "up",
      ...Array(7).fill("left"),
      ...Array(7).fill("up"),
    ]);
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.settlementSnapshot().currentInteraction,
      ),
    ).toBe("inn-door");
    await page.keyboard.press("Enter");
    await ready(page, "Town");
    await page.waitForFunction(
      () => window.__kithlandsTest.townSnapshot().backgroundLoaded,
    );
    let town = await page.evaluate(() => window.__kithlandsTest.townSnapshot());
    expect(town).toMatchObject({
      templateId: "inn_gilded_steps_2f",
      floorCount: 2,
      backgroundLoaded: true,
      hidesTileLayer: true,
      playerX: 8,
      playerY: 10,
    });
    expect(town.npcKeys).toEqual(["npc_innkeeper", "npc_elder", "npc_guard"]);
    const before = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    expect(before.current_location).toMatchObject({
      kind: "interior",
      map_id: "cadott-riverlight-inn",
    });
    if (mobile) {
      const layout = await page.evaluate(() =>
        window.__kithlandsTest.gameplayViewportSnapshot("Town"),
      );
      await tap(page, layout.action.x, layout.action.y);
      await tap(page, layout.dpad.x + layout.dpad.offset, layout.dpad.y);
      await page.waitForFunction(
        () => window.__kithlandsTest.townSnapshot().playerX === 9,
      );
      await page.waitForTimeout(300);
      await tap(page, layout.dpad.x - layout.dpad.offset, layout.dpad.y);
      await page.waitForFunction(
        () => window.__kithlandsTest.townSnapshot().playerX === 8,
      );
      await page.waitForTimeout(300);
    }
    await capture("arrival");
    await move(page, "Town", ["up", "up", "up"]);
    const blocked = await page.evaluate(() =>
      window.__kithlandsTest.movePlayer("up", "Town"),
    );
    expect(blocked.moved).toBe(false);
    // The helper only clears incidental hidden-item targeting. Dialogue is
    // advanced using real keyboard/touch input and rest uses the live server.
    await page.evaluate(() => window.__kithlandsTest.beginInteract("Town"));
    await dialogueOpen(page);
    await capture("reception-dialogue");
    await closeDialogue(page, mobile);
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .gameState("Town")
        .party.every((p) => p.hp === p.max_hp && p.mp === p.max_mp),
    );
    const rested = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    expect(rested.gold).toBe(before.gold);
    expect(requests.filter((url) => url.endsWith("/town/rest"))).toHaveLength(
      1,
    );
    await capture("restored");
    // Talk to the neighboring guest without charging or resting a second time.
    await move(page, "Town", ["left", "left", "left", "up", "up"]);
    await page.evaluate(() => window.__kithlandsTest.beginInteract("Town"));
    await dialogueOpen(page);
    await closeDialogue(page, mobile);
    expect(requests.filter((url) => url.endsWith("/town/rest"))).toHaveLength(
      1,
    );
    // Walk behind reception and around the dining group to the stair landing.
    await move(page, "Town", ["right", "right"]);
    await capture("behind-counter");
    await move(page, "Town", ["up", "right", "right", "up"]);
    await page.waitForFunction(
      () => window.__kithlandsTest.townSnapshot().floorIndex === 1,
    );
    await ready(page, "Town");
    await page.waitForFunction(() =>
      window.__kithlandsTest.townSnapshot().backgroundAsset?.includes("guest"),
    );
    await move(page, "Town", [
      "right",
      "right",
      "right",
      "up",
      "up",
      "up",
      "right",
      "right",
      "right",
      "up",
    ]);
    town = await page.evaluate(() => window.__kithlandsTest.townSnapshot());
    expect(town.chests).toEqual([
      { id: "gilded_guest_chest", x: 14, y: 2, opened: false },
    ]);
    if (mobile) await tap(page, 10, 120);
    await capture("guest-chest");
    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    await page.waitForFunction(
      () => window.__kithlandsTest.townSnapshot().chests[0].opened,
    );
    const claimed = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    await page.evaluate(() => window.__kithlandsTest.interact("Town"));
    expect(
      persistent(
        await page.evaluate(() => window.__kithlandsTest.gameState("Town")),
      ),
    ).toEqual(persistent(claimed));
    await capture("guest-chest-open");
    const saved = await page.evaluate(() =>
      window.__kithlandsTest.saveGame("Riverlight Inn proof", "Town"),
    );
    expect(saved.error).toBeUndefined();
    await move(page, "Town", [
      "down",
      "left",
      "left",
      "left",
      "down",
      "down",
      "down",
      "left",
      "left",
      "left",
    ]);
    await page.waitForFunction(
      () => window.__kithlandsTest.townSnapshot().floorIndex === 0,
    );
    await ready(page, "Town");
    await move(page, "Town", [
      "down",
      "down",
      ...Array(4).fill("right"),
      ...Array(3).fill("down"),
      ...Array(5).fill("left"),
      ...Array(3).fill("down"),
    ]);
    await ready(page, "Settlement");
    expect(
      await page.evaluate(() => window.__kithlandsTest.settlementSnapshot()),
    ).toMatchObject({ playerX: 6, playerY: 9 });
    const returned = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Settlement"),
    );
    expect(returned.current_location.kind).toBe("settlement");
    expect(persistent(returned)).toEqual(persistent(claimed));
    await move(page, "Settlement", ["down"]);
    await capture("town-return");
    // Phaser reuses Town. A completed exit must not lock the next inn visit.
    await move(page, "Settlement", ["up", "left", "up"]);
    await page.keyboard.press("Enter");
    await ready(page, "Town");
    await move(page, "Town", ["down"]);
    await ready(page, "Settlement");
    expect(
      await page.evaluate(() => window.__kithlandsTest.settlementSnapshot()),
    ).toMatchObject({ playerX: 6, playerY: 9 });
    expect(
      persistent(
        await page.evaluate(() =>
          window.__kithlandsTest.gameState("Settlement"),
        ),
      ),
    ).toEqual(persistent(claimed));
    await capture("town-repeat-return");
    writeFileSync(
      `${proofDir}/${label}-state.json`,
      JSON.stringify(
        { before, rested, claimed, returned, requests, saved },
        null,
        2,
      ),
    );
  });
}
