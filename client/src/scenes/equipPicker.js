// Pure helpers for the equip picker. Kept free of Phaser imports so
// they can be unit-tested in isolation (see equipPicker.test.js and
// issue #96).

const DELTA_COLOR_POSITIVE = "#44ff44";
const DELTA_COLOR_NEGATIVE = "#ff6666";
const DELTA_COLOR_NEUTRAL = "#888888";

export function filterEquippableItems(items, type) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const prefix = type === "weapon" ? "wpn_" : "arm_";
  const out = [];
  for (const item of items) {
    if (!item || typeof item.id !== "string") continue;
    if (!item.id.startsWith(prefix)) continue;
    out.push({ ...item, id: item.id.slice(prefix.length) });
  }
  return out;
}

export function computeEquipDelta(item, equipped, type) {
  const eq = equipped || {};
  if (type === "weapon") {
    return (item?.power ?? 0) - (eq.weapon_power ?? 0);
  }
  return (item?.absorb ?? 0) - (eq.armor_absorb ?? 0);
}

export function formatDeltaLabel(delta, type) {
  const label = type === "weapon" ? "Pow" : "Abs";
  let text;
  let color;
  if (delta > 0) {
    text = `${label} +${delta}`;
    color = DELTA_COLOR_POSITIVE;
  } else if (delta < 0) {
    text = `${label} ${delta}`;
    color = DELTA_COLOR_NEGATIVE;
  } else {
    text = `${label} 0`;
    color = DELTA_COLOR_NEUTRAL;
  }
  return { text, color };
}
