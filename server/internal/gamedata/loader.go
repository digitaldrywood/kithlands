package gamedata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/digitaldrywood/kithlands/internal/transport"
)

// TransportData holds transportation tier definitions from transport.json.
type TransportData struct {
	Tiers         []transport.Tier       `json:"tiers"`
	ConquestSkins map[string]SkinEntry   `json:"conquest_skins"`
}

// SkinEntry is a flavor-specific sprite mapping for a transport tier.
type SkinEntry struct {
	Name   string `json:"name"`
	Sprite string `json:"sprite"`
}

// GameData holds all loaded game data from shared/.
type GameData struct {
	Classes    []Class
	Stats      StatsConfig
	Items      ItemsData
	Spells     SpellsData
	Monsters   []Monster
	Formations []Formation
	Transport  TransportData
	Palettes   Palettes

	classByID     map[string]*Class
	weaponByID    map[string]*Weapon
	armorByID     map[string]*Armor
	spellByID     map[string]*Spell
	monsterByID   map[string]*Monster
	formationByID map[string]*Formation
	keyItemByID   map[string]*KeyItem
}

// Load reads and validates all game data from the shared directory.
// It panics with a clear message if any file is missing or malformed,
// per standing order: "A malformed classes.json should crash the server
// with a clear error, not produce a broken game."
func Load(sharedDir string) *GameData {
	gd := &GameData{}

	gd.Classes = loadJSON[[]Class](sharedDir, "classes.json")
	gd.Stats = loadJSON[StatsConfig](sharedDir, "stats.json")
	gd.Items = loadJSON[ItemsData](sharedDir, "items.json")
	gd.Spells = loadJSON[SpellsData](sharedDir, "spells.json")
	gd.Monsters = loadJSON[[]Monster](sharedDir, "monsters.json")
	gd.Formations = loadJSON[[]Formation](sharedDir, "formations.json")
	gd.Transport = loadJSON[TransportData](sharedDir, "transport.json")
	gd.Palettes = loadJSON[Palettes](sharedDir, "palettes.json")

	gd.buildIndexes()
	gd.validate()

	return gd
}

func (gd *GameData) ClassByID(id string) *Class         { return gd.classByID[id] }
func (gd *GameData) WeaponByID(id string) *Weapon       { return gd.weaponByID[id] }
func (gd *GameData) ArmorByID(id string) *Armor         { return gd.armorByID[id] }
func (gd *GameData) SpellByID(id string) *Spell         { return gd.spellByID[id] }
func (gd *GameData) MonsterByID(id string) *Monster     { return gd.monsterByID[id] }
func (gd *GameData) FormationByID(id string) *Formation { return gd.formationByID[id] }
func (gd *GameData) KeyItemByID(id string) *KeyItem     { return gd.keyItemByID[id] }

func (gd *GameData) buildIndexes() {
	gd.classByID = make(map[string]*Class, len(gd.Classes))
	for i := range gd.Classes {
		gd.classByID[gd.Classes[i].ID] = &gd.Classes[i]
	}

	gd.weaponByID = make(map[string]*Weapon, len(gd.Items.Weapons))
	for i := range gd.Items.Weapons {
		gd.weaponByID[gd.Items.Weapons[i].ID] = &gd.Items.Weapons[i]
	}

	gd.armorByID = make(map[string]*Armor, len(gd.Items.Armor))
	for i := range gd.Items.Armor {
		gd.armorByID[gd.Items.Armor[i].ID] = &gd.Items.Armor[i]
	}

	// Backfill MP cost for spells that omit it: cost = spell_level * 2 per GDD §8.1.
	// Explicit mp_cost in spells.json always wins.
	for i := range gd.Spells.Spells {
		if gd.Spells.Spells[i].MPCost == 0 {
			gd.Spells.Spells[i].MPCost = gd.Spells.Spells[i].SpellLevel * 2
		}
	}

	gd.spellByID = make(map[string]*Spell, len(gd.Spells.Spells))
	for i := range gd.Spells.Spells {
		gd.spellByID[gd.Spells.Spells[i].ID] = &gd.Spells.Spells[i]
	}

	gd.monsterByID = make(map[string]*Monster, len(gd.Monsters))
	for i := range gd.Monsters {
		gd.monsterByID[gd.Monsters[i].ID] = &gd.Monsters[i]
	}

	gd.formationByID = make(map[string]*Formation, len(gd.Formations))
	for i := range gd.Formations {
		gd.formationByID[gd.Formations[i].ID] = &gd.Formations[i]
	}

	gd.keyItemByID = make(map[string]*KeyItem, len(gd.Items.KeyItems))
	for i := range gd.Items.KeyItems {
		gd.keyItemByID[gd.Items.KeyItems[i].ID] = &gd.Items.KeyItems[i]
	}
}

