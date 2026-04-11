package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

// isCombatCastableEffect is the single source of truth for which spell
// effects the combat dispatch switch in processCombatAction handles. The
// SpellState builder uses this to surface a "castable_in_combat" flag so
// the client can grey out / reject utility-only spells (Light, Resurrect)
// without hardcoding its own list. Keep in sync with the switch on
// spell.Effect in processCombatAction.
func isCombatCastableEffect(effect string) bool {
	switch effect {
	case "damage", "heal", "buff", "status", "cure_status":
		return true
	}
	return false
}

// toHitEntries converts internal combat.Hit slices to the API-facing CombatHitEntry type.
func toHitEntries(hits []combat.Hit) []CombatHitEntry {
	if len(hits) == 0 {
		return nil
	}
	out := make([]CombatHitEntry, len(hits))
	for i, h := range hits {
		out[i] = CombatHitEntry{Damage: h.Damage, Crit: h.Crit, Missed: h.Missed}
	}
	return out
}

// anyCrit returns true if any hit in the slice was a critical hit.
func anyCrit(hits []combat.Hit) bool {
	for _, h := range hits {
		if h.Crit {
			return true
		}
	}
	return false
}

// allMissed returns true if every hit in the slice was a miss.
func allMissed(hits []combat.Hit) bool {
	for _, h := range hits {
		if !h.Missed {
			return false
		}
	}
	return len(hits) > 0
}

