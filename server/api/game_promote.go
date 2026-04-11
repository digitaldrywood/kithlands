package api

import (
	"fmt"

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
		sb.UpdateCharges(c.Level, cls, &g.gd.Spells, true)

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
		sb.RestoreAllCharges()
	}
}

// maybeTriggerPromotion sets phase="promotion" exactly once, when the party's
// next main quest is the campaign's IsPromotion story beat (i.e. all Act 1
// quests have been completed). Caller must already hold g.mu.
func (g *Game) maybeTriggerPromotion() {
	if g.promotionOffered {
		return
	}
	if g.currentQ < 0 || g.currentQ >= len(g.quests) {
		return
	}
	if !g.quests[g.currentQ].IsPromotion {
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
	g.message = "Act 1 complete. A surge of power courses through the party..."
}
