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
const WALK_FRAME_COUNT = 8;
const OPPOSITE_DIR = {
  down: "up",
  up: "down",
  left: "right",
  right: "left",
};
const BASE_FRAME = {
  down: 0,
  up: WALK_FRAME_COUNT,
  left: WALK_FRAME_COUNT * 2,
  right: WALK_FRAME_COUNT * 3,
};

async function startGame(page) {
  await page.goto("/");
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
        window.__kithlandsTest.sampleMovePlayer(dir, sceneKey),
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
      .at(-1)
      .walkFrameAudit.map((entry) => entry.frameIndex);
    expect(auditedFrames).toContain(BASE_FRAME[dir] + 0);
    expect(auditedFrames.some((frame) => frame > BASE_FRAME[dir] + 0)).toBe(
      true,
    );
    expect(auditedFrames).toContain(sequence.at(-1).frameIndex);
    expect(new Set(auditedFrames).size).toBeGreaterThan(1);
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
      ({ dir, sceneKey }) => window.__kithlandsTest.movePlayer(dir, sceneKey),
      { dir, sceneKey },
    );
    perDirection[dir] = firstStep.frameHash;
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
