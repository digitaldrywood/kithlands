package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
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
		g.enemies = result.Combatants
		g.formation = result.Layout
		g.phase = "combat"
		g.spellBuffs = nil

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
			q.Completed = true
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
			completedIdx := g.currentQ
			g.currentQ++
			if promoMsg := g.applyPromotionIfNeeded(completedIdx); promoMsg != "" {
				g.message += "\n" + promoMsg
			}
			if tierName := g.checkTransportUnlocks(); tierName != "" {
				g.message += fmt.Sprintf("\nTransport upgraded: %s!", tierName)
			}
			if g.currentQ >= len(g.quests) {
				g.phase = "victory"
				g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
			} else {
				g.phase = "quest_complete"
				g.maybeTriggerPromotion()
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
		g.enemies = result.Combatants
		g.formation = result.Layout
		g.phase = "combat"
		g.spellBuffs = nil
		g.logCombat("Enemies appear!", CombatActionEntry{Kind: "info"})
		for _, e := range g.enemies {
			g.logCombat(fmt.Sprintf("  %s (HP: %d)", e.Name, e.MaxHP), CombatActionEntry{Kind: "info"})
		}
	}

	state := g.stateUnlocked()
	return &state, nil
}

// applyPromotionIfNeeded checks whether the quest at the given index is the
// promotion story beat; if so, flips Promoted = true on every party member
// and returns a display message describing the class promotions. The caller
// should append the message to g.message (or g.combatLog).
func (g *Game) applyPromotionIfNeeded(questIdx int) string {
	if questIdx < 0 || questIdx >= len(g.quests) {
		return ""
	}
	if !g.quests[questIdx].IsPromotion {
		return ""
	}
	var names []string
	for _, c := range g.party {
		if c.Promoted {
			continue
		}
		c.Promoted = true
		cls := g.gd.ClassByID(c.ClassID)
		if cls != nil && cls.PromotedName != "" {
			names = append(names, fmt.Sprintf("%s is now a %s", c.Name, cls.PromotedName))
		} else {
			names = append(names, fmt.Sprintf("%s has been promoted", c.Name))
		}
	}
	if len(names) == 0 {
		return ""
	}
	msg := "Your party has been promoted! "
	for i, n := range names {
		if i > 0 {
			msg += ", "
		}
		msg += n
	}
	return msg + "."
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
		c.Status = character.StatusNone
	}
	for _, sb := range g.spellBooks {
		sb.RestoreAllCharges()
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
