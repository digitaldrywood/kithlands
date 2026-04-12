import { describe, it, expect } from "vitest";
import { debugPanelButtons } from "./debug_panel.js";

// The panel catalog is intentionally static — every button is a named
// feature trigger. These tests pin the set so future edits can't silently
// drop a trigger the feature-trigger harness (issue #145) relies on.

describe("debugPanelButtons", () => {
  it("exposes the full catalog of feature triggers", () => {
    const catalog = debugPanelButtons("game-xyz");
    const labels = catalog.map((b) => b.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        "Force ambush (next combat)",
        "Force preemptive",
        "Force normal opening",
        "Force encounter: slime L1",
        "Heal party",
        "Give 5x Potion",
        "Give Phoenix Down",
        "Warp to next quest",
      ]),
    );
  });

  it("returns callable run() for every entry", () => {
    for (const btn of debugPanelButtons("game-xyz")) {
      expect(typeof btn.run).toBe("function");
    }
  });

  it("includes the ambush trigger that reproduces c9be154", () => {
    const ambush = debugPanelButtons("gid").find(
      (b) => b.label === "Force ambush (next combat)",
    );
    expect(ambush).toBeDefined();
    // Catalog is pure JSON-level — we do not actually invoke run() in
    // the unit test because it would hit the network. The fact that the
    // label exists is the regression pin: if a refactor drops the
    // button, the c9be154 repro path goes missing.
  });
});
