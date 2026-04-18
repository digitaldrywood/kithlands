import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startBattle(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.startCustomGame({
      town_name: "Cadott, WI",
      people: [
        { name: "Coach Bell", relation: "friendly" },
        { name: "Ms Rivera", relation: "neutral" },
        { name: "Mallory", relation: "rival" },
      ],
      places: ["General Store", "Library", "Fire Hall"],
      big_building: "Town Hall",
      difficulty: "normal",
      party: [
        { name: "Ayla", class_id: "warrior" },
        { name: "Mira", class_id: "mender" },
        { name: "Cato", class_id: "cinder" },
        { name: "Nia", class_id: "rogue" },
      ],
    }),
  );
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.evaluate(() =>
    window.__kithlandsTest.forceEncounter(["slime", "goblin"], 2),
  );
  await page.waitForFunction(
    () =>
      window.__kithlandsTest.activeSceneKey() === "Battle" &&
      !!window.__kithlandsTest.gameState("Battle")?.enemies?.length,
  );
}

async function waitForBattleFxToSettle(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
    return (
      snapshot.tracers === 0 &&
      snapshot.reticles === 0 &&
      snapshot.bursts === 0 &&
      snapshot.vignetteAlpha < 0.01 &&
      snapshot.floatingTexts.length === 0
    );
  });
}

async function setProofLabel(page, label, snapshot) {
  await page.evaluate(
    ({ nextLabel, nextSnapshot }) => {
      const existing = document.getElementById("battle-party-stagger-proof");
      if (existing) existing.remove();

      const partyLines = (nextSnapshot.partyMembers || []).map((member) => {
        const pos =
          member.x == null || member.y == null
            ? "?"
            : `${Math.round(member.x)},${Math.round(member.y)}`;
        return `slot ${member.slot + 1} ${member.name}: ${member.row} @ ${pos}`;
      });

      const panel = document.createElement("div");
      panel.id = "battle-party-stagger-proof";
      panel.style.position = "fixed";
      panel.style.top = "8px";
      panel.style.left = "8px";
      panel.style.zIndex = "9999";
      panel.style.background = "rgba(15, 23, 42, 0.92)";
      panel.style.color = "#e2e8f0";
      panel.style.padding = "10px 12px";
      panel.style.border = "1px solid rgba(148, 163, 184, 0.7)";
      panel.style.borderRadius = "8px";
      panel.style.fontFamily = "monospace";
      panel.style.fontSize = "12px";
      panel.style.whiteSpace = "pre";
      panel.textContent = [nextLabel, ...partyLines].join("\n");
      document.body.appendChild(panel);
    },
    {
      nextLabel: label,
      nextSnapshot: snapshot,
    },
  );
}

test.describe("battle party stagger proof — issue #229", () => {
  test("shows staggered front/back rows and floating text above sprite bodies", async ({
    page,
  }, testInfo) => {
    await startBattle(page);
    await waitForBattleFxToSettle(page);

    const before = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    const [slot1, slot2, slot3, slot4] = before.partyMembers;
    expect(before.partyMembers).toHaveLength(4);
    expect(slot1.row).toBe("front");
    expect(slot2.row).toBe("back");
    expect(slot3.row).toBe("back");
    expect(slot4.row).toBe("front");
    expect(slot1.x).toBeLessThan(slot2.x);
    expect(slot4.x).toBeLessThan(slot3.x);
    expect(Math.abs(slot1.y - slot2.y)).toBeGreaterThanOrEqual(30);
    expect(Math.abs(slot3.y - slot4.y)).toBeGreaterThanOrEqual(30);

    await setProofLabel(page, "Before: staggered party rows", before);
    await page.screenshot({
      path: testInfo.outputPath(`battle-party-stagger-before-${RUN_ID}.png`),
      fullPage: true,
    });

    await page.evaluate(() =>
      window.__kithlandsTest.playBattleVisibilityDemo("floating_text"),
    );
    await page.waitForFunction(() => {
      const snapshot = window.__kithlandsTest.battleVisibilitySnapshot();
      return snapshot.floatingTexts.length >= 2;
    });

    const after = await page.evaluate(() =>
      window.__kithlandsTest.battleVisibilitySnapshot(),
    );
    const partyText = after.floatingTexts.find((entry) =>
      String(entry.targetKey || "").startsWith("proof_party_number_"),
    );
    const enemyText = after.floatingTexts.find((entry) =>
      String(entry.targetKey || "").startsWith("proof_magic_number_"),
    );
    const enemyTarget = after.enemyMembers.reduce((best, entry) => {
      if (!best) return entry;
      return Math.abs((entry.x || 0) - (enemyText?.x || 0)) <
        Math.abs((best.x || 0) - (enemyText?.x || 0))
        ? entry
        : best;
    }, null);
    expect(partyText?.text).toBe("-34");
    expect(enemyText?.text).toBe("-19");
    expect(partyText.y).toBeLessThan(slot1.spriteBounds.top);
    expect(enemyTarget?.spriteBounds).toBeTruthy();
    expect(enemyText.y).toBeLessThan(enemyTarget.spriteBounds.top);

    await setProofLabel(page, "After: damage numbers clear of sprites", after);
    await page.screenshot({
      path: testInfo.outputPath(
        `battle-party-stagger-damage-after-${RUN_ID}.png`,
      ),
      fullPage: true,
    });
  });
});
