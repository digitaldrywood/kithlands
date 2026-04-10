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
		// Snapshot XP before combat for victory screen animation
		g.xpBefore = make([]int, len(g.party))
		for i, c := range g.party {
			g.xpBefore[i] = c.XP
		}

		// Random encounter triggered by client (walking on grass)
		partyLevels := make([]int, len(g.party))
		for i, c := range g.party {
			partyLevels[i] = c.Level
		}
		encLvl := balance.EncounterLevel(partyLevels, "normal", 0, g.currentQ)
		g.enemies = balance.GenerateEncounter(g.gd.Monsters, encLvl, g.diff, g.rng)
		g.phase = "combat"

		// Track discovered monsters
		for _, e := range g.enemies {
			if g.discovered == nil {
				g.discovered = make(map[string]bool)
			}
			for _, m := range g.gd.Monsters {
				if m.Name == e.Name {
					g.discovered[m.ID] = true
				}
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
			g.currentQ++
			if g.currentQ >= len(g.quests) {
				g.phase = "victory"
				g.message = fmt.Sprintf("%s is saved! Your adventure is complete.", g.loc.Name)
			} else {
				g.phase = "quest_complete"
			}
		}

	default:
		// Legacy "advance" -- trigger encounter
		partyLevels := make([]int, len(g.party))
		for i, c := range g.party {
			partyLevels[i] = c.Level
		}
		encLvl := balance.EncounterLevel(partyLevels, "normal", 0, g.currentQ)
		g.enemies = balance.GenerateEncounter(g.gd.Monsters, encLvl, g.diff, g.rng)
		g.phase = "combat"
		g.combatLog = append(g.combatLog, "Enemies appear!")
		for _, e := range g.enemies {
			g.combatLog = append(g.combatLog, fmt.Sprintf("  %s (HP: %d)", e.Name, e.MaxHP))
		}
	}

	state := g.stateUnlocked()
	return &state, nil
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
