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
    const reward = line.match(/Victory!?\s*\+(\d+)\s+XP,\s*\+(\d+)\s+gold/i);
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
