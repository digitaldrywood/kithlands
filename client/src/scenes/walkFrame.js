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

/**
 * Return the next alive party-member index, skipping dead (hp <= 0) members.
 * Wraps around to the beginning. Returns currentIndex unchanged when the party
 * has zero or one alive member.
 */
export function nextLeaderIndex(party, currentIndex) {
  if (!party || party.length <= 1) return 0;
  let next = (currentIndex + 1) % party.length;
  const start = next;
  do {
    if (party[next].hp > 0) return next;
    next = (next + 1) % party.length;
  } while (next !== start);
  return currentIndex;
}
