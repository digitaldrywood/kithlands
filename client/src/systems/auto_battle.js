// Battle automation helpers for repeat-last-round (issue #99) and
// deterministic Smart Attack planning (issue #162).
//
// Everything in this module is pure and fully unit-testable. The server
// remains authoritative; the client only proposes legal actions.

const PHYSICAL_ABILITY_META = {
  backstab: { targeted: true, power_mult: 2.8, utility_bonus: 14 },
  focus: { targeted: false, power_mult: 1.0, utility_bonus: 18 },
  counter: { targeted: false, power_mult: 1.0, utility_bonus: 8 },
  inspire: { targeted: false, power_mult: 1.0, utility_bonus: 16 },
  steal: { targeted: true, power_mult: 0.25, utility_bonus: -16 },
};

const SMART_CONFIG = {
  urgent_heal_ratio: 0.45,
  hurt_heal_ratio: 0.7,
  stable_party_ratio: 0.82,
  all_ally_heal_min_missing: 38,
  weakness_mult: 1.7,
  resistance_mult: 0.55,
  revive_base_score: 140,
  status_cure_score: 72,
  buff_base_score: 28,
  multi_enemy_threshold: 2,
};

const ACTION_TIEBREAK = {
  revive: 0,
  spell: 1,
  ability: 2,
  item: 3,
  attack: 4,
};

function livingEnemies(enemies = []) {
  return enemies.filter((e) => e.hp > 0);
}

function livingParty(party = []) {
  return party
    .map((member, slot) => ({ ...member, slot }))
    .filter((member) => member.hp > 0);
}

function downedParty(party = []) {
  return party
    .map((member, slot) => ({ ...member, slot }))
    .filter((member) => member.hp <= 0);
}

function closestLivingEnemy(enemies) {
  return livingEnemies(enemies)[0] || null;
}

function closestLivingEnemyById(enemies, targetId) {
  const original = enemies.find((e) => e.id === targetId && e.hp > 0);
  if (original) return original;
  return closestLivingEnemy(enemies);
}

function mostDamagedLivingAlly(party) {
  let best = null;
  let bestRatio = Infinity;
  for (let i = 0; i < party.length; i++) {
    const m = party[i];
    if (m.hp <= 0) continue;
    const ratio = m.max_hp > 0 ? m.hp / m.max_hp : 1;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = i;
    }
  }
  return best;
}

function findSpell(actor, spellId) {
  if (!actor.spells) return null;
  return actor.spells.find((s) => s.id === spellId) || null;
}

function isAllySpell(spell) {
  return (
    spell.effect === "heal" ||
    spell.effect === "buff" ||
    spell.effect === "cure_status"
  );
}

function fallbackAttack(enemies) {
  const target = closestLivingEnemy(enemies);
  if (!target) return null;
  return { type: "attack", target_id: target.id };
}

function countConsumable(items = [], itemId) {
  const item = items.find((entry) => entry.id === itemId);
  return item?.count ?? 0;
}

function hasPhoenixDown(gameState) {
  return countConsumable(gameState.items, "phoenix_down") > 0;
}

function hasSupportCapability(actor) {
  return (actor.spells || []).some((spell) =>
    ["heal", "buff", "cure_status"].includes(spell.effect),
  );
}

function hasDamageCapability(actor) {
  return (actor.spells || []).some((spell) => spell.effect === "damage");
}

function hasPhysicalAbility(actor) {
  return (actor.abilities || []).some((id) => PHYSICAL_ABILITY_META[id]);
}

function getRoleProfile(actor) {
  const supportSpells = (actor.spells || []).filter((spell) =>
    ["heal", "buff", "cure_status"].includes(spell.effect),
  ).length;
  const damageSpells = (actor.spells || []).filter(
    (spell) => spell.effect === "damage",
  ).length;
  const physicalAbilities = (actor.abilities || []).filter(
    (id) => PHYSICAL_ABILITY_META[id],
  ).length;

  return {
    support_weight:
      supportSpells * 22 +
      Math.max(0, (actor.int_stat ?? actor.int ?? 0) - (actor.str ?? 0)),
    magic_weight:
      damageSpells * 16 +
      Math.max(0, (actor.int_stat ?? actor.int ?? 0) - (actor.str ?? 0) / 2),
    physical_weight:
      (actor.str ?? 0) +
      physicalAbilities * 12 +
      ((actor.max_mp ?? 0) === 0 ? 10 : 0),
  };
}

