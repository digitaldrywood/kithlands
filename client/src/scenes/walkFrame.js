export const WALK_FRAME_COUNT = 4;

export function nextWalkFrame(prevFrame) {
  return (prevFrame + 1) % WALK_FRAME_COUNT;
}

export function walkTextureKey(dir, frame) {
  return `walk_${dir}_${frame}`;
}
