package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

// DebugCreateShowcase creates a disposable, server-authoritative combat lab
// from shared/showcase.json. It is exposed only through the debug-gated route.
func (gm *GameManager) DebugCreateShowcase() (*Game, error) {
	cfg := gm.gd.Showcase
	party := make([]PartyMemberReq, 0, len(cfg.Party))
	for _, member := range cfg.Party {
		party = append(party, PartyMemberReq{
			Name:    member.Name,
			ClassID: member.ClassID,
			Row:     member.Row,
		})
	}

	game, err := gm.CreateGame(NewGameRequest{
		TownName:    cfg.TownName,
		Places:      append([]string(nil), cfg.Places...),
		BigBuilding: cfg.BigBuilding,
		Party:       party,
		Difficulty:  "normal",
		RNGSeed:     cfg.RNGSeed,
	})
	if err != nil {
		return nil, err
	}
	if err := game.applyShowcase(cfg); err != nil {
		return nil, err
	}
	if err := game.DebugForceEncounter(cfg.Encounter.MonsterIDs, cfg.Encounter.Level); err != nil {
		return nil, err
	}
	return game, nil
}

func (g *Game) applyShowcase(cfg gamedata.ShowcaseData) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if len(g.party) != len(cfg.Party) {
		return fmt.Errorf("showcase party mismatch: game has %d members, config has %d", len(g.party), len(cfg.Party))
	}

	for slot, member := range cfg.Party {
		c := g.party[slot]
		class := g.gd.ClassByID(c.ClassID)
		if class == nil {
			return fmt.Errorf("showcase class %q not found", c.ClassID)
		}
		for c.Level < cfg.Level {
			c.XP = character.XPToNextLevel(c.Level, &g.gd.Stats.XPCurve)
			if err := character.LevelUp(c, class, &g.gd.Stats, g.rng); err != nil {
				return fmt.Errorf("leveling showcase member %q: %w", c.Name, err)
			}
		}
		c.XP = 0
		c.CurrentHP = c.MaxHP
		c.CurrentMP = c.MaxMP

		if _, err := g.inv.EquipWeapon(slot, member.WeaponID, c.ClassID, g.gd); err != nil {
			return fmt.Errorf("equipping showcase member %q: %w", c.Name, err)
		}
		if _, err := g.inv.EquipArmor(slot, member.ArmorID, c.ClassID, g.gd); err != nil {
			return fmt.Errorf("equipping showcase member %q: %w", c.Name, err)
		}

		if len(class.Magic.Schools) > 0 {
			book := magic.NewSpellBook()
			for _, spellID := range member.Spells {
				spell := g.gd.SpellByID(spellID)
				if spell == nil {
					return fmt.Errorf("showcase spell %q not found", spellID)
				}
				if err := book.LearnSpell(spellID, spell.SpellLevel, g.gd.Spells.ChargeTable.MaxSpellsPerLvl); err != nil {
					return fmt.Errorf("teaching %q to %q: %w", spellID, c.Name, err)
				}
			}
			g.spellBooks[c.Name] = book
		}
	}

	g.inv.Gold = cfg.Gold
	g.inv.Consumables = make(map[string]int, len(cfg.Consumables))
	for itemID, qty := range cfg.Consumables {
		g.inv.Consumables[itemID] = qty
	}
	g.showcaseMode = true
	g.showcaseTitle = cfg.Title
	g.showcaseTips = append([]string(nil), cfg.Tips...)
	g.message = cfg.Description
	return nil
}
