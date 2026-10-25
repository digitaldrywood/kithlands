package api

import (
	"fmt"
	"sort"

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

func resolveSpellTargetMode(spell *gamedata.Spell, requested string) string {
	if spell == nil {
		return ""
	}
	if requested == "" || requested == spell.Target {
		return spell.Target
	}
	for _, mode := range spell.TargetModes {
		if mode == requested {
			return mode
		}
	}
	return spell.Target
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

func spellCombatAction(spell *gamedata.Spell, action CombatActionEntry) CombatActionEntry {
	if spell == nil {
		return action
	}
	action.ActionID = spell.ID
	action.ActionName = spell.Name
	action.CinematicTier = spell.CinematicTier
	action.TargetMode = spell.Target
	action.Presentation = spell.Presentation
	if action.SpellName == "" {
		action.SpellName = spell.Name
	}
	return action
}

func (g *Game) abilityCombatAction(abilityID string, action CombatActionEntry) CombatActionEntry {
	ability := g.gd.AbilityByID(abilityID)
	if ability == nil {
		return action
	}
	action.ActionID = ability.ID
	action.ActionName = ability.Name
	action.CinematicTier = ability.CinematicTier
	action.TargetMode = ability.Target
	action.Presentation = ability.Presentation
	return action
}

type scheduledRoundActionKind string

const (
	scheduledRoundActionCombat scheduledRoundActionKind = "combat"
	scheduledRoundActionSpell  scheduledRoundActionKind = "spell"
)

type scheduledRoundAction struct {
	kind         scheduledRoundActionKind
	initiative   int
	combatAction combat.Action
	memberAction MemberActionReq
}

func buildScheduledTurnOrderPriorities(
	party []*combat.Combatant,
	enemies []*combat.Combatant,
) map[int]int {
	priorities := make(map[int]int, len(party)+len(enemies))
	for slot, combatant := range party {
		if combatant != nil {
			priorities[combatant.ID] = slot
		}
	}
	base := len(party)
	for idx, combatant := range enemies {
		if combatant != nil {
			priorities[combatant.ID] = base + idx
		}
	}
	return priorities
}

func sortScheduledRoundActions(
	actions []scheduledRoundAction,
	party []*combat.Combatant,
	enemies []*combat.Combatant,
) {
	priorities := buildScheduledTurnOrderPriorities(party, enemies)
	sort.SliceStable(actions, func(i, j int) bool {
		if actions[i].initiative != actions[j].initiative {
			return actions[i].initiative > actions[j].initiative
		}
		left := actions[i].combatAction.ActorID
		right := actions[j].combatAction.ActorID
		leftPriority, leftOK := priorities[left]
		rightPriority, rightOK := priorities[right]
		if leftOK && rightOK && leftPriority != rightPriority {
			return leftPriority < rightPriority
		}
		return left < right
	})
}

func (g *Game) processCombatAction(req GameActionRequest) (*GameState, error) {
	stats := &g.gd.Stats.Combat

	// Handle flee
	if req.Type == "flee" {
		if g.rng.IntN(100) < 40 {
			g.phase = "world"
			g.message = "Got away safely!"
			g.leaveFinalEncounter(false)
			if g.inDungeon() {
				g.dungeon.EncounterID = ""
			}
			g.enemies = nil
			g.formation = ""
			g.spellBuffs = nil
			g.clearPendingChestClaimUnlocked()
			g.resetEncounterStartState()
			state := g.stateUnlocked()
			return &state, nil
		}
		g.logCombat("Couldn't escape!", CombatActionEntry{Kind: "info"})
		// Enemies still attack after failed flee -- fall through
	}

	// Handle item (potion) -- use and then enemies attack
	if req.Type == "item" && (g.combatRound != 0 || g.encounterStart != combat.EncounterStartAmbush) {
		return g.processCombatItem(req)
	}

	// "wait" is submitted by the client when the party is stunned for a
	// round (e.g. the first round of an ambush). The party contributes no
	// actions; enemies act normally.
	skipParty := req.Type == "wait" || req.Type == "flee" ||
		(g.combatRound == 0 && g.encounterStart == combat.EncounterStartAmbush)
	if !skipParty {
		seenSlots := make(map[int]bool, len(req.Actions))
		for _, action := range req.Actions {
			if action.Slot < 0 || action.Slot >= len(g.party) {
				continue
			}
			if seenSlots[action.Slot] {
				state := g.stateUnlocked()
				return &state, fmt.Errorf("choose only one action for party slot %d", action.Slot+1)
			}
			seenSlots[action.Slot] = true
		}
	}

	combatants := g.makeCombatants()

	// Build party actions from per-member actions if provided
	var roundActions []scheduledRoundAction

	// Revives (Phoenix Down / raise) that fire during the per-member loop.
	// We deliberately do NOT mutate combatants[targetIdx] — that would let a
	// dead member's own queued action slip into ResolveTurn this round, which
	// breaks JRPG convention ("revived allies sit out the turn they're
	// revived on"). Instead we record the revive here and re-apply it to
	// g.party AFTER the end-of-round sync-back below.
	var revivedThisTurn []bool

	if skipParty {
		// Party is frozen this round (ambush). Build no actions.
	} else if len(req.Actions) > 0 {
		// Per-member actions from client
		for _, ma := range req.Actions {
			if ma.Slot < 0 || ma.Slot >= len(combatants) {
				continue
			}
			pc := combatants[ma.Slot]
			if pc.CurrentHP <= 0 {
				continue
			}
			initiative := combat.RollInitiative(pc.AGI, g.rng)

			switch ma.Type {
			case "item":
				itemID := ma.ItemID
				if itemID == "" {
					itemID = "potion"
				}
				// Peek at the consumable so we can reject non-battle items
				// (e.g. Tent) before debiting inventory.
				if def := g.findConsumable(itemID); def != nil && !def.CombatUsable {
					g.logCombat(
						fmt.Sprintf("%s cannot be used in battle!", def.Name),
						CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name})
					continue
				}
				consumable, useErr := g.inv.UseConsumable(itemID, g.gd)
				if useErr != nil {
					continue
				}
				actorName := g.party[ma.Slot].Name
				targetIdx := ma.TargetID
				switch consumable.Effect {
				case "heal":
					target := pickHealTarget(g.party, targetIdx)
					if target != nil {
						target.Heal(consumable.Value)
						g.logCombat(
							fmt.Sprintf("%s uses %s on %s - healed %d HP (%d/%d)",
								actorName, consumable.Name, target.Name, consumable.Value, target.CurrentHP, target.MaxHP),
							CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: actorName, TargetName: target.Name, Damage: consumable.Value})
					}
				case "restore_mp":
					target := pickMPTarget(g.party, targetIdx)
					if target == nil {
						// No valid caster target — refund item.
						g.inv.Consumables[itemID]++
						continue
					}
					if target.CurrentMP >= target.MaxMP {
						// Full MP — refund item, do not consume turn's side effects.
						g.inv.Consumables[itemID]++
						g.logCombat(
							fmt.Sprintf("%s's MP is already full!", target.Name),
							CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: actorName, TargetName: target.Name})
						continue
					}
					before := target.CurrentMP
					target.RestoreMP(consumable.Value)
					restored := target.CurrentMP - before
					g.logCombat(
						fmt.Sprintf("%s uses %s on %s - restored %d MP (%d/%d)",
							actorName, consumable.Name, target.Name, restored, target.CurrentMP, target.MaxMP),
						CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: actorName, TargetName: target.Name, Damage: restored})
				case "cure_poison":
					g.applyCombatCure(combatants, pc, ma.Slot, targetIdx, consumable, character.StatusPoison, itemID)
				case "cure_silence":
					g.applyCombatCure(combatants, pc, ma.Slot, targetIdx, consumable, character.StatusSilence, itemID)
				case "cure_stone":
					g.applyCombatCure(combatants, pc, ma.Slot, targetIdx, consumable, character.StatusStone, itemID)
				}
				continue

			case "revive":
				// Use Phoenix Down on dead party member. We only record the
				// revive here; the actual HP/status mutation happens AFTER
				// ResolveTurn's sync-back loop. See the matching apply block
				// below. This keeps combatants[targetIdx] dead during the
				// current round so (a) the revived member cannot act this
				// round, matching JRPG convention, and (b) no subsequent
				// per-member action for that slot can slip through the
				// "pc.CurrentHP <= 0" guard at the top of this loop.
				if g.inv.Consumables["phoenix_down"] <= 0 {
					continue
				}
				targetIdx := ma.TargetID
				if targetIdx < 0 || targetIdx >= len(g.party) {
					continue
				}
				if !g.party[targetIdx].IsAlive() {
					if len(revivedThisTurn) == 0 {
						revivedThisTurn = make([]bool, len(g.party))
					}
					// Guard against double-consumption if the client queues
					// two revives targeting the same slot in one round.
					if revivedThisTurn[targetIdx] {
						continue
					}
					g.inv.Consumables["phoenix_down"]--
					revivedThisTurn[targetIdx] = true
					g.logCombat(
						fmt.Sprintf("%s uses Phoenix Down on %s - revived with 1 HP!",
							g.party[ma.Slot].Name, g.party[targetIdx].Name),
						CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: g.party[ma.Slot].Name, TargetID: targetIdx, TargetName: g.party[targetIdx].Name})
				}
				continue

			case "spell":
				spell := g.gd.SpellByID(ma.SpellID)
				if spell == nil {
					continue
				}
				roundActions = append(roundActions, scheduledRoundAction{
					kind:       scheduledRoundActionSpell,
					initiative: initiative,
					combatAction: combat.Action{
						ActorID:    pc.ID,
						Initiative: initiative,
					},
					memberAction: ma,
				})
				continue

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
				ignoreRow := false
				if ability := g.gd.AbilityByID(ma.AbilityID); ability != nil {
					ignoreRow = ability.IgnoresRow
				}
				roundActions = append(roundActions, scheduledRoundAction{
					kind:       scheduledRoundActionCombat,
					initiative: initiative,
					combatAction: combat.Action{
						ActorID:    pc.ID,
						Kind:       combat.ActionAbility,
						TargetID:   targetID,
						AbilityID:  ma.AbilityID,
						IgnoreRow:  ignoreRow,
						Initiative: initiative,
					},
				})

			case "defend":
				roundActions = append(roundActions, scheduledRoundAction{
					kind:       scheduledRoundActionCombat,
					initiative: initiative,
					combatAction: combat.Action{
						ActorID:    pc.ID,
						Kind:       combat.ActionDefend,
						Initiative: initiative,
					},
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
					roundActions = append(roundActions, scheduledRoundAction{
						kind:       scheduledRoundActionCombat,
						initiative: initiative,
						combatAction: combat.Action{
							ActorID:    pc.ID,
							Kind:       combat.ActionAttack,
							TargetID:   target.ID,
							Initiative: initiative,
						},
					})
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
				initiative := combat.RollInitiative(pc.AGI, g.rng)
				roundActions = append(roundActions, scheduledRoundAction{
					kind:       scheduledRoundActionCombat,
					initiative: initiative,
					combatAction: combat.Action{
						ActorID:    pc.ID,
						Kind:       combat.ActionAttack,
						TargetID:   target.ID,
						Initiative: initiative,
					},
				})
			}
		}
	}

	// Defensive: if the encounter started with an ambush, strip any party
	// actions the client may have submitted for round 1. The UI auto-sends
	// a "wait" action in this case, but drop stragglers server-side.
	if g.combatRound == 0 && g.encounterStart == combat.EncounterStartAmbush {
		roundActions = roundActions[:0]
	}

	for _, action := range g.planEnemyActions(combatants) {
		action.Initiative = combat.RollInitiative(g.enemyAgility(action.ActorID), g.rng)
		roundActions = append(roundActions, scheduledRoundAction{
			kind: scheduledRoundActionCombat, initiative: action.Initiative, combatAction: action,
		})
	}

	// Remember which slot issued which ability so we can attribute steal
	// outcomes and ability log lines after ResolveTurn.
	abilityByActor := g.enemyAbilityPlans()
	for _, ma := range req.Actions {
		if ma.Type == "ability" && ma.Slot >= 0 && ma.Slot < len(combatants) {
			abilityByActor[combatants[ma.Slot].ID] = ma.AbilityID
		}
	}

	sortScheduledRoundActions(roundActions, combatants, g.enemies)
	defenses := make([]combat.Action, 0, len(roundActions))
	for _, action := range roundActions {
		if action.kind == scheduledRoundActionCombat {
			defenses = append(defenses, action.combatAction)
		}
	}
	combat.PrepareRoundDefenses(combatants, g.enemies, defenses)

	for _, r := range combat.ResolveRoundStart(combatants, g.enemies) {
		g.logResolvedCombatAction(combatants, abilityByActor, r)
	}
	for _, action := range roundActions {
		if combat.CheckVictory(g.enemies) || combat.CheckDefeat(combatants) {
			break
		}
		switch action.kind {
		case scheduledRoundActionSpell:
			g.resolveScheduledSpell(combatants, action.memberAction)
		default:
			for _, resolved := range combat.ResolveAction(combatants, g.enemies, action.combatAction, stats, g.rng) {
				g.logResolvedCombatAction(combatants, abilityByActor, resolved)
			}
		}
	}
	combat.TickBuffs(combatants, g.enemies)
	if len(req.Actions) > 0 {
		g.lastRoundActions = cloneMemberActionReqs(req.Actions)
	}
	g.combatRound++

	// Sync HP back
	for i, pc := range combatants {
		g.party[i].CurrentHP = pc.CurrentHP
		g.party[i].Status = pc.Status
	}
	// Apply mid-round revives AFTER the sync-back. A revived member sat out
	// ResolveTurn (their combatant stayed dead), so the sync-back just wrote
	// 0 HP / StatusDeath back to g.party[i] — we replace that with the
	// revived state here so the victory/quest XP loop below sees them as
	// IsAlive() and they correctly share in the reward.
	for i, revived := range revivedThisTurn {
		if revived {
			g.party[i].CurrentHP = 1
			g.party[i].Status = character.StatusNone
			// Defeat detection reads combatants, so it must see the revived ally too.
			combatants[i].CurrentHP = 1
			combatants[i].Status = character.StatusNone
		}
	}

	g.resolveCombatOutcome(combatants)

	state := g.stateUnlocked()
	return &state, nil
}

