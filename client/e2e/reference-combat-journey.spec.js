import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  startNormalRoute,
  routeReady,
  chooseStoryAction,
  clickRouteText,
} from "./helpers/normal-route.js";
import {
  installCombatTextAudit,
  collectCombatTextAudit,
  expectReadableCombatText,
} from "./helpers/combat-text-audit.js";

const proof = path.resolve(`tmp/reference-combat-journey-${Date.now()}`);
mkdirSync(proof, { recursive: true });
test.use({ video: "on" });

function installReferenceAudit() {
  const game = window.__normalRouteGame,
    scene = game.scene.getScene("Battle");
  const audit = (window.__referenceAudit = {
    frames: [],
    contacts: [],
    images: {},
  });
  const cues = {
    defend: 1,
    physical_attack: 3,
    cast_class_ability: 3,
    item_use: 2,
    hit_reaction: 0,
    victory: 1,
    ko: 3,
  };
  const hit = scene.hitFx.bind(scene);
  scene.hitFx = (x, y, damage, isParty, defeated, type, opts) => {
    const actor = Object.entries(scene.partySprites).find(([, p]) =>
      ["physical_attack", "cast_class_ability", "item_use"].includes(
        p.sprite?.battleState,
      ),
    );
    audit.contacts.push({
      at: performance.now(),
      actor: actor?.[0],
      state: actor?.[1].sprite.battleState,
      frame: actor?.[1].sprite.battleFrameIndex,
      damage,
      isParty,
      type,
      missed: !!opts?.missed,
      crit: !!opts?.crit,
    });
    return hit(x, y, damage, isParty, defeated, type, opts);
  };
  const impact = scene.spawnSpellImpact.bind(scene);
  scene.spawnSpellImpact = (entry, element) => {
    const actor = scene.partySprites.Hero.sprite;
    if (actor.battleState === "item_use")
      audit.contacts.push({
        actor: "Hero",
        state: actor.battleState,
        frame: actor.battleFrameIndex,
        element,
        cue: "item-impact",
      });
    return impact(entry, element);
  };
  let last = 0;
  window.__referenceCapture = () => {
    const now = performance.now();
    for (const name of ["Hero", "Sparks"]) {
      const p = scene.partySprites[name]?.sprite;
      if (!p?.battleBody?.active) continue;
      const state = p.battleState,
        frame = p.battleFrameIndex;
      if (now - last > 70)
        audit.frames.push({
          at: now,
          name,
          state,
          frame,
          texture: p.battleBody.texture.key,
          feetOffset: p.battleBody.y + p.battleFeetOffset,
          angle: p.battleBody.angle,
          shadowDelta: Math.hypot(
            p.x - p.battleShadow.x,
            p.y - p.battleShadow.y,
          ),
          reduced: scene.reducedBattleMotion(),
        });
      if (cues[state] === frame) {
        const key = `${name}-${state}`;
        audit.images[key] ||= game.canvas.toDataURL("image/png");
      }
    }
    if (now - last > 70) last = now;
  };
  game.events.on("postrender", window.__referenceCapture);
}

