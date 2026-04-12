// Smart fallback resolver for auto-battle / repeat-last-round (issue #99).
//
// resolveAction() takes a previous round's action and returns a valid action
// for the current game state. Pure function — no Phaser dependency, fully
// unit-testable. The server remains authoritative; this is a client-side
// convenience layer so REPEAT and AUTO don't submit obviously invalid actions.

// ---------------------------------------------------------------------------
// Helpers (not exported — internal to the resolver)
// ---------------------------------------------------------------------------

function closestLivingEnemy(enemies) {
  return enemies.find((e) => e.hp > 0) || null;
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
    const ratio = m.hp / m.max_hp;
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

  // Actor dead — skip entirely
  if (actor.hp <= 0) return null;

  // No living enemies — nothing to do
  const hasLivingEnemies = enemies.some((e) => e.hp > 0);
  if (!hasLivingEnemies) return null;

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

  // Unknown action type — fall back to basic attack
  return { slot, ...fallbackAttack(enemies) };
}

// ---------------------------------------------------------------------------
// Per-type resolvers
// ---------------------------------------------------------------------------

function resolveAttack(action, enemies, slot) {
  const target = closestLivingEnemyById(enemies, action.target_id);
  if (!target) return null;
  return { slot, type: "attack", target_id: target.id };
}

function resolveSpell(action, actor, gameState, slot) {
  const { enemies, party } = gameState;
  const spell = findSpell(actor, action.spell_id);

  // Spell no longer known (e.g. edge case) — fall back to attack
  if (!spell) {
    const fb = fallbackAttack(enemies);
    return fb ? { slot, ...fb } : null;
  }

  // Not enough MP — fall back to attack
  if ((actor.mp ?? 0) < (spell.mp_cost ?? 0)) {
    const fb = fallbackAttack(enemies);
    return fb ? { slot, ...fb } : null;
  }

  if (isAllySpell(spell)) {
    return resolveAllySpell(action, spell, party, enemies, slot);
  }

  // Enemy-targeted spell
  return resolveEnemySpell(action, spell, enemies, slot);
}

function resolveAllySpell(action, spell, party, enemies, slot) {
  // Check if original target is alive
  const targetSlot = action.target_id;
  if (
    targetSlot >= 0 &&
    targetSlot < party.length &&
    party[targetSlot].hp > 0
  ) {
    // Original target still valid
    return {
      slot,
      type: "spell",
      target_id: targetSlot,
      spell_id: action.spell_id,
    };
  }

  // Target dead — retarget to most-damaged living ally
  const newTarget = mostDamagedLivingAlly(party);
  if (newTarget !== null) {
    return {
      slot,
      type: "spell",
      target_id: newTarget,
      spell_id: action.spell_id,
    };
  }

  // No living allies (shouldn't happen if actor is alive, but be safe)
  const fb = fallbackAttack(enemies);
  return fb ? { slot, ...fb } : null;
}

function resolveEnemySpell(action, spell, enemies, slot) {
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
  // Abilities that target enemies — retarget if dead
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
    // Revive: check if we still have phoenix_down
    const hasPhoenix =
      gameState.items && gameState.items.some((i) => i.id === "phoenix_down");
    if (!hasPhoenix) {
      const fb = fallbackAttack(enemies);
      return fb ? { slot, ...fb } : null;
    }
    // Check if target is still dead (needs revive)
    const targetSlot = action.target_id;
    if (
      targetSlot >= 0 &&
      targetSlot < party.length &&
      party[targetSlot].hp <= 0
    ) {
      return { slot, type: "revive", target_id: targetSlot, item_id: "phoenix_down" };
    }
    // Target no longer dead — fall back to attack
    const fb = fallbackAttack(enemies);
    return fb ? { slot, ...fb } : null;
  }

  // Potion / ether / etc.
  // Check if we still have the item (potions are tracked as gs.potions count)
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

  // Check if target is alive and not at full HP (for healing items)
  const targetSlot = action.target_id;
  if (targetSlot >= 0 && targetSlot < party.length) {
    const target = party[targetSlot];
    if (target.hp <= 0 || target.hp >= target.max_hp) {
      // Target dead or full HP — fall back to attack
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

  // Invalid target — fall back to attack
  const fb = fallbackAttack(enemies);
  return fb ? { slot, ...fb } : null;
}
