// Pure helpers for the equip picker. Kept free of Phaser imports so
// they can be unit-tested in isolation (see equipPicker.test.js and
// issue #96).

const DELTA_COLOR_POSITIVE = "#44ff44";
const DELTA_COLOR_NEGATIVE = "#ff6666";
const DELTA_COLOR_NEUTRAL = "#888888";

const DELTA_FIELD_MAP = {
  weapon: {
    defaultStat: "power",
    stats: {
      power: { itemKey: "power", equippedKey: "weapon_power", label: "Pow" },
      hit_pct: {
        itemKey: "hit_pct",
        equippedKey: "weapon_hit_pct",
        label: "Hit%",
      },
      crit_pct: {
        itemKey: "crit_pct",
        equippedKey: "weapon_crit_pct",
        label: "Crit%",
      },
    },
  },
  armor: {
    defaultStat: "absorb",
    stats: {
      absorb: { itemKey: "absorb", equippedKey: "armor_absorb", label: "Abs" },
      magic_defense: {
        itemKey: "magic_defense",
        equippedKey: "armor_magic_defense",
        label: "MDef",
      },
      evade_penalty: {
        itemKey: "evade_penalty",
        equippedKey: "armor_evade_penalty",
        label: "Eva",
      },
    },
  },
  shield: {
    defaultStat: "absorb",
    stats: {
      absorb: { itemKey: "absorb", equippedKey: "shield_absorb", label: "Abs" },
    },
  },
  helmet: {
    defaultStat: "absorb",
    stats: {
      absorb: { itemKey: "absorb", equippedKey: "helmet_absorb", label: "Abs" },
    },
  },
};

function deltaSpec(type, statKey) {
  const typeSpec = DELTA_FIELD_MAP[type] || DELTA_FIELD_MAP.armor;
  const key = statKey || typeSpec.defaultStat;
  return typeSpec.stats[key] || typeSpec.stats[typeSpec.defaultStat];
}

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

export function computeEquipDelta(item, equipped, type, statKey) {
  const eq = equipped || {};
  const spec = deltaSpec(type, statKey);
  return (item?.[spec.itemKey] ?? 0) - (eq?.[spec.equippedKey] ?? 0);
}

export function formatDeltaLabel(delta, type, statKey) {
  const label = deltaSpec(type, statKey).label;
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
