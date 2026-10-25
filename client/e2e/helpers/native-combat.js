import { expect } from "@playwright/test";
import { clickRouteText } from "./normal-route.js";

// Read choices, then use actual command/target controls for every party member.
export async function fightNormally(page, onRound = async () => {}) {
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
        await page.locator(".battle-loot-keep").click();
        await page.waitForTimeout(100);
      }
      await page.waitForFunction(() =>
        window.__kithlandsTest.interactiveTextPosition("Continue", "Battle"),
      );
      await clickRouteText(page, "Continue", "Battle");
      await page.waitForFunction(
        () => window.__kithlandsTest.activeSceneKey() !== "Battle",
      );
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
      await row.click();
    };
    const targetEnemy = async () => {
      await expect(page.locator(".battle-choice-panel")).toContainText(
        "Choose enemy",
      );
      await page
        .locator(".battle-choice-list button:not(:disabled)")
        .first()
        .click();
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
      await page.keyboard.press("s");
      await choose(spell.name);
      if (spell.id === "cure") await choose(injured.name);
      else await targetEnemy();
    } else if (
      member.class_id === "rogue" &&
      member.abilities?.some((a) => (a.id || a) === "backstab")
    ) {
      await page.keyboard.press("b");
      await choose("Backstab");
      await targetEnemy();
    } else {
      await page.keyboard.press("a");
      await targetEnemy();
    }
    // The next actor prompt is delayed; never recycle the previous actor's turn.
    await page.waitForTimeout(30);
  }
  throw new Error("Opening battle exceeded forty full-party rounds");
}