function estimatePhysicalDamage(actor, abilityId = "") {
  const intStat = actor.int_stat ?? actor.int ?? 0;
  const base = Math.max(
    8,
    (actor.str ?? 0) * 1.8 + (actor.level ?? 1) * 2 + intStat * 0.15,
  );
  const mult = PHYSICAL_ABILITY_META[abilityId]?.power_mult ?? 1;
  return base * mult;
}

function enemyThreat(enemy) {
  const sizeScore =
    enemy.size === "boss"
      ? 70
      : enemy.size === "large"
        ? 36
        : enemy.size === "medium"
          ? 24
          : 12;
  const hpScore = (enemy.max_hp ?? enemy.hp ?? 0) * 0.16;
  const woundedScore = ((enemy.max_hp ?? 1) - enemy.hp) * 0.08;
  const statusPenalty = enemy.status === "sleep" ? 4 : 0;
  return sizeScore + hpScore + woundedScore - statusPenalty;
}

function revivePriority(member) {
  const role = getRoleProfile(member);
  return (
    role.support_weight * 0.8 +
    role.magic_weight * 0.5 +
    role.physical_weight * 0.4
  );
}

function elementalMultiplier(spell, enemy) {
  if (!spell?.element || spell.element === "none") return 1;
  if (enemy.weaknesses?.includes(spell.element)) {
    return SMART_CONFIG.weakness_mult;
  }
  if (enemy.resistances?.includes(spell.element)) {
    return SMART_CONFIG.resistance_mult;
  }
  return 1;
}

function statusMatchesCure(spell, member) {
  const wanted = spell.cures_status;
  if (!wanted) return false;
  if (wanted === "all") {
    return !!member.status;
  }
  return member.status === wanted;
}

function bestEnemyTarget(enemies, damageEstimate, utilityShift = 0) {
  let best = null;
  for (const enemy of livingEnemies(enemies)) {
    const killBonus =
      damageEstimate >= enemy.hp ? 55 + enemyThreat(enemy) * 0.35 : 0;
    const lowHpBonus =
      (((enemy.max_hp ?? 1) - enemy.hp) / Math.max(1, enemy.max_hp)) * 22;
    const score = enemyThreat(enemy) + killBonus + lowHpBonus + utilityShift;
    if (
      !best ||
      score > best.score ||
      (score === best.score && enemy.id < best.enemy.id)
    ) {
      best = { enemy, score };
    }
  }
  return best;
}

function addCandidate(candidates, candidate) {
  if (!candidate) return;
  candidates.push(candidate);
}

function candidateSort(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const typeCmp =
    (ACTION_TIEBREAK[a.action.type] ?? 99) -
    (ACTION_TIEBREAK[b.action.type] ?? 99);
  if (typeCmp !== 0) return typeCmp;
  if ((a.action.target_id ?? -1) !== (b.action.target_id ?? -1)) {
    return (a.action.target_id ?? -1) - (b.action.target_id ?? -1);
  }
  return String(a.preview).localeCompare(String(b.preview));
}

function planAttackCandidate(actor, slot, enemies, role) {
  const estimate = estimatePhysicalDamage(actor);
  const best = bestEnemyTarget(enemies, estimate, role.physical_weight * 0.15);
  if (!best) return null;
  return {
    score: best.score + role.physical_weight * 0.75,
    action: { slot, type: "attack", target_id: best.enemy.id },
    preview: `${actor.name} -> Attack ${best.enemy.name}`,
  };
}

