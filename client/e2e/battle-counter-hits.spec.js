import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  installCombatTextAudit,
  collectCombatTextAudit,
  expectReadableCombatText,
} from "./helpers/combat-text-audit.js";
const proof = path.resolve(`tmp/counter-hits-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, motion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [375, 667, "no-preference"],
  [800, 600, "reduce"],
]) {
  test.describe(`${width} counter`, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 600 });
    test("native Counter displays every Go hit with readable spacing", async ({
      page,
    }) => {
      test.setTimeout(90000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/src/main.js*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nwindow.__counterGame=game;`,
        });
      });
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto("/?noEncounters=1");
      await page.waitForFunction(() => !!window.__kithlandsTest);
      await page.evaluate(
        (email) => window.__kithlandsTest.startWizardFromTitle(email),
        `counter-${width}-${Date.now()}@kithlands.dev`,
      );
      await page.evaluate(() =>
        window.__kithlandsTest.startCustomGame({
          town_name: "Cadott, WI",
          use_osm: false,
          people: [],
          places: ["Old Mill", "Market", "School"],
          big_building: "Town Hall",
          difficulty: "normal",
          party: [{ name: "Rook", class_id: "brawler" }],
          rng_seed: 24,
        }),
      );
      // Disposable advanced fixture: use Go's XP/level-up path, not the
      // shop-gating level override (which intentionally leaves stats unchanged).
      const leveled = await page.evaluate(async () => {
        const api = await import("/src/api.js");
        let state = window.__kithlandsTest.gameState("World");
        for (let n = 0; n < 24 && state.party[0].level < 32; n++) {
          const encounter = await api.debugForceEncounter(
            state.id,
            ["iron_golem"],
            60,
          );
          if (encounter.error) throw new Error(encounter.error);
          const won = await api.debugForceVictory(state.id);
          if (won.error) throw new Error(won.error);
          state = await api.getGame(state.id);
        }
        window.__kithlandsTest.startScene("World", { gameState: state });
        await window.__kithlandsTest.waitForSceneReady("World");
        return state;
      });
      expect(leveled.party[0].level).toBeGreaterThanOrEqual(32);
      expect(leveled.party[0].agi).toBeGreaterThan(5);
      const initial = await page.evaluate(() =>
        window.__kithlandsTest.forceEncounter(["iron_golem"], 35, "World"),
      );
      expect(initial.phase).toBe("combat");
      await page.waitForFunction(() =>
        window.__counterGame.scene
          .getScene("Battle")
          .promptText?.getText()
          .includes("choose an action"),
      );
      await page.evaluate(installCombatTextAudit, { gameKey: "__counterGame" });
      await page.evaluate(() => {
        const scene = window.__counterGame.scene.getScene("Battle");
        const audit = (window.__counterAudit = {
          hits: [],
          messages: [],
          images: {},
          titles: [],
          motion: [],
        });
        const hit = scene.hitFx.bind(scene);
        scene.hitFx = (...args) => {
          if (!args[3]) {
            const actor = scene.partySprites.Rook.sprite,
              shadow = actor.battleShadow;
            audit.hits.push({
              at: performance.now(),
              damage: args[2],
              crit: !!args[6]?.crit,
              missed: !!args[6]?.missed,
              caption: scene.messageWindow?.text?.text || "",
              x: actor.x,
              y: actor.y,
              shadowDelta: shadow
                ? Math.hypot(shadow.x - actor.x, shadow.y - actor.y)
                : null,
            });
            audit.pending = `hit-${audit.hits.length}`;
          }
          return hit(...args);
        };
        const title = scene.showActionTitle.bind(scene);
        scene.showActionTitle = (actor, label, ...rest) => {
          audit.titles.push(label);
          return title(actor, label, ...rest);
        };
        let lastMotion = -Infinity;
        const seenPoses = new Set();
        window.__counterCapture = () => {
          const actor = scene.partySprites.Rook?.sprite;
          const now = performance.now();
          if (actor?.active && now - lastMotion >= 80) {
            lastMotion = now;
            audit.motion.push({
              at: now,
              x: actor.x,
              y: actor.y,
              state: actor.battleState,
              frame: actor.battleFrameIndex,
              shadowX: actor.battleShadow?.x,
              shadowY: actor.battleShadow?.y,
            });
            const pose = `${actor.battleState}-${actor.battleFrameIndex}`;
            if (
              ["physical_attack", "critical_attack"].includes(
                actor.battleState,
              ) &&
              !seenPoses.has(pose)
            ) {
              seenPoses.add(pose);
              audit.images[`pose-${pose}`] =
                scene.game.canvas.toDataURL("image/png");
            }
          }
          const text = scene.promptText?.getText();
          if (text && text !== audit.messages.at(-1)) audit.messages.push(text);
          if (audit.pending) {
            audit.images[audit.pending] =
              scene.game.canvas.toDataURL("image/png");
            audit.pending = null;
          }
        };
        scene.game.events.on("postrender", window.__counterCapture);
      });
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      if (width < 600) {
        const point = await page.evaluate(() =>
          window.__kithlandsTest.interactiveTextPosition("ABILITY", "Battle"),
        );
        await page.touchscreen.tap(point.x, point.y);
      } else await page.keyboard.press("b");
      const choice = page
        .locator(".battle-choice-list button")
        .filter({ hasText: "Counter" });
      await expect(choice).toHaveCount(1);
      await page.screenshot({
        path: path.join(proof, `${width}-choose-counter.png`),
      });
      if (width < 600) await choice.tap();
      else {
        await choice.focus();
        await page.keyboard.press("Enter");
      }
      const result = await (await response).json();
      writeFileSync(
        path.join(proof, `${width}-server-round.json`),
        JSON.stringify(result, null, 2),
      );
      expect(result.error).toBeUndefined();
      const counter = result.combat_actions.find(
        (action) => action.kind === "counter" && action.actor_name === "Rook",
      );
      expect(counter).toBeTruthy();
      expect(counter.hits.length).toBeGreaterThanOrEqual(3);
      await page.waitForFunction(
        () => !window.__counterGame.scene.getScene("Battle").animating,
      );
      const audit = await page.evaluate(() => {
        const scene = window.__counterGame.scene.getScene("Battle");
        scene.game.events.off("postrender", window.__counterCapture);
        return {
          ...window.__counterAudit,
          enemyHP: Object.fromEntries(
            Object.entries(scene.enemySprites).map(([id, entry]) => [
              id,
              entry.hpBar?.currentHP,
            ]),
          ),
        };
      });
      const readability = await collectCombatTextAudit(page);
      writeFileSync(
        path.join(proof, `${width}-trace.json`),
        JSON.stringify(
          {
            counter,
            advancedParty: leveled.party,
            initialEnemies: initial.enemies,
            ...audit,
            images: undefined,
            readability,
          },
          null,
          2,
        ),
      );
      for (const [label, image] of Object.entries(audit.images))
        writeFileSync(
          path.join(proof, `${width}-${label}.png`),
          Buffer.from(image.split(",")[1], "base64"),
        );
      expect(
        audit.hits.map(({ damage, crit, missed }) => ({
          damage,
          crit,
          missed,
        })),
      ).toEqual(
        counter.hits.map((hit) => ({
          damage: hit.damage,
          crit: !!hit.crit,
          missed: !!hit.missed,
        })),
      );
      for (let i = 1; i < audit.hits.length; i++)
        expect(audit.hits[i].at - audit.hits[i - 1].at).toBeGreaterThanOrEqual(
          1200,
        );
      expect(audit.hits.every((hit) => hit.caption.trim().length > 0)).toBe(
        true,
      );
      expect(
        audit.hits.every(
          (hit) => hit.shadowDelta != null && hit.shadowDelta <= 2,
        ),
      ).toBe(true);
      expect(audit.titles).toContain("COUNTER");
      expect(audit.messages).toContain(
        `Rook: ${counter.damage} damage (${counter.hits.length} strikes).`,
      );
      expect(audit.enemyHP[counter.target_id]).toBe(
        Math.max(
          0,
          initial.enemies.find((enemy) => enemy.id === counter.target_id).hp -
            counter.damage,
        ),
      );
      expectReadableCombatText(readability);
      await page.screenshot({
        path: path.join(proof, `${width}-recovered.png`),
      });
      expect(errors).toEqual([]);
    });
  });
}

