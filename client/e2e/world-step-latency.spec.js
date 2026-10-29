import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const proof = new URL(`../tmp/walk-latency-${Date.now()}/`, import.meta.url);
mkdirSync(proof, { recursive: true });
async function measure(page, delay, serialized = false) {
  await page.addInitScript(() =>
    localStorage.setItem("kithlands_prefs", JSON.stringify({ walkSpeed: 1 })),
  );
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.__latencyGame = game;`,
    });
  });
  await page.route("**/src/scenes/world.js*", async (route) => {
    const response = await route.fetch();
    let source = await response.text();
    if (serialized) {
      // Reproduce the previous request-after-tween scheduler without mocking Go.
      if (!source.includes("const arrival = syncWorldArrival"))
        throw Error("Scheduler hook missing");
      source = source
        .replace(
          "const arrival = syncWorldArrival",
          "const arrival = () => syncWorldArrival",
        )
        .replace("void arrival\n", "void arrival()\n");
    }
    await route.fulfill({ response, body: source });
  });
  await page.goto("/?walkAudit=1&noEncounters=1");
  await page.waitForFunction(() =>
    window.__kithlandsTest?.sceneIsActive("World"),
  );
  await page.evaluate(async () => {
    const b = window.__kithlandsTest;
    await b.waitForSceneReady("World");
    const anchor = b.findStraightAuditAnchor("right", 12, "World");
    if (!anchor) throw Error("No straight lane");
    b.setPlayerTile(anchor.x, anchor.y, "World");
    b.centerCameraOnPlayer("World");
    const saved = await b.saveGame("latency lane", "World");
    if (saved.error) throw Error(saved.error);
    const scene = window.__latencyGame.scene.getScene("World");
    window.__latencyFrames = [];
    window.__latencyGame.events.on("postrender", () =>
      window.__latencyFrames.push({
        time: performance.now(),
        x: scene.player.x,
        frame: Number(scene.player.frame.name) % 6,
      }),
    );
  });
  let inFlight = 0,
    maxInFlight = 0;
  const requests = [];
  await page.route("**/api/game/*/transition", async (route) => {
    if (route.request().postDataJSON()?.transition_id !== "world-step")
      return route.continue();
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const start = Date.now();
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ response });
    requests.push({ start, end: Date.now() });
    inFlight--;
  });
  const start = await page.evaluate(() => ({
    time: performance.now(),
    x: window.__latencyGame.scene.getScene("World").player.x,
  }));
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (x) => window.__latencyGame.scene.getScene("World").player.x >= x + 192,
    start.x,
  );
  await page.keyboard.up("ArrowRight");
  await page.waitForFunction(
    () => !window.__latencyGame.scene.getScene("World").animating,
  );
  const frames = await page.evaluate(() => window.__latencyFrames);
  const reached = frames.find((f) => f.x >= start.x + 192);
  const elapsed = reached.time - start.time;
  const state = await page.evaluate(() => ({
    position: window.__kithlandsTest.worldNavigationSnapshot(),
    checkpoint: window.__kithlandsTest.gameState("World").world_checkpoint,
  }));
  const result = { elapsed, requests, maxInFlight, frames, state };
  writeFileSync(
    new URL(`delay-${delay}-${serialized ? "before" : "after"}.json`, proof),
    JSON.stringify(result, null, 2),
  );
  await page.screenshot({
    path: new URL(
      `delay-${delay}-${serialized ? "before" : "after"}.png`,
      proof,
    ).pathname,
  });
  await page.unrouteAll({ behavior: "wait" });
  return result;
}
for (const delay of [0, 200, 400]) {
  test(`held walking overlaps authority with animation at ${delay}ms response delay`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const before = await measure(page, delay, true);
    const after = await measure(page, delay);
    if (delay) expect(after.elapsed).toBeLessThan(before.elapsed * 0.9);
    else expect(after.elapsed).toBeLessThan(before.elapsed * 1.1);
    expect(after.maxInFlight).toBe(1);
    expect(after.requests.length).toBeGreaterThanOrEqual(6);
    expect(
      new Set(
        after.frames
          .filter((f, i) => i && f.x > after.frames[i - 1].x)
          .map((f) => f.frame),
      ).size,
    ).toBeGreaterThanOrEqual(5);
    expect(after.state.checkpoint.x).toBe(after.state.position.x);
    expect(after.state.checkpoint.y).toBe(after.state.position.y);
    console.log(
      `delay=${delay}: before=${Math.round(before.elapsed)}ms after=${Math.round(after.elapsed)}ms`,
    );
  });
}
