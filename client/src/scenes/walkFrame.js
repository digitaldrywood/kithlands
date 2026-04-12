export const WALK_FRAME_COUNT = 4;
export const WALK_DIRS = ["down", "up", "left", "right"];
export const WALK_DIR_INDEX = { down: 0, up: 1, left: 2, right: 3 };

export function nextWalkFrame(prevFrame) {
  return (prevFrame + 1) % WALK_FRAME_COUNT;
}

export function walkSheetKey(classId) {
  return `${classId}_walk`;
}

export function walkFrameIndex(dir, frame) {
  return WALK_DIR_INDEX[dir] * WALK_FRAME_COUNT + frame;
}
