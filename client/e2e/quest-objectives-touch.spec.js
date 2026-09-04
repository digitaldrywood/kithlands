import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Reuse a normal mid-quest save from the walking proof. Only renderer setup
// skips travel here; the campaign proof measures the actual outbound/return.
const source = process.env.OBJECTIVE_TOUCH_SOURCE
  ? JSON.parse(readFileSync(process.env.OBJECTIVE_TOUCH_SOURCE, "utf8"))
  : null;
const proofDir = path.join("tmp", "readiness", `objective-touch-${Date.now()}`);
mkdirSync(proofDir, { recursive: true });
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

for (const template of ["Q01", "Q02", "Q03"]) {
  test(`${template} handoff uses the phone action button once`, async ({
    page,
  }) => {
    test.skip(
      !source,
      "Set OBJECTIVE_TOUCH_SOURCE to a natural campaign checkpoint JSON",
    );
    test.setTimeout(90_000);
    await page.goto("/");
    await page.waitForFunction(() =>
      window.__kithlandsTest?.sceneIsActive("Title"),
    );
    await page.evaluate(
      (email) => window.__kithlandsTest.startQuickGame(email),
      source.email,
    );
    const saves = await page.evaluate(() => window.__kithlandsTest.listSaves());
    const saved = saves.saves.find((entry) =>
      entry.name.startsWith(`Objective custody ${template}-`),
    );
    expect(saved, `natural ${template} custody checkpoint`).toBeTruthy();
    await page.evaluate((id) => window.__kithlandsTest.loadSave(id), saved.id);
    const before = await page.evaluate(() =>
      window.__kithlandsTest.gameState("World"),
    );
    const q = before.quests[before.current_quest];
    expect(q.template_id).toBe(template);
    expect(q.objectives.step).toBe(2);
    const spawn = before.tilemap.spawns.find(
      (entry) => entry.node_id === q.target_node_id,
    );
    expect(spawn).toBeTruthy();
    await page.evaluate(
      async ({ node, spawn }) => {
        const result = await window.__kithlandsTest.submitAction(
          { type: "quest_advance", node_id: node },
          "World",
        );
        if (result.error) throw new Error(result.error);
        window.__kithlandsTest.startTownScene(spawn, "World");
      },
      { node: q.target_node_id, spawn },
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest.sceneIsActive("Town"),
    );
    await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("Town"));
    for (let moves = 0; moves < 80; moves++) {
      await page.waitForFunction(
        () => !window.__kithlandsTest.townNavigationSnapshot().animating,
      );
      const nav = await page.evaluate(() =>
        window.__kithlandsTest.townNavigationSnapshot(),
      );
      if (nav.nearNpcIndex === 0) break;
      const queue = [{ x: nav.x, y: nav.y, path: [] }],
        seen = new Set([`${nav.x},${nav.y}`]);
      let route;
      for (let i = 0; i < queue.length; i++) {
        const at = queue[i];
        const distances = nav.npcs.map(
          (npc) => Math.abs(npc.x - at.x) + Math.abs(npc.y - at.y),
        );
        if (
          distances[0] <= 2 &&
          distances.indexOf(Math.min(...distances)) === 0
        ) {
          route = at.path;
          break;
        }
        for (const [direction, dx, dy] of [
          ["up", 0, -1],
          ["down", 0, 1],
          ["left", -1, 0],
          ["right", 1, 0],
        ]) {
          const x = at.x + dx,
            y = at.y + dy,
            key = `${x},${y}`;
          if (!nav.walkable[y]?.[x] || seen.has(key)) continue;
          seen.add(key);
          queue.push({ x, y, path: [...at.path, direction] });
        }
      }
      expect(route?.length).toBeGreaterThan(0);
      await page.evaluate(
        (direction) => window.__kithlandsTest.movePlayer(direction, "Town"),
        route[0],
      );
    }
    expect(
      (
        await page.evaluate(() =>
          window.__kithlandsTest.townNavigationSnapshot(),
        )
      ).nearNpcIndex,
    ).toBe(0);
    const locationBeforeLog = await page.evaluate(() =>
      window.__kithlandsTest.townNavigationSnapshot(),
    );
    await page.keyboard.press("m");
    await expect
      .poll(() =>
        page.evaluate(() => window.__kithlandsTest.townObjectiveVisible()),
      )
      .toBe(false);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
    );
    await page.screenshot({
      path: path.join(proofDir, `${template}-party-phone.png`),
    });
    await page.evaluate(() =>
      window.__kithlandsTest.clickInteractiveText("QUEST LOG", "Town"),
    );
    const dialog = page.getByRole("dialog", { name: "Quest Log" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("listitem")).toHaveCount(4);
    await expect(dialog.locator('[aria-current="step"]')).toContainText(
      q.actions[3].text,
    );
    await page.keyboard.press("ArrowRight");
    await page.screenshot({
      path: path.join(proofDir, `${template}-quest-log-phone.png`),
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: path.join(proofDir, `${template}-quest-log-desktop.png`),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Close Quest Log" }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => window.__kithlandsTest.townObjectiveVisible()),
      )
      .toBe(true);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
    );
    const locationAfterLog = await page.evaluate(() =>
      window.__kithlandsTest.townNavigationSnapshot(),
    );
    expect([locationAfterLog.x, locationAfterLog.y]).toEqual([
      locationBeforeLog.x,
      locationBeforeLog.y,
    ]);
    const canvas = await page.locator("canvas").boundingBox();
    await page.touchscreen.tap(canvas.x + 4, canvas.y + 4);
    const input = await page.evaluate(() =>
      window.__kithlandsTest.townObjectiveInputSnapshot(),
    );
    expect(input).toMatchObject({
      objectiveVisible: true,
      inputEnabled: true,
      keyboardEnabled: true,
      menuOpen: false,
      modalLocks: [],
    });
    writeFileSync(
      path.join(proofDir, `${template}-input.json`),
      JSON.stringify({ canvas, input }, null, 2),
    );
    await page.screenshot({
      path: path.join(proofDir, `${template}-touch-prompt.png`),
    });
    await page.touchscreen.tap(
      canvas.x + (canvas.width * input.action.x) / input.gameSize.width,
      canvas.y + (canvas.height * input.action.y) / input.gameSize.height,
    );
    await page.waitForFunction(
      (id) =>
        window.__kithlandsTest.gameState("Town").quests.find((q) => q.id === id)
          .completed,
      q.id,
      { timeout: 15_000 },
    );
    await page.waitForFunction(() =>
      window.__kithlandsTest
        .visibleTexts("Town")
        .some((entry) => entry.text.includes("Quest complete:")),
    );
    const after = await page.evaluate(() =>
      window.__kithlandsTest.gameState("Town"),
    );
    expect(after.gold).toBe(before.gold + q.reward.gold);
    expect(after.quests[before.current_quest].objectives).toEqual({ step: 4 });
    await page.screenshot({
      path: path.join(proofDir, `${template}-touch-handoff.png`),
    });
    writeFileSync(
      path.join(proofDir, `${template}-state.json`),
      JSON.stringify({ sourceSave: saved.id, before, after }, null, 2),
    );
  });
}
