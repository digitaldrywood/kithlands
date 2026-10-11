import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const proof = new URL(
  `../tmp/battle-grounding-${Date.now()}/`,
  import.meta.url,
);
mkdirSync(proof, { recursive: true });
test.use({ video: "on" });
for (const [label, width, height, reducedMotion, battleSpeed] of [
  ["desktop", 1440, 900, "no-preference", 3],
  ["portrait", 390, 844, "no-preference", 3],
  ["reduced", 1440, 900, "reduce", 3],
  ["slow", 1440, 900, "no-preference", 6],
  ["fast", 1440, 900, "no-preference", 1],
]) {
  test(`${label}: grounded feet, following shadows, and authored attack/cast cues`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const rounds = [];
    page.on("response", async (response) => {
      if (response.url().endsWith("/action")) {
        const result = await response.json();
        rounds.push({
          combat_actions: result.combat_actions,
          combat_log: result.combat_log,
          error: result.error,
        });
      }
    });
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(
      (speed) =>
        localStorage.setItem(
          "kithlands_prefs",
          JSON.stringify({ battleSpeed: speed }),
        ),
      battleSpeed,
    );
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.__battleProofGame = game;`,
      });
    });
    await page.goto("/");
    await page.waitForFunction(
      () => window.__kithlandsTest?.activeSceneKey() === "Title",
    );
    await page.evaluate(() => window.__kithlandsTest.startQuickGame());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.evaluate(() =>
      window.__kithlandsTest.forceEncounter(["goblin", "goblin", "goblin"], 1),
    );
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "Battle",
    );
    // Ambush legitimately skips the front-row Warrior on the first round.
    // Pin only the encounter start; all submitted actions still resolve in Go.
    await page.evaluate(async () => {
      const scene = window.__battleProofGame.scene.getScene("Battle");
      const { debugForceEncounterStart } = await import("/src/api.js");
      const result = await debugForceEncounterStart(
        scene.gameState.id,
        "normal",
      );
      if (result.error) throw new Error(result.error);
    });
    const baseline = await page.evaluate(() => {
      const scene = window.__battleProofGame.scene.getScene("Battle");
      window.__battleProof = { hits: [], casts: [], abilities: [], frames: [] };
      const abilityCue = scene.spawnAbilityCue.bind(scene);
      scene.spawnAbilityCue = (actor, target, color) => {
        window.__battleProof.abilities.push({
          actor: actor.classId,
          frame: actor.sprite.battleFrameIndex,
          x: actor.sprite.x,
          originX: actor.x,
          weaponVisible: actor.sprite.battleAttachmentLayers.some(
            (layer) =>
              layer.channel === "weapon" &&
              (layer.front.visible || layer.back.visible),
          ),
        });
        return abilityCue(actor, target, color);
      };
      const cast = scene.playCastAnticipation.bind(scene);
      scene.playCastAnticipation = async (actor, element) => {
        await cast(actor, element);
        window.__battleProof.casts.push({
          actor: actor.classId,
          frame: actor.sprite.battleFrameIndex,
          source: actor.sprite.battleCastSource,
        });
      };
      const hitFx = scene.hitFx.bind(scene);
      scene.hitFx = (...args) => {
        const actor = Object.values(scene.partySprites).find(
          (entry) => entry.battleAction,
        );
        if (actor)
          window.__battleProof.hits.push({
            actor: actor.classId,
            state: actor.sprite.battleState,
            frame: actor.sprite.battleFrameIndex,
            impactVisible: scene.children.list.some(
              (object) => object._combatFxTag === "spell-impact",
            ),
          });
        return hitFx(...args);
      };
      const sample = () => {
        if (!scene.scene.isActive()) return;
        window.__battleProof.frames.push(
          Object.values(scene.partySprites).map(({ sprite, classId }) => ({
            classId,
            x: sprite.x,
            y: sprite.y,
            state: sprite.battleState,
            frame: sprite.battleFrameIndex,
            shadowX: sprite.battleShadow.x,
            shadowY: sprite.battleShadow.y,
          })),
        );
      };
      window.__battleProofGame.events.on("postrender", sample);
      scene.events.once("shutdown", () =>
        window.__battleProofGame.events.off("postrender", sample),
      );
      return Object.values(scene.partySprites).map(({ sprite, classId }) => ({
        classId,
        feet: sprite.y,
        bodyOffset: sprite.battleBody.y,
        floor:
          scene.hudLayout.battlefield.y + scene.hudLayout.battlefield.height,
      }));
    });
    for (const actor of baseline) {
      expect(actor.feet).toBeGreaterThan(height > width ? 340 : 200);
      expect(actor.feet).toBeLessThan(baseline[0].floor);
      expect(actor.bodyOffset).toBe(-88);
    }
    await page.screenshot({
      path: new URL(`${label}-idle.png`, proof).pathname,
    });
    await page.evaluate(() => {
      const scene = window.__battleProofGame.scene.getScene("Battle");
      scene.memberActions = scene.gameState.party.map((member, slot) => ({
        slot,
        type:
          slot === 0
            ? "attack"
            : slot === 1
              ? "spell"
              : slot === 2
                ? "ability"
                : "defend",
        target_id: scene.gameState.enemies[Math.min(slot, 2)].id,
        ...(slot === 1 ? { spell_id: "spark" } : {}),
        ...(slot === 2 ? { ability_id: "steal" } : {}),
      }));
      void scene.submitAllActions();
    });
    await page
      .waitForFunction(
        () =>
          window.__battleProof.hits.some((hit) => hit.actor === "warrior") &&
          window.__battleProof.hits.some((hit) => hit.actor === "cinder"),
        undefined,
        { timeout: 20000 },
      )
      .catch(async (error) => {
        console.log(
          JSON.stringify({
            rounds,
            hits: await page.evaluate(() => window.__battleProof.hits),
          }),
        );
        throw error;
      });
    await page.screenshot({
      path: new URL(`${label}-cast-impact.png`, proof).pathname,
    });
    await page.waitForFunction(
      () => !window.__battleProofGame.scene.getScene("Battle").animating,
    );
    const result = await page.evaluate(() => window.__battleProof);
    for (const hit of result.hits.filter((entry) => entry.actor === "warrior"))
      expect(hit.frame, `${hit.actor}/${hit.state} impact`).toBe(3);
    expect(result.casts.find((entry) => entry.actor === "cinder").frame).toBe(
      3,
    );
    expect(
      result.hits.find((entry) => entry.actor === "cinder").impactVisible,
    ).toBe(true);
    const samples = result.frames.flat();
    expect(
      rounds
        .flatMap((round) => round.combat_actions || [])
        .some((action) => action.action_id === "steal"),
    ).toBe(true);
    const ability = result.abilities.find((entry) => entry.actor === "rogue");
    expect(ability.frame).toBe(2);
    expect(ability.weaponVisible).toBe(false);
    if (reducedMotion === "reduce")
      expect(Math.abs(ability.x - ability.originX)).toBeLessThanOrEqual(14);
    else expect(ability.x).toBeLessThan(ability.originX - 100);
    for (const sample of samples) {
      expect(sample.shadowX).toBeCloseTo(sample.x, 4);
      expect(sample.shadowY).toBeCloseTo(sample.y, 4);
    }
    expect(
      new Set(
        samples
          .filter((actor) => actor.classId === "warrior")
          .map((actor) => Math.round(actor.x)),
      ).size,
    ).toBeGreaterThan(2);
    writeFileSync(
      new URL(`${label}-trace.json`, proof),
      JSON.stringify(result, null, 2),
    );
    await page.screenshot({
      path: new URL(`${label}-recovered.png`, proof).pathname,
    });
  });
}
