import { describe, expect, it } from "vitest";
import {
  encounterChanceForStep,
  encounterRateMultiplierForTile,
} from "./worldEncounter.js";

describe("encounterRateMultiplierForTile", () => {
  it("uses reduced rates for safer open tiles", () => {
    expect(encounterRateMultiplierForTile(1)).toBe(0.1);
    expect(encounterRateMultiplierForTile(0)).toBe(0.5);
    expect(encounterRateMultiplierForTile(12)).toBe(0.7);
  });

  it("uses higher rates for dangerous terrain", () => {
    expect(encounterRateMultiplierForTile(9)).toBe(1.0);
    expect(encounterRateMultiplierForTile(10)).toBe(1.5);
    expect(encounterRateMultiplierForTile(11)).toBe(1.2);
  });

  it("returns 0 for safe or indoor tiles", () => {
    expect(encounterRateMultiplierForTile(2)).toBe(0);
    expect(encounterRateMultiplierForTile(4)).toBe(0);
    expect(encounterRateMultiplierForTile(5)).toBe(0);
    expect(encounterRateMultiplierForTile(6)).toBe(0);
  });
});

describe("encounterChanceForStep", () => {
  it("stays at 0 until the opening grace period ends", () => {
    expect(
      encounterChanceForStep({ tile: 9, stepCount: 6, transportMult: 1 }),
    ).toBe(0);
  });

  it("scales the base step chance by terrain and transport", () => {
    expect(
      encounterChanceForStep({ tile: 1, stepCount: 7, transportMult: 1 }),
    ).toBe(3.1);
    expect(
      encounterChanceForStep({ tile: 9, stepCount: 7, transportMult: 0.25 }),
    ).toBe(7.75);
  });

  it("returns 0 for tiles that should never trigger encounters", () => {
    expect(
      encounterChanceForStep({ tile: 2, stepCount: 20, transportMult: 1 }),
    ).toBe(0);
    expect(
      encounterChanceForStep({ tile: 9, stepCount: 20, transportMult: 0 }),
    ).toBe(0);
  });
});
