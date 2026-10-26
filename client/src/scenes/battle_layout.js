import { monsterBattleSize } from "../data/monsterSprites.js";

const PARTY_LAYOUT = {
  desktop: { frontX: 550, backX: 680, slotStartY: 244, slotGapY: 54 },
  mobile: { frontX: 550, backX: 680, slotStartY: 378, slotGapY: 54 },
  arrowOffsetX: -42,
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

export function buildPartyBattleLayout(party = [], { compact = false } = {}) {
  const config = compact ? PARTY_LAYOUT.mobile : PARTY_LAYOUT.desktop;
  return party.map((member, slot) => {
    const row = inferPartyRow(member);
    const y = config.slotStartY + slot * config.slotGapY;
    const x = row === "front" ? config.frontX : config.backX;

    return {
      slot,
      row,
      x,
      y,
      spriteX: x,
      spriteY: y,
      arrowX: x + PARTY_LAYOUT.arrowOffsetX,
      arrowY: y,
      lane: {
        x: 500,
        y: y - config.slotGapY / 2,
        width: 292,
        height: config.slotGapY,
      },
    };
  });
}

export function buildEnemyBattleLayout(
  enemies = [],
  bounds = {},
  formation = enemies,
) {
  const area = { x: 24, y: 84, width: 430, height: 320, ...bounds };
  const count = Math.max(1, formation.length);
  const columns = Math.min(3, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const cellWidth = area.width / columns;
  const cellHeight = area.height / rows;

  return enemies.map((enemy, index) => {
    const originalIndex =
      formation === enemies
        ? index
        : formation.findIndex((entry) => entry.id === enemy.id);
    const slot = originalIndex < 0 ? index : originalIndex;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const lane = {
      x: area.x + column * cellWidth,
      y: area.y + row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
    const spriteSize = Math.min(
      monsterBattleSize(enemy),
      cellWidth - 24,
      cellHeight - 56,
    );
    const groundTop = bounds.groundTop ?? 205;
    const groundBottom = bounds.groundBottom ?? 414;
    const feetY =
      groundTop + ((row + 0.75) / rows) * (groundBottom - groundTop);
    return {
      lane,
      x: lane.x + lane.width / 2,
      y: feetY - spriteSize / 2,
      nameY: feetY - spriteSize - 14,
      numberY: lane.y + lane.height - 10,
      spriteSize,
      feetY,
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

  const top = y - (sprite?.feetAnchored ? height : height / 2);
  const nameTop = entry?.nameText?.getBounds?.().top;
  return {
    x,
    y: top - PARTY_LAYOUT.floatingTextLift,
    maxBottom: Math.min(top, nameTop ?? top) - (fallback.gap ?? 10),
  };
}
