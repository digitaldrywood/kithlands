import { buildVictoryXPSegments } from "./victoryXp.js";

function cleanLineEnding(value) {
  return value.replace(/[!.]+$/, "").trim();
}

export function buildVictorySummary(log = []) {
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

    if (/^Found:/i.test(line)) {
      const itemName = cleanLineEnding(line.replace(/^Found:\s*/i, ""));
      if (itemName && !summary.found.includes(itemName)) {
        summary.found.push(itemName);
      }
    }

    if (/Quest complete/i.test(line)) {
      summary.quests.push(cleanLineEnding(line));
    }
  }

  return summary;
}

export function formatSpoils(summary) {
  if (!summary?.found?.length) return "No item drops";
  return summary.found.join("  ·  ");
}

// A finale pays both split battle XP and per-survivor quest XP. Read the
// authoritative progression segments so the receipt reflects what was awarded.
export function buildFinalePartyXP(gs) {
  if (!gs.final_encounter?.defeated) return null;
  return gs.party.map((member, index) => {
    if (gs.died_this_fight?.[index]) return 0;
    return buildVictoryXPSegments({
      prevXP: gs.xp_before?.[index] || 0,
      currentXP: member.xp,
      xpNext: member.xp_next,
      xpThresholds: gs.xp_thresholds?.[index] || [],
    }).reduce(
      (total, segment) => total + Math.max(0, segment.end - segment.start),
      0,
    );
  });
}
