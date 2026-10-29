import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
const proof = path.resolve(`tmp/enemy-tactics-${Date.now()}`);
mkdirSync(proof, { recursive: true });
const state = (page) => page.evaluate(() => window.__kithlandsTest.gameState());
async function ready(page, key = "Dungeon") {
  await page.waitForFunction(
    (key) => window.__kithlandsTest.activeSceneKey() === key,
    key,
  );
  if (key === "Battle") {
    await page.waitForFunction(
      () => window.__kithlandsTest.visibleTexts("Battle").length > 5,
    );
  } else {
    await page.evaluate(
      (key) => window.__kithlandsTest.waitForSceneReady(key),
      key,
    );
  }
}
async function control(page, label, touch) {
  // Phaser registers rebuilt HUD hit areas on its input update, after scene readiness.
  await ready(page);
  const p = await page.evaluate(
    (label) => window.__kithlandsTest.interactiveTextPosition(label, "Dungeon"),
    label,
  );
  expect(p, `visible ${label} control`).toBeTruthy();
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function choose(page, id, touch) {
  const action = (await state(page)).dungeon.actions.find((a) => a.id === id);
  expect(action).toBeTruthy();
  for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
    const visible = await page.evaluate(() =>
      window.__kithlandsTest.visibleTexts("Dungeon"),
    );
    if (
      visible.some(
        (t) => t.text === action.label || t.text === `✓ ${action.label}`,
      )
    ) {
      await control(page, action.label, touch);
      return action;
    }
    await control(page, "More routes", touch);
  }
  throw new Error(`Action not reachable: ${id}`);
}
async function act(page, id, touch) {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/dungeon") &&
      r.request().postDataJSON()?.action_id === id,
    { timeout: 20000 },
  );
  const action = await choose(page, id, touch);
  if (action.encounter?.optional) {
    const fight = page.getByRole("button", { name: "Fight", exact: true });
    if (touch) await fight.tap();
    else {
      await expect(fight).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(fight).toBeFocused();
      await page.keyboard.press("Enter");
    }
  }
  expect((await (await response).json()).error).toBeUndefined();
  await ready(page, action.encounter ? "Battle" : "Dungeon");
}

