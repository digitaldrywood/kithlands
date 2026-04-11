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
	BaseHitChance      int       `json:"base_hit_chance"`
	CritMultiplier     int       `json:"crit_multiplier"`
	MinDamagePerHit    int       `json:"min_damage_per_hit"`
	EnemyTargetWeights []float64 `json:"enemy_targeting_weights"`
}

// Items

type ItemsData struct {
	Weapons     []Weapon     `json:"weapons"`
	Armor       []Armor      `json:"armor"`
	Shields     []Shield     `json:"shields"`
	Helmets     []Helmet     `json:"helmets"`
	Consumables []Consumable `json:"consumables"`
	KeyItems    []KeyItem    `json:"key_items"`
}

type KeyItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	BuyPrice    int    `json:"buy_price"`
	SellPrice   int    `json:"sell_price"`
}

type Weapon struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Type      string   `json:"type"`
	Tier      int      `json:"tier"`
	Power     int      `json:"power"`
	HitPct    int      `json:"hit_pct"`
	CritPct   int      `json:"crit_pct"`
	Element   string   `json:"element"`
	Classes   []string `json:"classes"`
	Special   string   `json:"special"`
	BuyPrice  int      `json:"buy_price"`
	SellPrice int      `json:"sell_price"`
}

type Armor struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Type          string   `json:"type"`
	Tier          int      `json:"tier"`
	Absorb        int      `json:"absorb"`
	EvadePenalty  int      `json:"evade_penalty"`
	MagicDefense  int      `json:"magic_defense"`
	Classes       []string `json:"classes"`
	ElementResist string   `json:"element_resist"`
	BuyPrice      int      `json:"buy_price"`
	SellPrice     int      `json:"sell_price"`
}

type Shield struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Tier         int      `json:"tier"`
	Absorb       int      `json:"absorb"`
	EvadePenalty int      `json:"evade_penalty"`
	Classes      []string `json:"classes"`
	BuyPrice     int      `json:"buy_price"`
	SellPrice    int      `json:"sell_price"`
}

type Helmet struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Type      string   `json:"type"`
	Tier      int      `json:"tier"`
	Absorb    int      `json:"absorb"`
	Classes   []string `json:"classes"`
	BuyPrice  int      `json:"buy_price"`
	SellPrice int      `json:"sell_price"`
}

type Consumable struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Effect    string `json:"effect"`
	Value     int    `json:"value"`
	BuyPrice  int    `json:"buy_price"`
	SellPrice int    `json:"sell_price"`
}

// Spells

type SpellsData struct {
	ChargeTable ChargeTable `json:"charge_table"`
	Spells      []Spell     `json:"spells"`
}

type ChargeTable struct {
	Description     string           `json:"description"`
	Table           map[string][]int `json:"table"`
	MaxSpellsPerLvl int              `json:"max_spells_per_level"`
}

type Spell struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	School       string `json:"school"`
	SpellLevel   int    `json:"spell_level"`
	Target       string `json:"target"`
	Effect       string `json:"effect"`
	Element      string `json:"element"`
	Power        int    `json:"power"`
	StatusEffect string `json:"status_effect,omitempty"`
	HitChance    int    `json:"hit_chance,omitempty"`
	CuresStatus  string `json:"cures_status,omitempty"`
	BuffStat     string `json:"buff_stat,omitempty"`
	Description  string `json:"description"`
}

// Monsters

type Monster struct {
	ID              string       `json:"id"`
	Name            string       `json:"name"`
	Tier            int          `json:"tier"`
	Size            string       `json:"size"` // small, medium, large, boss
	IsBoss          bool         `json:"is_boss"`
	IsUndead        bool         `json:"is_undead,omitempty"`
	Stats           MonsterStats `json:"stats"`
	HP              int          `json:"hp"`
	ArmorAbsorb     int          `json:"armor_absorb"`
	XPReward        int          `json:"xp_reward"`
	GoldReward      int          `json:"gold_reward"`
	Weaknesses      []string     `json:"weaknesses"`
	Resistances     []string     `json:"resistances"`
	Absorbs         []string     `json:"absorbs"`
	Drops           []Drop       `json:"drops"`
	EncounterWeight int          `json:"encounter_weight"`
	MinGroup        int          `json:"min_group"`
	MaxGroup        int          `json:"max_group"`
}

type MonsterStats struct {
	STR    int `json:"str"`
	AGI    int `json:"agi"`
	INT    int `json:"int"`
	VIT    int `json:"vit"`
	LCK    int `json:"lck"`
	HitPct int `json:"hit_pct"`
}

type Drop struct {
	ItemID    string `json:"item_id"`
	ChancePct int    `json:"chance_pct"`
}

// Formations

type Formation struct {
	ID                string          `json:"id"`
	Weight            int             `json:"weight"`
	MinEncounterLevel int             `json:"min_encounter_level"`
	MaxEncounterLevel int             `json:"max_encounter_level"` // 0 = no upper bound
	Layout            string          `json:"layout"`              // line, vshape, triangle, boss_minions, scattered, rows
	Slots             []FormationSlot `json:"slots"`
}

type FormationSlot struct {
	MonsterID string `json:"monster_id"`
	Min       int    `json:"min"`
	Max       int    `json:"max"`
}
