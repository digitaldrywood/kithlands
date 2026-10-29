import { beforeAll, describe, expect, it, vi } from "vitest";
import { playSFX } from "../systems/audio.js";
vi.mock("../systems/audio.js", () => ({
  playSFX: vi.fn(),
  initAudio: vi.fn(),
  playMusic: vi.fn(),
  stopMusic: vi.fn(),
}));
vi.mock("../ui/floating_text.js", () => ({ FloatingTextPool: class {} }));
let BattleScene;
beforeAll(async () => {
  vi.stubGlobal("Phaser", { Scene: class {} });
  ({ BattleScene } = await import("./battle.js"));
});

describe("authoritative counter playback", () => {
  it("keeps all counter hits, crits and misses separate and drains only landed damage", async () => {
    const scene = new BattleScene();
    const actor = { name: "Counter", sprite: {} },
      target = {
        name: "Golem",
        sprite: {},
        x: 120,
        y: 220,
        hpBar: { currentHP: 100, maxHP: 100 },
      };
    scene.partySprites = { Counter: actor };
    scene.enemySprites = { 100: target };
    scene.isDefeatedEnemyActor = () => false;
    scene.findEnemySpriteForAction = () => null;
    scene.findPartySpriteForTarget = () => null;
    scene.showActionFocus = vi.fn();
    scene.revealLine = vi.fn();
    scene.showActionTitle = vi.fn().mockResolvedValue(undefined);
    scene.playMajorCinematicPrelude = vi.fn().mockResolvedValue(undefined);
    scene.lungePartySprite = vi.fn().mockResolvedValue(undefined);
    scene.wait = vi.fn().mockResolvedValue(undefined);
    scene.waitForCombatRead = vi.fn().mockResolvedValue(undefined);
    scene.hitFx = vi.fn().mockResolvedValue(undefined);
    scene.playEnemyHitReaction = vi.fn();
    scene.animateHPBar = vi.fn((bar, hp) => {
      bar.currentHP = hp;
    });
    scene.resetPartySprite = vi.fn().mockResolvedValue(undefined);
    const hits = [
      { damage: 12, crit: true },
      { damage: 0, missed: true },
      { damage: 8 },
    ];
    await scene.animateCombatLog(
      ["Counter counter-attacks Golem[100] for 20 damage"],
      [
        {
          kind: "counter",
          actor_name: "Counter",
          target_id: 100,
          damage: 20,
          hits,
        },
      ],
    );
    expect(
      scene.hitFx.mock.calls.map((args) => ({
        damage: args[2],
        crit: args[6].crit,
        missed: args[6].missed,
      })),
    ).toEqual(
      hits.map((hit) => ({
        damage: hit.damage,
        crit: !!hit.crit,
        missed: !!hit.missed,
      })),
    );
    expect(
      playSFX.mock.calls.filter(([name]) => name === "sfx_hit"),
    ).toHaveLength(2);
    expect(scene.lungePartySprite).toHaveBeenCalledTimes(3);
    expect(scene.resetPartySprite).toHaveBeenCalledTimes(3);
    expect(scene.animateHPBar.mock.calls.map((args) => args[1])).toEqual([
      88, 80,
    ]);
    expect(scene.showActionTitle).toHaveBeenCalledWith(
      actor,
      "COUNTER",
      "#ffcc66",
    );
    expect(scene.revealLine).toHaveBeenCalledWith(
      "Counter counters Golem: strike 1/3",
      "#ff8844",
    );
    expect(scene.revealLine).toHaveBeenCalledWith(
      "Counter counters Golem: strike 3/3",
      "#ffcc66",
    );
    const thirdCaption = scene.revealLine.mock.calls.findIndex(([text]) =>
      text.includes("strike 3/3"),
    );
    expect(
      scene.revealLine.mock.invocationCallOrder[thirdCaption],
    ).toBeLessThan(scene.lungePartySprite.mock.invocationCallOrder[2]);
    expect(scene.revealLine).toHaveBeenCalledWith(
      "Counter: 20 damage (3 strikes).",
      "#ffcc66",
    );
  });
});
