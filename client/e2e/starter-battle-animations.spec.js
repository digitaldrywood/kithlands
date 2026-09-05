import { expect, test } from "@playwright/test";

const RUN_ID = Date.now();

async function waitForBridge(page) {
  await page.waitForFunction(
    () => window.__kithlandsTest?.activeSceneKey() === "Title",
  );
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

test("starter party uses animated bodies through attack and return", async ({
  page,
}, testInfo) => {
  await startBattle(page);
  const snapshot = await page.evaluate(() =>
    window.__kithlandsTest.battleVisibilitySnapshot(),
  );
  for (const [slot, classID] of [
    "warrior",
    "mender",
    "cinder",
    "rogue",
  ].entries()) {
    const member = snapshot.partyMembers[slot];
    expect(member.textureKey).toContain(`battle_${classID}_`);
    for (const frame of [0, 1, 3, 5]) {
      const result = await page.evaluate(
        ({ name, frame }) =>
          window.__kithlandsTest.previewBattleCharacterStateFrame(
            name,
            "physical_attack",
            frame,
          ),
        { name: member.name, frame },
      );
      expect(result.textureKey).toContain(`battle_${classID}_`);
      await page.screenshot({
        path: testInfo.outputPath(
          `starter-${classID}-attack-${frame}-${RUN_ID}.png`,
        ),
      });
    }
    const completed = await page.evaluate(
      (name) =>
        window.__kithlandsTest.playBattleCharacterState(
          name,
          "physical_attack",
        ),
      member.name,
    );
    expect(completed.stateID).toBe("idle_guard");
    expect(completed.frameIndex).toBe(0);
  }
  await page.screenshot({
    path: testInfo.outputPath(`starter-party-idle-${RUN_ID}.png`),
  });
  await page.evaluate(() =>
    window.__kithlandsTest.startAuthoritativeBattleRound("attack"),
  );
  await page.waitForFunction(() => {
    const s = window.__kithlandsTest.battleVisibilitySnapshot();
    return (
      !s.animating &&
      s.partyMembers.every((member) => member.battleState === "idle_guard")
    );
  });
});
