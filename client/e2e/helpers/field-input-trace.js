import { writeFileSync } from "node:fs";

// Diagnostic observation only. Never changes party state or casts a spell.
export async function installFieldInputTrace(page) {
  const requests = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/action") || request.method() !== "POST")
      return;
    const action = request.postDataJSON();
    if (action?.type === "spell")
      requests.push({ target: action.target_id, spell: action.spell_id });
  });
  await page.route("**/src/main.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.__cureInputGame = game;`,
    });
  });
  await page.addInitScript(() => {
    window.__cureInputTrace = [];
    window.__cureInputSnapshot = (stage, event) => {
      const scene = window.__cureInputGame?.scene.getScene("World");
      const state = scene?.fieldMagicMenuState;
      const row = state?.rows?.[state.cursor];
      window.__cureInputTrace.push({
        stage,
        time: performance.now(),
        key: event?.key,
        repeat: event?.repeat,
        busy: state?.busy,
        cursor: state?.cursor,
        label: row?.label,
        greyed: row?.greyed,
        hp: scene?.gameState?.party?.map((p) => p.hp),
        mp: scene?.gameState?.party?.map((p) => p.mp),
      });
    };
    window.addEventListener(
      "keydown",
      (event) => {
        if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key))
          window.__cureInputSnapshot("dom-key", event);
      },
      true,
    );
  });
  const rate = Number(process.env.KITHLANDS_INPUT_STRESS || 0);
  if (rate > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  }
  return requests;
}

export async function traceFieldKeyboard(page) {
  await page.evaluate(() => {
    const scene = window.__cureInputGame.scene.getScene("World");
    // Registered after the menu listener, so this records the selected row
    // and busy state immediately after the real handler processes a key.
    scene.input.keyboard.on("keydown", (event) => {
      window.__cureLastKeyEvent = event;
      window.__cureInputSnapshot("phaser-key", event);
    });
    scene.input.on("gameobjectover", () =>
      window.__cureInputSnapshot("pointer-over"),
    );
  });
}

export async function attachFieldInputTrace(page, info, requests) {
  const snapshot = await page
    .evaluate(() => ({
      events: window.__cureInputTrace,
      final: window.__kithlandsTest?.menuOverlaySummary("magic", "World"),
      party: window.__kithlandsTest
        ?.gameState("World")
        ?.party?.map(({ name, hp, mp }) => ({ name, hp, mp })),
    }))
    .catch(() => ({ unavailable: true }));
  const tracePath = info.outputPath(`field-input-${Date.now()}.json`);
  writeFileSync(tracePath, JSON.stringify({ requests, ...snapshot }, null, 2));
  await info.attach("field-input.json", {
    path: tracePath,
    contentType: "application/json",
  });
  if (info.status !== info.expectedStatus)
    await page
      .screenshot({
        path: info.outputPath(`field-input-failed-${Date.now()}.png`),
      })
      .catch(() => {});
}
