import { describe, expect, it, vi } from "vitest";

import {
  partyStatusRowLayout,
  reconcilePartyMana,
} from "./battle_party_status.js";
import { battleHudLayout } from "../scenes/battle_hud_layout.js";

describe("partyStatusRowLayout", () => {
  it("gives each desktop member a dedicated full-width row", () => {
    const rows = partyStatusRowLayout(
      { x: 504, y: 440, width: 288, height: 152 },
      4,
      false,
    );
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.x))).toHaveLength(1);
    expect(rows[1].y).toBeGreaterThan(rows[0].y + rows[0].height);
  });

  it("uses two readable columns in the portrait mobile layout", () => {
    const rows = partyStatusRowLayout(
      battleHudLayout({ viewportWidth: 390, viewportHeight: 844 }).party,
      4,
      true,
    );
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.height >= 140)).toBe(true);
    expect(rows[1].x).toBeGreaterThan(rows[0].x + rows[0].width);
    expect(rows[2].y).toBeGreaterThan(rows[0].y + rows[0].height);
  });
});

describe("reconcilePartyMana", () => {
  const meter = () => ({
    width: 120,
    currentHP: 10,
    maxHP: 10,
    fill: { height: 6, setSize: vi.fn(), setFillStyle: vi.fn() },
    ghost: { height: 6, setSize: vi.fn() },
    label: { setText: vi.fn() },
  });
  it("reconciles spent MP from the result, retaining blue and cancelling stale meter tweens", () => {
    const mpBar = meter(),
      hpBar = { currentHP: 25 };
    const scene = { tweens: { killTweensOf: vi.fn() } };
    reconcilePartyMana(scene, { Sparks: { mpBar, hpBar } }, [
      { name: "Sparks", mp: 8, max_mp: 10 },
    ]);
    expect(mpBar.currentHP).toBe(8);
    expect(mpBar.maxHP).toBe(10);
    expect(mpBar.label.setText).toHaveBeenCalledWith("8/10");
    expect(mpBar.fill.setSize).toHaveBeenCalledWith(96, 6);
    expect(mpBar.ghost.setSize).toHaveBeenCalledWith(96, 6);
    expect(mpBar.fill.setFillStyle).toHaveBeenCalledWith(0x8faee9);
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith([
      mpBar.fill,
      mpBar.ghost,
    ]);
    expect(hpBar.currentHP).toBe(25);
  });
  it("shows restored MP and truly empty MP without a stale ghost or health coloring", () => {
    const restored = meter(),
      empty = meter();
    restored.currentHP = 2;
    reconcilePartyMana(
      {},
      { Willow: { mpBar: restored }, Sparks: { mpBar: empty } },
      [
        { name: "Willow", mp: 9, max_mp: 10 },
        { name: "Sparks", mp: 0, max_mp: 10 },
        { name: "Missing", mp: 3, max_mp: 10 },
      ],
    );
    expect(restored.label.setText).toHaveBeenCalledWith("9/10");
    expect(restored.fill.setSize).toHaveBeenCalledWith(108, 6);
    expect(restored.fill.setFillStyle).toHaveBeenCalledWith(0x8faee9);
    expect(empty.label.setText).toHaveBeenCalledWith("0/10");
    expect(empty.fill.setSize).toHaveBeenCalledWith(0, 6);
    expect(empty.ghost.setSize).toHaveBeenCalledWith(0, 6);
    expect(empty.fill.setFillStyle).toHaveBeenCalledWith(0x384859);
  });
});
