package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

// tickOverworldPoisonAndCheckDefeat applies -1 HP poison damage per Section 6.5
// to each poisoned party member and returns true if the entire party has been
// defeated, meaning the caller should transition to the defeat phase instead of
// entering combat.
func (g *Game) tickOverworldPoisonAndCheckDefeat() bool {
	for _, c := range g.party {
		if c.Status == character.StatusPoison && c.CurrentHP > 0 {
			c.CurrentHP--
			if c.CurrentHP <= 0 {
				c.CurrentHP = 0
				c.Status = character.StatusDeath
			}
		}
	}
	for _, c := range g.party {
		if c.IsAlive() {
			return false
		}
	}
	g.phase = "defeat"
	g.message = "Your party succumbed to poison. Game over."
	return true
}

func (g *Game) processWorldAction(req GameActionRequest) (*GameState, error) {
	switch req.Type {
	case "encounter":
		if g.tickOverworldPoisonAndCheckDefeat() {
			state := g.stateUnlocked()
			return &state, nil
		}

		// Snapshot XP and level before combat for victory screen animation
		g.xpBefore = make([]int, len(g.party))
		g.levelBefore = make([]int, len(g.party))
		// Clear per-fight dead-at-victory flags so a prior fight's death
		// cannot leak into the next victory screen.
		g.diedThisFight = make([]bool, len(g.party))
		for i, c := range g.party {
			g.xpBefore[i] = c.XP
			g.levelBefore[i] = c.Level
		}

		// Random encounter triggered by client (walking on grass)
		partyLevels := make([]int, len(g.party))
		for i, c := range g.party {
			partyLevels[i] = c.Level
		}
		encLvl := balance.EncounterLevel(partyLevels, "normal", 0, g.currentQ)
		result := balance.GenerateFormationEncounter(g.gd, encLvl, g.diff, g.rng)
		if len(result.Combatants) == 0 {
			// Formation generation can legitimately return zero combatants
			// (unknown monster IDs in data, or every slot clipped to zero by
			// SizeMaxPerEncounter). Stay in world phase rather than shipping
			// phase="combat" with no enemies — otherwise the client plays the
			// encounter flash and the Battle scene never starts (issue #114).
			state := g.stateUnlocked()
			return &state, nil
		}
		g.enemies = result.Combatants
		g.formation = result.Layout
		g.phase = "combat"
		g.spellBuffs = nil
		g.rollEncounterStartForNewFight()

		// Track discovered monsters
		if g.discovered == nil {
			g.discovered = make(map[string]bool)
		}
		for _, e := range g.enemies {
			if e.MonsterID != "" {
				g.discovered[e.MonsterID] = true
			}
		}

		g.logCombat("Enemies appear!", CombatActionEntry{Kind: "info"})
		for _, e := range g.enemies {
			g.logCombat(fmt.Sprintf("  %s (HP: %d)", e.Name, e.MaxHP), CombatActionEntry{Kind: "info"})
		}

	case "quest_advance":
		// Track node visit for soft prerequisites and Strange Coin
		if req.NodeID != "" {
			if g.visitedNodes == nil {
				g.visitedNodes = make(map[string]bool)
			}
			g.visitedNodes[req.NodeID] = true

			// Check soft prerequisites: reveal hidden quests
			for i := range g.quests {
				if g.quests[i].Hidden && g.quests[i].SoftPrereq == req.NodeID {
					g.quests[i].Hidden = false
					g.message += fmt.Sprintf("A hidden quest has been revealed: %s\n", g.quests[i].Name)
				}
			}

			// Strange Coin: opens hidden door at natural/wilderness nodes
			node := g.loc.NodeByID(req.NodeID)
			if node != nil && node.Kind == locality.NodeNatural && g.inv.HasKeyItem("strange_coin") {
				g.inv.RemoveKeyItem("strange_coin")
				g.inv.AddKeyItem("ancient_ring")
				g.message += "The Strange Coin vibrates... A hidden passage opens!\nFound: Ancient Ring of Power!\n"
			}
		}

		// Player entered a quest-relevant location
		if g.currentQ >= len(g.quests) {
			g.phase = "victory"
			g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
		} else {
			q := &g.quests[g.currentQ]
			// Promotion quests walk a three-stage story gate (seek giver,
			// find proof, return to giver). The handler mutates q in place
			// and reports whether it handled this quest_advance entirely.
			// Stage 2 + proof-item held falls through to the normal
			// completion path below so the promotion offer can fire.
			if q.IsPromotion {
				handled, spawnedFight, state := g.advancePromotionQuest(q, req.NodeID)
				if state != nil {
					return state, nil
				}
				if spawnedFight {
					// Scripted guardian fight in progress; game_combat.go
					// handles the victory path (drops proof, advances to
					// stage 2, returns to world).
					s := g.stateUnlocked()
					return &s, nil
				}
				if handled {
					s := g.stateUnlocked()
					return &s, nil
				}
				// Fall through: stage 2, at the giver, with proof in hand.
			} else if q.TargetNodeID != "" && req.NodeID != q.TargetNodeID {
				// Non-promotion quests: only complete when the player
				// reaches the target node. Empty TargetNodeID falls through
				// so edge-case generator output still advances.
				state := g.stateUnlocked()
				return &state, nil
			}
			q.Completed = true
			completedCopy := *q // capture for maybeTriggerPromotion below
			g.message = fmt.Sprintf("Quest complete: %s\n%s\n+%d XP, +%d gold",
				q.Name, q.Completion, q.Reward.XP, q.Reward.Gold)
			g.inv.Gold += q.Reward.Gold
			for _, c := range g.party {
				if c.IsAlive() {
					c.XP += q.Reward.XP
				}
			}
			g.checkLevelUps()
			g.restParty()
			g.currentQ++
			if tierName := g.checkTransportUnlocks(); tierName != "" {
				g.message += fmt.Sprintf("\nTransport upgraded: %s!", tierName)
			}
			if g.currentQ >= len(g.quests) {
				g.phase = "victory"
				g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
			} else {
				g.phase = "quest_complete"
				g.maybeTriggerPromotion(&completedCopy)
			}
		}

	default:
		// Legacy "advance" -- trigger encounter
		if g.tickOverworldPoisonAndCheckDefeat() {
			state := g.stateUnlocked()
			return &state, nil
		}
		g.xpBefore = make([]int, len(g.party))
		g.levelBefore = make([]int, len(g.party))
		g.diedThisFight = make([]bool, len(g.party))
		partyLevels := make([]int, len(g.party))
		for i, c := range g.party {
			g.xpBefore[i] = c.XP
			g.levelBefore[i] = c.Level
			partyLevels[i] = c.Level
		}
		encLvl := balance.EncounterLevel(partyLevels, "normal", 0, g.currentQ)
		result := balance.GenerateFormationEncounter(g.gd, encLvl, g.diff, g.rng)
		if len(result.Combatants) == 0 {
			// See note on the "encounter" branch above (issue #114).
			state := g.stateUnlocked()
			return &state, nil
		}
		g.enemies = result.Combatants
		g.formation = result.Layout
		g.phase = "combat"
		g.spellBuffs = nil
		g.rollEncounterStartForNewFight()
		g.logCombat("Enemies appear!", CombatActionEntry{Kind: "info"})
		for _, e := range g.enemies {
			g.logCombat(fmt.Sprintf("  %s (HP: %d)", e.Name, e.MaxHP), CombatActionEntry{Kind: "info"})
		}
	}

	state := g.stateUnlocked()
	return &state, nil
}