func (gd *GameData) validate() {
	if len(gd.Classes) == 0 {
		panic("gamedata: classes.json is empty")
	}

	for _, c := range gd.Classes {
		if c.ID == "" {
			panic("gamedata: class with empty id")
		}
		if c.Name == "" {
			panic(fmt.Sprintf("gamedata: class %q has empty name", c.ID))
		}
		if c.HPPerLevel <= 0 {
			panic(fmt.Sprintf("gamedata: class %q has invalid hp_per_level: %d", c.ID, c.HPPerLevel))
		}
		if c.StrongLevelRate < 0 || c.StrongLevelRate > 100 {
			panic(fmt.Sprintf("gamedata: class %q has invalid strong_level_rate_pct: %d", c.ID, c.StrongLevelRate))
		}
		validateGrowth(c.ID, "str", c.StatGrowthEights.STR)
		validateGrowth(c.ID, "agi", c.StatGrowthEights.AGI)
		validateGrowth(c.ID, "int", c.StatGrowthEights.INT)
		validateGrowth(c.ID, "vit", c.StatGrowthEights.VIT)
		validateGrowth(c.ID, "lck", c.StatGrowthEights.LCK)
	}

	if gd.Stats.XPCurve.MaxLevel <= 0 {
		panic("gamedata: stats.json xp_curve.max_level must be > 0")
	}
	prev := 0
	for lvl := 1; lvl <= gd.Stats.XPCurve.MaxLevel; lvl++ {
		v, ok := gd.Stats.XPCurve.RefTable[strconv.Itoa(lvl)]
		if !ok {
			panic(fmt.Sprintf("gamedata: stats.json xp_curve.reference_table missing level %d", lvl))
		}
		if v <= prev {
			panic(fmt.Sprintf("gamedata: stats.json xp_curve.reference_table not monotonic at level %d: %d <= %d", lvl, v, prev))
		}
		prev = v
	}
	if gd.Stats.Combat.BaseHitChance <= 0 {
		panic("gamedata: stats.json combat.base_hit_chance must be > 0")
	}
	if gd.Stats.Combat.MinDamagePerHit <= 0 {
		panic("gamedata: stats.json combat.min_damage_per_hit must be > 0")
	}

	for _, w := range gd.Items.Weapons {
		if w.ID == "" {
			panic("gamedata: weapon with empty id")
		}
		if w.Power < 0 {
			panic(fmt.Sprintf("gamedata: weapon %q has negative power", w.ID))
		}
	}

	for _, s := range gd.Spells.Spells {
		if s.ID == "" {
			panic("gamedata: spell with empty id")
		}
		if s.SpellLevel < 1 || s.SpellLevel > 8 {
			panic(fmt.Sprintf("gamedata: spell %q has invalid spell_level: %d", s.ID, s.SpellLevel))
		}
	}

	validSizes := map[string]bool{"small": true, "medium": true, "large": true, "boss": true}
	for _, m := range gd.Monsters {
		if m.ID == "" {
			panic("gamedata: monster with empty id")
		}
		if m.HP <= 0 {
			panic(fmt.Sprintf("gamedata: monster %q has invalid hp: %d", m.ID, m.HP))
		}
		if !validSizes[m.Size] {
			panic(fmt.Sprintf("gamedata: monster %q has invalid size: %q", m.ID, m.Size))
		}
	}

	for _, ki := range gd.Items.KeyItems {
		if ki.ID == "" {
			panic("gamedata: key_item with empty id")
		}
		if ki.Name == "" {
			panic(fmt.Sprintf("gamedata: key_item %q has empty name", ki.ID))
		}
		if ki.BuyPrice < 0 {
			panic(fmt.Sprintf("gamedata: key_item %q has negative buy_price", ki.ID))
		}
	}

	validLayouts := map[string]bool{
		"line": true, "vshape": true, "triangle": true,
		"boss_minions": true, "scattered": true, "rows": true,
	}
	for _, f := range gd.Formations {
		if f.ID == "" {
			panic("gamedata: formation with empty id")
		}
		if !validLayouts[f.Layout] {
			panic(fmt.Sprintf("gamedata: formation %q has invalid layout: %q", f.ID, f.Layout))
		}
		if f.MinEncounterLevel < 1 {
			panic(fmt.Sprintf("gamedata: formation %q has invalid min_encounter_level: %d", f.ID, f.MinEncounterLevel))
		}
		if len(f.Slots) == 0 {
			panic(fmt.Sprintf("gamedata: formation %q has no slots", f.ID))
		}
		for _, s := range f.Slots {
			if gd.monsterByID[s.MonsterID] == nil {
				panic(fmt.Sprintf("gamedata: formation %q slot references unknown monster: %q", f.ID, s.MonsterID))
			}
			if s.Min < 1 {
				panic(fmt.Sprintf("gamedata: formation %q slot %q has invalid min: %d", f.ID, s.MonsterID, s.Min))
			}
			if s.Max < s.Min {
				panic(fmt.Sprintf("gamedata: formation %q slot %q has max < min: %d < %d", f.ID, s.MonsterID, s.Max, s.Min))
			}
		}
	}

	if len(gd.Transport.Tiers) == 0 {
		panic("gamedata: transport.json has no tiers")
	}
	for _, t := range gd.Transport.Tiers {
		if t.ID == "" {
			panic("gamedata: transport tier with empty id")
		}
		if t.RangeEdges <= 0 {
			panic(fmt.Sprintf("gamedata: transport tier %q has invalid range_edges: %d", t.ID, t.RangeEdges))
		}
		if t.Unlock == "" {
			panic(fmt.Sprintf("gamedata: transport tier %q has empty unlock condition", t.ID))
		}
	}
}

func validateGrowth(classID, stat string, value int) {
	if value < 0 || value > 8 {
		panic(fmt.Sprintf("gamedata: class %q stat_growth_eighths.%s must be 0-8, got %d", classID, stat, value))
	}
}

func loadJSON[T any](dir, filename string) T {
	path := filepath.Join(dir, filename)
	data, err := os.ReadFile(path)
	if err != nil {
		panic(fmt.Sprintf("gamedata: reading %s: %v", path, err))
	}

	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		panic(fmt.Sprintf("gamedata: parsing %s: %v", path, err))
	}

	return result
}
