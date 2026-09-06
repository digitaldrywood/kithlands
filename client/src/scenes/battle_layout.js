import { monsterBattleSize } from "../data/monsterSprites.js";

const PARTY_LAYOUT = {
  desktop: { frontX: 548, backX: 630, slotStartY: 110, slotGapY: 88 },
  mobile: { frontX: 552, backX: 628, slotStartY: 88, slotGapY: 140 },
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

export function buildEnemyBattleLayout(enemies = [], bounds = {}) {
  const area = { x: 24, y: 84, width: 430, height: 320, ...bounds };
  const count = Math.max(1, enemies.length);
  const columns = Math.min(3, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const cellWidth = area.width / columns;
  const cellHeight = area.height / rows;

  return enemies.map((enemy, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const lane = {
      x: area.x + column * cellWidth,
      y: area.y + row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
    return {
      lane,
      x: lane.x + lane.width / 2,
      y: lane.y + lane.height * 0.56,
      nameY: lane.y + 8,
      numberY: lane.y + lane.height - 10,
      spriteSize: Math.min(
        monsterBattleSize(enemy),
        cellWidth - 24,
        cellHeight - 56,
      ),
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