// advancePromotionQuest runs the FF1/DQ3-style three-stage machine for the
// promotion quest. Returns (handled, spawnedFight, overrideState):
//
//   - handled=true means the handler fully processed this quest_advance and
//     the caller should return g.stateUnlocked() without touching q further.
//   - spawnedFight=true means the scripted guardian fight has been spawned
//     (phase is now "combat"); game_combat.go's victory path will advance
//     the stage and drop the proof item.
//   - overrideState is non-nil if the handler wants the caller to short
//     circuit and return a specific state (e.g. early no-op reached a
//     non-objective node).
//
// When the function returns (false, false, nil), stage 2 is complete (proof
// item held + at giver) and the caller should fall through to the normal
// quest-completion path, which removes the proof item and fires the
// promotion offer via maybeTriggerPromotion.
func (g *Game) advancePromotionQuest(q *generator.Quest, nodeID string) (handled, spawnedFight bool, overrideState *GameState) {
	switch q.PromoStage {
	case 0:
		// Seek the giver.
		if nodeID != q.GiverNodeID {
			s := g.stateUnlocked()
			return false, false, &s
		}
		q.PromoStage = 1
		q.TargetNodeID = q.DungeonNodeID
		q.TargetName = q.DungeonName
		g.message = fmt.Sprintf("%s tells you of the trial: seek the Proof of Courage at %s.",
			q.GiverName, q.DungeonName)
		return true, false, nil
	case 1:
		// Clear the trial.
		if nodeID != q.DungeonNodeID {
			s := g.stateUnlocked()
			return false, false, &s
		}
		if g.inv.HasKeyItem(q.ProofItemID) {
			// Shouldn't happen (stage should already be 2), but be defensive.
			q.PromoStage = 2
			q.TargetNodeID = q.GiverNodeID
			q.TargetName = q.GiverName
			s := g.stateUnlocked()
			return false, false, &s
		}
		if err := g.spawnScriptedBoss(q.BossMonsterID); err != nil {
			// Fall back to non-scripted behavior: mark stage as if the
			// trial were cleared so the game doesn't hard-stick. Log the
			// error so balance tests surface missing monster data.
			g.logCombat(fmt.Sprintf("scripted boss spawn failed: %v", err), CombatActionEntry{Kind: "info"})
			g.inv.AddKeyItem(q.ProofItemID)
			q.PromoStage = 2
			q.TargetNodeID = q.GiverNodeID
			q.TargetName = q.GiverName
			s := g.stateUnlocked()
			return false, false, &s
		}
		return false, true, nil
	case 2:
		// Return to the giver. The caller handles quest completion only
		// when the player is at the giver AND holds the proof item.
		if nodeID != q.GiverNodeID {
			s := g.stateUnlocked()
			return false, false, &s
		}
		if !g.inv.HasKeyItem(q.ProofItemID) {
			g.message = fmt.Sprintf("%s: \"Return with the Proof of Courage.\"", q.GiverName)
			s := g.stateUnlocked()
			return false, false, &s
		}
		// Consume the proof item right before falling through to the
		// normal completion path. The completion path increments currentQ
		// and calls maybeTriggerPromotion with a copy of the quest.
		g.inv.RemoveKeyItem(q.ProofItemID)
		return false, false, nil
	}
	// Unknown stage — degrade gracefully by refusing to advance.
	s := g.stateUnlocked()
	return false, false, &s
}

