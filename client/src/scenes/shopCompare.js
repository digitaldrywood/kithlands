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
      label: "Evade",
      equippedKey: "armor_evade_penalty",
    },
  ],
};

function statSpecs(type) {
  return DETAIL_SPECS[type] || [];
}

function itemType(item) {
  return item?.type === "weapon" ? "weapon" : "armor";
}

export function isEquipmentShopItem(item) {
  return item?.type === "weapon" || item?.type === "armor";
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

export function canPartyMemberEquip(item, member) {
  if (!isEquipmentShopItem(item) || !member?.class_id) return false;
  return allowedClassIds(item).includes(member.class_id);
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

  const delta = computeEquipDelta(item, equipped, item.type);
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
  } else {
    stats.push({ label: "Power", value: "0" });
    stats.push({ label: "Absorb", value: `${item?.absorb ?? 0}` });
    stats.push({ label: "Hit%", value: "0" });
    stats.push({ label: "Crit%", value: "0" });
    stats.push({ label: "MagicDef", value: `${item?.magic_defense ?? 0}` });
  }
  stats.push({ label: "Element", value: item?.element || "none" });
  stats.push({
    label: "Wielders",
    value: allowedClassIds(item).join(", ") || "-",
  });
  return stats;
}

export function buildFocusedMemberCompare(item, member, equipped = {}) {
  const type = itemType(item);
  const canEquip = canPartyMemberEquip(item, member);
  const currentName =
    type === "weapon"
      ? equipped?.weapon_name || "None"
      : equipped?.armor_name || "None";
  const currentElement =
    type === "weapon"
      ? equipped?.weapon_element || "none"
      : equipped?.armor_element || "none";

  return {
    canEquip,
    currentName,
    nextName: item?.name || "",
    currentElement,
    nextElement: item?.element || "none",
    lines: statSpecs(type).map((spec) => {
      const delta = computeEquipDelta(item, equipped, type, spec.key);
      const deltaLabel = formatDeltaLabel(delta, type, spec.key);
      return {
        key: spec.key,
        label: spec.label,
        currentValue: equipped?.[spec.equippedKey] ?? 0,
        nextValue: item?.[spec.key] ?? 0,
        delta,
        deltaText: deltaLabel.text,
        color: canEquip ? deltaLabel.color : SHOP_COMPARE_COLORS.locked,
      };
    }),
  };
}

export function buyForMemberLabel(member) {
  return `Buy for ${member?.name || "member"}`;
}
