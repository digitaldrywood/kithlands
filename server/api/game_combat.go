package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

func (g *Game) processCombatAction(req GameActionRequest) (*GameState, error) {
	stats := &g.gd.Stats.Combat

	// Handle flee
	if req.Type == "flee" {
		if g.rng.IntN(100) < 40 {
			g.phase = "world"
			g.message = "Got away safely!"
			g.enemies = nil
			g.formation = ""
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
							CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name, TargetID: targetIdx})
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
								CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name})
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
							CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name, TargetID: targetIdx})
					}
				}
				continue

			case "spell":
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
								killed := e.CurrentHP <= 0
								if killed {
									e.CurrentHP = 0
									g.logCombat(
										fmt.Sprintf("%s casts %s on %s[%d] for %d damage - DEFEATED!", caster.Name, spell.Name, e.Name, e.ID, dmg),
										CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
											ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, Damage: dmg, Killed: true, SpellName: spell.Name})
								} else {
									g.logCombat(
										fmt.Sprintf("%s casts %s on %s[%d] for %d damage", caster.Name, spell.Name, e.Name, e.ID, dmg),
										CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
											ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, Damage: dmg, SpellName: spell.Name})
								}
								if spell.Target == "single_enemy" {
									break
								}
							}
						case "heal":
							amt := magic.ResolveHealSpell(spell, g.rng)
							var healTarget *character.Character
							for _, c := range g.party {
								if c.IsAlive() && (healTarget == nil || c.CurrentHP < healTarget.CurrentHP) {
									healTarget = c
								}
							}
							if healTarget != nil {
								healTarget.Heal(amt)
								g.logCombat(
									fmt.Sprintf("%s casts %s - healed %d HP", caster.Name, spell.Name, amt),
									CombatActionEntry{Kind: "heal", ActorID: pc.ID, ActorName: caster.Name, Damage: amt, SpellName: spell.Name})
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
		if e.CurrentHP <= 0 || e.Status == character.StatusSleep {
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
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg, Killed: r.Killed})
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
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg, Killed: r.Killed})
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
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg, Killed: r.Killed})
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
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg, Killed: r.Killed})
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
		if g.currentQ < len(g.quests) {
			g.quests[g.currentQ].Completed = true
			completedIdx := g.currentQ
			g.currentQ++
			if promoMsg := g.applyPromotionIfNeeded(completedIdx); promoMsg != "" {
				g.logCombat(promoMsg, CombatActionEntry{Kind: "info"})
				g.message = promoMsg
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
						ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg})
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
