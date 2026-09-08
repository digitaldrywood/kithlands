import { describe, expect, it, vi } from "vitest";
vi.mock("../api.js", () => ({ gameAction: vi.fn() }));
import { gameAction } from "../api.js";
import { fieldCastReason, performCharacterCast } from "./character_spells.js";
const cure = {
  id: "cure",
  name: "Cure",
  effect: "heal",
  target: "single_ally",
  mp_cost: 2,
};
const state = () => {
  const state = {
    partyIndex: 0,
    scene: {
      gameState: {
        id: "game",
        phase: "exploration",
        party: [
          { name: "Willow", hp: 10, max_hp: 20, mp: 4, max_mp: 10 },
          { name: "Hero", hp: 1, max_hp: 35 },
        ],
      },
    },
  };
  state.scene.equipmentScreenState = state;
  return state;
};
describe("character spell casting", () => {
  it("explains battle-only, low MP, KO, and unnecessary casts", () => {
    const gs = state().scene.gameState;
    expect(fieldCastReason(gs, gs.party[0], { effect: "damage" })).toBe(
      "Battle only",
    );
    expect(fieldCastReason(gs, { hp: 1, mp: 0 }, cure)).toBe("Not enough MP");
    expect(fieldCastReason(gs, { hp: 0, mp: 10 }, cure)).toBe("Caster is KO");
    gs.party.forEach((p) => (p.hp = p.max_hp));
    expect(fieldCastReason(gs, gs.party[0], cure)).toBe("No eligible targets");
  });
  it("applies server values, keeps the spell selected, and allows another target", async () => {
    const s = state();
    const next = structuredClone(s.scene.gameState);
    next.party[0].mp = 2;
    next.party[1].hp = 25;
    gameAction.mockResolvedValueOnce(next);
    await performCharacterCast(s, cure, 1, vi.fn());
    expect(gameAction).toHaveBeenLastCalledWith("game", {
      type: "spell",
      slot_idx: 0,
      spell_id: "cure",
      target_id: 1,
    });
    expect(s.scene.gameState.party[0].mp).toBe(2);
    expect(s.selectedSpellID).toBe("cure");
    expect(s.busy).toBe(false);
  });
  it("does not spend locally on failure or submit twice while pending", async () => {
    gameAction.mockClear();
    let resolve;
    gameAction.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const s = state();
    const pending = performCharacterCast(s, cure, 1, vi.fn());
    await performCharacterCast(s, cure, 1, vi.fn());
    expect(gameAction).toHaveBeenCalledTimes(1);
    resolve({ error: "Try again" });
    await pending;
    expect(s.status).toBe("Try again");
    expect(s.scene.gameState.party[0].mp).toBe(4);
    expect(s.busy).toBe(false);
  });
});