// resolveCombatOutcome is shared by full party rounds and legacy item turns,
// so every supported combat input completes flags, rewards, and recovery.
func (g *Game) resolveCombatOutcome(combatants []*combat.Combatant) {
	if combat.CheckVictory(g.enemies) {
		totalXP, totalGold := 0, 0
		type dropRoll struct {
			itemID    string
			itemLevel int
		}
		var drops []dropRoll
		for _, e := range g.enemies {
			// XP comes straight off the scaled combatant — issue #121. Gold
			// and drops still need the base Monster record.
			totalXP += e.XPReward
			monster := g.gd.MonsterByID(e.MonsterID)
			if monster == nil {
				for i := range g.gd.Monsters {
					if g.gd.Monsters[i].Name == e.Name {
						monster = &g.gd.Monsters[i]
						break
					}
				}
			}
			if monster != nil {
				totalGold += monster.GoldReward
				// Roll drops
				for _, drop := range monster.Drops {
					if g.rng.IntN(100) < drop.ChancePct {
						drops = append(drops, dropRoll{itemID: drop.ItemID, itemLevel: monster.Tier})
					}
				}
			}
		}
		g.inv.Gold += totalGold
		g.battleRewards = &battleRewardsReceipt{XP: totalXP, Gold: totalGold}
		// Add dropped items to inventory
		for _, drop := range drops {
			grant, err := g.grantLoot(drop.itemID, drop.itemLevel, 0)
			if err != nil {
				g.logCombat(fmt.Sprintf("Loot error: %v", err), CombatActionEntry{Kind: "info"})
				continue
			}
			g.addBattleDrop(grant)
			g.logCombat(fmt.Sprintf("Found: %s!", grant.Name), CombatActionEntry{Kind: "info"})
		}
		// Snapshot who was dead at victory resolution BEFORE any XP is
		// distributed and BEFORE restParty() heals them. The client uses this
		// to render the victory screen correctly — otherwise a member killed
		// mid-fight is indistinguishable from a survivor once restParty has
		// run. Phoenix Down (see ~L112) revives mid-combat, so a revived
		// member is IsAlive() here and correctly receives XP.
		g.diedThisFight = make([]bool, len(g.party))
		for i, c := range g.party {
			if !c.IsAlive() {
				g.diedThisFight[i] = true
			}
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
		// No auto-rest between fights. Per GDD §8.1, only inns/tents/houses
		// (and quest completion) restore HP/MP/status — damage must persist
		// across the encounter chain for attrition to matter.
		g.enemies = nil
		g.spellBuffs = nil

		g.completeDungeonEncounter()

		if g.completeFinalEncounter() {
			g.resetEncounterStartState()
		} else if g.scriptedBoss {
			// Scripted quest encounter (today: the promotion trial
			// guardian). Drop the proof item, advance promo_stage, and
			// bypass the quest-complete screen because no quest actually
			// finished — the player still has to return to the giver.
			g.scriptedBoss = false
			g.advancePromotionStageAfterTrial()
			g.phase = "world"
			g.resetEncounterStartState()
		} else {
			// Combat victory never advances quests (issue #86). Quests only
			// advance when the party enters the quest's target building via
			// processWorldAction's "quest_advance" branch in game_world.go.
			// The victory screen (phase=quest_complete) is acknowledged by
			// the client via the "advance" action, which returns the party
			// to world.
			g.phase = "quest_complete"
			g.resetEncounterStartState()
		}
	} else if combat.CheckDefeat(combatants) {
		g.phase = "defeat"
		g.message = "Your party has fallen. Game over."
		g.recoverDungeonDefeat()
		g.leaveFinalEncounter(true)
		g.spellBuffs = nil
		g.clearPendingChestClaimUnlocked()
		g.resetEncounterStartState()
	}

}

func (g *Game) logResolvedCombatAction(
	combatants []*combat.Combatant,
	abilityByActor map[int]string,
	r combat.ResolvedAction,
) {
	switch r.Kind {
	case combat.ActionDefend:
		g.logCombat(
			fmt.Sprintf("%s defends.", r.ActorName),
			CombatActionEntry{
				Kind:       "defend",
				ActorID:    r.ActorID,
				ActorName:  r.ActorName,
				Initiative: r.Initiative,
			})
	case combat.ActionPoisonTick:
		status := ""
		if r.Killed {
			status = " - DEFEATED!"
		}
		g.logCombat(
			fmt.Sprintf("%s takes %d poison damage%s", r.ActorName, r.TotalDmg, status),
			CombatActionEntry{Kind: "poison_tick",
				ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg, DamagePrevented: r.DamagePrevented, Killed: r.Killed})
	case combat.ActionConfusion:
		targetName := g.findCombatantName(combatants, r.TargetID)
		if targetName == "?" {
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
				ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Damage: r.TotalDmg, DamagePrevented: r.DamagePrevented, Killed: r.Killed,
				Initiative: r.Initiative})
	case combat.ActionCounter:
		if r.TotalDmg > 0 || len(r.Hits) > 0 {
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
					Damage: r.TotalDmg, DamagePrevented: r.DamagePrevented, Killed: r.Killed, Crit: anyCrit(r.Hits), Missed: allMissed(r.Hits), Hits: toHitEntries(r.Hits),
					Initiative: r.Initiative})
		}
	case combat.ActionAbility:
		abilityID := abilityByActor[r.ActorID]
		targetName := g.findCombatantName(combatants, r.TargetID)
		switch abilityID {
		case "focus":
			g.logCombat(
				fmt.Sprintf("%s focuses - next attacks hit harder!", r.ActorName),
				g.abilityCombatAction(abilityID, CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName, Initiative: r.Initiative}))
		case "counter":
			g.logCombat(
				fmt.Sprintf("%s braces to counter!", r.ActorName),
				g.abilityCombatAction(abilityID, CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName, Initiative: r.Initiative}))
		case "inspire":
			g.logCombat(
				fmt.Sprintf("%s inspires the party!", r.ActorName),
				g.abilityCombatAction(abilityID, CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName, Initiative: r.Initiative}))
		case "backstab":
			status := ""
			if r.Killed {
				status = " - DEFEATED!"
			}
			g.logCombat(
				fmt.Sprintf("%s backstabs %s for %d damage%s",
					r.ActorName, targetName, r.TotalDmg, status),
				g.abilityCombatAction(abilityID, CombatActionEntry{Kind: "ability", DamageType: "physical",
					ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, TargetName: targetName,
					Damage: r.TotalDmg, DamagePrevented: r.DamagePrevented, Killed: r.Killed, Crit: anyCrit(r.Hits), Hits: toHitEntries(r.Hits),
					Initiative: r.Initiative}))
		case "steal":
			if _, itemName, ok := g.tryStealFrom(r.TargetID); ok {
				g.logCombat(
					fmt.Sprintf("%s steals %s from %s!", r.ActorName, itemName, targetName),
					g.abilityCombatAction(abilityID, CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Initiative: r.Initiative}))
			} else {
				g.logCombat(
					fmt.Sprintf("%s tries to steal from %s but finds nothing.", r.ActorName, targetName),
					g.abilityCombatAction(abilityID, CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName, TargetID: r.TargetID, Initiative: r.Initiative}))
			}
		default:
			g.logCombat(
				fmt.Sprintf("%s uses an ability.", r.ActorName),
				g.abilityCombatAction(abilityID, CombatActionEntry{Kind: "ability", ActorID: r.ActorID, ActorName: r.ActorName, Initiative: r.Initiative}))
		}
	default:
		if r.TotalDmg > 0 || len(r.Hits) > 0 {
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
					Damage: r.TotalDmg, DamagePrevented: r.DamagePrevented, Killed: r.Killed, Crit: anyCrit(r.Hits), Missed: allMissed(r.Hits), Hits: toHitEntries(r.Hits),
					Initiative: r.Initiative})
		}
	}
}

