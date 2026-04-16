import { expect, test } from "@playwright/test";

async function waitForBridge(page) {
  await page.waitForFunction(() => !!window.__kithlandsTest);
}

async function startQuickGame(page) {
  await page.goto("/");
  await waitForBridge(page);
  await page.evaluate(() => window.__kithlandsTest.startQuickGame());
  await page.waitForFunction(
    () => window.__kithlandsTest.activeSceneKey() === "World",
  );
  await page.locator("canvas").click({ position: { x: 24, y: 24 } });
}

async function addAudioOverlay(page, label, sceneKey) {
  await page.evaluate(
    ({ overlayLabel, targetSceneKey }) => {
      const existing = document.getElementById("building-audio-proof");
      if (existing) existing.remove();

      const panel = document.createElement("div");
      panel.id = "building-audio-proof";
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

      const audio = window.__kithlandsTest.audioState(targetSceneKey);
      panel.textContent = [
        overlayLabel,
        `current=${audio.currentMusicKey || "none"}`,
        `playing=${(audio.playingKeys || []).join(",") || "none"}`,
      ].join("\n");
      document.body.appendChild(panel);
    },
    { overlayLabel: label, targetSceneKey: sceneKey },
  );
}

async function expectTownAudio(page, spawn, expectedMusicKey) {
  await page.evaluate(
    (nextSpawn) => window.__kithlandsTest.startTownScene(nextSpawn),
    spawn,
  );
  await page.waitForFunction(() =>
    window.__kithlandsTest.sceneIsActive("Town"),
  );
  await page.waitForFunction(
    ({ musicKey }) => {
      const audio = window.__kithlandsTest.audioState("Town");
      return (
        audio.currentMusicKey === musicKey &&
        audio.playingKeys.length === 1 &&
        audio.playingKeys[0] === musicKey
      );
    },
    { musicKey: expectedMusicKey },
  );

  const audio = await page.evaluate(() =>
    window.__kithlandsTest.audioState("Town"),
  );
  expect(audio).toEqual({
    currentMusicKey: expectedMusicKey,
    playingKeys: [expectedMusicKey],
  });
}

test.describe("building audio routing", () => {
  test("building interiors use a single building-specific music track", async ({
    page,
  }) => {
    const stamp = Date.now();
    await startQuickGame(page);

    await expectTownAudio(
      page,
      { node_id: "audio-shop", name: "Market", tags: ["shop"] },
      "music_shop",
    );
    await addAudioOverlay(page, "SHOP", "Town");
    await page.screenshot({
      path: `tmp/building-audio-${stamp}-shop.png`,
      fullPage: true,
    });

    await expectTownAudio(
      page,
      { node_id: "audio-temple", name: "Temple", tags: ["temple"] },
      "music_quest",
    );
    await addAudioOverlay(page, "TEMPLE", "Town");
    await page.screenshot({
      path: `tmp/building-audio-${stamp}-temple.png`,
      fullPage: true,
    });

    await expectTownAudio(
      page,
      { node_id: "audio-house", name: "Home", tags: ["house"] },
      "music_inn",
    );
    await addAudioOverlay(page, "HOUSE", "Town");
    await page.screenshot({
      path: `tmp/building-audio-${stamp}-house.png`,
      fullPage: true,
    });

    await page.evaluate(() => window.__kithlandsTest.exitTown());
    await page.waitForFunction(
      () => window.__kithlandsTest.activeSceneKey() === "World",
    );
    await page.waitForFunction(() => {
      const audio = window.__kithlandsTest.audioState("World");
      return (
        audio.currentMusicKey === "music_overworld" &&
        audio.playingKeys.length === 1 &&
        audio.playingKeys[0] === "music_overworld"
      );
    });

    await addAudioOverlay(page, "WORLD", "World");
    await page.screenshot({
      path: `tmp/building-audio-${stamp}-world.png`,
      fullPage: true,
    });
  });
});
