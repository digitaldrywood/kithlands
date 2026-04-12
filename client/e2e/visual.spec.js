// Visual regression suite (#145 Part D). Four named checks, each
// corresponding to a bug class that shipped this session:
//
//   1. Ambush banner fires once and clears                    (c9be154)
//   2. Walk sprite frames differ per direction                (14c3da0)
//   3. Modal blocks click-through to the world player         (0eba90d)
//   4. HUD footer fits a 4-member party                       (c26d83f)
//
// Each test drives the game into a known state by calling the dev-only
// debug API (registered when KITHLANDS_DEBUG=1 is set server-side) and
// then screenshots the relevant viewport region. On first run Playwright
// auto-captures the baseline under __screenshots__/; subsequent runs
// fail on any pixel delta > maxDiffPixelRatio (configured in
// playwright.config.js).
//
// NOTE: this suite is local-only — CI does not install Playwright
// browsers. Run it manually via `make test-visual` after starting the
// dev server with KITHLANDS_DEBUG=1. See client/e2e/README.md for the
// one-time baseline capture procedure.

import { test, expect } from "@playwright/test";

// Helper: start a fresh game via the public API so each test is
// deterministic and does not depend on localStorage leftover state.
async function startGame(page) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__kithlandsTest);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
}

const OPPOSITE_DIR = {
  down: "up",
  up: "down",
  left: "right",
  right: "left",
};

test.describe("visual regression — issue #145", () => {
  test.skip("ambush banner fires once and clears (c9be154)", async ({
    page,
  }) => {
    await startGame(page);
    // Force an ambush via the debug API.
    // TODO(baseline-capture): hit /api/debug/game/{id}/force-encounter-start
    // with start=ambush, screenshot round 0, issue a wait action,
    // screenshot round 1, assert round-1 screenshot has no ambush banner.
    await expect(page).toHaveScreenshot("ambush-round-0.png");
  });

  test("walk sprite frames differ per direction (14c3da0)", async ({ page }) => {
    await startGame(page);
    const anchor = await page.evaluate(() =>
      window.__kithlandsTest.findDirectionAuditAnchor("World"),
    );
    expect(anchor).toBeTruthy();

    const frames = {};
    for (const dir of ["down", "up", "left", "right"]) {
      await page.evaluate(
        ({ x, y }) => window.__kithlandsTest.setPlayerTile(x, y, "World"),
        anchor,
      );
      await page.evaluate(
        (facing) => window.__kithlandsTest.setPlayerFacing(facing, "World"),
        OPPOSITE_DIR[dir],
      );
      frames[dir] = await page.evaluate(
        (moveDir) => window.__kithlandsTest.movePlayer(moveDir, "World"),
        dir,
      );
      expect(frames[dir].moved).toBe(true);
      expect(frames[dir].playerDir).toBe(dir);
      if (frames[dir].hasWalkSheet) {
        expect(frames[dir].textureKey).toBe(`${frames[dir].leaderClass}_walk`);
        expect(frames[dir].walkFrame).toBe(0);
      } else {
        expect(frames[dir].textureKey).toBe(`player_${dir}`);
      }
    }

    const usesWalkSheet = Object.values(frames).some((frame) => frame.hasWalkSheet);
    expect(
      Object.values(frames).every((frame) => frame.hasWalkSheet === usesWalkSheet),
    ).toBe(true);

    if (usesWalkSheet) {
      expect(frames.down.frameIndex).toBe(0);
      expect(frames.up.frameIndex).toBe(4);
      expect(frames.left.frameIndex).toBe(8);
      expect(frames.right.frameIndex).toBe(12);
    }
    expect(new Set(Object.values(frames).map((frame) => frame.frameHash)).size).toBe(4);

    const leftPathAnchor = await page.evaluate(() =>
      window.__kithlandsTest.findStraightAuditAnchor("left", 2, "World"),
    );
    expect(leftPathAnchor).toBeTruthy();

    await page.evaluate(
      ({ x, y }) => window.__kithlandsTest.setPlayerTile(x, y, "World"),
      leftPathAnchor,
    );
    await page.evaluate(
      () => window.__kithlandsTest.setPlayerFacing("right", "World"),
    );
    const left0 = await page.evaluate(
      () => window.__kithlandsTest.movePlayer("left", "World"),
    );
    const left1 = await page.evaluate(
      () => window.__kithlandsTest.movePlayer("left", "World"),
    );
    expect(left1.moved).toBe(true);
    expect(left1.playerDir).toBe("left");
    if (left1.hasWalkSheet) {
      expect(left0.frameIndex).toBe(8);
      expect(left1.frameIndex).toBe(9);
      expect(left1.walkFrame).toBe(1);
      expect(left1.frameHash).not.toBe(left0.frameHash);
    } else {
      expect(left0.textureKey).toBe("player_left");
      expect(left1.textureKey).toBe("player_left");
    }
  });

  test.skip("options modal blocks world click-through (0eba90d)", async ({
    page,
  }) => {
    await startGame(page);
    // TODO(baseline-capture): open options, click at a world position,
    // screenshot the canvas and assert the player did not move. The
    // screenshot pins the overlay z-order and the player position in
    // one frame.
    await expect(page).toHaveScreenshot("options-modal-blocks.png");
  });

  test.skip("HUD footer fits a 4-member party (c26d83f)", async ({ page }) => {
    await startGame(page);
    // TODO(baseline-capture): create a 4-member party, force into
    // combat (so MP bars show), and screenshot just the bottom 40px
    // of the canvas. Pixel diff catches HUD overflow regressions.
    await expect(page).toHaveScreenshot("hud-footer-4-party.png", {
      clip: { x: 0, y: 560, width: 800, height: 40 },
    });
  });
});
