package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
)

func (g *Game) processWorldAction(req GameActionRequest) (*GameState, error) {
	switch req.Type {
	case "encounter":
		// Snapshot XP and level before combat for victory screen animation
		g.xpBefore = make([]int, len(g.party))
		g.levelBefore = make([]int, len(g.party))
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

		// Track discovered monsters
		if g.discovered == nil {
			g.discovered = make(map[string]bool)
		}
		for _, e := range g.enemies {
			if e.MonsterID != "" {
				g.discovered[e.MonsterID] = true
			}
		}

		g.combatLog = append(g.combatLog, "Enemies appear!")
		for _, e := range g.enemies {
			g.combatLog = append(g.combatLog, fmt.Sprintf("  %s (HP: %d)", e.Name, e.MaxHP))
		}

	case "quest_advance":
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
			if g.currentQ >= len(g.quests) {
				g.phase = "victory"
				g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
			} else {
				g.phase = "quest_complete"
			}
		}

	default:
		// Legacy "advance" -- trigger encounter
		g.xpBefore = make([]int, len(g.party))
		g.levelBefore = make([]int, len(g.party))
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
		g.combatLog = append(g.combatLog, "Enemies appear!")
		for _, e := range g.enemies {
			g.combatLog = append(g.combatLog, fmt.Sprintf("  %s (HP: %d)", e.Name, e.MaxHP))
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
		result = append(result, &combat.Combatant{
			ID: i, Name: c.Name, IsPlayer: true,
			STR: c.STR, AGI: c.AGI, INT: c.INT, VIT: c.VIT, LCK: c.LCK,
			HitPct: c.HitPct, MaxHP: c.MaxHP, CurrentHP: c.CurrentHP,
			Status:         c.Status,
			WeaponPower:    g.inv.WeaponPower(i, g.gd),
			ArmorAbsorb:    g.inv.TotalAbsorb(i, g.gd),
			BareHandDamage: bareHand,
		})
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
			g.combatLog = append(g.combatLog, fmt.Sprintf("%s leveled up! %d -> %d (HP: %d)", c.Name, old, c.Level, c.MaxHP))
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
