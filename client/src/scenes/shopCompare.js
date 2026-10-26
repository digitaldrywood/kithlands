import { computeEquipDelta, formatDeltaLabel } from "./equipPicker.js";

export const SHOP_COMPARE_COLORS = {
  upgrade: "#44ff44",
  downgrade: "#ff6666",
  equal: "#aaaaaa",
  locked: "#666666",
};

const DETAIL_SPECS = {
  weapon: [
    {
      key: "power",
      label: "Power",
      equippedKey: "weapon_power",
    },
    {
      key: "hit_pct",
      label: "Hit%",
      equippedKey: "weapon_hit_pct",
    },
    {
      key: "crit_pct",
      label: "Crit%",
      equippedKey: "weapon_crit_pct",
    },
  ],
  armor: [
    {
      key: "absorb",
      label: "Absorb",
      equippedKey: "armor_absorb",
    },
    {
      key: "magic_defense",
      label: "MagicDef",
      equippedKey: "armor_magic_defense",
    },
    {
      key: "evade_penalty",
      label: "Evade penalty",
      equippedKey: "armor_evade_penalty",
    },
  ],
};

const GENERIC_STAT_LABELS = {
  power: "Power",
  absorb: "Absorb",
  str: "Strength",
  agi: "Agility",
  int: "Intellect",
  vit: "Vitality",
  lck: "Luck",
  hit_pct: "Hit%",
  crit_pct: "Crit%",
  magic_defense: "MagicDef",
  evade_penalty: "Evade penalty",
};

function statSpecs(item) {
  const type = itemType(item);
  if (type !== "equipment") return DETAIL_SPECS[type] || [];
  return Object.keys(item?.stats || {}).map((key) => ({
    key,
    label: GENERIC_STAT_LABELS[key] || key,
  }));
}

function itemType(item) {
  if (item?.type === "weapon") return "weapon";
  if (item?.type === "equipment") return "equipment";
  return "armor";
}

export function isEquipmentShopItem(item) {
  return ["weapon", "armor", "equipment"].includes(item?.type);
}