func (g *Game) processCombatAction(req GameActionRequest) (*GameState, error) {
	stats := &g.gd.Stats.Combat

	// Handle flee
	if req.Type == "flee" {
		if g.rng.IntN(100) < 40 {
			g.phase = "world"
			g.message = "Got away safely!"
			g.enemies = nil
			g.formation = ""
			g.spellBuffs = nil
			state := g.stateUnlocked()
			return &state, nil
		}
		g.logCombat("Couldn't escape!", CombatActionEntry{Kind: "info"})
		// Enemies still attack after failed flee -- fall through
	}

	// Handle item (potion) -- use and then enemies attack
	if req.Type == "item" {
		return g.processCombatItem(req)
	}

	combatants := g.makeCombatants()

	// Build party actions from per-member actions if provided
	var actions []combat.Action

	if len(req.Actions) > 0 {
		// Per-member actions from client
		for _, ma := range req.Actions {
			if ma.Slot < 0 || ma.Slot >= len(combatants) {
				continue
			}
			pc := combatants[ma.Slot]
			if pc.CurrentHP <= 0 {
				continue
			}

			switch ma.Type {
			case "item":
				// Use potion on targeted party member
				if g.inv.Consumables["potion"] > 0 {
					g.inv.Consumables["potion"]--
					targetIdx := ma.TargetID
					if targetIdx >= 0 && targetIdx < len(g.party) && g.party[targetIdx].IsAlive() {
						g.party[targetIdx].Heal(30)
						g.logCombat(
							fmt.Sprintf("%s uses Potion on %s - healed 30 HP (%d/%d)",
								g.party[ma.Slot].Name, g.party[targetIdx].Name, g.party[targetIdx].CurrentHP, g.party[targetIdx].MaxHP),
							CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name, TargetID: targetIdx, TargetName: g.party[targetIdx].Name, Damage: 30})
					} else {
						// Fallback: heal most damaged
						var healTarget *character.Character
						for _, c := range g.party {
							if c.IsAlive() && (healTarget == nil || c.CurrentHP < healTarget.CurrentHP) {
								healTarget = c
							}
						}
						if healTarget != nil {
							healTarget.Heal(30)
							g.logCombat(
								fmt.Sprintf("%s uses Potion on %s - healed 30 HP (%d/%d)",
									g.party[ma.Slot].Name, healTarget.Name, healTarget.CurrentHP, healTarget.MaxHP),
								CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name, TargetName: healTarget.Name, Damage: 30})
						}
					}
				}
				continue

			case "revive":
				// Use Phoenix Down on dead party member
				if g.inv.Consumables["phoenix_down"] > 0 {
					targetIdx := ma.TargetID
					if targetIdx >= 0 && targetIdx < len(g.party) && !g.party[targetIdx].IsAlive() {
						g.inv.Consumables["phoenix_down"]--
						g.party[targetIdx].CurrentHP = 1
						g.party[targetIdx].Status = character.StatusNone
						g.logCombat(
							fmt.Sprintf("%s uses Phoenix Down on %s - revived with 1 HP!",
								g.party[ma.Slot].Name, g.party[targetIdx].Name),
							CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name, TargetID: targetIdx, TargetName: g.party[targetIdx].Name})
					}
				}
				continue

			case "spell":
				// Silence check per Section 6.5: silenced casters cannot cast.
				if g.party[ma.Slot].Status == character.StatusSilence {
					g.logCombat(
						fmt.Sprintf("%s is silenced and cannot cast!", g.party[ma.Slot].Name),
						CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name})
					continue
				}
				// Resolve spell inline
				spell := g.gd.SpellByID(ma.SpellID)
				if spell != nil {
					// Find caster character
					caster := g.party[ma.Slot]
					if sb, ok := g.spellBooks[caster.Name]; ok && sb.CanCast(spell) {
						_ = sb.ConsumeCharge(spell.SpellLevel)
						switch spell.Effect {
						case "damage":
							for _, e := range g.enemies {
								if (ma.TargetID > 0 && e.ID != ma.TargetID) && spell.Target == "single_enemy" {
									continue
								}
								if e.CurrentHP <= 0 {
									continue
								}
								target := &magic.SpellTarget{}
								for _, m := range g.gd.Monsters {
									if m.Name == e.Name {
										target.Weaknesses = m.Weaknesses
										target.Resistances = m.Resistances
									}
								}
								dmg := magic.ResolveSpellDamage(spell, target, g.rng)
								e.CurrentHP -= dmg
								// Wake sleeping enemies on spell damage per Section 6.5.
								if dmg > 0 && e.Status == character.StatusSleep {
									combat.ProcessSleepOnDamage(e)
								}
								killed := e.CurrentHP <= 0
								if killed {
									e.CurrentHP = 0
									g.logCombat(
										fmt.Sprintf("%s casts %s on %s[%d] for %d damage - DEFEATED!", caster.Name, spell.Name, e.Name, e.ID, dmg),
										CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
											ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, TargetName: e.Name, Damage: dmg, Killed: true, SpellName: spell.Name})
								} else {
									g.logCombat(
										fmt.Sprintf("%s casts %s on %s[%d] for %d damage", caster.Name, spell.Name, e.Name, e.ID, dmg),
										CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
											ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, TargetName: e.Name, Damage: dmg, SpellName: spell.Name})
								}
								if spell.Target == "single_enemy" {
									break
								}
							}
						case "heal":
							amt := magic.ResolveHealSpell(spell, g.rng)
							g.resolveHealSpell(combatants, pc, caster, spell, ma.TargetID, amt)
						case "buff":
							g.resolveBuffSpell(combatants, pc, caster, spell, ma.TargetID)
						case "status":
							// Status effect spells (sleep, mute, poison_powder, slow)
							for _, e := range g.enemies {
								if (ma.TargetID > 0 && e.ID != ma.TargetID) && spell.Target == "single_enemy" {
									continue
								}
								if e.CurrentHP <= 0 {
									continue
								}
								if magic.ResolveStatusSpell(spell, e.VIT, g.rng) {
									combat.ApplyStatus(e, character.Status(spell.StatusEffect))
									g.logCombat(
										fmt.Sprintf("%s casts %s on %s[%d] - %s!", caster.Name, spell.Name, e.Name, e.ID, spell.StatusEffect),
										CombatActionEntry{Kind: "status_effect", ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, SpellName: spell.Name})
								} else {
									g.logCombat(
										fmt.Sprintf("%s casts %s on %s[%d] - resisted!", caster.Name, spell.Name, e.Name, e.ID),
										CombatActionEntry{Kind: "status_effect", ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, SpellName: spell.Name})
								}
								if spell.Target == "single_enemy" {
									break
								}
							}
						case "cure_status":
							// Cure status spells (cure_poison, dispel)
							if spell.Target == "all_allies" {
								for _, c := range g.party {
									if !c.IsAlive() {
										continue
									}
									if spell.CuresStatus == "all" {
										if c.Status != character.StatusNone && c.Status != character.StatusDeath {
											c.Status = character.StatusNone
										}
									} else if c.Status == character.Status(spell.CuresStatus) {
										c.Status = character.StatusNone
									}
								}
								g.logCombat(
									fmt.Sprintf("%s casts %s - statuses cured!", caster.Name, spell.Name),
									CombatActionEntry{Kind: "heal", ActorID: pc.ID, ActorName: caster.Name, SpellName: spell.Name})
							} else {
								// Single ally target
								targetIdx := ma.TargetID
								if targetIdx >= 0 && targetIdx < len(g.party) && g.party[targetIdx].IsAlive() {
									magic.ApplySpellToCharacter(g.party[targetIdx], spell, 0)
									g.logCombat(
										fmt.Sprintf("%s casts %s on %s - cured!", caster.Name, spell.Name, g.party[targetIdx].Name),
										CombatActionEntry{Kind: "heal", ActorID: pc.ID, ActorName: caster.Name, SpellName: spell.Name})
								}
							}
						}
					}
					continue // don't add a combat.Action for spells, already resolved
				}

			case "ability":
				// Dispatch a class ability through combat.ResolveTurn so it
				// respects AGI ordering and shares counter/buff machinery.
				var target *combat.Combatant
				if ma.TargetID > 0 {
					for _, e := range g.enemies {
						if e.ID == ma.TargetID && e.CurrentHP > 0 {
							target = e
							break
						}
					}
				}
				if target == nil {
					for _, e := range g.enemies {
						if e.CurrentHP > 0 {
							target = e
							break
						}
					}
				}
				targetID := 0
				if target != nil {
					targetID = target.ID
				}
				actions = append(actions, combat.Action{
					ActorID:   pc.ID,
					Kind:      combat.ActionAbility,
					TargetID:  targetID,
					AbilityID: ma.AbilityID,
				})

			default:
				// Physical attack
				var target *combat.Combatant
				if ma.TargetID > 0 {
					for _, e := range g.enemies {
						if e.ID == ma.TargetID && e.CurrentHP > 0 {
							target = e
							break
						}
					}
				}
				if target == nil {
					for _, e := range g.enemies {
						if e.CurrentHP > 0 {
							target = e
							break
						}
					}
				}
				if target != nil {
					actions = append(actions, combat.Action{ActorID: pc.ID, Kind: combat.ActionAttack, TargetID: target.ID})
				}
			}
		}
	} else {
		// Legacy single action -- all members attack same target
		for _, pc := range combatants {
			if pc.CurrentHP <= 0 {
				continue
			}
			var target *combat.Combatant
			if req.TargetID > 0 {
				for _, e := range g.enemies {
					if e.ID == req.TargetID && e.CurrentHP > 0 {
						target = e
						break
					}
				}
			}
			if target == nil {
				for _, e := range g.enemies {
					if e.CurrentHP > 0 {
						target = e
						break
					}
				}
			}
			if target != nil {
				actions = append(actions, combat.Action{ActorID: pc.ID, Kind: combat.ActionAttack, TargetID: target.ID})
			}
		}
	}

	// Enemy attacks
	for _, e := range g.enemies {
		if e.CurrentHP <= 0 || e.Status == character.StatusSleep || e.Status == character.StatusStone || e.Status == character.StatusDeath {
			continue
		}
		target := combat.SelectEnemyTarget(combatants, g.rng)
		if target != nil {
			actions = append(actions, combat.Action{ActorID: e.ID, Kind: combat.ActionAttack, TargetID: target.ID})
		}
	}

	// Remember which slot issued which ability so we can attribute steal
	// outcomes and ability log lines after ResolveTurn.
	abilityByActor := make(map[int]string, len(req.Actions))
	for _, ma := range req.Actions {
		if ma.Type == "ability" && ma.Slot >= 0 && ma.Slot < len(combatants) {
			abilityByActor[combatants[ma.Slot].ID] = ma.AbilityID
		}
	}

	results := combat.ResolveTurn(combatants, g.enemies, actions, stats, g.rng)
	for _, r := range results {
		switch r.Kind {
		case combat.ActionPoisonTick:
			status := ""
			if r.Killed {
				status = " - DEFEATED!"
			}
			g.logCombat(
				fmt.Sprintf("%s takes %d poison damage%s", r.ActorName, r.TotalDmg, status),
				CombatActionEntry{Kind: "poison_tick",
					ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg, Killed: r.Killed})
		case combat.ActionConfusion:
			targetName := g.findCombatantName(combatants, r.TargetID)
			if targetName == "?" {
				// Target might be an enemy
				for _, e := range g.enemies {
					if e.ID == r.TargetID {
						targetName = e.Name
						break
					}
				}
			}
			status := ""
			if r.Killed {
				status = " - DEFEATED!"
			}
			g.logCombat(
				fmt.Sprintf("%s is confused and attacks %s[%d] for %d damage%s",
					r.ActorName, targetName, r.TargetID, r.TotalDmg, status),
				CombatActionEntry{Kind: "confusion", DamageType: "physical",
					ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg, Killed: r.Killed})
		case combat.ActionCounter:
			if r.TotalDmg > 0 {
				targetName := g.findCombatantName(combatants, r.TargetID)
				status := ""
				if r.Killed {
					status = " - DEFEATED!"
				}
				g.logCombat(
					fmt.Sprintf("%s counter-attacks %s[%d] for %d damage%s",
						r.ActorName, targetName, r.TargetID, r.TotalDmg, status),
					CombatActionEntry{Kind: "counter", DamageType: "physical",
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, TargetName: targetName,
						Damage: r.TotalDmg, Killed: r.Killed, Crit: anyCrit(r.Hits), Missed: allMissed(r.Hits), Hits: toHitEntries(r.Hits)})
			}
		case combat.ActionAbility:
			abilityID := abilityByActor[r.ActorID]
			targetName := g.findCombatantName(combatants, r.TargetID)
			switch abilityID {
			case "focus":
				g.logCombat(
					fmt.Sprintf("%s focuses - next attacks hit harder!", r.ActorName),
					CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName})
			case "counter":
				g.logCombat(
					fmt.Sprintf("%s braces to counter!", r.ActorName),
					CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName})
			case "inspire":
				g.logCombat(
					fmt.Sprintf("%s inspires the party!", r.ActorName),
					CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName})
			case "backstab":
				status := ""
				if r.Killed {
					status = " - DEFEATED!"
				}
				g.logCombat(
					fmt.Sprintf("%s backstabs %s for %d damage%s",
						r.ActorName, targetName, r.TotalDmg, status),
					CombatActionEntry{Kind: "ability", DamageType: "physical",
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, TargetName: targetName,
						Damage: r.TotalDmg, Killed: r.Killed, Crit: anyCrit(r.Hits), Hits: toHitEntries(r.Hits)})
			case "steal":
				if itemID, itemName, ok := g.tryStealFrom(r.TargetID); ok {
					g.inv.Consumables[itemID]++
					g.logCombat(
						fmt.Sprintf("%s steals %s from %s!", r.ActorName, itemName, targetName),
						CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID})
				} else {
					g.logCombat(
						fmt.Sprintf("%s tries to steal from %s but finds nothing.", r.ActorName, targetName),
						CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID})
				}
			default:
				g.logCombat(
					fmt.Sprintf("%s uses an ability.", r.ActorName),
					CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName})
			}
		default:
			if r.TotalDmg > 0 {
				targetName := g.findCombatantName(combatants, r.TargetID)
				status := ""
				if r.Killed {
					status = " - DEFEATED!"
				}
				g.logCombat(
					fmt.Sprintf("%s attacks %s[%d] for %d damage%s",
						r.ActorName, targetName, r.TargetID, r.TotalDmg, status),
					CombatActionEntry{Kind: "attack", DamageType: "physical",
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, TargetName: targetName,
						Damage: r.TotalDmg, Killed: r.Killed, Crit: anyCrit(r.Hits), Missed: allMissed(r.Hits), Hits: toHitEntries(r.Hits)})
			}
		}
	}

	// Sync HP back
	for i, pc := range combatants {
		g.party[i].CurrentHP = pc.CurrentHP
		g.party[i].Status = pc.Status
	}

	if combat.CheckVictory(g.enemies) {
		totalXP, totalGold := 0, 0
		var drops []string
		for _, e := range g.enemies {
			for _, m := range g.gd.Monsters {
				if m.Name == e.Name {
					totalXP += m.XPReward
					totalGold += m.GoldReward
					// Roll drops
					for _, drop := range m.Drops {
						if g.rng.IntN(100) < drop.ChancePct {
							drops = append(drops, drop.ItemID)
						}
					}
					break
				}
			}
		}
		g.inv.Gold += totalGold
		// Add dropped items to inventory
		for _, itemID := range drops {
			g.inv.Consumables[itemID]++
			// Find item name for log
			itemName := itemID
			for _, c := range g.gd.Items.Consumables {
				if c.ID == itemID {
					itemName = c.Name
					break
				}
			}
			if w := g.gd.WeaponByID(itemID); w != nil {
				itemName = w.Name
			}
			g.logCombat(fmt.Sprintf("Found: %s!", itemName), CombatActionEntry{Kind: "info"})
		}
		living := 0
		for _, c := range g.party {
			if c.IsAlive() {
				living++
			}
		}
		if living > 0 {
			each := totalXP / living
			for _, c := range g.party {
				if c.IsAlive() {
					c.XP += each
				}
			}
		}
		g.logCombat(fmt.Sprintf("Victory! +%d XP, +%d gold", totalXP, totalGold), CombatActionEntry{Kind: "info"})
		g.checkLevelUps()
		g.enemies = nil
		g.spellBuffs = nil

		// Complete current quest
		if g.currentQ < len(g.quests) {
			q := &g.quests[g.currentQ]
			q.Completed = true
			g.inv.Gold += q.Reward.Gold
			for _, c := range g.party {
				if c.IsAlive() {
					c.XP += q.Reward.XP
				}
			}
			g.checkLevelUps()
			g.logCombat(
				fmt.Sprintf("Quest complete: %s (+%d XP, +%d gold)", q.Name, q.Reward.XP, q.Reward.Gold),
				CombatActionEntry{Kind: "info"})
			g.restParty()
			completedIdx := g.currentQ
			g.currentQ++
			if promoMsg := g.applyPromotionIfNeeded(completedIdx); promoMsg != "" {
				g.logCombat(promoMsg, CombatActionEntry{Kind: "info"})
				g.message = promoMsg
			}
			if tierName := g.checkTransportUnlocks(); tierName != "" {
				g.logCombat(fmt.Sprintf("Transport upgraded: %s!", tierName), CombatActionEntry{Kind: "info"})
			}
		}

		if g.currentQ >= len(g.quests) {
			g.phase = "victory"
			g.message = fmt.Sprintf("%s is saved!", g.loc.Name)
		} else {
			g.phase = "quest_complete"
			g.maybeTriggerPromotion()
		}
	} else if combat.CheckDefeat(combatants) {
		g.phase = "defeat"
		g.message = "Your party has fallen. Game over."
		g.spellBuffs = nil
	}

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) processCombatSpell(req GameActionRequest) (*GameState, error) { //nolint:unused
	spell := g.gd.SpellByID(req.SpellID)
	if spell == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("spell not found")
	}

	// Find caster
	var caster *character.Character
	for _, c := range g.party {
		if sb, ok := g.spellBooks[c.Name]; ok && sb.CanCast(spell) {
			caster = c
			_ = sb.ConsumeCharge(spell.SpellLevel)
			break
		}
	}
	if caster == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("no caster available")
	}

	switch spell.Effect {
	case "damage":
		target := &magic.SpellTarget{}
		for _, e := range g.enemies {
			if e.CurrentHP > 0 {
				for _, m := range g.gd.Monsters {
					if m.Name == e.Name {
						target.Weaknesses = m.Weaknesses
						target.Resistances = m.Resistances
					}
				}
				dmg := magic.ResolveSpellDamage(spell, target, g.rng)
				e.CurrentHP -= dmg
				killed := e.CurrentHP <= 0
				if killed {
					e.CurrentHP = 0
					g.logCombat(
						fmt.Sprintf("%s casts %s on %s for %d - DEFEATED!", caster.Name, spell.Name, e.Name, dmg),
						CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
							ActorName: caster.Name, TargetID: e.ID, Damage: dmg, Killed: true, SpellName: spell.Name})
				} else {
					g.logCombat(
						fmt.Sprintf("%s casts %s on %s for %d (HP:%d)", caster.Name, spell.Name, e.Name, dmg, e.CurrentHP),
						CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
							ActorName: caster.Name, TargetID: e.ID, Damage: dmg, SpellName: spell.Name})
				}
				if spell.Target == "single_enemy" {
					break
				}
			}
		}
	case "heal":
		amt := magic.ResolveHealSpell(spell, g.rng)
		// Heal most damaged
		var target *character.Character
		for _, c := range g.party {
			if c.IsAlive() && (target == nil || c.CurrentHP < target.CurrentHP) {
				target = c
			}
		}
		if target != nil {
			target.Heal(amt)
			g.logCombat(
				fmt.Sprintf("%s casts %s on %s for %d HP", caster.Name, spell.Name, target.Name, amt),
				CombatActionEntry{Kind: "heal", ActorName: caster.Name, Damage: amt, SpellName: spell.Name})
		}
	}

	// Enemy turn after spell
	combatants := g.makeCombatants()
	var enemyActions []combat.Action
	for _, e := range g.enemies {
		if e.CurrentHP <= 0 {
			continue
		}
		target := combat.SelectEnemyTarget(combatants, g.rng)
		if target != nil {
			enemyActions = append(enemyActions, combat.Action{ActorID: e.ID, Kind: combat.ActionAttack, TargetID: target.ID})
		}
	}
	if len(enemyActions) > 0 {
		results := combat.ResolveTurn(combatants, g.enemies, enemyActions, &g.gd.Stats.Combat, g.rng)
		for _, r := range results {
			if r.TotalDmg > 0 {
				name := g.findCombatantName(combatants, r.TargetID)
				status := ""
				if r.Killed {
					status = " - DEFEATED!"
				}
				g.logCombat(
					fmt.Sprintf("%s attacks %s for %d%s", r.ActorName, name, r.TotalDmg, status),
					CombatActionEntry{Kind: "attack", DamageType: "physical",
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, TargetName: name,
						Damage: r.TotalDmg, Killed: r.Killed, Crit: anyCrit(r.Hits), Missed: allMissed(r.Hits), Hits: toHitEntries(r.Hits)})
			}
		}
		for i, pc := range combatants {
			g.party[i].CurrentHP = pc.CurrentHP
			g.party[i].Status = pc.Status
		}
	}

	if combat.CheckVictory(g.enemies) {
		g.logCombat("Victory!", CombatActionEntry{Kind: "info"})
		g.enemies = nil
		g.spellBuffs = nil
		if g.currentQ < len(g.quests) {
			g.quests[g.currentQ].Completed = true
			completedIdx := g.currentQ
			g.currentQ++
			if promoMsg := g.applyPromotionIfNeeded(completedIdx); promoMsg != "" {
				g.logCombat(promoMsg, CombatActionEntry{Kind: "info"})
				g.message = promoMsg
			}
			if tierName := g.checkTransportUnlocks(); tierName != "" {
				g.logCombat(fmt.Sprintf("Transport upgraded: %s!", tierName), CombatActionEntry{Kind: "info"})
			}
		}
		g.restParty()
		g.checkLevelUps()
		if g.currentQ >= len(g.quests) {
			g.phase = "victory"
		} else {
			g.phase = "quest_complete"
		}
	} else if combat.CheckDefeat(combatants) {
		g.phase = "defeat"
		g.message = "Your party has fallen."
		g.spellBuffs = nil
	}

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) processCombatItem(req GameActionRequest) (*GameState, error) {
	if g.inv.Consumables["potion"] <= 0 {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("no potions")
	}
	g.inv.Consumables["potion"]--

	// Heal most damaged party member
	var target *character.Character
	for _, c := range g.party {
		if c.IsAlive() && (target == nil || c.CurrentHP < target.CurrentHP) {
			target = c
		}
	}
	if target != nil {
		target.Heal(30)
		g.logCombat(
			fmt.Sprintf("%s uses Potion - healed 30 HP (HP:%d/%d)", target.Name, target.CurrentHP, target.MaxHP),
			CombatActionEntry{Kind: "item", ActorName: target.Name})
	}

	// Enemy turn
	combatants := g.makeCombatants()
	var enemyActions []combat.Action
	for _, e := range g.enemies {
		if e.CurrentHP <= 0 {
			continue
		}
		t := combat.SelectEnemyTarget(combatants, g.rng)
		if t != nil {
			enemyActions = append(enemyActions, combat.Action{ActorID: e.ID, Kind: combat.ActionAttack, TargetID: t.ID})
		}
	}
	if len(enemyActions) > 0 {
		results := combat.ResolveTurn(combatants, g.enemies, enemyActions, &g.gd.Stats.Combat, g.rng)
		for _, r := range results {
			if r.TotalDmg > 0 {
				name := g.findCombatantName(combatants, r.TargetID)
				g.logCombat(
					fmt.Sprintf("%s attacks %s for %d", r.ActorName, name, r.TotalDmg),
					CombatActionEntry{Kind: "attack", DamageType: "physical",
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, TargetName: name,
						Damage: r.TotalDmg, Killed: r.Killed, Crit: anyCrit(r.Hits), Missed: allMissed(r.Hits), Hits: toHitEntries(r.Hits)})
			}
		}
		for i, pc := range combatants {
			g.party[i].CurrentHP = pc.CurrentHP
			g.party[i].Status = pc.Status
		}
	}

	state := g.stateUnlocked()
	return &state, nil
}