test("Backstab keeps its ability identity through the shared physical pipeline", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.__counterGame=game;`,
    });
  });
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.evaluate(
    (email) => window.__kithlandsTest.startWizardFromTitle(email),
    `backstab-${Date.now()}@kithlands.dev`,
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      use_osm: false,
      people: [],
      places: ["Old Mill", "Market", "School"],
      big_building: "Town Hall",
      difficulty: "normal",
      party: [{ name: "Shade", class_id: "rogue" }],
      rng_seed: 24,
    }),
  );
  await page.evaluate(() =>
    window.__kithlandsTest.forceEncounter(["slime"], 1, "World"),
  );
  await page.waitForFunction(() =>
    window.__counterGame.scene
      .getScene("Battle")
      .promptText?.getText()
      .includes("choose an action"),
  );
  await page.evaluate(() => {
    const scene = window.__counterGame.scene.getScene("Battle"),
      audit = (window.__backstabAudit = {
        captions: [],
        titles: [],
        damage: [],
      });
    const reveal = scene.revealLine.bind(scene);
    scene.revealLine = (text, ...args) => {
      audit.captions.push(text);
      return reveal(text, ...args);
    };
    const title = scene.showActionTitle.bind(scene);
    scene.showActionTitle = (actor, text, ...args) => {
      audit.titles.push(text);
      return title(actor, text, ...args);
    };
    const hit = scene.hitFx.bind(scene);
    scene.hitFx = (...args) => {
      if (!args[3]) {
        audit.damage.push(args[2]);
        audit.pending = true;
      }
      return hit(...args);
    };
    window.__backstabCapture = () => {
      if (audit.pending) {
        audit.image = scene.game.canvas.toDataURL("image/png");
        audit.pending = false;
      }
    };
    scene.game.events.on("postrender", window.__backstabCapture);
  });
  await page.keyboard.press("b");
  await page
    .locator(".battle-choice-list button")
    .filter({ hasText: "Backstab" })
    .click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/action") &&
      r.request().postDataJSON()?.type === "combat_round",
  );
  await page
    .locator(".battle-choice-list button")
    .filter({ hasText: "Slime" })
    .click();
  const state = await (await response).json();
  const action = state.combat_actions.find(
    (a) => a.kind === "ability" && a.action_id === "backstab",
  );
  expect(action?.damage).toBeGreaterThan(0);
  await page.waitForFunction(
    () => !window.__counterGame.scene.getScene("Battle").animating,
  );
  const audit = await page.evaluate(() => {
    window.__counterGame.events.off("postrender", window.__backstabCapture);
    return window.__backstabAudit;
  });
  expect(audit.captions).toContain("Shade backstabs Slime!");
  expect(audit.titles).toContain("Backstab");
  expect(audit.damage).toEqual([action.damage]);
  writeFileSync(
    path.join(proof, "backstab-contact.png"),
    Buffer.from(audit.image.split(",")[1], "base64"),
  );
  writeFileSync(
    path.join(proof, "backstab-trace.json"),
    JSON.stringify({ action, ...audit, image: undefined }, null, 2),
  );
  await page.screenshot({ path: path.join(proof, "backstab-result.png") });
  expect(errors).toEqual([]);
});
