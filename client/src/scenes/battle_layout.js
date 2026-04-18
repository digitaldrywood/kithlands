const PARTY_LAYOUT = {
  frontX: 520,
  backX: 556,
  spriteOffsetX: 15,
  arrowOffsetX: -18,
  slotStartY: 142,
  slotGapY: 74,
  frontYOffset: 22,
  backYOffset: -12,
  slotJitterY: [-4, 2, 0, -2],
  floatingTextLift: 12,
};

function normalizedRowValue(value) {
  const row = String(value || "")
    .trim()
    .toLowerCase();
  return row === "front" || row === "back" ? row : "";
}

export function inferPartyRow(member = {}) {
  const explicitRow =
    normalizedRowValue(member.row) ||
    normalizedRowValue(member.battle_row) ||
    normalizedRowValue(member.formation_row);
  if (explicitRow) {
    return explicitRow;
  }

  const maxHP = Math.max(0, Number(member.max_hp) || 0);
  const maxMP = Math.max(0, Number(member.max_mp) || 0);
  if (maxHP > 0 && maxMP / maxHP >= 0.25) {
    return "back";
  }
  return "front";
}

export function buildPartyBattleLayout(party = []) {
  return party.map((member, slot) => {
    const row = inferPartyRow(member);
    const jitter =
      PARTY_LAYOUT.slotJitterY[slot % PARTY_LAYOUT.slotJitterY.length] || 0;
    const baseY = PARTY_LAYOUT.slotStartY + slot * PARTY_LAYOUT.slotGapY;
    const yOffset =
      row === "front" ? PARTY_LAYOUT.frontYOffset : PARTY_LAYOUT.backYOffset;
    const y = baseY + yOffset + jitter;
    const x = row === "front" ? PARTY_LAYOUT.frontX : PARTY_LAYOUT.backX;

    return {
      slot,
      row,
      x,
      y,
      spriteX: x + PARTY_LAYOUT.spriteOffsetX,
      spriteY: y,
      arrowX: x + PARTY_LAYOUT.arrowOffsetX,
      arrowY: y,
    };
  });
}

export function floatingTextAnchorForEntry(entry, fallback = {}) {
  const sprite = entry?.sprite || entry || null;
  const x = entry?.x ?? sprite?.x ?? fallback.x ?? null;
  const y = entry?.y ?? sprite?.y ?? fallback.y ?? null;
  const height = Math.max(
    42,
    Number(
      sprite?.displayHeight ?? sprite?.height ?? entry?.displayHeight ?? 56,
    ) || 56,
  );

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return {
      x: fallback.x ?? null,
      y: fallback.y ?? null,
    };
  }

  return {
    x,
    y: y - height / 2 - PARTY_LAYOUT.floatingTextLift,
  };
}