// tryStealFrom rolls the enemy's drop table for the Rogue Steal ability.
// A successful roll returns (itemID, displayName, true) and the caller adds
// the item to the inventory. Steal uses the same probabilities as the
// post-victory drop table — rogues get multiple chances per fight, so flat
// rates are already generous.
func (g *Game) tryStealFrom(targetID int) (string, string, bool) {
	var enemy *combat.Combatant
	for _, e := range g.enemies {
		if e.ID == targetID {
			enemy = e
			break
		}
	}
	if enemy == nil {
		return "", "", false
	}
	var drops []string
	for _, m := range g.gd.Monsters {
		if m.Name == enemy.Name {
			for _, drop := range m.Drops {
				if g.rng.IntN(100) < drop.ChancePct {
					drops = append(drops, drop.ItemID)
				}
			}
			break
		}
	}
	if len(drops) == 0 {
		return "", "", false
	}
	itemID := drops[g.rng.IntN(len(drops))]
	itemName := itemID
	for _, c := range g.gd.Items.Consumables {
		if c.ID == itemID {
			itemName = c.Name
			break
		}
	}
	if w := g.gd.WeaponByID(itemID); w != nil {
		itemName = w.Name
	}
	return itemID, itemName, true
}

// resolveHealSpell applies a heal-effect spell to the appropriate target based
// on spell.Target and the incoming ma.TargetID.
//
// Target interpretation:
//   - single_ally: targetID is a party slot (0..len(party)-1); heal that ally.
//   - all_allies:  heal every living party member.
//   - enemy ID (>= 100): Cure on an undead enemy deals damage equal to the
//     heal amount (per FF1 canon). Non-undead enemies are a no-op.
//
// Heals are applied to the combatant, not directly to g.party, so the
// sync-back in processCombatAction picks them up correctly.
func (g *Game) resolveHealSpell(
	combatants []*combat.Combatant,
	pc *combat.Combatant,
	caster *character.Character,
	spell *gamedata.Spell,
	targetID int,
	amt int,
) {
	// Undead-cure: single_ally heals can be cast on an undead enemy for damage
	// (FF1 canon). Gate on spell.Target so all_allies heals always loop over
	// the party even if a bogus targetID slips in.
	if spell.Target == "single_ally" && targetID >= 100 {
		var target *combat.Combatant
		for _, e := range g.enemies {
			if e.ID == targetID && e.CurrentHP > 0 {
				target = e
				break
			}
		}
		if target == nil {
			g.logCombat(
				fmt.Sprintf("%s casts %s - target missing!", caster.Name, spell.Name),
				CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: caster.Name, SpellName: spell.Name})
			return
		}
		var monsterDef *gamedata.Monster
		for i := range g.gd.Monsters {
			if g.gd.Monsters[i].Name == target.Name {
				monsterDef = &g.gd.Monsters[i]
				break
			}
		}
		if monsterDef == nil || !monsterDef.IsUndead {
			g.logCombat(
				fmt.Sprintf("%s casts %s on %s - no effect.", caster.Name, spell.Name, target.Name),
				CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: caster.Name, TargetID: target.ID, TargetName: target.Name, SpellName: spell.Name})
			return
		}
		target.CurrentHP -= amt
		killed := target.CurrentHP <= 0
		if killed {
			target.CurrentHP = 0
		}
		msg := fmt.Sprintf("%s casts %s on %s[%d] for %d damage", caster.Name, spell.Name, target.Name, target.ID, amt)
		if killed {
			msg += " - DEFEATED!"
		}
		g.logCombat(msg,
			CombatActionEntry{Kind: "spell", Element: "holy", DamageType: "magical",
				ActorID: pc.ID, ActorName: caster.Name, TargetID: target.ID, TargetName: target.Name,
				Damage: amt, Killed: killed, SpellName: spell.Name})
		return
	}

	healAlly := func(slot int) {
		cb := combatants[slot]
		cb.CurrentHP += amt
		if cb.CurrentHP > cb.MaxHP {
			cb.CurrentHP = cb.MaxHP
		}
		g.logCombat(
			fmt.Sprintf("%s casts %s on %s - healed %d HP", caster.Name, spell.Name, g.party[slot].Name, amt),
			CombatActionEntry{Kind: "heal", ActorID: pc.ID, ActorName: caster.Name,
				TargetID: slot, TargetName: g.party[slot].Name, Damage: amt, SpellName: spell.Name})
	}

	if spell.Target == "all_allies" {
		for i, c := range g.party {
			if !c.IsAlive() {
				continue
			}
			healAlly(i)
		}
		return
	}

	// single_ally (default): use targetID as a party slot index.
	if targetID < 0 || targetID >= len(g.party) || !g.party[targetID].IsAlive() {
		g.logCombat(
			fmt.Sprintf("%s casts %s - no valid target!", caster.Name, spell.Name),
			CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: caster.Name, SpellName: spell.Name})
		return
	}
	healAlly(targetID)
}

