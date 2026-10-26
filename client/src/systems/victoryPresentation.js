import { buildVictoryXPSegments } from "./victoryXp.js";

function cleanLineEnding(value) {
  return value.replace(/[!.]+$/, "").trim();
}

export function formatBattleDrop(drop = {}) {
  const name = String(drop.name || drop.item?.name || drop.item_id || "Item");
  const quantity = Math.max(1, Number(drop.quantity) || 1);
  return quantity > 1 ? `${name} ×${quantity}` : name;
}

export function buildVictorySummary(log = [], battleRewards = null) {
  const summary = {
    xpEarned: 0,
    goldEarned: 0,
    found: [],
    quests: [],
  };

  for (const rawLine of log) {
    const line = String(rawLine || "").trim();
    const reward = line.match(
      /(?:Victory!?|Quest reward:)\s*\+(\d+)\s+XP,\s*\+(\d+)\s+gold/i,
    );
    if (reward) {
      summary.xpEarned += Number.parseInt(reward[1], 10) || 0;
      summary.goldEarned += Number.parseInt(reward[2], 10) || 0;
    }

    if (!Array.isArray(battleRewards?.drops) && /^Found:/i.test(line)) {
      const itemName = cleanLineEnding(line.replace(/^Found:\s*/i, ""));
      if (itemName && !summary.found.includes(itemName)) {
        summary.found.push(itemName);
      }
    }

    if (/Quest complete/i.test(line)) {
      summary.quests.push(cleanLineEnding(line));
    }
  }

  if (Array.isArray(battleRewards?.drops)) {
    summary.found = battleRewards.drops.map(formatBattleDrop);
  }

  return summary;
}

export function formatSpoils(summary) {
  if (!summary?.found?.length) return "No item drops";
  return summary.found.join("  ·  ");
}

// The log describes the pooled reward. Each row must instead use the server's
// before/after progression, including thresholds crossed and lost KO rewards.
export function buildPartyXP(gs) {
  return (gs.party || []).map((member, index) => {
    if (gs.died_this_fight?.[index]) return 0;
    const prevXP = gs.xp_before?.[index];
    if (!Number.isFinite(prevXP) || !Number.isFinite(member.xp)) return null;
    if (!(member.xp_next > 0) && !(gs.xp_thresholds?.[index]?.length > 1))
      return Math.max(0, member.xp - prevXP);
    return buildVictoryXPSegments({
      prevXP,
      currentXP: member.xp,
      xpNext: member.xp_next,
      xpThresholds: gs.xp_thresholds?.[index] || [],
    }).reduce(
      (total, segment) => total + Math.max(0, segment.end - segment.start),
      0,
    );
  });
}

// A finale also pays per-survivor quest XP, so its headline uses the sum of
// actual progression rather than treating both log rewards as one split pool.
export function buildFinalePartyXP(gs) {
  if (!gs.final_encounter?.defeated) return null;
  const amounts = buildPartyXP(gs);
  return amounts.every(Number.isFinite) ? amounts : null;
}