export function allowedClassIds(item) {
  if (Array.isArray(item?.class_ids) && item.class_ids.length > 0) {
    return item.class_ids;
  }
  if (typeof item?.classes !== "string" || item.classes.trim() === "") {
    return [];
  }
  return item.classes
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function memberEquipmentStatus(item, member) {
  if (
    !isEquipmentShopItem(item) ||
    !member?.class_id ||
    !allowedClassIds(item).includes(member.class_id)
  ) {
    return {
      canEquip: false,
      label: "Class restricted",
      reason: `${member?.class_name || "This class"} cannot equip this ${itemType(item) === "weapon" ? "weapon" : itemType(item) === "armor" ? "armor" : "gear"}.`,
    };
  }
  const requiredLevel = item.required_level || 1;
  const level = member.level || 1;
  if (level < requiredLevel) {
    return {
      canEquip: false,
      label: `Requires Lv.${requiredLevel}`,
      reason: `Requires level ${requiredLevel}; ${member.name || "this character"} is level ${level}.`,
    };
  }
  return { canEquip: true, label: "Can equip", reason: "" };
}

export function canPartyMemberEquip(item, member) {
  return memberEquipmentStatus(item, member).canEquip;
}

export function indicatorForMember(item, member, equipped = {}) {
  if (!canPartyMemberEquip(item, member)) {
    return {
      state: "locked",
      symbol: "-",
      color: SHOP_COMPARE_COLORS.locked,
      delta: null,
    };
  }

  const delta =
    item.type === "equipment"
      ? genericItemScore(item) -
        genericItemScore(currentGenericItem(item, equipped))
      : computeEquipDelta(item, equipped, item.type);
  if (delta > 0) {
    return {
      state: "upgrade",
      symbol: "▲",
      color: SHOP_COMPARE_COLORS.upgrade,
      delta,
    };
  }
  if (delta < 0) {
    return {
      state: "downgrade",
      symbol: "▼",
      color: SHOP_COMPARE_COLORS.downgrade,
      delta,
    };
  }
  return {
    state: "equal",
    symbol: "=",
    color: SHOP_COMPARE_COLORS.equal,
    delta,
  };
}

export function buildMemberIndicators(item, party = [], equipment = []) {
  return (party || []).slice(0, 4).map((member, slot) => ({
    slot,
    name: member?.name || `Member ${slot + 1}`,
    ...indicatorForMember(item, member, equipment?.[slot] || {}),
  }));
}

export function cycleMemberIndex(currentIndex, memberCount, direction = 1) {
  if (!Number.isFinite(memberCount) || memberCount <= 0) return 0;
  const offset = direction >= 0 ? 1 : -1;
  return (currentIndex + offset + memberCount) % memberCount;
}

export function buildItemStatBlock(item) {
  const stats = [];
  const type = itemType(item);
  if (type === "weapon") {
    stats.push({ label: "Power", value: `${item?.power ?? 0}` });
    stats.push({ label: "Absorb", value: "0" });
    stats.push({ label: "Hit%", value: `${item?.hit_pct ?? 0}` });
    stats.push({ label: "Crit%", value: `${item?.crit_pct ?? 0}` });
    stats.push({ label: "MagicDef", value: "0" });
  } else if (type === "armor") {
    stats.push({ label: "Power", value: "0" });
    stats.push({ label: "Absorb", value: `${item?.absorb ?? 0}` });
    stats.push({ label: "Hit%", value: "0" });
    stats.push({ label: "Crit%", value: "0" });
    stats.push({ label: "MagicDef", value: `${item?.magic_defense ?? 0}` });
  } else {
    for (const spec of statSpecs(item)) {
      stats.push({
        label: spec.label,
        value: `${item?.stats?.[spec.key] ?? 0}`,
      });
    }
  }
  stats.push({ label: "Element", value: item?.element || "none" });
  stats.push({
    label: "Classes",
    value: allowedClassIds(item).join(", ") || "-",
  });
  return stats;
}

export function buildFocusedMemberCompare(item, member, equipped = {}) {
  const type = itemType(item);
  const canEquip = canPartyMemberEquip(item, member);
  const genericCurrent =
    type === "equipment" ? currentGenericItem(item, equipped) : null;
  const currentName =
    type === "weapon"
      ? equipped?.weapon_name || "None"
      : type === "armor"
        ? equipped?.armor_name || "None"
        : genericCurrent?.name || "None";
  const currentElement =
    type === "weapon"
      ? equipped?.weapon_element || "none"
      : type === "armor"
        ? equipped?.armor_element || "none"
        : "none";

  return {
    canEquip,
    currentName,
    nextName: item?.name || "",
    currentElement,
    nextElement: item?.element || "none",
    lines: statSpecs(item).map((spec) => {
      const currentValue =
        type === "equipment"
          ? (genericCurrent?.stats?.[spec.key] ?? 0)
          : (equipped?.[spec.equippedKey] ?? 0);
      const nextValue =
        type === "equipment"
          ? (item?.stats?.[spec.key] ?? 0)
          : (item?.[spec.key] ?? 0);
      const delta = nextValue - currentValue;
      const deltaLabel =
        type === "equipment"
          ? {
              text: `${delta > 0 ? "+" : ""}${delta}`,
              color:
                delta === 0
                  ? SHOP_COMPARE_COLORS.equal
                  : spec.key === "evade_penalty"
                    ? delta < 0
                      ? SHOP_COMPARE_COLORS.upgrade
                      : SHOP_COMPARE_COLORS.downgrade
                    : delta > 0
                      ? SHOP_COMPARE_COLORS.upgrade
                      : SHOP_COMPARE_COLORS.downgrade,
            }
          : formatDeltaLabel(delta, type, spec.key);
      return {
        key: spec.key,
        label: spec.label,
        currentValue,
        nextValue,
        delta,
        deltaText: deltaLabel.text,
        color: canEquip ? deltaLabel.color : SHOP_COMPARE_COLORS.locked,
      };
    }),
  };
}

function currentGenericItem(item, equipped = {}) {
  return (
    (equipped?.loadout || []).find(
      (slot) => slot?.item?.category === item?.category,
    )?.item || null
  );
}

function genericItemScore(item) {
  return Object.entries(item?.stats || {}).reduce(
    (total, [key, value]) =>
      total +
      (key === "evade_penalty" ? -Number(value || 0) : Number(value || 0)),
    0,
  );
}

export function buyForMemberLabel(member) {
  return `Buy for ${member?.name || "member"}`;
}
