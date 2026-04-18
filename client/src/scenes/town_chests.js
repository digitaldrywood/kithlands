export function chestFlagKey(nodeId, chestId) {
  return `chest_open:${nodeId}:${chestId}`;
}

export function isChestOpen(triggeredFlags, nodeId, chestId) {
  return !!triggeredFlags?.[chestFlagKey(nodeId, chestId)];
}