function planAbilityCandidates(actor, slot, gameState, role) {
  const candidates = [];
  for (const abilityId of actor.abilities || []) {
    if (abilityId === "backstab") {
      const best = bestEnemyTarget(
        gameState.enemies,
        estimatePhysicalDamage(actor, abilityId),
        role.physical_weight * 0.22 +
          PHYSICAL_ABILITY_META[abilityId].utility_bonus,
      );
      if (!best) continue;
      addCandidate(candidates, {
        score: best.score + role.physical_weight * 0.95 + 8,
        action: {
          slot,
          type: "ability",
          ability_id: abilityId,
          target_id: best.enemy.id,
        },
        preview: `${actor.name} -> Backstab ${best.enemy.name}`,
      });
      continue;
    }

    if (abilityId === "focus") {
      const enemyCount = livingEnemies(gameState.enemies).length;
      addCandidate(candidates, {
        score:
          role.physical_weight * 0.72 +
          PHYSICAL_ABILITY_META[abilityId].utility_bonus +
          enemyCount * 4,
        action: { slot, type: "ability", ability_id: abilityId, target_id: 0 },
        preview: `${actor.name} -> Focus`,
      });
      continue;
    }

    if (abilityId === "counter") {
      const hpRatio = actor.max_hp > 0 ? actor.hp / actor.max_hp : 1;
      addCandidate(candidates, {
        score:
          role.physical_weight * 0.42 +
          PHYSICAL_ABILITY_META[abilityId].utility_bonus +
          (hpRatio <= 0.6 ? 12 : 0),
        action: { slot, type: "ability", ability_id: abilityId, target_id: 0 },
        preview: `${actor.name} -> Counter`,
      });
      continue;
    }

    if (abilityId === "inspire") {
      const wounded = partyMissingHP(gameState.party);
      const urgent =
        lowestLivingHpRatio(gameState.party) <= SMART_CONFIG.hurt_heal_ratio;
      addCandidate(candidates, {
        score:
          role.support_weight * 0.6 +
          role.physical_weight * 0.25 +
          PHYSICAL_ABILITY_META[abilityId].utility_bonus +
          (urgent ? -22 : 14) -
          wounded * 0.03,
        action: { slot, type: "ability", ability_id: abilityId, target_id: 0 },
        preview: `${actor.name} -> Inspire`,
      });
      continue;
    }
  }
  return candidates;
}

function lowestLivingHpRatio(party) {
  let best = 1;
  for (const member of party) {
    if (member.hp <= 0) continue;
    const ratio = member.max_hp > 0 ? member.hp / member.max_hp : 1;
    if (ratio < best) best = ratio;
  }
  return best;
}

function partyMissingHP(party) {
  return party.reduce(
    (sum, member) => sum + Math.max(0, (member.max_hp ?? 0) - (member.hp ?? 0)),
    0,
  );
}

