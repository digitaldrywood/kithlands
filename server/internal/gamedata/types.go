package gamedata

// Class represents a playable character class loaded from shared/classes.json.
type Class struct {
	ID               string           `json:"id"`
	Name             string           `json:"name"`
	Role             string           `json:"role"`
	PromotesTo       string           `json:"promotes_to"`
	PromotedName     string           `json:"promoted_name"`
	StartingStats    StartingStats    `json:"starting_stats"`
	StatGrowthEights StatGrowthEights `json:"stat_growth_eighths"`
	HPPerLevel       int              `json:"hp_per_level"`
	StrongLevelRate  int              `json:"strong_level_rate_pct"`
	StrongLevelBonus int              `json:"strong_level_bonus_hp"`
	Equipment        Equipment        `json:"equipment"`
	Magic            Magic            `json:"magic"`
	Abilities        []string         `json:"abilities"`
	BareHand         *BareHand        `json:"bare_hand,omitempty"`
	Description      string           `json:"description"`
}

type StartingStats struct {
	STR    int `json:"str"`
	AGI    int `json:"agi"`
	INT    int `json:"int"`
	VIT    int `json:"vit"`
	LCK    int `json:"lck"`
	MHP    int `json:"mhp"`
	HitPct int `json:"hit_pct"`
}

type StatGrowthEights struct {
	STR int `json:"str"`
	AGI int `json:"agi"`
	INT int `json:"int"`
	VIT int `json:"vit"`
	LCK int `json:"lck"`
}

type Equipment struct {
	Weapons []string `json:"weapons"`
	Armor   []string `json:"armor"`
	Shields bool     `json:"shields"`
	Helmets []string `json:"helmets"`
}

type Magic struct {
	Schools             []string `json:"schools"`
	MaxSpellLevel       int      `json:"max_spell_level"`
	PromotedSchools     []string `json:"promoted_schools"`
	PromotedMaxSpellLvl int      `json:"promoted_max_spell_level"`
}

type BareHand struct {
	BaseDamage          int    `json:"base_damage"`
	LevelScalingFormula string `json:"level_scaling_formula"`
}

// StatsConfig holds stat definitions, XP curve, and combat constants from shared/stats.json.
type StatsConfig struct {
	CoreStats    []StatDef          `json:"core_stats"`
	XPCurve      XPCurve            `json:"xp_curve"`
	DerivedStats map[string]Derived `json:"derived_stats"`
	LevelUp      LevelUpConfig      `json:"level_up"`
	HitPctPerLvl map[string]int     `json:"hit_pct_per_level"`
	Combat       CombatConfig       `json:"combat"`
}

type StatDef struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type XPCurve struct {
	Formula     string         `json:"formula"`
	Coefficient float64        `json:"coefficient"`
	Exponent    float64        `json:"exponent"`
	Constant    float64        `json:"constant"`
	MaxLevel    int            `json:"max_level"`
	RefTable    map[string]int `json:"reference_table"`
}

type Derived struct {
	Formula     string `json:"formula"`
	Description string `json:"description"`
}

type LevelUpConfig struct {
	StatGainMethod string       `json:"stat_gain_method"`
	HPGain         HPGainConfig `json:"hp_gain"`
}

type HPGainConfig struct {
	Formula     string `json:"formula"`
	StrongBonus int    `json:"strong_bonus"`
	Description string `json:"description"`
}

type CombatConfig struct {
	BaseHitChance        int       `json:"base_hit_chance"`
	CritMultiplier       int       `json:"crit_multiplier"`
	MinDamagePerHit      int       `json:"min_damage_per_hit"`
	EnemyTargetWeights   []float64 `json:"enemy_targeting_weights"`
}
