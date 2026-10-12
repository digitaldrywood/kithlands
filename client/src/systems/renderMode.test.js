import { expect, it, vi } from "vitest";
import { useCanvasRenderer } from "./renderMode.js";
it.each([
  ["ANGLE SwiftShader Device", true],
  ["llvmpipe LLVM", true],
  ["Apple M2 Pro", false],
  ["NVIDIA RTX", false],
])("chooses the renderer for %s", (renderer, canvas) => {
  const loseContext = vi.fn();
  const gl = {
    getExtension: (key) =>
      key === "WEBGL_debug_renderer_info"
        ? { UNMASKED_RENDERER_WEBGL: 1 }
        : { loseContext },
    getParameter: () => renderer,
  };
  expect(
    useCanvasRenderer({ createElement: () => ({ getContext: () => gl }) }),
  ).toBe(canvas);
  expect(loseContext).toHaveBeenCalledOnce();
});
it("uses Canvas when WebGL is unavailable", () =>
  expect(
    useCanvasRenderer({ createElement: () => ({ getContext: () => null }) }),
  ).toBe(true));