function planReviveCandidate(actor, slot, gameState, role) {
  const downed = downedParty(gameState.party);
  if (!downed.length || !hasPhoenixDown(gameState)) return null;
  const aliveCount = livingParty(gameState.party).length;
  if (aliveCount === 0) return null;

  const target = [...downed].sort((a, b) => {
    const scoreDiff = revivePriority(b) - revivePriority(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.slot - b.slot;
  })[0];

  return {
    score:
      SMART_CONFIG.revive_base_score +
      revivePriority(target) +
      role.support_weight * 0.45 -
      livingEnemies(gameState.enemies).length * 4,
    action: {
      slot,
      type: "revive",
      target_id: target.slot,
      item_id: "phoenix_down",
    },
    preview: `${actor.name} -> Phoenix Down ${target.name}`,
  };
}

function planSupportSpellCandidates(actor, slot, gameState, role) {
  const candidates = [];
  const spells = (actor.spells || []).filter(
    (spell) =>
      spell.castable_in_combat !== false &&
      (actor.mp ?? 0) >= (spell.mp_cost ?? 0) &&
      ["heal", "buff", "cure_status"].includes(spell.effect),
  );

  for (const spell of spells) {
    if (spell.effect === "heal") {
      if (spell.target === "all_allies" || spell.target === "party") {
        const totalMissing = partyMissingHP(gameState.party);
        const livingCount = livingParty(gameState.party).length;
        if (totalMissing <= 0 || livingCount === 0) continue;
        addCandidate(candidates, {
          score:
            role.support_weight +
            totalMissing * 0.55 +
            spell.power * livingCount -
            (spell.mp_cost ?? 0) * 3 -
            (totalMissing < SMART_CONFIG.all_ally_heal_min_missing ? 24 : 0),
          action: { slot, type: "spell", target_id: -1, spell_id: spell.id },
          preview: `${actor.name} -> ${spell.name}`,
        });
        continue;
      }

      for (const member of livingParty(gameState.party)) {
        const missing = Math.max(0, member.max_hp - member.hp);
        if (missing <= 0) continue;
        const ratio = member.max_hp > 0 ? member.hp / member.max_hp : 1;
        addCandidate(candidates, {
          score:
            role.support_weight +
            missing * 0.9 +
            Math.min(missing, spell.power ?? 0) * 1.2 +
            (ratio <= SMART_CONFIG.urgent_heal_ratio
              ? 52
              : ratio <= SMART_CONFIG.hurt_heal_ratio
                ? 20
                : -18) -
            (spell.mp_cost ?? 0) * 2.5,
          action: {
            slot,
            type: "spell",
            target_id: member.slot,
            spell_id: spell.id,
          },
          preview: `${actor.name} -> ${spell.name} ${member.name}`,
        });
      }
      continue;
    }

    if (spell.effect === "cure_status") {
      if (spell.target === "all_allies" || spell.target === "party") {
        const afflicted = livingParty(gameState.party).filter((member) =>
          statusMatchesCure(spell, member),
        );
        if (!afflicted.length) continue;
        addCandidate(candidates, {
          score:
            role.support_weight +
            SMART_CONFIG.status_cure_score +
            afflicted.length * 18 -
            (spell.mp_cost ?? 0) * 2,
          action: { slot, type: "spell", target_id: -1, spell_id: spell.id },
          preview: `${actor.name} -> ${spell.name}`,
        });
        continue;
      }

      for (const member of livingParty(gameState.party)) {
        if (!statusMatchesCure(spell, member)) continue;
        addCandidate(candidates, {
          score:
            role.support_weight +
            SMART_CONFIG.status_cure_score +
            (member.status === "stone" ? 16 : 0) -
            (spell.mp_cost ?? 0) * 2,
          action: {
            slot,
            type: "spell",
            target_id: member.slot,
            spell_id: spell.id,
          },
          preview: `${actor.name} -> ${spell.name} ${member.name}`,
        });
      }
      continue;
    }

    if (spell.effect === "buff") {
      if (
        lowestLivingHpRatio(gameState.party) <= SMART_CONFIG.hurt_heal_ratio
      ) {
        continue;
      }
      const allies = livingParty(gameState.party);
      if (!allies.length) continue;
      const target = [...allies].sort((a, b) => {
        const diff = estimatePhysicalDamage(b) - estimatePhysicalDamage(a);
        if (diff !== 0) return diff;
        return a.slot - b.slot;
      })[0];
      addCandidate(candidates, {
        score:
          role.support_weight * 0.8 +
          SMART_CONFIG.buff_base_score +
          estimatePhysicalDamage(target) * 0.3 -
          (spell.mp_cost ?? 0) * 1.5,
        action: {
          slot,
          type: "spell",
          target_id: target.slot,
          spell_id: spell.id,
        },
        preview: `${actor.name} -> ${spell.name} ${target.name}`,
      });
    }
  }

  return candidates;
}

function planDamageSpellCandidates(actor, slot, gameState, role) {
  const candidates = [];
  const spells = (actor.spells || []).filter(
    (spell) =>
      spell.castable_in_combat !== false &&
      (actor.mp ?? 0) >= (spell.mp_cost ?? 0) &&
      spell.effect === "damage",
  );
  const enemies = livingEnemies(gameState.enemies);

  for (const spell of spells) {
    if (!enemies.length) continue;

    if (spell.target === "all_enemies") {
      const bestEnemy = bestEnemyTarget(enemies, spell.power ?? 0);
      const totalValue = enemies.reduce((sum, enemy) => {
        const mult = elementalMultiplier(spell, enemy);
        return sum + (spell.power ?? 0) * mult + enemyThreat(enemy) * 0.25;
      }, 0);
      addCandidate(candidates, {
        score:
          role.magic_weight +
          totalValue -
          (spell.mp_cost ?? 0) * 3 -
          (enemies.length < SMART_CONFIG.multi_enemy_threshold ? 26 : 0),
        action: {
          slot,
          type: "spell",
          target_id: bestEnemy?.enemy.id ?? enemies[0].id,
          spell_id: spell.id,
        },
        preview: `${actor.name} -> ${spell.name}`,
      });
      continue;
    }

    for (const enemy of enemies) {
      const mult = elementalMultiplier(spell, enemy);
      const damageEstimate = (spell.power ?? 0) * mult;
      const weaknessBonus = mult > 1 ? 32 : mult < 1 ? -24 : 0;
      addCandidate(candidates, {
        score:
          role.magic_weight +
          damageEstimate * 2.1 +
          enemyThreat(enemy) +
          weaknessBonus -
          (spell.mp_cost ?? 0) * 3,
        action: {
          slot,
          type: "spell",
          target_id: enemy.id,
          spell_id: spell.id,
        },
        preview: `${actor.name} -> ${spell.name} ${enemy.name}`,
      });
    }
  }

  return candidates;
}

function planSmartAction(slot, actor, gameState) {
  if (!actor || actor.hp <= 0) return null;
  if (livingEnemies(gameState.enemies).length === 0) return null;

  const role = getRoleProfile(actor);
  const candidates = [];

  addCandidate(candidates, planReviveCandidate(actor, slot, gameState, role));
  for (const candidate of planSupportSpellCandidates(
    actor,
    slot,
    gameState,
    role,
  )) {
    addCandidate(candidates, candidate);
  }
  for (const candidate of planDamageSpellCandidates(
    actor,
    slot,
    gameState,
    role,
  )) {
    addCandidate(candidates, candidate);
  }
  for (const candidate of planAbilityCandidates(actor, slot, gameState, role)) {
    addCandidate(candidates, candidate);
  }
  addCandidate(
    candidates,
    planAttackCandidate(actor, slot, gameState.enemies, role),
  );

  if (!candidates.length) return null;
  candidates.sort(candidateSort);
  return candidates[0];
}

export function planSmartRound(gameState, slots = null) {
  const chosenSlots =
    slots ||
    gameState.party
      .map((member, slot) => ({ member, slot }))
      .filter(({ member }) => member.hp > 0)
      .map(({ slot }) => slot);

  const actions = [];
  const preview = [];

  for (const slot of chosenSlots) {
    const candidate = planSmartAction(slot, gameState.party[slot], gameState);
    if (!candidate) continue;
    actions.push(candidate.action);
    preview.push(candidate.preview);
  }

  return { actions, preview };
}

export function describePlannedAction(action, gameState) {
  if (!action) return "";
  const actorName =
    gameState.party?.[action.slot]?.name || `Slot ${action.slot + 1}`;
  if (action.type === "attack") {
    const enemy = gameState.enemies?.find(
      (entry) => entry.id === action.target_id,
    );
    return `${actorName} -> Attack ${enemy?.name || `Enemy ${action.target_id}`}`;
  }
  if (action.type === "revive") {
    const member = gameState.party?.[action.target_id];
    return `${actorName} -> Phoenix Down ${member?.name || `Ally ${action.target_id + 1}`}`;
  }
  if (action.type === "spell") {
    const spell = findSpell(gameState.party?.[action.slot], action.spell_id);
    if (action.target_id >= 0 && gameState.party?.[action.target_id]) {
      return `${actorName} -> ${spell?.name || action.spell_id} ${gameState.party[action.target_id].name}`;
    }
    if (action.target_id > 0) {
      const enemy = gameState.enemies?.find(
        (entry) => entry.id === action.target_id,
      );
      return `${actorName} -> ${spell?.name || action.spell_id} ${enemy?.name || `Enemy ${action.target_id}`}`;
    }
    return `${actorName} -> ${spell?.name || action.spell_id}`;
  }
  if (action.type === "ability") {
    if (action.target_id > 0) {
      const enemy = gameState.enemies?.find(
        (entry) => entry.id === action.target_id,
      );
      return `${actorName} -> ${action.ability_id} ${enemy?.name || `Enemy ${action.target_id}`}`;
    }
    return `${actorName} -> ${action.ability_id}`;
  }
  return `${actorName} -> ${action.type}`;
}

export function buildBattleActionButtons({
  member,
  gameState,
  hasLastRound,
  autoMode,
}) {
  const buttons = [{ label: "[A]TTACK", type: "attack", color: "#ff4444" }];
  const hasSpells =
    member.spells?.length > 0 &&
    member.spells.some(
      (spell) =>
        spell.castable_in_combat !== false &&
        (member.mp ?? 0) >= (spell.mp_cost ?? 0),
    );
  const hasAbilities = member.abilities?.length > 0;
  const hasItems =
    (gameState.potions ?? 0) > 0 ||
    countConsumable(gameState.items, "phoenix_down") > 0;

  if (hasSpells) {
    buttons.push({ label: "[S]PELL", type: "spell", color: "#8888ff" });
  }
  if (hasAbilities) {
    buttons.push({ label: "[B]ABILITY", type: "ability", color: "#ff88ff" });
  }
  if (hasItems) {
    buttons.push({ label: "[I]TEMS", type: "item", color: "#44ff44" });
  }
  buttons.push({ label: "S[M]ART", type: "smart", color: "#88ffaa" });
  buttons.push({ label: "[F]LEE", type: "flee", color: "#ffcc44" });

  if (hasLastRound) {
    buttons.push({ label: "[R]EPEAT", type: "repeat", color: "#44ccff" });
    buttons.push({
      label: autoMode ? "[Q] AUTO*" : "[Q] AUTO",
      type: "auto",
      color: autoMode ? "#ffaa44" : "#ff8844",
    });
  }

  return buttons;
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a previous round's action into a valid action for the current state.
 *
 * @param {object} action   - Previous action: { slot, type, target_id, spell_id?, item_id?, ability_id? }
 * @param {object} actor    - Current party member state (hp, mp, spells, etc.)
 * @param {object} gameState - Current game state (party, enemies, potions, items)
 * @returns {object|null}   - Resolved action with slot, or null if actor is dead / no valid action
 */
export function resolveAction(action, actor, gameState) {
  const { enemies, party } = gameState;
  const slot = action.slot;

  if (actor.hp <= 0) return null;
  if (!enemies.some((e) => e.hp > 0)) return null;

  if (action.type === "attack") {
    return resolveAttack(action, enemies, slot);
  }

  if (action.type === "spell") {
    return resolveSpell(action, actor, gameState, slot);
  }

  if (action.type === "ability") {
    return resolveAbility(action, enemies, slot);
  }

  if (action.type === "item" || action.type === "revive") {
    return resolveItem(action, gameState, slot);
  }

  return { slot, ...fallbackAttack(enemies) };
}

function resolveAttack(action, enemies, slot) {
  const target = closestLivingEnemyById(enemies, action.target_id);
  if (!target) return null;
  return { slot, type: "attack", target_id: target.id };
}

function resolveSpell(action, actor, gameState, slot) {
  const { enemies, party } = gameState;
  const spell = findSpell(actor, action.spell_id);

  if (!spell || spell.castable_in_combat === false) {
    const fb = fallbackAttack(enemies);
    return fb ? { slot, ...fb } : null;
  }
  if ((actor.mp ?? 0) < (spell.mp_cost ?? 0)) {
    const fb = fallbackAttack(enemies);
    return fb ? { slot, ...fb } : null;
  }

  if (isAllySpell(spell)) {
    return resolveAllySpell(action, spell, party, enemies, slot);
  }

  return resolveEnemySpell(action, spell, enemies, slot);
}

function resolveAllySpell(action, spell, party, enemies, slot) {
  if (spell.target === "all_allies" || spell.target === "party") {
    return {
      slot,
      type: "spell",
      target_id: -1,
      spell_id: action.spell_id,
    };
  }

  const targetSlot = action.target_id;
  if (
    targetSlot >= 0 &&
    targetSlot < party.length &&
    party[targetSlot].hp > 0
  ) {
    return {
      slot,
      type: "spell",
      target_id: targetSlot,
      spell_id: action.spell_id,
    };
  }

  const newTarget = mostDamagedLivingAlly(party);
  if (newTarget !== null) {
    return {
      slot,
      type: "spell",
      target_id: newTarget,
      spell_id: action.spell_id,
    };
  }

  const fb = fallbackAttack(enemies);
  return fb ? { slot, ...fb } : null;
}

function resolveEnemySpell(action, spell, enemies, slot) {
  if (spell.target === "all_enemies") {
    const fallbackTarget = closestLivingEnemy(enemies);
    if (!fallbackTarget) return null;
    return {
      slot,
      type: "spell",
      target_id: fallbackTarget.id,
      spell_id: action.spell_id,
    };
  }

  const target = closestLivingEnemyById(enemies, action.target_id);
  if (!target) return null;
  return {
    slot,
    type: "spell",
    target_id: target.id,
    spell_id: action.spell_id,
  };
}

function resolveAbility(action, enemies, slot) {
  if (
    action.ability_id === "focus" ||
    action.ability_id === "counter" ||
    action.ability_id === "inspire"
  ) {
    return {
      slot,
      type: "ability",
      target_id: 0,
      ability_id: action.ability_id,
    };
  }

  const target = closestLivingEnemyById(enemies, action.target_id);
  if (!target) return null;
  return {
    slot,
    type: "ability",
    target_id: target.id,
    ability_id: action.ability_id,
  };
}

function resolveItem(action, gameState, slot) {
  const { enemies, party } = gameState;

  if (action.type === "revive") {
    if (!hasPhoenixDown(gameState)) {
      const fb = fallbackAttack(enemies);
      return fb ? { slot, ...fb } : null;
    }
    const targetSlot = action.target_id;
    if (
      targetSlot >= 0 &&
      targetSlot < party.length &&
      party[targetSlot].hp <= 0
    ) {
      return {
        slot,
        type: "revive",
        target_id: targetSlot,
        item_id: "phoenix_down",
      };
    }
    const fb = fallbackAttack(enemies);
    return fb ? { slot, ...fb } : null;
  }

  if (action.item_id === "potion" || action.item_id === "hi_potion") {
    if ((gameState.potions ?? 0) <= 0) {
      const fb = fallbackAttack(enemies);
      return fb ? { slot, ...fb } : null;
    }
  } else if (action.item_id === "ether") {
    if ((gameState.ethers ?? 0) <= 0) {
      const fb = fallbackAttack(enemies);
      return fb ? { slot, ...fb } : null;
    }
  }

  const targetSlot = action.target_id;
  if (targetSlot >= 0 && targetSlot < party.length) {
    const target = party[targetSlot];
    if (target.hp <= 0 || target.hp >= target.max_hp) {
      const fb = fallbackAttack(enemies);
      return fb ? { slot, ...fb } : null;
    }
    return {
      slot,
      type: "item",
      target_id: targetSlot,
      item_id: action.item_id,
    };
  }

  const fb = fallbackAttack(enemies);
  return fb ? { slot, ...fb } : null;
}