for (const [width, height, reduced] of [
  [1440, 900, false],
  [390, 844, false],
  [800, 600, true],
]) {
  test.describe(`${width} integrated reference combat`, () => {
    test.use({
      viewport: { width, height },
      hasTouch: width === 390,
    });
    test("fresh Old Mill party guards, uses supplies, strikes, casts, heals and returns with real rewards", async ({
      page,
    }) => {
      test.setTimeout(300000);
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      const errors = [],
        rounds = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const activate = (node) => (width === 390 ? node.tap() : node.click());
      await startNormalRoute(page, 6);
      await activate(
        page.getByRole("button", { name: "Old Mill trail", exact: true }),
      );
      await routeReady(page, "Dungeon");
      await chooseStoryAction(page, "heron-trail", width === 390);
      await chooseStoryAction(page, "pool-bramblehog", width === 390);
      await routeReady(page, "Battle");
      await page.evaluate(installReferenceAudit);
      await page.evaluate(installCombatTextAudit, {
        gameKey: "__normalRouteGame",
      });
      const state = () =>
        page.evaluate(() => window.__kithlandsTest.gameState("Battle"));
      const initial = await state();
      expect(initial.party.map((p) => p.level)).toEqual([1, 1, 1, 1]);
      const initialPotions =
        initial.items.find((i) => i.id === "potion")?.count || 0;
      expect(initialPotions).toBeGreaterThan(0);
      const ready = (slot) =>
        page.waitForFunction((slot) => {
          const s = window.__normalRouteGame.scene.getScene("Battle");
          return (
            !s.animating &&
            s.currentMemberIdx === slot &&
            s.promptText
              ?.getText()
              .startsWith(`${s.gameState.party[slot].name}'s turn`)
          );
        }, slot);
      const choose = async (label) => {
        const row = page
          .locator(".battle-choice-list")
          .getByRole("button", { name: label });
        await expect(row).toHaveCount(1);
        await expect(row).toBeEnabled();
        await activate(row);
      };
      const targetEnemy = async () => {
        await expect(page.locator(".battle-choice-panel")).toContainText(
          "Choose enemy",
        );
        const targets = page.locator(
          ".battle-choice-list button:not(:disabled)",
        );
        expect(await targets.count()).toBeGreaterThan(0);
        await activate(targets.first());
      };
      const command = async (label, key) => {
        if (width === 390) await clickRouteText(page, label, "Battle", true);
        else await page.keyboard.press(key);
      };
      const play = async (actions) => {
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/action") &&
            r.request().postDataJSON()?.type === "combat_round",
        );
        for (let slot = 0; slot < 4; slot++) {
          await ready(slot);
          const action = actions[slot];
          if (action.type === "defend") await command("DEFEND", "d");
          if (action.type === "attack") {
            await command("ATTACK", "a");
            await targetEnemy();
          }
          if (action.type === "potion") {
            await command("ITEMS", "i");
            await activate(page.getByRole("button", { name: /^Potion ×/ }));
            await page.screenshot({
              path: path.join(proof, `${width}-potion-targets.png`),
            });
            await expect(
              page.locator(".battle-choice-panel"),
            ).not.toContainText(" MP");
            await choose(new RegExp(`^${action.target} ·`));
          }
          if (action.type === "spell") {
            await command("SPELL", "s");
            await choose(action.name);
            if (action.target)
              await choose(new RegExp(`^${action.target}(?: ·|$)`));
            else await targetEnemy();
          }
        }
        const result = await (await response).json();
        expect(result.error).toBeUndefined();
        await page.waitForFunction(
          () => {
            const s = window.__normalRouteGame.scene.getScene("Battle");
            return (
              !s.animating &&
              ((s.gameState.phase === "combat" &&
                s.promptText?.getText().startsWith("Hero's turn")) ||
                s.victoryContinueShown ||
                s.gameState.phase === "defeat")
            );
          },
          null,
          { timeout: 90000 },
        );
        expect(result.phase).not.toBe("defeat");
        const meters = await page.evaluate(() => {
          const s = window.__normalRouteGame.scene.getScene("Battle");
          return s.gameState.party.map((p) => ({
            name: p.name,
            hp: s.partySprites[p.name]?.hpBar?.currentHP,
            mp: s.partySprites[p.name]?.mpBar?.currentHP ?? 0,
          }));
        });
        expect(meters).toEqual(
          result.party.map((p) => ({ name: p.name, hp: p.hp, mp: p.mp })),
        );
        rounds.push({ actions, result, meters });
        writeFileSync(
          path.join(proof, `${width}-rounds.json`),
          JSON.stringify(rounds, null, 2),
        );
        await page.screenshot({
          path: path.join(proof, `${width}-round-${rounds.length}-resumed.png`),
        });
        return result;
      };
      const defend = { type: "defend" },
        attack = { type: "attack" };
      await ready(0);
      await play([defend, attack, defend, defend]);
      const rushed = await play([defend, defend, defend, defend]);
      const injured = (gs) =>
        gs.party
          .filter((p) => p.hp > 0 && p.hp < p.max_hp)
          .sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp)[0];
      expect(
        injured(rushed),
        "actual rush leaves someone needing supplies",
      ).toBeTruthy();
      const supplied = await play([
        { type: "potion", target: injured(rushed).name },
        defend,
        defend,
        defend,
      ]);
      expect(supplied.items.find((i) => i.id === "potion")?.count || 0).toBe(
        initialPotions - 1,
      );
      expect(
        injured(supplied),
        "second rush leaves someone needing Cure",
      ).toBeTruthy();
      let won = await play([
        defend,
        { type: "spell", name: "Spark" },
        defend,
        { type: "spell", name: "Cure", target: injured(supplied).name },
      ]);
      // Establish the Warrior's real strike before the rest of the party can
      // finish the target. Then use the party's available offense normally.
      if (won.phase === "combat")
        won = await play([attack, defend, defend, defend]);
      for (let i = 0; i < 8 && won.phase === "combat"; i++) {
        const spark = won.party[1].spells.find((s) => s.id === "spark");
        won = await play([
          attack,
          won.party[1].mp >= spark.mp_cost
            ? { type: "spell", name: "Spark" }
            : attack,
          attack,
          defend,
        ]);
      }
      // Go uses quest_complete for the acknowledged ordinary victory receipt;
      // the separate advance request returns to the active dungeon.
      expect(won.phase).toBe("quest_complete");
      expect(won.gold).toBeGreaterThan(initial.gold);
      expect(
        won.party.every(
          (member, index) =>
            member.level > initial.party[index].level ||
            member.xp > initial.party[index].xp,
        ),
      ).toBe(true);
      const all = rounds.flatMap((r) => r.result.combat_actions);
      for (const [actor, kind] of [
        ["Hero", "defend"],
        ["Sparks", "defend"],
        ["Hero", "item"],
        ["Sparks", "attack"],
        ["Sparks", "spell"],
        ["Willow", "heal"],
        ["Hero", "attack"],
      ])
        expect(
          all.some((a) => a.actor_name === actor && a.kind === kind),
          `${actor} actually resolves ${kind}`,
        ).toBe(true);
      const audit = await page.evaluate(() => {
        window.__normalRouteGame.events.off(
          "postrender",
          window.__referenceCapture,
        );
        return window.__referenceAudit;
      });
      for (const [name, image] of Object.entries(audit.images))
        writeFileSync(
          path.join(proof, `${width}-${name}.png`),
          Buffer.from(image.split(",")[1], "base64"),
        );
      delete audit.images;
      writeFileSync(
        path.join(proof, `${width}-presentation.json`),
        JSON.stringify(audit, null, 2),
      );
      for (const name of ["Hero", "Sparks"]) {
        const samples = audit.frames.filter((f) => f.name === name);
        expect(samples.length).toBeGreaterThan(20);
        expect(
          samples.every(
            (f) =>
              Math.abs(f.feetOffset) < 0.1 &&
              f.angle === 0 &&
              f.shadowDelta < 0.5 &&
              f.reduced === reduced,
          ),
        ).toBe(true);
      }
      expect(
        audit.contacts.some(
          (c) =>
            c.actor === "Hero" &&
            c.state === "item_use" &&
            c.frame === 2 &&
            c.cue === "item-impact" &&
            c.element === "holy",
        ),
      ).toBe(true);
      expect(
        audit.contacts.some(
          (c) =>
            c.actor === "Sparks" &&
            c.state === "physical_attack" &&
            c.frame === 3 &&
            !c.isParty,
        ),
      ).toBe(true);
      expect(
        audit.frames.some(
          (f) =>
            f.name === "Sparks" &&
            f.state === "cast_class_ability" &&
            f.frame === 3,
        ),
      ).toBe(true);
      const text = await collectCombatTextAudit(page);
      expectReadableCombatText(text);
      for (
        let i = 0;
        i < 4 && (await page.locator(".battle-loot-keep").count());
        i++
      )
        await activate(page.locator(".battle-loot-keep"));
      const go = page.locator(".victory-continue");
      await expect(go).toBeEnabled({ timeout: 45000 });
      const beforeContinue = await state();
      await activate(go);
      await routeReady(page, "Dungeon");
      const continued = await page.evaluate(() =>
        window.__kithlandsTest.gameState("Dungeon"),
      );
      expect(continued.party).toEqual(beforeContinue.party);
      expect(continued.gold).toBe(beforeContinue.gold);
      expect(continued.active_dungeon_id).toBe("old-mill");
      expect(
        continued.quests.map(({ id, completed }) => ({ id, completed })),
      ).toEqual(initial.quests.map(({ id, completed }) => ({ id, completed })));
      await page.screenshot({
        path: path.join(proof, `${width}-returned-to-old-mill.png`),
      });
      expect(errors).toEqual([]);
      writeFileSync(
        path.join(proof, `${width}-audit.json`),
        JSON.stringify(
          { initial, rounds, audit, text, beforeContinue, continued, errors },
          null,
          2,
        ),
      );
    });
  });
}