for (const [width, height, reducedMotion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [800, 600, "reduce"],
]) {
  test.describe(`${width} tactical encounter`, () => {
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
      reducedMotion,
    });
    test("normal Heron encounter advertises preparation and resolves guarded rushes", async ({
      page,
    }) => {
      test.setTimeout(180000);
      const touch = width === 390,
        errors = [],
        trace = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__tacticsGame=game;`,
        });
      });
      await page.goto("/");
      await page.waitForFunction(() =>
        window.__kithlandsTest?.sceneIsActive("Title"),
      );
      await page.evaluate(() => window.__kithlandsTest.startQuickGame());
      await ready(page, "World");
      await page
        .getByRole("button", { name: "Old Mill trail", exact: true })
        .click();
      await ready(page);
      await act(page, "heron-trail", touch);
      await act(page, "pool-bramblehog", touch);
      const readyMember = (slot) =>
        page.waitForFunction((slot) => {
          const scene = window.__tacticsGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            scene.currentMemberIdx === slot &&
            scene.promptText
              ?.getText()
              .startsWith(`${scene.gameState.party[slot].name}'s turn`)
          );
        }, slot);
      await readyMember(0);
      const capture = (label) =>
        page.screenshot({ path: path.join(proof, `${width}-${label}.png`) });
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.__tacticsGame.scene.getScene("Battle").promptText.getText(),
          ),
        )
        .toContain("Enemy plans: Prepare rush");
      await capture("prepare-intent");
      if (touch) {
        const p = await page.evaluate(() =>
          window.__kithlandsTest.interactiveTextPosition("ATTACK", "Battle"),
        );
        await page.touchscreen.tap(p.x, p.y);
      } else await page.keyboard.press("a");
      const choices = page.locator(".battle-choice-panel");
      await expect(choices.locator(".battle-choice-detail")).toHaveText(
        "Plans: Prepare rush",
      );
      await capture("target-plan");
      if (touch)
        await choices.getByRole("button", { name: "Back", exact: true }).tap();
      else await page.keyboard.press("Escape");
      await expect(choices).toHaveCount(0);
      await readyMember(0);

      expect((await state(page)).enemies[0].intent).toEqual({
        kind: "focus",
        label: "Plans: Prepare rush",
      });
      await page.evaluate(() => {
        window.__tacticsFrames = [];
        const game = window.__tacticsGame;
        window.__tacticsCapture = () => {
          const scene = game.scene.getScene("Battle");
          if (
            window.__tacticsFrames.length < 3 &&
            scene.children.list.some(
              (o) => o.active && o._combatFxTag === "ability-cue",
            )
          ) {
            window.__tacticsFrames.push(game.canvas.toDataURL("image/png"));
          }
        };
        game.events.on("postrender", window.__tacticsCapture);
      });
      for (let round = 0; round < 3; round++) {
        const planned = (await state(page)).enemies.map((enemy) => ({
          id: enemy.id,
          kind: enemy.intent.kind,
        }));
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/action") &&
            r.request().postDataJSON()?.type === "combat_round",
        );
        for (let slot = 0; slot < 4; slot++) {
          await readyMember(slot);
          if (touch) {
            const p = await page.evaluate(() =>
              window.__kithlandsTest.interactiveTextPosition(
                "DEFEND",
                "Battle",
              ),
            );
            expect(p).toBeTruthy();
            await page.touchscreen.tap(p.x, p.y);
          } else await page.keyboard.press("d");
        }
        const resolved = await (await response).json();
        trace.push(resolved);
        for (const intent of planned) {
          const actual = resolved.combat_actions.filter(
            (action) => action.actor_id === intent.id,
          );
          expect(actual).toHaveLength(1);
          expect(actual[0].kind).toBe(
            intent.kind === "focus" ? "ability" : "attack",
          );
          if (intent.kind === "focus")
            expect(actual[0].action_id).toBe("focus");
        }
        const enemyActions = resolved.combat_actions.filter(
          (a) => a.actor_id === 100,
        );
        expect(enemyActions.length).toBeGreaterThan(0);
        if (round === 0) {
          expect(enemyActions[0].kind).toBe("ability");
          expect(enemyActions[0].action_id).toBe("focus");
          expect(enemyActions[0].damage || 0).toBe(0);
        } else {
          expect(enemyActions[0].kind).toBe("attack");
          const hit = enemyActions[0];
          // Natural rolls may miss or reach the one-damage floor. Neither
          // should manufacture a GUARD receipt for damage never prevented.
          expect(hit.damage || 0).toBeGreaterThanOrEqual(0);
          if ((hit.damage || 0) > 1)
            expect(hit.damage_prevented).toBeGreaterThan(0);
          if (hit.missed) expect(hit.damage_prevented || 0).toBe(0);
          expect(
            resolved.combat_actions.filter((a) => a.kind === "defend"),
          ).toHaveLength(4);
        }
        await readyMember(0);
        const next = (await state(page)).enemies[0].intent;
        expect(next.kind).toBe(round === 2 ? "focus" : "attack");
        const metrics = await page.evaluate(() =>
          window.__tacticsGame.scene
            .getScene("Battle")
            .messageWindow.getLayoutMetrics(),
        );
        expect(
          metrics.textBounds.y + metrics.textBounds.height,
        ).toBeLessThanOrEqual(metrics.bounds.y + metrics.bounds.height);
        await capture(`round-${round + 1}-next-plan`);
      }
      const frames = await page.evaluate(() => {
        window.__tacticsGame.events.off("postrender", window.__tacticsCapture);
        return window.__tacticsFrames;
      });
      expect(frames.length).toBeGreaterThan(0);
      frames.forEach((data, index) =>
        writeFileSync(
          path.join(proof, `${width}-preparation-cue-${index}.png`),
          Buffer.from(data.split(",")[1], "base64"),
        ),
      );
      writeFileSync(
        path.join(proof, `${width}-resolved-rounds.json`),
        JSON.stringify(trace, null, 2),
      );
      expect(errors).toEqual([]);
    });
  });
}
