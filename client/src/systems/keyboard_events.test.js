import { describe, expect, it, vi } from "vitest";
import { oncePerKeyEvent } from "./keyboard_events.js";

describe("oncePerKeyEvent", () => {
  it("ignores replayed events even after interleaved key deliveries", () => {
    const handler = vi.fn();
    const deliver = oncePerKeyEvent(handler);
    const up = { key: "ArrowUp" };
    const down = { key: "ArrowDown" };
    deliver(up);
    deliver(down);
    deliver(up);
    deliver(down);
    expect(handler.mock.calls).toEqual([[up], [down]]);
  });

  it("preserves distinct presses, native repeats, callback context and arguments", () => {
    const context = {};
    const handler = vi.fn(function (event, value) {
      expect(this).toBe(context);
      return value;
    });
    const deliver = oncePerKeyEvent(handler);
    expect(deliver.call(context, { key: "Enter" }, 1)).toBe(1);
    expect(deliver.call(context, { key: "Enter" }, 2)).toBe(2);
    expect(deliver.call(context, { key: "Enter", repeat: true }, 3)).toBe(3);
    expect(handler).toHaveBeenCalledTimes(3);
  });
});
