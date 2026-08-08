package gamedata

// Class represents a playable character class loaded from shared/classes.json.
type Class struct {
	ID               string           `json:"id"`
	Name             string           `json:"name"`
	Role             string           `json:"role"`
	DefaultRow       string           `json:"default_row,omitempty"`
	PromotesTo       string           `json:"promotes_to"`
	PromotedName     string           `json:"promoted_name"`
	StartingStats    StartingStats    `json:"starting_stats"`
	StatGrowthEights StatGrowthEights `json:"stat_growth_eighths"`
	HPPerLevel       int              `json:"hp_per_level"`
	MPPerLevel       int              `json:"mp_per_level"`
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
	MMP    int `json:"mmp"`
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

// BattleCharactersData is the shared presentation manifest for authored
// battle bodies and their equipment attachment sockets. It contains no combat
// rules; Go loads and validates it so shared content remains the single source
// of truth while Phaser consumes the same JSON at build time.
type BattleCharactersData struct {
	FrameSize      int                      `json:"frame_size"`
	RequiredStates []string                 `json:"required_states"`
	WeaponAssets   []BattleWeaponAsset      `json:"weapon_assets"`
	OffHandAssets  []BattleWeaponAsset      `json:"off_hand_assets"`
	Classes        []BattleCharacterProfile `json:"classes"`
}

type BattleWeaponAsset struct {
	VisualID string `json:"visual_id"`
	Key      string `json:"key"`
	Path     string `json:"path"`
}

type BattleCharacterProfile struct {
	ID           string                                `json:"id"`
	Status       string                                `json:"status"`
	DefaultState string                                `json:"default_state"`
	Attachments  map[string]BattleAttachmentDefinition `json:"attachments"`
	States       map[string]BattleStateDefinition      `json:"states"`
}

type BattleAttachmentDefinition struct {
	Origin []float64 `json:"origin"`
}

type BattleStateDefinition struct {
	BodyKey  string             `json:"body_key"`
	BodyPath string             `json:"body_path"`
	Frames   []BattleStateFrame `json:"frames"`
}

type BattleStateFrame struct {
	Frame       int                              `json:"frame"`
	Duration    int                              `json:"duration"`
	Attachments map[string]BattleAttachmentFrame `json:"attachments"`
}

type BattleAttachmentFrame struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Angle float64 `json:"angle"`
	Front bool    `json:"front"`
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

// ShowcaseData defines the disposable developer battle entered from the title
// screen. Keeping the roster and loadout in shared/ prevents the debug client
// or Go mechanics from becoming a second source of game content.
type ShowcaseData struct {
	Title                string                       `json:"title"`
	Description          string                       `json:"description"`
	TownName             string                       `json:"town_name"`
	Places               []string                     `json:"places"`
	BigBuilding          string                       `json:"big_building"`
	Level                int                          `json:"level"`
	RNGSeed              int64                        `json:"rng_seed"`
	Gold                 int                          `json:"gold"`
	Party                []ShowcasePartyMember        `json:"party"`
	Consumables          map[string]int               `json:"consumables"`
	Encounter            ShowcaseEncounter            `json:"encounter"`
	Tips                 []string                     `json:"tips"`
	BattleCharacterAudit ShowcaseBattleCharacterAudit `json:"battle_character_audit"`
}

type ShowcaseBattleCharacterAudit struct {
	AnimationStates []string `json:"animation_states"`
	EffectModes     []string `json:"effect_modes"`
}

type ShowcasePartyMember struct {
	Name     string   `json:"name"`
	ClassID  string   `json:"class_id"`
	Row      string   `json:"row,omitempty"`
	WeaponID string   `json:"weapon_id"`
	ArmorID  string   `json:"armor_id"`
	Spells   []string `json:"spells,omitempty"`
}

type ShowcaseEncounter struct {
	MonsterIDs []string `json:"monster_ids"`
	Level      int      `json:"level"`
}

// Items

type ItemsData struct {
	EquipmentSlots []EquipmentSlotDefinition `json:"equipment_slots"`
	Weapons        []Weapon                  `json:"weapons"`
	Armor          []Armor                   `json:"armor"`
	Shields        []Shield                  `json:"shields"`
	Helmets        []Helmet                  `json:"helmets"`
	Consumables    []Consumable              `json:"consumables"`
	KeyItems       []KeyItem                 `json:"key_items"`
}

// EquipmentSlotDefinition describes one position in a character loadout.
// Content owns the display order and accepted item categories so adding a
// future slot does not require another Go or save-schema redesign.
type EquipmentSlotDefinition struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Group   string   `json:"group"`
	Order   int      `json:"order"`
	Accepts []string `json:"accepts"`
}

// Chests

type ChestCatalog map[string]ChestDefinition

type ChestDefinition struct {
	Kind               string         `json:"kind"`
	ItemID             string         `json:"item_id,omitempty"`
	Amount             int            `json:"amount,omitempty"`
	LockFlag           string         `json:"lock_flag,omitempty"`
	SetFlag            string         `json:"set_flag,omitempty"`
	MonsterFormationID string         `json:"monster_formation_id,omitempty"`
	RewardKind         string         `json:"reward_kind,omitempty"`
	RewardItemID       string         `json:"reward_item_id,omitempty"`
	RewardAmount       int            `json:"reward_amount,omitempty"`
	Variants           []ChestVariant `json:"variants,omitempty"`
}