// advancePromotionStageAfterTrial is called from the scripted-boss victory
// branch in game_combat.go. It finds the active promotion quest, adds the
// proof item, promotes the quest to stage 2, and retargets the HUD at the
// giver so the bot/player knows to return.
func (g *Game) advancePromotionStageAfterTrial() {
	if g.currentQ < 0 || g.currentQ >= len(g.quests) {
		return
	}
	q := &g.quests[g.currentQ]
	if !q.IsPromotion {
		return
	}
	if q.ProofItemID != "" {
		g.inv.AddKeyItem(q.ProofItemID)
	}
	q.PromoStage = 2
	q.TargetNodeID = q.GiverNodeID
	q.TargetName = q.GiverName
	g.message = fmt.Sprintf("The %s falls. You claim the Proof of Courage. Return to %s.",
		g.guardianDisplayName(q), q.GiverName)
}

// guardianDisplayName returns the display name of the quest's scripted boss
// monster. Falls back to "guardian" if the monster is missing from
// gamedata.
func (g *Game) guardianDisplayName(q *generator.Quest) string {
	if m := g.gd.MonsterByID(q.BossMonsterID); m != nil {
		return m.Name
	}
	return "guardian"
}

// spawnScriptedBoss sets up a single-enemy scripted fight against the named
// monster. Used by the promotion trial. The scriptedBoss flag signals
// game_combat.go's victory path to drop the quest's proof item and bypass
// the normal quest-complete transition.
func (g *Game) spawnScriptedBoss(monsterID string) error {
	m := g.gd.MonsterByID(monsterID)
	if m == nil {
		return fmt.Errorf("monster %q not found", monsterID)
	}
	partyLevels := make([]int, len(g.party))
	for i, c := range g.party {
		partyLevels[i] = c.Level
	}
	encLvl := balance.EncounterLevel(partyLevels, "normal", 0, g.currentQ)

	// Snapshot XP/level for the victory screen animation, same as random
	// encounters do in the "encounter" branch above.
	g.xpBefore = make([]int, len(g.party))
	g.levelBefore = make([]int, len(g.party))
	g.diedThisFight = make([]bool, len(g.party))
	for i, c := range g.party {
		g.xpBefore[i] = c.XP
		g.levelBefore[i] = c.Level
	}

	c := balance.ScaleMonster(m, 100, encLvl, g.diff)
	c.MonsterID = m.ID
	c.Size = m.Size
	g.enemies = []*combat.Combatant{c}
	g.formation = "boss_minions"
	g.phase = "combat"
	g.spellBuffs = nil
	g.scriptedBoss = true
	g.rollEncounterStartForNewFight()

	if g.discovered == nil {
		g.discovered = make(map[string]bool)
	}
	g.discovered[m.ID] = true

	g.logCombat(fmt.Sprintf("%s emerges from the shadows!", m.Name), CombatActionEntry{Kind: "info"})
	g.logCombat(fmt.Sprintf("  %s (HP: %d)", c.Name, c.MaxHP), CombatActionEntry{Kind: "info"})
	return nil
}