func (g *Game) resolveScheduledSpell(combatants []*combat.Combatant, ma MemberActionReq) {
	if ma.Slot < 0 || ma.Slot >= len(combatants) {
		return
	}
	pc := combatants[ma.Slot]
	if pc == nil || pc.CurrentHP <= 0 {
		return
	}
	if pc.Status == character.StatusSleep || pc.Status == character.StatusStone || pc.Status == character.StatusDeath {
		return
	}
	caster := g.party[ma.Slot]
	if caster.Status == character.StatusSilence {
		g.logCombat(
			fmt.Sprintf("%s is silenced and cannot cast!", caster.Name),
			CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: caster.Name})
		return
	}

	spell := g.gd.SpellByID(ma.SpellID)
	if spell == nil {
		return
	}
	spellForCast := *spell
	spellForCast.Target = resolveSpellTargetMode(spell, ma.TargetMode)
	spell = &spellForCast
	if _, ok := g.spellBooks[caster.Name]; !ok {
		g.logCombat(
			fmt.Sprintf("%s has no spells!", caster.Name),
			CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: caster.Name})
		return
	}
	if !magic.CanCast(caster, spell) {
		g.logCombat(
			fmt.Sprintf("%s doesn't have enough MP to cast %s (%d/%d)!",
				caster.Name, spell.Name, caster.CurrentMP, spell.MPCost),
			CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: caster.Name})
		return
	}
	_ = magic.ConsumeMP(caster, spell)
	casterPower := magic.CasterPower{Intellect: pc.INT, SpellDamagePct: pc.SpellDamagePct}

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
			dmg := magic.ResolveSpellDamage(spell, casterPower, target, g.rng)
			e.CurrentHP -= dmg
			if dmg > 0 && e.Status == character.StatusSleep {
				combat.ProcessSleepOnDamage(e)
			}
			killed := e.CurrentHP <= 0
			if killed {
				e.CurrentHP = 0
				g.logCombat(
					fmt.Sprintf("%s casts %s on %s[%d] for %d damage - DEFEATED!", caster.Name, spell.Name, e.Name, e.ID, dmg),
					spellCombatAction(spell, CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
						ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, TargetName: e.Name, Damage: dmg, Killed: true, SpellName: spell.Name}))
			} else {
				g.logCombat(
					fmt.Sprintf("%s casts %s on %s[%d] for %d damage", caster.Name, spell.Name, e.Name, e.ID, dmg),
					spellCombatAction(spell, CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
						ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, TargetName: e.Name, Damage: dmg, SpellName: spell.Name}))
			}
			if spell.Target == "single_enemy" {
				break
			}
		}
	case "heal":
		amt := magic.ResolveHealSpell(spell, casterPower, g.rng)
		g.resolveHealSpell(combatants, pc, caster, spell, ma.TargetID, amt)
	case "buff":
		g.resolveBuffSpell(combatants, pc, caster, spell, ma.TargetID)
	case "status":
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
					spellCombatAction(spell, CombatActionEntry{Kind: "status_effect", ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, SpellName: spell.Name}))
			} else {
				g.logCombat(
					fmt.Sprintf("%s casts %s on %s[%d] - resisted!", caster.Name, spell.Name, e.Name, e.ID),
					spellCombatAction(spell, CombatActionEntry{Kind: "status_effect", ActorID: pc.ID, ActorName: caster.Name, TargetID: e.ID, SpellName: spell.Name}))
			}
			if spell.Target == "single_enemy" {
				break
			}
		}
	case "cure_status":
		if spell.Target == "all_allies" {
			for i, c := range g.party {
				if !c.IsAlive() {
					continue
				}
				if spell.CuresStatus == "all" {
					if c.Status != character.StatusNone && c.Status != character.StatusDeath {
						c.Status = character.StatusNone
						if i < len(combatants) && combatants[i] != nil {
							combatants[i].Status = character.StatusNone
						}
					}
				} else if c.Status == character.Status(spell.CuresStatus) {
					c.Status = character.StatusNone
					if i < len(combatants) && combatants[i] != nil {
						combatants[i].Status = character.StatusNone
					}
				}
			}
			g.logCombat(
				fmt.Sprintf("%s casts %s - statuses cured!", caster.Name, spell.Name),
				spellCombatAction(spell, CombatActionEntry{Kind: "heal", ActorID: pc.ID, ActorName: caster.Name, SpellName: spell.Name}))
			return
		}
		targetIdx := ma.TargetID
		if targetIdx >= 0 && targetIdx < len(g.party) && g.party[targetIdx].IsAlive() {
			magic.ApplySpellToCharacter(g.party[targetIdx], spell, 0)
			if targetIdx < len(combatants) && combatants[targetIdx] != nil {
				combatants[targetIdx].Status = g.party[targetIdx].Status
			}
			g.logCombat(
				fmt.Sprintf("%s casts %s on %s - cured!", caster.Name, spell.Name, g.party[targetIdx].Name),
				spellCombatAction(spell, CombatActionEntry{Kind: "heal", ActorID: pc.ID, ActorName: caster.Name,
					TargetID: targetIdx, TargetName: g.party[targetIdx].Name, SpellName: spell.Name}))
		}
	}
}

