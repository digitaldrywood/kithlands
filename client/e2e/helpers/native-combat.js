import { expect } from "@playwright/test";
import { clickRouteText } from "./normal-route.js";

// Read choices, then use actual command/target controls for every party member.
export async function fightNormally(
  page,
  onRound = async () => {},
  { touch = false } = {},
) {
  let choices = 0;
  while (choices++ < 160) {
    await page.waitForFunction(
      () => {
        const key = window.__kithlandsTest.activeSceneKey();
        if (key !== "Battle") return true;
        const s = window.__normalRouteGame.scene.getScene("Battle");
        return (
          (!s.animating &&
            s.promptText?.getText().includes("choose an action")) ||
          (s.gameState.phase !== "combat" && s.victoryContinueShown) ||
          s.gameState.phase === "defeat"
        );
      },
      null,
      { timeout: 90000 },
    );
    const snapshot = await page.evaluate(() => {
      const key = window.__kithlandsTest.activeSceneKey();
      if (key !== "Battle") return { key };
      const s = window.__normalRouteGame.scene.getScene("Battle");
      return {
        key,
        state: s.gameState,
        slot: s.livingMembers?.[s.currentMemberIdx],
        victory: s.gameState.phase !== "combat" && s.victoryContinueShown,
      };
    });
    if (snapshot.key !== "Battle") return snapshot;
    const { state, slot } = snapshot;
    expect(state.phase, "party survived the opening battle").not.toBe("defeat");
    if (snapshot.victory) {
      await page.waitForFunction(
        () =>
          document.querySelector(".battle-loot-keep") ||
          window.__kithlandsTest.interactiveTextPosition("Continue", "Battle"),
      );
      while (await page.locator(".battle-loot-keep").count()) {
        await page.locator(".battle-loot-keep")[touch ? "tap" : "click"]();
        await page.waitForTimeout(100);
      }
      await page.waitForFunction(() =>
        window.__kithlandsTest.interactiveTextPosition("Continue", "Battle"),
      );
      await page.evaluate(() => {
        window.__receiptInputEvents = [];
        window.__receiptInputListener = (event) => {
          const button = document.querySelector(".victory-continue");
          const rect = button?.getBoundingClientRect();
          window.__receiptInputEvents.push({
            type: event.type,
            target: event.target?.tagName,
            text: event.target?.textContent?.slice(0, 100),
            x: event.clientX,
            y: event.clientY,
            button: rect
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : null,
          });
        };
        for (const type of ["pointerdown", "pointerup", "click"])
          window.addEventListener(type, window.__receiptInputListener, true);
      });
      try {
        await clickRouteText(page, "Continue", "Battle", touch);
        await page.waitForFunction(
          () => window.__kithlandsTest.activeSceneKey() !== "Battle",
        );
      } catch (error) {
        const audit = await page.evaluate(() => ({
          events: window.__receiptInputEvents,
          active: window.__kithlandsTest.activeSceneKey(),
          phase: window.__kithlandsTest.gameState("Battle")?.phase,
          input: window.__kithlandsTest.sceneInputSnapshot("Battle"),
          receipt: document.querySelector(".victory-receipt")?.outerHTML,
        }));
        throw new Error(
          `${error.message}\nReceipt pointer audit: ${JSON.stringify(audit)}`,
        );
      } finally {
        await page.evaluate(() => {
          for (const type of ["pointerdown", "pointerup", "click"])
            window.removeEventListener(
              type,
              window.__receiptInputListener,
              true,
            );
          delete window.__receiptInputListener;
        });
      }
      return {
        key: await page.evaluate(() => window.__kithlandsTest.activeSceneKey()),
        state,
      };
    }
    const member = state.party[slot];
    expect(member).toBeTruthy();
    const injured = state.party
      .filter((p) => p.hp > 0 && p.hp / p.max_hp < 0.7)
      .sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp)[0];
    const choose = async (label) => {
      const row = page
        .locator(".battle-choice-list button:not(:disabled)")
        .filter({ hasText: label })
        .first();
      await expect(row).toBeVisible();
      await row[touch ? "tap" : "click"]();
    };
    const targetEnemy = async () => {
      await expect(page.locator(".battle-choice-panel")).toContainText(
        "Choose enemy",
      );
      await page
        .locator(".battle-choice-list button:not(:disabled)")
        .first()
        [touch ? "tap" : "click"]();
    };
    const spell = member.spells?.find(
      (s) =>
        s.castable_in_combat !== false &&
        s.mp_cost <= member.mp &&
        ((injured && s.id === "cure") ||
          (member.class_id === "cinder" &&
            (/bat/i.test(state.enemies[0]?.name || "")
              ? s.id === "frost"
              : s.id === "spark"))),
    );
    if (slot === 0) await onRound(state);
    if (spell) {
      if (touch) await clickRouteText(page, "SPELL", "Battle", true);
      else await page.keyboard.press("s");
      await choose(spell.name);
      if (spell.id === "cure") await choose(injured.name);
      else await targetEnemy();
    } else if (
      member.class_id === "rogue" &&
      member.abilities?.some((a) => (a.id || a) === "backstab")
    ) {
      if (touch) await clickRouteText(page, "ABILITY", "Battle", true);
      else await page.keyboard.press("b");
      await choose("Backstab");
      await targetEnemy();
    } else {
      if (touch) await clickRouteText(page, "ATTACK", "Battle", true);
      else await page.keyboard.press("a");
      await targetEnemy();
    }
    // The next actor prompt is delayed; never recycle the previous actor's turn.
    await page.waitForTimeout(30);
  }
  throw new Error("Opening battle exceeded forty full-party rounds");
}