func (g *Game) processAdvance(req GameActionRequest) (*GameState, error) {
	g.phase = "world"
	g.message = ""
	state := g.stateUnlocked()
	return &state, nil
}

func (g *Game) makeCombatants() []*combat.Combatant {
	var result []*combat.Combatant
	for i, c := range g.party {
		cls := g.gd.ClassByID(c.ClassID)
		bareHand := 0
		if cls.BareHand != nil {
			bareHand = cls.BareHand.BaseDamage + c.Level*c.STR/2
		}
		cb := &combat.Combatant{
			ID: i, Name: c.Name, IsPlayer: true,
			STR: c.STR, AGI: c.AGI, INT: c.INT, VIT: c.VIT, LCK: c.LCK,
			HitPct: c.HitPct, MaxHP: c.MaxHP, CurrentHP: c.CurrentHP,
			Status:         c.Status,
			WeaponPower:    g.inv.WeaponPower(i, g.gd),
			ArmorAbsorb:    g.inv.TotalAbsorb(i, g.gd),
			BareHandDamage: bareHand,
		}
		if buffs, ok := g.spellBuffs[i]; ok {
			cb.Buffs = append(cb.Buffs, buffs...)
		}
		result = append(result, cb)
	}
	return result
}

func (g *Game) findCombatantName(party []*combat.Combatant, id int) string {
	for _, c := range party {
		if c.ID == id {
			return c.Name
		}
	}
	for _, e := range g.enemies {
		if e.ID == id {
			return e.Name
		}
	}
	return "?"
}

func (g *Game) checkLevelUps() {
	for _, c := range g.party {
		for character.CanLevelUp(c, &g.gd.Stats.XPCurve) {
			cls := g.gd.ClassByID(c.ClassID)
			old := c.Level
			_ = character.LevelUp(c, cls, &g.gd.Stats, g.rng)
			g.logCombat(fmt.Sprintf("%s leveled up! %d -> %d (HP: %d)", c.Name, old, c.Level, c.MaxHP), CombatActionEntry{Kind: "info"})
		}
	}
}

func (g *Game) restParty() {
	for _, c := range g.party {
		c.CurrentHP = c.MaxHP
		c.CurrentMP = c.MaxMP
		c.Status = character.StatusNone
	}
}

// checkTransportUnlocks evaluates quest completion state and unlocks transport
// tiers whose conditions are met. Returns the name of the newly active tier if
// the current tier changed, or "" if unchanged.
func (g *Game) checkTransportUnlocks() string {
	if g.trans == nil {
		return ""
	}
	tiers := g.gd.Transport.Tiers
	before := g.trans.CurrentTier

	// act1_complete: all non-promotion Act 1 quests are done
	act1Done := true
	hasAct1 := false
	for _, q := range g.quests {
		if q.Act == 1 && !q.IsPromotion {
			hasAct1 = true
			if !q.Completed {
				act1Done = false
				break
			}
		}
	}
	if hasAct1 && act1Done {
		g.trans.TryUnlock("act1_complete", tiers)
	}

	// promotion_event: any promotion quest completed
	for _, q := range g.quests {
		if q.IsPromotion && q.Completed {
			g.trans.TryUnlock("promotion_event", tiers)
			break
		}
	}

	// act2_midpoint: at least half of Act 2 quests done
	act2Total, act2Done := 0, 0
	for _, q := range g.quests {
		if q.Act == 2 {
			act2Total++
			if q.Completed {
				act2Done++
			}
		}
	}
	if act2Total > 0 && act2Done >= (act2Total+1)/2 {
		g.trans.TryUnlock("act2_midpoint", tiers)
	}

	// act3_midpoint: at least half of Act 3 quests done
	act3Total, act3Done := 0, 0
	for _, q := range g.quests {
		if q.Act == 3 {
			act3Total++
			if q.Completed {
				act3Done++
			}
		}
	}
	if act3Total > 0 && act3Done >= (act3Total+1)/2 {
		g.trans.TryUnlock("act3_midpoint", tiers)
	}

	if g.trans.CurrentTier != before {
		td := g.trans.CurrentTierData(tiers)
		if td != nil {
			skin := td.Name
			if s, ok := g.gd.Transport.ConquestSkins[td.ID]; ok {
				skin = s.Name
			}
			return skin
		}
	}
	return ""
}