func (g *Game) processCombatSpell(req GameActionRequest) (*GameState, error) { //nolint:unused
	spell := g.gd.SpellByID(req.SpellID)
	if spell == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("spell not found")
	}

	// Find a caster who knows this spell and can afford the MP cost.
	var caster *character.Character
	casterSlot := -1
	for slot, c := range g.party {
		sb, ok := g.spellBooks[c.Name]
		if !ok {
			continue
		}
		known := false
		for _, ids := range sb.KnownSpells {
			for _, id := range ids {
				if id == spell.ID {
					known = true
					break
				}
			}
			if known {
				break
			}
		}
		if !known {
			continue
		}
		if !magic.CanCast(c, spell) {
			continue
		}
		caster = c
		casterSlot = slot
		_ = magic.ConsumeMP(c, spell)
		break
	}
	if caster == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("no caster available")
	}
	effective := g.inv.ResolveEffectiveStats(caster, casterSlot, g.gd)
	casterPower := magic.CasterPower{Intellect: effective.INT, SpellDamagePct: effective.SpellDamagePct}

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
				dmg := magic.ResolveSpellDamage(spell, casterPower, target, g.rng)
				e.CurrentHP -= dmg
				killed := e.CurrentHP <= 0
				if killed {
					e.CurrentHP = 0
					g.logCombat(
						fmt.Sprintf("%s casts %s on %s for %d - DEFEATED!", caster.Name, spell.Name, e.Name, dmg),
						spellCombatAction(spell, CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
							ActorName: caster.Name, TargetID: e.ID, Damage: dmg, Killed: true, SpellName: spell.Name}))
				} else {
					g.logCombat(
						fmt.Sprintf("%s casts %s on %s for %d (HP:%d)", caster.Name, spell.Name, e.Name, dmg, e.CurrentHP),
						spellCombatAction(spell, CombatActionEntry{Kind: "spell", Element: spell.Element, DamageType: "magical",
							ActorName: caster.Name, TargetID: e.ID, Damage: dmg, SpellName: spell.Name}))
				}
				if spell.Target == "single_enemy" {
					break
				}
			}
		}
	case "heal":
		amt := magic.ResolveHealSpell(spell, casterPower, g.rng)
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
				spellCombatAction(spell, CombatActionEntry{Kind: "heal", ActorName: caster.Name, Damage: amt, SpellName: spell.Name}))
		}
	}

	combatants := g.resolveLegacyEnemyTurn()

	if g.finalEncounterActive() {
		g.resolveCombatOutcome(combatants)
		state := g.stateUnlocked()
		return &state, nil
	}

	if combat.CheckVictory(g.enemies) {
		g.logCombat("Victory!", CombatActionEntry{Kind: "info"})
		g.enemies = nil
		g.spellBuffs = nil
		g.checkLevelUps()
		g.phase = "quest_complete"
		g.resetEncounterStartState()
	} else if combat.CheckDefeat(combatants) {
		g.phase = "defeat"
		g.message = "Your party has fallen."
		g.spellBuffs = nil
		g.clearPendingChestClaimUnlocked()
		g.resetEncounterStartState()
	}

	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) processCombatItem(req GameActionRequest) (*GameState, error) {
	itemID := req.ItemID
	if itemID == "" {
		itemID = "potion"
	}
	if g.inv.Consumables[itemID] <= 0 {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("no %s", itemID)
	}
	var consumable *gamedata.Consumable
	for i := range g.gd.Items.Consumables {
		if g.gd.Items.Consumables[i].ID == itemID {
			consumable = &g.gd.Items.Consumables[i]
			break
		}
	}
	if consumable == nil {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("unknown item %q", itemID)
	}
	// Reject items that cannot be used in battle (e.g. Tent). Don't consume
	// the item on reject so the player keeps what they tried to spend.
	if !consumable.CombatUsable {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("%s cannot be used in battle", consumable.Name)
	}
	// For restore_mp, reject the request if the best target is already full
	// so the player doesn't burn an ether on a caster at full MP.
	if consumable.Effect == "restore_mp" {
		target := pickMPTarget(g.party, -1)
		if target == nil {
			state := g.stateUnlocked()
			return &state, fmt.Errorf("no valid target")
		}
		if target.CurrentMP >= target.MaxMP {
			state := g.stateUnlocked()
			return &state, fmt.Errorf("MP already full")
		}
	}
	g.inv.Consumables[itemID]--
	if g.inv.Consumables[itemID] == 0 {
		delete(g.inv.Consumables, itemID)
	}

	targetIdx := req.TargetID
	switch consumable.Effect {
	case "heal":
		target := pickHealTarget(g.party, targetIdx)
		if target != nil {
			target.Heal(consumable.Value)
			g.logCombat(
				fmt.Sprintf("%s uses %s - healed %d HP (HP:%d/%d)", target.Name, consumable.Name, consumable.Value, target.CurrentHP, target.MaxHP),
				CombatActionEntry{Kind: "item", ActorName: target.Name})
		}
	case "restore_mp":
		target := pickMPTarget(g.party, targetIdx)
		if target != nil {
			before := target.CurrentMP
			target.RestoreMP(consumable.Value)
			g.logCombat(
				fmt.Sprintf("%s uses %s - restored %d MP (MP:%d/%d)", target.Name, consumable.Name, target.CurrentMP-before, target.CurrentMP, target.MaxMP),
				CombatActionEntry{Kind: "item", ActorName: target.Name})
		}
	case "cure_poison":
		g.applyTopLevelCombatCure(targetIdx, consumable, character.StatusPoison)
	case "cure_silence":
		g.applyTopLevelCombatCure(targetIdx, consumable, character.StatusSilence)
	case "cure_stone":
		g.applyTopLevelCombatCure(targetIdx, consumable, character.StatusStone)
	case "revive":
		if targetIdx >= 0 && targetIdx < len(g.party) && !g.party[targetIdx].IsAlive() {
			t := g.party[targetIdx]
			t.Status = character.StatusNone
			t.CurrentHP = consumable.Value
			if t.CurrentHP < 1 {
				t.CurrentHP = 1
			}
			g.logCombat(
				fmt.Sprintf("%s uses Phoenix Down - revived with %d HP!", t.Name, t.CurrentHP),
				CombatActionEntry{Kind: "item", ActorName: t.Name})
		}
	}

	combatants := g.resolveLegacyEnemyTurn()

	g.resolveCombatOutcome(combatants)

	state := g.stateUnlocked()
	return &state, nil
}

