package gamedata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// GameData holds all loaded game data from shared/.
type GameData struct {
	Classes []Class
	Stats   StatsConfig

	classByID map[string]*Class
}

// Load reads and validates all game data from the shared directory.
// It panics with a clear message if any file is missing or malformed,
// per standing order: "A malformed classes.json should crash the server
// with a clear error, not produce a broken game."
func Load(sharedDir string) *GameData {
	gd := &GameData{}

	gd.Classes = loadJSON[[]Class](sharedDir, "classes.json")
	gd.Stats = loadJSON[StatsConfig](sharedDir, "stats.json")

	gd.buildIndexes()
	gd.validate()

	return gd
}

// ClassByID returns a class by its ID, or nil if not found.
func (gd *GameData) ClassByID(id string) *Class {
	return gd.classByID[id]
}

func (gd *GameData) buildIndexes() {
	gd.classByID = make(map[string]*Class, len(gd.Classes))
	for i := range gd.Classes {
		gd.classByID[gd.Classes[i].ID] = &gd.Classes[i]
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
	if gd.Stats.Combat.BaseHitChance <= 0 {
		panic("gamedata: stats.json combat.base_hit_chance must be > 0")
	}
	if gd.Stats.Combat.MinDamagePerHit <= 0 {
		panic("gamedata: stats.json combat.min_damage_per_hit must be > 0")
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
