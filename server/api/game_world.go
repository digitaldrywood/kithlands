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
	case "quest_action":
		return g.processQuestObjective(req)
	case "item":
		return g.processWorldItem(req)
	case "spell":
		return g.processWorldSpell(req)
	case "encounter":
		if g.tickOverworldPoisonAndCheckDefeat() {
			state := g.stateUnlocked()
			return &state, nil
		}

		// Snapshot current XP/level progress so the victory screen starts from
		// the party's real pre-fight state.
		g.snapshotVictoryXPProgress()

		terrainTag, err := encounterTerrainTag(req.TileType)
		if err != nil {
			return nil, err
		}
		state, err := g.startRandomEncounter(terrainTag)
		if err != nil || state != nil {
			return state, err
		}
	case "natural_discovery":
		return g.processNaturalDiscovery(req.NodeID)

	case "quest_advance":
		if !g.validQuestVisit(req.NodeID) {
			g.questVisitNodeID = ""
			return nil, fmt.Errorf("reach the quest location before interacting")
		}
		g.questVisitNodeID = req.NodeID
		// Track node visits and soft prerequisites. Exploration discoveries
		// use their own explicit action so generic quest/simulator visits never
		// claim one-shot rewards.
		if req.NodeID != "" {
			for _, questName := range g.recordNodeVisit(req.NodeID) {
				g.message += fmt.Sprintf("A hidden quest has been revealed: %s\n", questName)
			}
		}

		// Player entered a quest-relevant location
		if g.currentQ >= len(g.quests) {
			g.phase = "victory"
			g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
		} else {
			q := &g.quests[g.currentQ]
			if q.TemplateID == g.gd.FinalEncounter.QuestTemplateID && !q.IsPromotion && !q.IsSideQuest {
				return g.advanceFinalEncounter(q, req.NodeID)
			}
			if g.advanceObjectiveArrival(q, req.NodeID) {
				state := g.stateUnlocked()
				return &state, nil
			}
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
			g.completeOrdinaryQuest(q)
		}

	default:
		// Legacy "advance" -- trigger encounter
		if g.tickOverworldPoisonAndCheckDefeat() {
			state := g.stateUnlocked()
			return &state, nil
		}
		g.snapshotVictoryXPProgress()
		partyLevels := make([]int, len(g.party))
		for i, c := range g.party {
			partyLevels[i] = c.Level
		}
		state, err := g.startRandomEncounter("")
		if err != nil || state != nil {
			return state, err
		}
	}

	state := g.stateUnlocked()
	return &state, nil
}

// recordNodeVisit applies the non-rewarding consequences of reaching a world
// node. It is shared by quest progression and explicit natural discovery so
// soft prerequisites keep their legacy behavior without generic visits
// claiming exploration rewards.
func (g *Game) recordNodeVisit(nodeID string) []string {
	if nodeID == "" {
		return nil
	}
	if g.visitedNodes == nil {
		g.visitedNodes = make(map[string]bool)
	}
	g.visitedNodes[nodeID] = true

	for giverNodeID, quest := range g.buildingSideQuests {
		if quest.Status != generator.BuildingQuestAccepted {
			continue
		}
		if quest.TargetNodeID != "" && nodeID == quest.TargetNodeID {
			quest.Status = generator.BuildingQuestReadyToTurnIn
			g.buildingSideQuests[giverNodeID] = quest
			g.message += fmt.Sprintf("Building side quest updated: return to %s for %s.\n", quest.GiverName, quest.Name)
		}
	}

	return g.revealHiddenQuestsAtNode(nodeID)
}

// revealHiddenQuestsAtNode makes matching soft-prerequisite quests visible and
// returns only the quests changed by this call. Calling it again is a no-op.
func (g *Game) revealHiddenQuestsAtNode(nodeID string) []string {
	var revealed []string
	for i := range g.quests {
		if g.quests[i].Hidden && g.quests[i].SoftPrereq == nodeID {
			g.quests[i].Hidden = false
			revealed = append(revealed, g.quests[i].Name)
		}
	}
	return revealed
}

func encounterTerrainTag(tileType *int) (string, error) {
	if tileType == nil {
		return "", nil
	}
	tag, ok := locality.EncounterTerrainTag(locality.TileType(*tileType))
	if !ok {
		return "", fmt.Errorf("invalid tile_type: %d", *tileType)
	}
	return tag, nil
}

func (g *Game) startRandomEncounter(terrainTag string) (*GameState, error) {
	partyLevels := make([]int, len(g.party))
	for i, c := range g.party {
		partyLevels[i] = c.Level
	}
	encLvl := balance.EncounterLevel(partyLevels, "normal", 0, g.currentQ)
	encounterIndex := g.worldEncounterCount
	result := balance.GenerateFormationEncounterWithProfile(
		g.gd,
		encLvl,
		g.diff,
		terrainTag,
		balance.EncounterProfile{WorldEncounterIndex: encounterIndex},
		g.rng,
	)
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
	if encounterIndex == 0 {
		g.resetEncounterStartState()
	} else {
		g.rollEncounterStartForNewFight()
	}
	g.worldEncounterCount++

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
	return nil, nil
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
	g.snapshotVictoryXPProgress()

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
		cb := combat.NewPlayer(i, c, g.inv, g.gd)
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
		if !c.IsAlive() {
			continue
		}
		c.CurrentHP = c.MaxHP
		c.CurrentMP = c.MaxMP
		c.Status = character.StatusNone
	}
}

// restPartyPercent restores pct% of each living member's MaxHP and MaxMP.
// Used by consumables like Tent that give a partial rest.
func (g *Game) restPartyPercent(pct int) {
	for _, c := range g.party {
		if !c.IsAlive() {
			continue
		}
		c.Heal(c.MaxHP * pct / 100)
		c.RestoreMP(c.MaxMP * pct / 100)
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
