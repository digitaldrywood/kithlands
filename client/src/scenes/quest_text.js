function compactName(name, fallback = "the next location") {
  return String(name || fallback).trim() || fallback;
}

function isFinalQuest(q) {
  const name = String(q?.name || "").toLowerCase();
  return q?.template_id === "Q12" || name.startsWith("defeat ");
}

export function questKindLabel(q) {
  if (q?.is_promotion) return "Promotion";
  if (q?.is_side_quest) return "Side Quest";
  if (isFinalQuest(q)) return "Final Trial";
  return `Act ${q?.act || 1}`;
}

export function questObjectiveText(q) {
  if (!q) return "Explore nearby locations.";
  if (q.objectives && !q.completed) {
    const action = q.actions?.[q.objectives.step];
    if (action?.text)
      return `${q.objectives.step + 1}/${q.actions.length} · ${action.text}`;
  }

  if (q.is_promotion) {
    if (q.promo_stage === 1) {
      return `Clear ${compactName(q.dungeon_name || q.target_name, "the trial dungeon")}.`;
    }
    if (q.promo_stage === 2) {
      return `Return to ${compactName(q.giver_name, "the quest giver")}.`;
    }
    return `Seek ${compactName(q.giver_name || q.target_name, "the quest giver")}.`;
  }

  const target = compactName(q.target_name);
  const giver = compactName(q.giver_name, "");
  const name = String(q.name || "").toLowerCase();
  const desc = String(q.description || "").toLowerCase();
  const text = `${name} ${desc}`;

  if (isFinalQuest(q)) return `Travel to ${target} and end the threat.`;
  if (text.includes("deliver") || text.includes("bring")) {
    return `Deliver the needed item to ${target}.`;
  }
  if (
    text.includes("recover") ||
    text.includes("find") ||
    text.includes("lost")
  ) {
    return `Search ${target} and recover what is missing.`;
  }
  if (
    text.includes("defeat") ||
    text.includes("bandit") ||
    text.includes("monster")
  ) {
    return `Travel to ${target} and defeat the threat.`;
  }
  if (
    text.includes("speak") ||
    text.includes("visit") ||
    text.includes("meet")
  ) {
    return `Visit ${target}${giver ? ` for ${giver}` : ""}.`;
  }

  return q.target_name ? `Travel to ${target}.` : "Explore nearby locations.";
}

export function questRewardText(q) {
  const xp = q?.reward?.xp || 0;
  const gold = q?.reward?.gold || 0;
  if (!xp && !gold) return "";
  if (xp && gold) return `${xp} XP, ${gold} gold`;
  if (xp) return `${xp} XP`;
  return `${gold} gold`;
}

export function questCustodyText(q) {
  if (q?.objectives?.item) return `Carrying: ${q.objectives.item}`;
  if (q?.objectives?.clue) return `Clue recorded: ${q.objectives.clue}`;
  return "";
}