// resolveBuffSpell installs a combat-duration stat buff on the targeted ally.
// Buffs persist across rounds via g.spellBuffs (indexed by party slot) and are
// re-applied to combatants at the start of each round via makeCombatants.
// The buff is also applied to the current round's combatant so it affects
// this round's attack resolution.
func (g *Game) resolveBuffSpell(
	combatants []*combat.Combatant,
	pc *combat.Combatant,
	caster *character.Character,
	spell *gamedata.Spell,
	targetID int,
) {
	buff := combat.CombatBuff{Kind: "spell_" + spell.ID, TurnsLeft: 999}
	switch spell.BuffStat {
	case "hit_pct":
		buff.HitPctBonus = spell.Power
	case "armor_absorb":
		// Power is expressed as "% bonus over base", so power=100 means +100%
		// (i.e. double armor -- matches Aegis' "doubles armor" description).
		buff.ArmorAbsorbMult = 100 + spell.Power
	default:
		// Unknown buff_stat: still consume the charge but log a warning line.
		g.logCombat(
			fmt.Sprintf("%s casts %s - (no stat effect configured)", caster.Name, spell.Name),
			CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: caster.Name, SpellName: spell.Name})
		return
	}

	apply := func(slot int) {
		if g.spellBuffs == nil {
			g.spellBuffs = make(map[int][]combat.CombatBuff)
		}
		existing := g.spellBuffs[slot]
		replaced := false
		for i := range existing {
			if existing[i].Kind == buff.Kind {
				existing[i] = buff
				replaced = true
				break
			}
		}
		if !replaced {
			existing = append(existing, buff)
		}
		g.spellBuffs[slot] = existing
		// Apply live to this round's combatant too so the buff takes effect
		// immediately instead of waiting for next round's makeCombatants().
		// Replace an existing buff of the same kind rather than stacking,
		// otherwise a recast doubles the bonus for the current round (the
		// persistent list already carried one copy in via makeCombatants).
		live := combatants[slot].Buffs
		replacedLive := false
		for i := range live {
			if live[i].Kind == buff.Kind {
				live[i] = buff
				replacedLive = true
				break
			}
		}
		if !replacedLive {
			live = append(live, buff)
		}
		combatants[slot].Buffs = live
		g.logCombat(
			fmt.Sprintf("%s casts %s on %s", caster.Name, spell.Name, g.party[slot].Name),
			CombatActionEntry{Kind: "spell", ActorID: pc.ID, ActorName: caster.Name,
				TargetID: slot, TargetName: g.party[slot].Name, SpellName: spell.Name})
	}

	if spell.Target == "all_allies" {
		for i, c := range g.party {
			if c.IsAlive() {
				apply(i)
			}
		}
		return
	}

	if targetID < 0 || targetID >= len(g.party) || !g.party[targetID].IsAlive() {
		g.logCombat(
			fmt.Sprintf("%s casts %s - no valid target!", caster.Name, spell.Name),
			CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: caster.Name, SpellName: spell.Name})
		return
	}
	apply(targetID)
}
