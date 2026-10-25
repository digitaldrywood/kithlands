import { expect, test } from "@playwright/test";
import {
  installFieldInputTrace,
  traceFieldKeyboard,
  attachFieldInputTrace,
} from "./helpers/field-input-trace.js";
const traces = new WeakMap();
test.beforeEach(async ({ page }) => {
  traces.set(page, await installFieldInputTrace(page));
});
test.afterEach(async ({ page }, info) => {
  await attachFieldInputTrace(page, info, traces.get(page));
});
const run = Date.now();
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 800, height: 600 },
  { width: 645, height: 847 },
  { width: 390, height: 844 },
]) {
  test(`repeat Cure without reopening menus at ${viewport.width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.evaluate(() =>
      window.__kithlandsTest.setPartyVitals(
        [
          { slot: 0, hp: 1 },
          { slot: 1, hp: 1 },
          { slot: 3, mp: 4 },
        ],
        "World",
      ),
    );
    const before = await page.evaluate(
      () => window.__kithlandsTest.gameState("World").party,
    );
    const caster = before.findIndex((m) =>
      m.spells?.some((s) => s.id === "cure"),
    );
    expect(caster).toBe(3);
    const cost = before[caster].spells.find((s) => s.id === "cure").mp_cost;
    await page.keyboard.press("m");
    const click = async (fn, label) => {
      await page.waitForFunction(
        ({ fn, label }) => !!window.__kithlandsTest[fn](label, "World"),
        { fn, label },
      );
      // Row objects exist before Phaser processes their input registration.
      // Wait for rendered frames before sending a real pointer click.
      await page.evaluate(() =>
        window.__kithlandsTest.waitForSceneReady("World"),
      );
      const pos = await page.evaluate(
        ({ fn, label }) => window.__kithlandsTest[fn](label, "World"),
        { fn, label },
      );
      await page.mouse.click(pos.x, pos.y);
    };
    await page.getByRole("button", { name: /^Magic/ }).click();
    await click("fieldMagicRowPosition", before[caster].name);
    await click("fieldMagicRowPosition", "Cure");
    await traceFieldKeyboard(page);
    await page.screenshot({
      path: info.outputPath(`field-repeat-${run}-${viewport.width}-before.png`),
    });
    let casts = 0;
    let rejectNext = true;
    await page.route("**/game/*/action", async (route) => {
      if (route.request().postDataJSON()?.type === "spell") {
        if (rejectNext) {
          rejectNext = false;
          return route.fulfill({
            json: { error: "Cast unavailable. Try again." },
          });
        }
        casts++;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await route.continue();
    });
    await click("fieldMagicRowPosition", before[2].name);
    expect(rejectNext).toBe(true); // Full-health targets cannot spend MP.
    await click("fieldMagicRowPosition", before[0].name);
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("World")
        .some((entry) => entry.text.includes("Cast unavailable")),
    );
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.gameState("World").party[3].mp,
      ),
    ).toBe(before[3].mp);
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").fieldMagicOpen,
      ),
    ).toBe(true);
    const first = await page.evaluate(
      (name) => window.__kithlandsTest.fieldMagicRowPosition(name, "World"),
      before[0].name,
    );
    await page.mouse.dblclick(first.x, first.y, { delay: 20 });
    await page.waitForFunction(
      ({ caster, mp, cost }) =>
        window.__kithlandsTest.gameState("World").party[caster].mp ===
        mp - cost,
      { caster, mp: before[caster].mp, cost },
    );
    expect(casts).toBe(1);
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").fieldMagicOpen,
      ),
    ).toBe(true);
    const firstState = await page.evaluate(
      () => window.__kithlandsTest.gameState("World").party,
    );
    expect(firstState[0].hp).toBeGreaterThan(before[0].hp);
    if (viewport.width === 800) {
      const target = await page.evaluate(
        (name) => window.__kithlandsTest.fieldMagicRowPosition(name, "World"),
        before[1].name,
      );
      await page.waitForFunction(
        () =>
          window.__kithlandsTest.menuOverlaySummary("magic", "World")?.busy ===
          false,
      );
      await page.mouse.move(target.x, target.y);
      const selected = (name) =>
        page.waitForFunction(
          (name) =>
            window.__kithlandsTest
              .menuOverlaySummary("magic", "World")
              ?.cursorLabel?.startsWith(name),
          name,
        );
      await selected(before[1].name);
      await page.keyboard.press("ArrowUp");
      await selected(before[0].name);
      await page.keyboard.press("ArrowDown");
      await selected(before[1].name);
      await page.keyboard.press("Enter");
    } else {
      await click("fieldMagicRowPosition", before[1].name);
    }
    await page.waitForFunction(
      ({ caster, mp, cost }) =>
        window.__kithlandsTest.gameState("World").party[caster].mp ===
        mp - cost * 2,
      { caster, mp: before[caster].mp, cost },
    );
    expect(casts).toBe(2);
    expect(
      await page.evaluate(
        () => window.__kithlandsTest.sceneFlags("World").fieldMagicOpen,
      ),
    ).toBe(true);
    const after = await page.evaluate(
      () => window.__kithlandsTest.gameState("World").party,
    );
    expect(after[1].hp).toBeGreaterThan(before[1].hp);
    await page.keyboard.press("Enter");
    await page.screenshot({
      path: info.outputPath(`field-repeat-${run}-${viewport.width}-after.png`),
    });
    await click("interactiveTextPosition", "DONE");
    await page.waitForFunction(
      () => !window.__kithlandsTest.sceneFlags("World").fieldMagicOpen,
    );
    expect(casts).toBe(2);
  });
}
