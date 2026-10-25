import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { openShowcase } from "./battle-vfx-proof-helpers.js";
test.afterEach(async ({ page }, info) => {
  const snapshot = await page
    .evaluate(() => ({
      proof: window.__criticalProof
        ? {
            frames: window.__criticalProof.frames,
            hits: window.__criticalProof.hits,
            labelGaps: window.__criticalProof.labelGaps,
          }
        : null,
      flags: window.__kithlandsTest?.sceneFlags("Battle"),
    }))
    .catch(() => null);
  if (snapshot)
    writeFileSync(
      info.outputPath(`critical-state-${Date.now()}.json`),
      JSON.stringify(snapshot, null, 2),
    );
  await page
    .screenshot({ path: info.outputPath(`critical-last-${Date.now()}.png`) })
    .catch(() => {});
});
const proof = path.resolve(`tmp/warrior-critical-${Date.now()}`);
mkdirSync(proof, { recursive: true });
for (const [width, height, reducedMotion] of [
  [1440, 900, "no-preference"],
  [390, 844, "no-preference"],
  [800, 600, "reduce"],
]) {
  test(`server critical selects a grounded authored strike ${width}`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route("**/src/main.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.__criticalGame=game;`,
      });
    });
    await openShowcase(page, { width, height, reducedMotion });
    await page.evaluate(() => {
      window.__criticalProof = {
        frames: [],
        images: {},
        hits: [],
        labelGaps: [],
      };
      let previous = "";
      window.__criticalCapture = () => {
        const game = window.__criticalGame,
          scene = game.scene.getScene("Battle");
        const entry = scene.partySprites?.Hero,
          sprite = entry?.sprite;
        if (!sprite?.active) return;
        const state = sprite.battleState,
          frame = sprite.battleFrameIndex;
        const key = `${state}:${frame}`;
        const labels =
          scene.floatingText?.active.filter(
            (text) => text.visible && text.alpha > 0.9,
          ) || [];
        const criticalLabel = labels.find((text) =>
          text.text.startsWith("CRITICAL"),
        );
        const defeatLabel = labels.find((text) => text.text === "DEFEATED!");
        if (criticalLabel && defeatLabel) {
          window.__criticalProof.labelGaps.push(
            defeatLabel.getBounds().top - criticalLabel.getBounds().bottom,
          );
          if (!window.__criticalProof.images["critical-labels"])
            window.__criticalProof.images["critical-labels"] =
              game.canvas.toDataURL("image/png");
        }
        if (key === previous) return;
        previous = key;
        const shadow = sprite.battleShadow;
        const record = {
          state,
          frame,
          time: performance.now(),
          x: sprite.x,
          y: sprite.y,
          homeX: entry.x,
          homeY: entry.y,
          angle: sprite.battleBody?.angle,
          shadowDelta: shadow
            ? Math.hypot(sprite.x - shadow.x, sprite.y - shadow.y)
            : null,
        };
        window.__criticalProof.frames.push(record);
        if (
          ["physical_attack", "critical_attack"].includes(state) &&
          !window.__criticalProof.images[key]
        )
          window.__criticalProof.images[key] =
            game.canvas.toDataURL("image/png");
      };
      window.__criticalGame.events.on("postrender", window.__criticalCapture);
    });
    const authoritative = [];
    for (let round = 0; round < 3; round++) {
      await page.waitForFunction(
        () =>
          window.__kithlandsTest.activeSceneKey() === "Battle" &&
          !window.__kithlandsTest.sceneFlags("Battle").animating,
      );
      await page.evaluate(() => {
        const scene = window.__criticalGame.scene.getScene("Battle");
        window.__criticalPreviousHero = scene.partySprites.Hero.sprite;
        if (scene.__criticalProofWrapped) return;
        scene.__criticalProofWrapped = true;
        const hit = scene.hitFx.bind(scene);
        scene.hitFx = (...args) => {
          const hero = scene.partySprites?.Hero?.sprite;
          if (hero?.battleState === "critical_attack")
            window.__criticalProof.hits.push({
              crit: !!args[6]?.crit,
              state: hero.battleState,
              frame: hero.battleFrameIndex,
            });
          return hit(...args);
        };
      });
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/action") &&
          r.request().postDataJSON()?.type === "combat_round",
      );
      await page.evaluate(() =>
        window.__kithlandsTest.startAuthoritativeBattleRound("attack"),
      );
      const result = await (await response).json();
      expect(result.error).toBeUndefined();
      const hero = result.combat_actions.find(
        (a) => a.actor_name === "Hero" && a.kind === "attack",
      );
      expect(hero).toBeTruthy();
      authoritative.push({ round, critical: !!hero.crit, damage: hero.damage });
      writeFileSync(
        path.join(proof, `${width}-server-${round}.json`),
        JSON.stringify({ hero, errors }, null, 2),
      );
      await page.waitForFunction(
        (finished) => {
          const scene = window.__criticalGame.scene.getScene("Battle");
          return (
            !scene.animating &&
            (finished ||
              scene.partySprites.Hero.sprite !== window.__criticalPreviousHero)
          );
        },
        result.phase !== "combat",
        { timeout: 60000 },
      );
    }
    const data = await page.evaluate(() => {
      window.__criticalGame.events.off("postrender", window.__criticalCapture);
      return window.__criticalProof;
    });
    expect(authoritative.map((a) => a.critical)).toEqual([false, false, true]);
    const normal = data.frames.filter((f) => f.state === "physical_attack");
    const critical = data.frames.filter((f) => f.state === "critical_attack");
    expect(normal.some((f) => f.frame === 3)).toBe(true);
    expect(critical.some((f) => f.frame === 3)).toBe(true);
    expect(data.hits.some((h) => h.crit && h.frame === 3)).toBe(true);
    expect(critical.every((f) => f.shadowDelta !== null)).toBe(true);
    expect(Math.max(...critical.map((f) => f.shadowDelta))).toBeLessThan(0.5);
    if (reducedMotion === "reduce") {
      expect([...new Set(critical.map((f) => f.frame))]).toEqual([1, 3, 5]);
      expect(
        Math.max(
          ...critical.map((f) => Math.hypot(f.x - f.homeX, f.y - f.homeY)),
        ),
      ).toBeLessThanOrEqual(14.1);
    } else {
      expect([...new Set(critical.map((f) => f.frame))]).toEqual([
        0, 1, 2, 3, 4, 5,
      ]);
      expect(critical.find((f) => f.frame === 1).angle).not.toBe(
        normal.find((f) => f.frame === 1).angle,
      );
    }
    expect(data.hits.every((hit) => hit.crit && hit.frame === 3)).toBe(true);
    expect(data.labelGaps.length).toBeGreaterThan(0);
    expect(Math.min(...data.labelGaps)).toBeGreaterThan(8);
    const lastCritical = data.frames.findLastIndex(
      (frame) => frame.state === "critical_attack",
    );
    expect(
      data.frames
        .slice(lastCritical + 1)
        .some(
          (frame) =>
            ["idle_guard", "victory"].includes(frame.state) &&
            Math.hypot(frame.x - frame.homeX, frame.y - frame.homeY) < 0.5,
        ),
    ).toBe(true);
    for (const [key, image] of Object.entries(data.images))
      writeFileSync(
        path.join(proof, `${width}-${key.replace(":", "-")}.png`),
        Buffer.from(image.split(",")[1], "base64"),
      );
    delete data.images;
    writeFileSync(
      path.join(proof, `${width}-trace.json`),
      JSON.stringify({ authoritative, ...data }, null, 2),
    );
    expect(errors).toEqual([]);
    await page.screenshot({ path: path.join(proof, `${width}-recovered.png`) });
  });
}
