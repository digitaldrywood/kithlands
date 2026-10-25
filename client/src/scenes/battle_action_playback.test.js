import { describe, expect, it } from "vitest";
import {
  beginBattleAction,
  physicalAttackState,
} from "./battle_action_playback.js";

describe("authored action cue", () => {
  it("uses a critical state only for a reported crit with an authored variant", () => {
    const warrior = {
      battleStates: { physical_attack: {}, critical_attack: {} },
    };
    expect(physicalAttackState(warrior, true)).toBe("critical_attack");
    expect(physicalAttackState(warrior, false)).toBe("physical_attack");
    expect(
      physicalAttackState({ battleStates: { physical_attack: {} } }, true),
    ).toBe("physical_attack");
  });
  it("allows follow-through during hit feedback but waits to retreat until feedback finishes", async () => {
    const observed = [];
    const sprite = {
      battleStates: { physical_attack: { frames: Array(6) } },
      async playBattleState(state, { onCue, onFrame }) {
        await onCue();
        await onFrame({ index: 4 });
        await onFrame({ index: 5 });
        observed.push("home");
      },
    };
    const action = beginBattleAction(sprite, "physical_attack", {
      holdRecovery: true,
      onFrame: ({ index }) => observed.push(index),
    });
    await action.cue;
    action.followThrough();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(observed).toEqual([4]);
    action.resume();
    await action.finished;
    expect(observed).toEqual([4, 5, "home"]);
  });
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
