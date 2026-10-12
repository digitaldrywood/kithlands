// Software WebGL rasterizers are much slower than Canvas for this sprite game.
// Retain hardware WebGL (including its optional equipment glow) when available.
export function useCanvasRenderer(documentRef = document) {
  const canvas = documentRef.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return true;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "";
  const software = /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(
    renderer,
  );
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return software;
}