// applyCombatCure clears the given status from the targeted party member
// during a per-member item action. Refunds the item when the target is
// invalid or not afflicted (matches the restore_mp refund pattern above).
// combatants is the live turn slice — we MUST mutate the combatant in place
// too, otherwise the end-of-round sync-back at
// `g.party[i].Status = pc.Status` would overwrite the cure.
// pc is the combatant view of the *actor*; targetIdx is the party slot being
// cured.
func (g *Game) applyCombatCure(combatants []*combat.Combatant, pc *combat.Combatant, actorSlot, targetIdx int, consumable *gamedata.Consumable, status character.Status, itemID string) {
	actorName := g.party[actorSlot].Name
	if targetIdx < 0 || targetIdx >= len(g.party) {
		g.inv.Consumables[itemID]++
		return
	}
	target := g.party[targetIdx]
	if target.Status != status {
		g.inv.Consumables[itemID]++
		g.logCombat(
			fmt.Sprintf("%s is not afflicted with %s!", target.Name, status),
			CombatActionEntry{Kind: "info", ActorID: pc.ID, ActorName: actorName, TargetName: target.Name})
		return
	}
	target.Status = character.StatusNone
	if targetIdx < len(combatants) && combatants[targetIdx] != nil {
		combatants[targetIdx].Status = character.StatusNone
	}
	g.logCombat(
		fmt.Sprintf("%s uses %s on %s - cured %s!",
			actorName, consumable.Name, target.Name, status),
		CombatActionEntry{Kind: "item", ActorID: pc.ID, ActorName: actorName, TargetName: target.Name})
}

