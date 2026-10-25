import { roundedRectangle } from "./theme.js";
import {
  formatHPLabel,
  combatantConditionLabel,
  hpBarColorPct,
  hpBarFillWidth,
} from "../systems/hpBar.js";
import { drawPanel } from "./panel.js";

const FONT = "Arial, sans-serif";

function meterColor(current, maximum, kind) {
  if (kind === "mp") return current > 0 ? 0x8faee9 : 0x384859;
  const pct = hpBarColorPct(current, maximum);
  return pct > 0.5 ? 0x8ac7aa : pct > 0.25 ? 0xffb84d : 0xff5f5f;
}

export function partyStatusRowLayout(rect, count, compact = false) {
  const columns = compact ? 2 : 1;
  const rows = Math.ceil(Math.max(1, count) / columns);
  const gap = compact ? 18 : 2;
  const content = {
    x: rect.x + 8,
    y: rect.y + (compact ? 58 : 25),
    width: rect.width - 16,
    height: rect.height - (compact ? 74 : 33),
  };
  const width = (content.width - gap * (columns - 1)) / columns;
  const height = (content.height - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: content.x + (index % columns) * (width + gap),
    y: content.y + Math.floor(index / columns) * (height + gap),
    width,
    height,
  }));
}

function addMeter(scene, row, y, label, current, maximum, compact) {
  const dense = compact && row.height < 210;
  const labelX = row.x + (compact ? 16 : 80);
  const numberX = row.x + (compact ? 72 : 100);
  const barX = row.x + (compact ? 16 : 151);
  const barY = compact ? y + (dense ? 36 : 40) : y + 5;
  const barWidth = Math.max(54, row.width - (compact ? 32 : 163));
  const fontSize = compact ? "24px" : "8px";
  const meterHeight = compact ? (dense ? 12 : 18) : 6;
  const bg = roundedRectangle(
    scene,
    barX,
    barY,
    barWidth,
    meterHeight,
    0x1c2736,
  )
    .setOrigin(0, 0.5)
    .setDepth(18);
  const fillWidth = hpBarFillWidth(current, maximum, barWidth);
  const ghost = roundedRectangle(
    scene,
    barX,
    barY,
    fillWidth,
    meterHeight,
    0xff765f,
  )
    .setOrigin(0, 0.5)
    .setDepth(19);
  const fill = roundedRectangle(
    scene,
    barX,
    barY,
    fillWidth,
    meterHeight,
    meterColor(current, maximum, label.toLowerCase()),
  )
    .setOrigin(0, 0.5)
    .setDepth(20);
  const prefix = scene.add
    .text(labelX, y, label, {
      fontSize,
      color: label === "HP" ? "#b9ffd0" : "#b8d1ff",
      fontFamily: FONT,
      fontStyle: "bold",
    })
    .setDepth(20);
  const value = scene.add
    .text(numberX, y, formatHPLabel(current, maximum), {
      fontSize,
      color: "#e9eef7",
      fontFamily: FONT,
    })
    .setDepth(20);
  return {
    objects: [bg, ghost, fill, prefix, value],
    data: {
      bg,
      ghost,
      fill,
      label: value,
      width: barWidth,
      currentHP: Math.max(0, current | 0),
      maxHP: Math.max(0, maximum | 0),
    },
  };
}

export function drawBattlePartyStatus(
  scene,
  rect,
  party,
  { compact = false } = {},
) {
  const panel = drawPanel(
    scene,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    rect.width,
    rect.height,
    { variant: "ff6", radius: 8, innerInset: 5, depth: 16 },
  );
  panel.bg._combatFxTag = "party-status-panel";
  const objects = [panel.bg];
  objects.push(
    scene.add
      .text(rect.x + 12, rect.y + 8, "PARTY STATUS", {
        fontSize: compact ? "28px" : "11px",
        color: "#dcecff",
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setDepth(20),
  );

  const rows = partyStatusRowLayout(rect, party.length, compact).map(
    (bounds, slot) => {
      const member = party[slot];
      const alive = member.hp > 0;
      const card = roundedRectangle(
        scene,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        alive ? 0x151e2b : 0x151e2b,
        0.98,
      )
        .setOrigin(0, 0)
        .setStrokeStyle(1, alive ? 0x384859 : 0x5a5a66)
        .setDepth(17);
      card._combatFxTag = "party-status-row";
      card._partySlot = slot;
      const name = scene.add
        .text(
          bounds.x + (compact ? 16 : 8),
          bounds.y + (compact ? 14 : 4),
          member.name,
          {
            fontSize: compact ? "28px" : "10px",
            color: alive ? "#e9eef7" : "#9a9aa3",
            fontFamily: FONT,
            fontStyle: "bold",
          },
        )
        .setDepth(20);
      const conditionValue = combatantConditionLabel(
        member.hp,
        member.max_hp,
        member.status,
      );
      const statusValue = conditionValue || "OK";
      const status = scene.add
        .text(
          compact ? bounds.x + bounds.width - 16 : bounds.x + 8,
          bounds.y + (compact ? 20 : 16),
          statusValue,
          {
            fontSize: compact ? "20px" : "7px",
            color: statusValue === "OK" ? "#a7b7cb" : "#ffd36b",
            fontFamily: FONT,
            fontStyle: statusValue === "OK" ? "" : "bold",
          },
        )
        .setOrigin(compact ? 1 : 0, 0)
        .setDepth(20);
      status._combatFxTag = "party-status-condition";
      status._partySlot = slot;
      const hp = addMeter(
        scene,
        bounds,
        bounds.y + (compact ? (bounds.height < 210 ? 48 : 70) : 3),
        "HP",
        member.hp,
        member.max_hp,
        compact,
      );
      const mp = addMeter(
        scene,
        bounds,
        bounds.y + (compact ? (bounds.height < 210 ? 96 : 146) : 15),
        "MP",
        member.mp || 0,
        member.max_mp || 0,
        compact,
      );
      hp.data.conditionLabel = status;
      hp.data.status = member.status || "";
      objects.push(card, name, status, ...hp.objects, ...mp.objects);
      return { bounds, card, name, status, hpBar: hp.data, mpBar: mp.data };
    },
  );

  return {
    panel: panel.bg,
    rows,
    objects,
    setActive(slot) {
      rows.forEach((row, index) => {
        const active = index === slot;
        row.card.setStrokeStyle(active ? 3 : 1, active ? 0xffd36b : 0x384859);
        row.name.setText(`${active ? "▶ " : ""}${party[index].name}`);
      });
    },
    destroy() {
      objects.forEach((object) => object?.destroy?.());
    },
  };
}
