package api

import (
	"fmt"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/magic"
	"github.com/digitaldrywood/kithlands/internal/sprites"
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

		if len(member.Loadout) == 0 {
			if _, err := g.inv.EquipWeapon(slot, member.WeaponID, c.ClassID, g.gd); err != nil {
				return fmt.Errorf("equipping showcase member %q: %w", c.Name, err)
			}
			if _, err := g.inv.EquipArmor(slot, member.ArmorID, c.ClassID, g.gd); err != nil {
				return fmt.Errorf("equipping showcase member %q: %w", c.Name, err)
			}
		} else {
			for _, loadoutSlot := range g.gd.Items.EquipmentSlots {
				baseID := member.Loadout[loadoutSlot.ID]
				if baseID == "" {
					continue
				}
				gemIDs := member.Sockets[loadoutSlot.ID]
				grant, err := g.grantLoot(baseID, c.Level, len(gemIDs))
				if err != nil {
					return fmt.Errorf("granting showcase member %q item %q: %w", c.Name, baseID, err)
				}
				for socketIndex, gemID := range gemIDs {
					g.inv.Normalize()
					g.inv.Gems[gemID]++
					if err := g.inv.SocketGem(grant.InstanceID, socketIndex, gemID, c.Level, g.gd); err != nil {
						return fmt.Errorf("socketing showcase member %q item %q: %w", c.Name, baseID, err)
					}
				}
				if _, err := g.inv.EquipInstanceAt(slot, loadoutSlot.ID, grant.InstanceID, c.ClassID, c.Level, g.gd); err != nil {
					return fmt.Errorf("equipping showcase member %q item %q: %w", c.Name, baseID, err)
				}
			}
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
	audit := buildBattleCharacterAudit(g.gd, cfg.BattleCharacterAudit)
	g.battleAudit = &audit
	g.message = cfg.Description
	return nil
}

func buildBattleCharacterAudit(gd *gamedata.GameData, cfg gamedata.ShowcaseBattleCharacterAudit) BattleCharacterAudit {
	audit := BattleCharacterAudit{
		AnimationStates: append([]string(nil), cfg.AnimationStates...),
		EffectModes:     append([]string(nil), cfg.EffectModes...),
	}
	for _, class := range gd.Classes {
		audit.Identities = append(audit.Identities, buildBattleAuditIdentity(gd, class, false))
	}
	for _, class := range gd.Classes {
		if class.PromotesTo == "" {
			continue
		}
		audit.Identities = append(audit.Identities, buildBattleAuditIdentity(gd, class, true))
	}
	return audit
}

func buildBattleAuditIdentity(gd *gamedata.GameData, class gamedata.Class, promoted bool) BattleAuditIdentity {
	id := class.ID
	name := class.Name
	if promoted {
		id = class.PromotesTo
		name = class.PromotedName
	}
	identity := BattleAuditIdentity{
		ID:             id,
		Name:           name,
		BaseClassID:    class.ID,
		Promoted:       promoted,
		SupportsShield: class.Equipment.Shields,
	}

	if len(class.Equipment.Weapons) == 0 {
		identity.Equipment = append(identity.Equipment, battleAuditEquipment(gd, class, promoted, "unarmed", nil))
		return identity
	}
	for _, weaponType := range class.Equipment.Weapons {
		var selected *gamedata.Weapon
		for i := range gd.Items.Weapons {
			weapon := &gd.Items.Weapons[i]
			if weapon.Type != weaponType || !auditContains(weapon.Classes, class.ID) {
				continue
			}
			if selected == nil ||
				(selected.VisualID == "" && weapon.VisualID != "") ||
				(selected.VisualID != "" && weapon.VisualID != "" && weapon.Tier > selected.Tier) {
				selected = weapon
			}
		}
		if selected != nil {
			identity.Equipment = append(identity.Equipment, battleAuditEquipment(gd, class, promoted, weaponType, selected))
		}
	}
	return identity
}

func battleAuditEquipment(gd *gamedata.GameData, class gamedata.Class, promoted bool, equipmentType string, weapon *gamedata.Weapon) BattleAuditEquipment {
	equip := inventory.EquipmentSlots{}
	itemName := "Unarmed"
	itemID := ""
	if weapon != nil {
		equip.WeaponID = weapon.ID
		itemID = weapon.ID
		itemName = weapon.Name
	}
	if class.Equipment.Shields {
		var selected *gamedata.Shield
		for i := range gd.Items.Shields {
			shield := &gd.Items.Shields[i]
			if shield.VisualID == "" || !auditContains(shield.Classes, class.ID) {
				continue
			}
			if selected == nil || shield.Tier > selected.Tier {
				selected = shield
			}
		}
		if selected != nil {
			equip.ShieldID = selected.ID
		}
	}
	composition := sprites.Compose(sprites.Input{
		ClassID:    class.ID,
		Promoted:   promoted,
		PromotesTo: class.PromotesTo,
		Equip:      equip,
		Palettes:   &gd.Palettes,
		Lookup:     sprites.LookupFromGameData(gd),
	})
	return BattleAuditEquipment{
		Type:           equipmentType,
		ItemID:         itemID,
		ItemName:       itemName,
		LayerAvailable: composition.WeaponVisualID != "" || composition.ShieldVisualID != "",
		Composition:    composition,
	}
}

func auditContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func cloneBattleCharacterAudit(source *BattleCharacterAudit) *BattleCharacterAudit {
	if source == nil {
		return nil
	}
	clone := &BattleCharacterAudit{
		AnimationStates: append([]string(nil), source.AnimationStates...),
		EffectModes:     append([]string(nil), source.EffectModes...),
		Identities:      make([]BattleAuditIdentity, len(source.Identities)),
	}
	for i, identity := range source.Identities {
		clone.Identities[i] = identity
		clone.Identities[i].Equipment = append([]BattleAuditEquipment(nil), identity.Equipment...)
	}
	return clone
}