// applyTopLevelCombatCure handles cure_* effects for the single-action
// top-level `{type:"item"}` combat request path used by processCombatItem.
// The inventory is already debited by the caller; on invalid target we
// refund so the player doesn't lose the item.
func (g *Game) applyTopLevelCombatCure(targetIdx int, consumable *gamedata.Consumable, status character.Status) {
	if targetIdx < 0 || targetIdx >= len(g.party) {
		g.inv.Consumables[consumable.ID]++
		return
	}
	target := g.party[targetIdx]
	if target.Status != status {
		g.inv.Consumables[consumable.ID]++
		g.logCombat(
			fmt.Sprintf("%s is not afflicted with %s!", target.Name, status),
			CombatActionEntry{Kind: "info", ActorName: target.Name})
		return
	}
	target.Status = character.StatusNone
	g.logCombat(
		fmt.Sprintf("%s uses %s - cured %s!", target.Name, consumable.Name, status),
		CombatActionEntry{Kind: "item", ActorName: target.Name})
}

// pickHealTarget returns the party member to heal with an HP consumable.
// If targetIdx names a living member, prefer it. Otherwise fall back to the
// most-damaged living member. Returns nil when no valid target exists.
func pickHealTarget(party []*character.Character, targetIdx int) *character.Character {
	if targetIdx >= 0 && targetIdx < len(party) && party[targetIdx].IsAlive() {
		return party[targetIdx]
	}
	var best *character.Character
	for _, c := range party {
		if c.IsAlive() && (best == nil || c.CurrentHP < best.CurrentHP) {
			best = c
		}
	}
	return best
}

