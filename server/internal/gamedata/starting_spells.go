package gamedata

import "fmt"

// StartingSpellsForClass leaves older content packs unchanged when no explicit
// starter set is authored. Loaded saves retain their own learned spell books.
func (gd *GameData) StartingSpellsForClass(class *Class) []Spell {
	var spells []Spell
	if len(class.Magic.StartingSpells) > 0 {
		for _, id := range class.Magic.StartingSpells {
			if spell := gd.SpellByID(id); spell != nil {
				spells = append(spells, *spell)
			}
		}
		return spells
	}
	for _, spell := range gd.Spells.Spells {
		for _, school := range class.Magic.Schools {
			if spell.School == school && spell.SpellLevel == 1 {
				spells = append(spells, spell)
			}
		}
	}
	return spells
}

func (gd *GameData) validateStartingSpells(class Class) {
	seen := make(map[string]bool)
	if len(class.Magic.StartingSpells) > gd.Spells.ChargeTable.MaxSpellsPerLvl {
		panic(fmt.Sprintf("gamedata: class %q has too many starting spells", class.ID))
	}
	for _, id := range class.Magic.StartingSpells {
		spell := gd.SpellByID(id)
		if spell == nil || spell.SpellLevel != 1 || seen[id] {
			panic(fmt.Sprintf("gamedata: class %q has invalid starting spell %q", class.ID, id))
		}
		allowed := false
		for _, school := range class.Magic.Schools {
			if school == spell.School {
				allowed = true
			}
		}
		if !allowed {
			panic(fmt.Sprintf("gamedata: class %q cannot start with %s magic", class.ID, spell.School))
		}
		seen[id] = true
	}
}
