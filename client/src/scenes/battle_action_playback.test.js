import { describe, expect, it } from "vitest";
import { beginBattleAction } from "./battle_action_playback.js";

describe("authored action cue", () => {
  it("holds the impact pose until the result is displayed, then recovers", async () => {
    const observed = [];
    const sprite = {
      async playBattleState(state, { onCue }) {
        observed.push("anticipate", "impact");
        await onCue();
        observed.push("recover");
        return true;
      },
    };
    const action = beginBattleAction(sprite, "physical_attack");
    expect(await action.cue).toBe(true);
    expect(observed).toEqual(["anticipate", "impact"]);
    observed.push("damage");
    action.resume();
    expect(await action.finished).toBe(true);
    expect(observed).toEqual(["anticipate", "impact", "damage", "recover"]);
  });
  it("settles without hanging when a missing or cancelled state never reaches its cue", async () => {
    const action = beginBattleAction(
      { playBattleState: async () => false },
      "physical_attack",
    );
    expect(await action.cue).toBe(false);
    expect(await action.finished).toBe(false);
  });
});
