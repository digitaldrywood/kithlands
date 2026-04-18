import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const audioMocks = vi.hoisted(() => ({
  initAudio: vi.fn(),
  playMusic: vi.fn(),
  playSFX: vi.fn(),
}));

vi.mock("../systems/audio.js", () => ({
  initAudio: audioMocks.initAudio,
  playMusic: audioMocks.playMusic,
  playSFX: audioMocks.playSFX,
}));

vi.mock("../api.js", () => ({
  autosaveGame: vi.fn(),
  openChest: vi.fn(),
  collectHiddenItem: vi.fn(),
  interactWithNpc: vi.fn(),
  restAtTown: vi.fn(),
  getNpcDialogue: vi.fn(),
}));

vi.mock("./town_dialogue.js", () => ({
  openDialogue: vi.fn(),
}));

vi.mock("./world_menu.js", () => ({
  toggleMenu: vi.fn(),
}));

vi.mock("./world_shop.js", () => ({
  openShop: vi.fn(),
}));

vi.mock("../systems/input.js", () => ({
  isTouchDevice: vi.fn(() => false),
  initTouchControls: vi.fn(),
}));

vi.mock("./walkFrame.js", () => ({
  nextWalkFrame: vi.fn(() => 0),
  walkSheetKey: vi.fn(() => "warrior_walk"),
  walkFrameIndex: vi.fn(() => 0),
  nextLeaderIndex: vi.fn(() => 0),
}));

vi.mock("./world.js", () => ({
  getLeaderIndex: vi.fn(() => 0),
}));

vi.mock("../systems/prefs.js", () => ({
  walkStepMs: vi.fn(() => 200),
}));

vi.mock("../systems/modalLock.js", () => ({
  hasWorldLock: vi.fn(() => false),
  isWorldInputLocked: vi.fn(() => false),
  topWorldLock: vi.fn(() => null),
}));

let TownScene;
let npcSpriteForTags;
let interiorCharacterScale;

beforeAll(async () => {
  globalThis.Phaser = {
    Scene: class {},
  };

  ({ TownScene, npcSpriteForTags, interiorCharacterScale } =
    await import("./town.js"));
});

beforeEach(() => {
  audioMocks.initAudio.mockReset();
  audioMocks.playMusic.mockReset();
  audioMocks.playSFX.mockReset();
});

function runCreateUntilMusic(tags) {
  const stopAfterMusic = new Error("stop after music setup");
  const scene = new TownScene();
  scene.gameState = {
    party: [{ class_id: "warrior", sprite_id: "warrior" }],
  };
  scene.spawn = {
    node_id: "building-1",
    name: "Test Building",
    tags,
  };
  scene.cameras = {
    main: {
      setBackgroundColor: vi.fn(),
    },
  };
  scene.placeNPCs = () => {
    throw stopAfterMusic;
  };

  try {
    scene.create();
  } catch (error) {
    if (error !== stopAfterMusic) throw error;
  }
}

function runCreateUntilBackground(tags) {
  const stopAfterBackground = new Error("stop after background setup");
  const scene = new TownScene();
  scene.gameState = {
    party: [{ class_id: "warrior", sprite_id: "warrior" }],
  };
  scene.spawn = {
    node_id: "building-1",
    name: "Test Building",
    tags,
  };
  scene.cameras = {
    main: {
      setBackgroundColor: vi.fn(() => {
        throw stopAfterBackground;
      }),
    },
  };

  try {
    scene.create();
  } catch (error) {
    if (error !== stopAfterBackground) throw error;
  }

  return scene.cameras.main.setBackgroundColor;
}

describe("TownScene audio setup", () => {
  it("rebinds audio to the town scene before starting interior music", () => {
    runCreateUntilMusic(["shop"]);

    expect(audioMocks.initAudio).toHaveBeenCalledTimes(1);
    expect(audioMocks.initAudio).toHaveBeenCalledWith(expect.any(TownScene));
    expect(audioMocks.playMusic).toHaveBeenCalledWith("music_shop", true);

    const [initOrder] = audioMocks.initAudio.mock.invocationCallOrder;
    const [playOrder] = audioMocks.playMusic.mock.invocationCallOrder;
    expect(initOrder).toBeLessThan(playOrder);
  });

  it("uses quest music for temples", () => {
    runCreateUntilMusic(["temple"]);

    expect(audioMocks.playMusic).toHaveBeenCalledWith("music_quest", true);
  });

  it("uses interior music instead of overworld music for generic houses", () => {
    runCreateUntilMusic(["house"]);

    expect(audioMocks.playMusic).toHaveBeenCalledWith("music_inn", false);
  });

  it("switches the town camera to a pure black background", () => {
    const setBackgroundColor = runCreateUntilBackground(["shop"]);

    expect(setBackgroundColor).toHaveBeenCalledWith("#000000");
  });
});

describe("npcSpriteForTags", () => {
  it("uses the healer sprite for heal-tag buildings", () => {
    expect(npcSpriteForTags(["rest", "heal"])).toBe("npc_priestess");
  });

  it("keeps merchants and innkeepers mapped to their existing sprites", () => {
    expect(npcSpriteForTags(["shop", "commerce"])).toBe("npc_merchant");
    expect(npcSpriteForTags(["rest"])).toBe("npc_innkeeper");
  });
});

describe("interiorCharacterScale", () => {
  it("scales 128px NPC portraits down to the FF-style interior footprint", () => {
    expect(interiorCharacterScale(128)).toBe(0.5);
  });

  it("keeps smaller source art proportional to the rendered tile size", () => {
    expect(interiorCharacterScale(64)).toBe(1);
  });
});