// pickMPTarget returns the party member to restore MP for. If targetIdx names
// a living caster (MaxMP > 0), prefer it. Otherwise fall back to the caster
// with the lowest MP fraction. Skips non-casters and dead members.
func pickMPTarget(party []*character.Character, targetIdx int) *character.Character {
	if targetIdx >= 0 && targetIdx < len(party) && party[targetIdx].IsAlive() && party[targetIdx].MaxMP > 0 {
		return party[targetIdx]
	}
	var best *character.Character
	var bestFrac float64
	for _, c := range party {
		if !c.IsAlive() || c.MaxMP <= 0 {
			continue
		}
		frac := float64(c.CurrentMP) / float64(c.MaxMP)
		if best == nil || frac < bestFrac {
			best = c
			bestFrac = frac
		}
	}
	return best
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
	monster := g.gd.MonsterByID(enemy.MonsterID)
	if monster == nil {
		for i := range g.gd.Monsters {
			if g.gd.Monsters[i].Name == enemy.Name {
				monster = &g.gd.Monsters[i]
				break
			}
		}
	}
	if monster == nil {
		return "", "", false
	}
	var drops []string
	for _, drop := range monster.Drops {
		if g.rng.IntN(100) < drop.ChancePct {
			drops = append(drops, drop.ItemID)
		}
	}
	if len(drops) == 0 {
		return "", "", false
	}
	itemID := drops[g.rng.IntN(len(drops))]
	grant, err := g.grantLoot(itemID, monster.Tier, 0)
	if err != nil {
		return "", "", false
	}
	return itemID, grant.Name, true
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
			spellCombatAction(spell, CombatActionEntry{Kind: "spell", Element: "holy", DamageType: "magical",
				ActorID: pc.ID, ActorName: caster.Name, TargetID: target.ID, TargetName: target.Name,
				Damage: amt, Killed: killed, SpellName: spell.Name}))
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
			spellCombatAction(spell, CombatActionEntry{Kind: "heal", ActorID: pc.ID, ActorName: caster.Name,
				TargetID: slot, TargetName: g.party[slot].Name, Damage: amt, SpellName: spell.Name}))
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
			spellCombatAction(spell, CombatActionEntry{Kind: "spell", ActorID: pc.ID, ActorName: caster.Name,
				TargetID: slot, TargetName: g.party[slot].Name, SpellName: spell.Name}))
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
