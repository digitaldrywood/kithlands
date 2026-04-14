function activeScene(game) {
  const scenes = game.scene.getScenes(true);
  return scenes.length > 0 ? scenes[0] : null;
}

function getScene(game, key) {
  if (!key) return activeScene(game);
  return game.scene.getScene(key);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defaultGameState() {
  return {
    id: "test-game",
    phase: "world",
    gold: 0,
    potions: 0,
    ethers: 0,
    items: [],
    collected_hidden_items: {},
    equipment: [],
    party: [
      {
        name: "Ayla",
        class_id: "warrior",
        sprite_id: "warrior",
        hp: 1,
        max_hp: 20,
        mp: 0,
        max_mp: 5,
        status: "",
      },
      {
        name: "Bram",
        class_id: "mage",
        sprite_id: "sage",
        hp: 2,
        max_hp: 14,
        mp: 0,
        max_mp: 12,
        status: "",
      },
    ],
  };
}

function waitFor(check, timeoutMs = 5000, intervalMs = 25) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (check()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for game state"));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

export function installDevTestBridge(game) {
  globalThis.__kithlandsTest = {
    activeSceneKey() {
      return activeScene(game)?.scene?.key || null;
    },

    sceneIsActive(sceneKey) {
      return game.scene.isActive(sceneKey);
    },

    gameState(sceneKey) {
      return clone(getScene(game, sceneKey)?.gameState || null);
    },

    visibleTexts(sceneKey) {
      const scene = getScene(game, sceneKey);
      return (scene?.children?.list || [])
        .filter((child) => typeof child?.text === "string")
        .map((child) => ({
          text: child.text,
          interactive: !!child?.input?.enabled,
        }));
    },

    async startQuickGame(email = `playwright_${Date.now()}@kithlands.dev`) {
      const title = getScene(game, "Title");
      if (!title || typeof title.startGame !== "function") {
        throw new Error("Title scene is not ready");
      }
      await waitFor(() => !!title.statusText);
      await title.startGame({ value: email }, true);
      return this.gameState("World");
    },

    setPartyVitals(updates, sceneKey) {
      const scene = getScene(game, sceneKey);
      if (!scene?.gameState?.party) throw new Error("Scene has no party state");
      for (const update of updates || []) {
        const member = scene.gameState.party?.[update.slot];
        if (!member) continue;
        if (Object.hasOwn(update, "hp")) member.hp = update.hp;
        if (Object.hasOwn(update, "mp")) member.mp = update.mp;
        if (Object.hasOwn(update, "status")) member.status = update.status;
      }
      if (typeof scene.updateHUD === "function") scene.updateHUD();
      return this.gameState(sceneKey);
    },

    startTownScene(spawn, fromSceneKey = "World") {
      const scene = getScene(game, fromSceneKey) || activeScene(game);
      const sourceGameState = clone(scene?.gameState) || defaultGameState();
      game.scene.start("Town", {
        gameState: sourceGameState,
        spawn: {
          node_id: "test_house",
          name: "Home",
          tags: ["house"],
          ...spawn,
        },
      });
      return true;
    },

    townNpcPositions(sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene) throw new Error("Town scene is not active");
      return (scene.npcs || []).map((npc) => ({ x: npc.x, y: npc.y }));
    },

    teleportTownPlayer(x, y, sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene) throw new Error("Town scene is not active");
      scene.playerX = x;
      scene.playerY = y;
      if (scene.player) {
        scene.player.x = scene.offsetX + x * 32 + 16;
        scene.player.y = scene.offsetY + y * 32 + 16;
      }
      let closestIdx = -1;
      let closestDist = Infinity;
      for (let i = 0; i < (scene.npcs || []).length; i++) {
        const dist =
          Math.abs(scene.playerX - scene.npcs[i].x) +
          Math.abs(scene.playerY - scene.npcs[i].y);
        if (dist <= 2 && dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      if (closestIdx >= 0) {
        scene.nearNpcIndex = closestIdx;
        if (typeof scene.showInteractPrompt === "function")
          scene.showInteractPrompt();
      } else {
        scene.nearNpcIndex = -1;
        if (typeof scene.hideInteractPrompt === "function")
          scene.hideInteractPrompt();
      }
      return {
        x: scene.playerX,
        y: scene.playerY,
        nearNpcIndex: scene.nearNpcIndex,
        npcPositions: (scene.npcs || []).map((npc) => ({ x: npc.x, y: npc.y })),
      };
    },

    async interact(sceneKey = "Town") {
      const scene = getScene(game, sceneKey);
      if (!scene || typeof scene.interact !== "function") {
        throw new Error("Scene cannot interact");
      }
      const pending = scene.interact();
      [150, 350, 650, 1000].forEach((delay) => {
        setTimeout(() => scene.input.keyboard.emit("keydown-ENTER"), delay);
      });
      await pending;
      return this.gameState(sceneKey);
    },
  };
}
