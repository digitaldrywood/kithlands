package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

// PromoteRequest is the body of POST /api/game/{id}/promote.
type PromoteRequest struct {
	Accept bool `json:"accept"`
}

// Promote handles the midpoint promotion event. If accept is false, the
// phase returns to world and the party stays on the base class. If accept
// is true, every eligible party member gains their class's promoted form.
func (g *Game) Promote(accept bool) (*GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.phase != "promotion" {
		state := g.stateUnlocked()
		return &state, fmt.Errorf("no promotion available (phase: %s)", g.phase)
	}

	if accept {
		g.promoteParty()
		g.message = "Your party has ascended. New power courses through you!"
	} else {
		g.message = "You choose to stay the course."
	}
	g.phase = "world"

	state := g.stateUnlocked()
	return &state, nil
}

// promoteParty flips every eligible character to their promoted class and
// upgrades their spellbook to include promoted-school spells at level 1.
// Characters without a PromotesTo are left untouched.
func (g *Game) promoteParty() {
	for _, c := range g.party {
		if c.Promoted {
			continue
		}
		cls := g.gd.ClassByID(c.ClassID)
		if cls == nil || cls.PromotesTo == "" {
			continue
		}
		c.Promote()

		// Caster upgrade: either extend an existing spellbook or create a
		// fresh one if promotion grants brand-new magic schools.
		hasBaseMagic := len(cls.Magic.Schools) > 0
		hasPromotedMagic := len(cls.Magic.PromotedSchools) > 0
		if !hasPromotedMagic {
			continue
		}

		sb, ok := g.spellBooks[c.Name]
		if !ok {
			sb = magic.NewSpellBook()
			g.spellBooks[c.Name] = sb
		}

		// Promotion grants a baseline MP pool to late-blooming casters
		// (Knight, Shadow) and refills existing casters to full. Floor at 10
		// so promoted warriors/rogues have meaningful first-act magic.
		if c.MaxMP < 10 {
			c.MaxMP = 10 + cls.MPPerLevel*max(0, c.Level-1)
		}
		c.CurrentMP = c.MaxMP

		// Learn level-1 spells in every school the character can now access.
		// Merge base + promoted schools so an existing caster gets any new
		// schools (e.g. Wayfarer → Wanderer retains white+black) and a
		// new caster (e.g. Rogue → Shadow) learns black magic from scratch.
		accessible := make(map[string]bool)
		if hasBaseMagic {
			for _, s := range cls.Magic.Schools {
				accessible[s] = true
			}
		}
		for _, s := range cls.Magic.PromotedSchools {
			accessible[s] = true
		}
		for _, spell := range g.gd.Spells.Spells {
			if !accessible[spell.School] {
				continue
			}
			if spell.SpellLevel != 1 {
				continue
			}
			_ = sb.LearnSpell(spell.ID, spell.SpellLevel, g.gd.Spells.ChargeTable.MaxSpellsPerLvl)
		}
	}
}

// promotionSoftLevelFloor is the party-level floor the FF1/DQ3-style trial
// uses as flavor guidance. The story gate (trial + proof item turn-in) is
// the real gate; the floor only drives a warning message.
const promotionSoftLevelFloor = 6

// maybeTriggerPromotion sets phase="promotion" exactly once, immediately
// after the player turns in the Proof of Courage at the promotion giver. The
// caller (game_world.go's quest_advance handler) passes the quest that was
// just completed so we don't need to rely on currentQ pointing at the
// promotion quest at all. Caller must already hold g.mu.
func (g *Game) maybeTriggerPromotion(completed *generator.Quest) {
	if g.promotionOffered {
		return
	}
	if completed == nil || !completed.IsPromotion {
		return
	}
	// Only trigger if there are still non-promoted characters with a
	// promotes_to target — avoids a no-op phase transition.
	eligible := false
	for _, c := range g.party {
		if c.Promoted {
			continue
		}
		cls := g.gd.ClassByID(c.ClassID)
		if cls != nil && cls.PromotesTo != "" {
			eligible = true
			break
		}
	}
	if !eligible {
		return
	}
	g.promotionOffered = true
	g.phase = "promotion"
	msg := "The elder lays the Proof of Courage on the altar. A surge of power courses through the party..."
	if g.averagePartyLevel() < promotionSoftLevelFloor {
		msg += fmt.Sprintf(" (Party is below the recommended level %d — the trial honors you anyway.)", promotionSoftLevelFloor)
	}
	g.message = msg
}

// averagePartyLevel is the integer-truncated mean level of every living or
// dead party member. Used by the promotion soft level floor.
func (g *Game) averagePartyLevel() int {
	if len(g.party) == 0 {
		return 0
	}
	sum := 0
	for _, c := range g.party {
		sum += c.Level
	}
	return sum / len(g.party)
}
