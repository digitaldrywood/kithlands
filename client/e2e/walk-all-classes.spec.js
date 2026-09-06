import { test, expect } from "@playwright/test";

const CLASS_IDS = [
  "warrior",
  "brawler",
  "rogue",
  "mender",
  "cinder",
  "wayfarer",
  "knight",
  "champion",
  "shadow",
  "sage",
  "pyromancer",
  "wanderer",
];

const DIRS = ["down", "up", "left", "right"];
const OPPOSITE_DIR = {
  down: "up",
  up: "down",
  left: "right",
  right: "left",
};
async function startGame(page) {
  // Use the same explicit render clock as the cadence tests. Headless Linux
  // has no display vsync; requestAnimationFrame can alias the pose sampling.
  await page.route("**/src/main.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        "const game = new Phaser.Game(config);",
        "config.fps = { target: 60, forceSetTimeOut: true };\nconst game = new Phaser.Game(config);",
      ),
    });
  });
  // The audit must display every biomechanical pose even when headless
  // Chromium is under load; the normal-speed smoke test runs separately.
  await page.addInitScript(() => {
    localStorage.setItem("kithlands_prefs", JSON.stringify({ walkSpeed: 1 }));
  });
  await page.goto("/?noEncounters=1");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Title"),
  );
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.evaluate(() => window.__kithlandsTest.waitForSceneReady("World"));
}

async function restartSceneWithLeaderClass(page, sceneKey, classId) {
  await page.evaluate(
    ({ classId, sceneKey }) =>
      window.__kithlandsTest.restartSceneWithLeaderClass(classId, sceneKey),
    { classId, sceneKey },
  );
  await page.evaluate(
    ({ sceneKey, classId }) =>
      window.__kithlandsTest.waitForSceneReady(sceneKey, classId),
    { sceneKey, classId },
  );
}

async function auditClassScene(page, sceneKey, classId) {
  await restartSceneWithLeaderClass(page, sceneKey, classId);
  const contract = await page.evaluate(
    (id) => window.__kithlandsTest.walkSheetContract(id),
    classId,
  );

  for (const dir of DIRS) {
    const anchor = await page.evaluate(
      ({ dir, sceneKey }) =>
        window.__kithlandsTest.findStraightAuditAnchor(dir, 4, sceneKey),
      { dir, sceneKey },
    );
    expect(anchor).toBeTruthy();

    await page.evaluate(
      ({ x, y, sceneKey }) =>
        window.__kithlandsTest.setPlayerTile(x, y, sceneKey),
      { ...anchor, sceneKey },
    );
    await page.evaluate(
      ({ dir, sceneKey }) =>
        window.__kithlandsTest.setPlayerFacing(dir, sceneKey),
      { dir: OPPOSITE_DIR[dir], sceneKey },
    );

    const sequence = await page.evaluate(
      ({ dir, sceneKey }) =>
        window.__kithlandsTest.sampleWalkCycle(dir, sceneKey),
      { dir, sceneKey },
    );

    expect(sequence.every((step) => step.moved)).toBe(true);
    expect(sequence.every((step) => step.playerDir === dir)).toBe(true);
    expect(sequence.every((step) => step.hasWalkSheet)).toBe(true);
    expect(sequence.every((step) => step.leaderClass === classId)).toBe(true);
    expect(
      sequence.every((step) => step.textureKey === `${classId}_walk`),
    ).toBe(true);
    const auditedFrames = sequence
      .flatMap((sample) => sample.walkFrameAudit)
      .filter((entry) => entry.dir === dir)
      .map((entry) => entry.frameIndex);
    const expectedFrames = contract.frameSequence.map(
      (frame) => contract.baseFrameByDirection[dir] + frame,
    );
    expect(auditedFrames.every((frame) => expectedFrames.includes(frame))).toBe(
      true,
    );
    expect(
      new Set(auditedFrames).size,
      `${classId} ${sceneKey} ${dir}: assigned ${[...new Set(auditedFrames)]}; rendered ${[...new Set(sequence.map((s) => s.frameIndex))]}`,
    ).toBeGreaterThanOrEqual(Math.min(4, contract.frameSequence.length));
    const passingFrames = [2, 6]
      .filter((frame) => contract.frameSequence.includes(frame))
      .map((frame) => contract.baseFrameByDirection[dir] + frame);
    expect(auditedFrames.some((frame) => passingFrames.includes(frame))).toBe(
      true,
    );
    expect(auditedFrames).toContain(sequence.at(-1).frameIndex);
    expect(
      sequence.every((step) => step.frameWidth === contract.cellSize),
    ).toBe(true);
    expect(
      sequence.every((step) => step.frameHeight === contract.cellSize),
    ).toBe(true);
    expect(sequence.every((step) => step.originX === 0.5)).toBe(true);
    expect(sequence.every((step) => step.originY === 1)).toBe(true);
    expect(sequence.every((step) => step.framePixels?.opaquePixels > 120)).toBe(
      true,
    );
    expect(sequence.every((step) => step.framePixels?.edgePixels === 0)).toBe(
      true,
    );
    expect(new Set(sequence.map((step) => step.displayWidth)).size).toBe(1);
    expect(new Set(sequence.map((step) => step.displayHeight)).size).toBe(1);
    expect(new Set(sequence.map((step) => step.scaleX)).size).toBe(1);
    expect(new Set(sequence.map((step) => step.scaleY)).size).toBe(1);
  }

  const perDirection = {};
  for (const dir of DIRS) {
    const anchor = await page.evaluate(
      ({ dir, sceneKey }) =>
        window.__kithlandsTest.findStraightAuditAnchor(dir, 1, sceneKey),
      { dir, sceneKey },
    );
    expect(anchor).toBeTruthy();

    await page.evaluate(
      ({ x, y, sceneKey }) =>
        window.__kithlandsTest.setPlayerTile(x, y, sceneKey),
      { ...anchor, sceneKey },
    );
    await page.evaluate(
      ({ dir, sceneKey }) =>
        window.__kithlandsTest.setPlayerFacing(dir, sceneKey),
      { dir: OPPOSITE_DIR[dir], sceneKey },
    );

    const firstStep = await page.evaluate(
      ({ dir, sceneKey }) =>
        window.__kithlandsTest.sampleMovePlayer(dir, sceneKey),
      { dir, sceneKey },
    );
    expect(firstStep.every((sample) => sample.moved)).toBe(true);
    perDirection[dir] = firstStep[0].frameHash;
  }
  expect(new Set(Object.values(perDirection)).size).toBe(4);
}

test.describe("walk audit", () => {
  for (const classId of CLASS_IDS) {
    test(`${classId} keeps the correct directional walk sequences in world and town`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await startGame(page);
      await auditClassScene(page, "World", classId);
      await auditClassScene(page, "Town", classId);
    });
  }
});
