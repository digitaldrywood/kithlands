import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

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
const BASE_FRAME = {
  down: 0,
  up: 4,
  left: 8,
  right: 12,
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

async function exportDirectionFrame(page, sceneKey, classId, dir) {
  const anchor = await page.evaluate(
    ({ dir, sceneKey }) =>
      window.__kithlandsTest.findStraightAuditAnchor(dir, 1, sceneKey),
    { dir, sceneKey },
  );
  expect(anchor).toBeTruthy();

  await page.evaluate(
    ({ x, y, sceneKey }) => window.__kithlandsTest.setPlayerTile(x, y, sceneKey),
    { ...anchor, sceneKey },
  );
  await page.evaluate(
    ({ dir, sceneKey }) =>
      window.__kithlandsTest.setPlayerFacing(dir, sceneKey),
    { dir: OPPOSITE_DIR[dir], sceneKey },
  );

  const step = await page.evaluate(
    ({ dir, sceneKey }) => window.__kithlandsTest.movePlayer(dir, sceneKey),
    { dir, sceneKey },
  );
  expect(step.moved).toBe(true);
  expect(step.playerDir).toBe(dir);
  expect(step.leaderClass).toBe(classId);
  expect(step.textureKey).toBe(`${classId}_walk`);
  expect(step.frameIndex).toBe(BASE_FRAME[dir]);

  const frame = await page.evaluate(
    ({ sceneKey }) => window.__kithlandsTest.exportPlayerFrame(sceneKey),
    { sceneKey },
  );
  expect(frame.textureKey).toBe(`${classId}_walk`);
  expect(frame.frameIndex).toBe(BASE_FRAME[dir]);
  return frame;
}

test("walk audit exports directional proof frames for every class", async ({
  page,
}) => {
  test.setTimeout(120_000);

  const sceneKey = "World";
  const timestamp = Date.now();
  const outputDir = path.resolve(process.cwd(), "tmp");
  const manifest = [];

  await fs.mkdir(outputDir, { recursive: true });
  await startGame(page);

  for (const classId of CLASS_IDS) {
    await restartSceneWithLeaderClass(page, sceneKey, classId);

    for (const dir of DIRS) {
      const frame = await exportDirectionFrame(page, sceneKey, classId, dir);
      const fileName = `issue-234-${timestamp}-${classId}-${dir}.png`;
      const outputPath = path.join(outputDir, fileName);
      const payload = frame.dataUrl.replace(/^data:image\/png;base64,/, "");
      await fs.writeFile(outputPath, Buffer.from(payload, "base64"));
      manifest.push({
        classId,
        dir,
        fileName,
        textureKey: frame.textureKey,
        frameIndex: frame.frameIndex,
      });
    }
  }

  await fs.writeFile(
    path.join(outputDir, `issue-234-${timestamp}-walk-proof-manifest.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
});
