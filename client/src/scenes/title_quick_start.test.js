import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { login, newGame } from "../api.js";
import { getLastWizard } from "../systems/prefs.js";

vi.mock("../api.js", () => ({
  debugCreateShowcase: vi.fn(),
  login: vi.fn(),
  setToken: vi.fn(),
  newGame: vi.fn(),
  listSaves: vi.fn(),
  loadSave: vi.fn(),
}));
vi.mock("../systems/audio.js", () => ({
  initAudio: vi.fn(),
  playMusic: vi.fn(),
  playSFX: vi.fn(),
}));
vi.mock("../systems/prefs.js", () => ({
  getEmail: vi.fn(),
  setEmail: vi.fn(),
  getLastWizard: vi.fn(),
  setLastWizard: vi.fn(),
}));
vi.mock("./walkAuditMode.js", () => ({
  walkAuditRequested: () => false,
  buildWalkAuditParty: vi.fn(),
}));
let TitleScene;
beforeAll(async () => {
  vi.stubGlobal("Phaser", { Scene: class {} });
  ({ TitleScene } = await import("./title.js"));
});
beforeEach(() => {
  vi.clearAllMocks();
  login.mockResolvedValue({ token: "test" });
  newGame.mockResolvedValue({ id: "new", party: [] });
});
it.each([
  null,
  { town_name: "My town", party: [{ name: "Old hero", class_id: "warrior" }] },
])(
  "quick starts four classes while retaining the town setup %j",
  async (last) => {
    getLastWizard.mockReturnValue(last);
    const scene = new TitleScene();
    scene.statusText = {
      setText: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
    };
    scene.scene = { start: vi.fn() };
    await scene.startGame({ value: "player@example.com" }, true);
    const request = newGame.mock.calls[0][0];
    expect(request.party.map((member) => member.class_id)).toEqual([
      "warrior",
      "cinder",
      "rogue",
      "mender",
    ]);
    expect(request.town_name).toBe(last?.town_name || "Cadott, WI");
    expect(scene.scene.start).toHaveBeenCalledWith("World", {
      gameState: { id: "new", party: [] },
    });
    if (last) expect(last.party).toHaveLength(1);
  },
);