type ChestVariant struct {
	IfFlag             string `json:"if_flag,omitempty"`
	IfFlagNot          string `json:"if_flag_not,omitempty"`
	Kind               string `json:"kind"`
	ItemID             string `json:"item_id,omitempty"`
	Amount             int    `json:"amount,omitempty"`
	SetFlag            string `json:"set_flag,omitempty"`
	MonsterFormationID string `json:"monster_formation_id,omitempty"`
	RewardKind         string `json:"reward_kind,omitempty"`
	RewardItemID       string `json:"reward_item_id,omitempty"`
	RewardAmount       int    `json:"reward_amount,omitempty"`
}

type KeyItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	BuyPrice    int    `json:"buy_price"`
	SellPrice   int    `json:"sell_price"`
}

type Weapon struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Type         string   `json:"type"`
	Tier         int      `json:"tier"`
	Power        int      `json:"power"`
	HitPct       int      `json:"hit_pct"`
	CritPct      int      `json:"crit_pct"`
	Element      string   `json:"element"`
	Classes      []string `json:"classes"`
	LongRange    bool     `json:"long_range,omitempty"`
	VisualID     string   `json:"visual_id,omitempty"`
	AnimationSet string   `json:"animation_set,omitempty"`
	Special      string   `json:"special"`
	BuyPrice     int      `json:"buy_price"`
	SellPrice    int      `json:"sell_price"`
}

type Ability struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Target        string `json:"target,omitempty"`
	IgnoresRow    bool   `json:"ignores_row,omitempty"`
	CinematicTier string `json:"cinematic_tier,omitempty"`
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
	VisualID     string   `json:"visual_id,omitempty"`
	AnimationSet string   `json:"animation_set,omitempty"`
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
	ID           string `json:"id"`
	Name         string `json:"name"`
	Effect       string `json:"effect"`
	Value        int    `json:"value"`
	BuyPrice     int    `json:"buy_price"`
	SellPrice    int    `json:"sell_price"`
	Description  string `json:"description,omitempty"`
	CombatUsable bool   `json:"combat_usable,omitempty"`
	WorldUsable  bool   `json:"world_usable,omitempty"`
}

// LootData defines randomized equipment, socket gems, and known recipes.
// Base equipment continues to live in ItemsData.
type LootData struct {
	Rarities []LootRarity `json:"rarities"`
	Affixes  []LootAffix  `json:"affixes"`
	Gems     []Gem        `json:"gems"`
	Recipes  []GemRecipe  `json:"recipes"`
	Starter  StarterLoot  `json:"starter"`
}

type IntRange struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

type LootRarity struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	MinItemLevel int      `json:"min_item_level"`
	Weight       int      `json:"weight"`
	Affixes      IntRange `json:"affixes"`
	Sockets      IntRange `json:"sockets"`
}

type LootAffix struct {
	ID            string       `json:"id"`
	Name          string       `json:"name"`
	Position      string       `json:"position"`
	Kinds         []string     `json:"kinds"`
	MinItemLevel  int          `json:"min_item_level"`
	RequiredLevel int          `json:"required_level"`
	Weight        int          `json:"weight"`
	Modifier      LootModifier `json:"modifier"`
}

type LootModifier struct {
	Stat string `json:"stat"`
	Min  int    `json:"min"`
	Max  int    `json:"max"`
}

type Gem struct {
	ID            string      `json:"id"`
	Name          string      `json:"name"`
	Tier          int         `json:"tier"`
	RequiredLevel int         `json:"required_level"`
	Description   string      `json:"description"`
	Effects       []GemEffect `json:"effects"`
}

type GemEffect struct {
	Kind  string `json:"kind"`
	Stat  string `json:"stat"`
	Value int    `json:"value"`
}

type GemRecipe struct {
	ID            string      `json:"id"`
	Name          string      `json:"name"`
	RequiredLevel int         `json:"required_level"`
	Inputs        []GemAmount `json:"inputs"`
	Output        GemAmount   `json:"output"`
}

type GemAmount struct {
	GemID string `json:"gem_id"`
	Count int    `json:"count"`
}

type StarterLoot struct {
	GemID      string `json:"gem_id"`
	GemCount   int    `json:"gem_count"`
	MinSockets int    `json:"min_sockets"`
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
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	School        string   `json:"school"`
	SpellLevel    int      `json:"spell_level"`
	MPCost        int      `json:"mp_cost"`
	Target        string   `json:"target"`
	TargetModes   []string `json:"target_modes,omitempty"`
	Effect        string   `json:"effect"`
	Element       string   `json:"element"`
	Power         int      `json:"power"`
	StatusEffect  string   `json:"status_effect,omitempty"`
	HitChance     int      `json:"hit_chance,omitempty"`
	CuresStatus   string   `json:"cures_status,omitempty"`
	BuffStat      string   `json:"buff_stat,omitempty"`
	AIPolicy      string   `json:"ai_policy,omitempty"`
	CinematicTier string   `json:"cinematic_tier,omitempty"`
	Description   string   `json:"description"`
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
	TutorialOnly      bool            `json:"tutorial_only,omitempty"`
	StarterSafe       bool            `json:"starter_safe,omitempty"`
	TerrainTags       []string        `json:"terrain_tags,omitempty"`
	Layout            string          `json:"layout"` // line, vshape, triangle, boss_minions, scattered, rows
	Slots             []FormationSlot `json:"slots"`
}

type FormationSlot struct {
	MonsterID string `json:"monster_id"`
	Min       int    `json:"min"`
	Max       int    `json:"max"`
}
