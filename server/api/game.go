package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"runtime/debug"
	"sort"
	"sync"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/magic"
	"github.com/digitaldrywood/kithlands/internal/settlements"
	"github.com/digitaldrywood/kithlands/internal/sprites"
	"github.com/digitaldrywood/kithlands/internal/transport"
)

// ErrInternalAction is returned by ProcessAction when the action handler
// panics. The HTTP layer uses errors.Is to map this to a 500 response with
// a JSON body so the client can recover instead of seeing an empty 500 body
// (issue #138).
var ErrInternalAction = errors.New("internal action error")

// Request/response types

type WizardRequest struct {
	TownName    string            `json:"town_name"`
	People      []WizardPersonReq `json:"people"`
	Places      []string          `json:"places"`
	BigBuilding string            `json:"big_building"`
}

type WizardPersonReq struct {
	Name     string `json:"name"`
	Relation string `json:"relation"`
}

type NewGameRequest struct {
	TownName    string            `json:"town_name"`
	People      []WizardPersonReq `json:"people"`
	Places      []string          `json:"places"`
	BigBuilding string            `json:"big_building"`
	Party       []PartyMemberReq  `json:"party"`
	Difficulty  string            `json:"difficulty"`
	UseOSM      bool              `json:"use_osm,omitempty"`
	Lat         float64           `json:"lat,omitempty"`
	Lng         float64           `json:"lng,omitempty"`
	RadiusMiles float64           `json:"radius_miles,omitempty"`
	SpawnNodeID string            `json:"spawn_node_id,omitempty"`
	// RNGSeed overrides the default time-based seed. Zero selects time.Now().
	// Used by cmd/simulate for reproducible Monte Carlo runs.
	RNGSeed int64 `json:"rng_seed,omitempty"`
}

type OSMPreviewRequest struct {
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	RadiusMiles float64 `json:"radius_miles"`
}

type OSMPreviewNode struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Kind       string   `json:"kind"`
	Lat        float64  `json:"lat"`
	Lng        float64  `json:"lng"`
	Tags       []string `json:"tags"`
	Importance int      `json:"importance"`
}

type OSMPreviewResponse struct {
	Nodes       []OSMPreviewNode `json:"nodes"`
	RadiusMiles float64          `json:"radius_miles"`
	Cached      bool             `json:"cached"`
}

type PartyMemberReq struct {
	Name    string `json:"name"`
	ClassID string `json:"class_id"`
	Row     string `json:"row,omitempty"`
}

type GameActionRequest struct {
	QuestID        string `json:"quest_id,omitempty"`
	ObjectiveIndex int    `json:"objective_index,omitempty"`

	Type       string            `json:"type"` // attack, spell, item, flee, encounter, quest_advance, natural_discovery
	TargetID   int               `json:"target_id,omitempty"`
	SpellID    string            `json:"spell_id,omitempty"`
	TargetMode string            `json:"target_mode,omitempty"`
	ItemID     string            `json:"item_id,omitempty"`
	SlotIdx    int               `json:"slot_idx,omitempty"`
	NodeID     string            `json:"node_id,omitempty"` // node ID for quest_advance / natural_discovery
	TileType   *int              `json:"tile_type,omitempty"`
	Actions    []MemberActionReq `json:"actions,omitempty"` // per-member actions for combat
}

type MemberActionReq struct {
	Slot       int    `json:"slot"` // party slot 0-3
	Type       string `json:"type"` // attack, spell, item, defend, ability
	TargetID   int    `json:"target_id"`
	TargetMode string `json:"target_mode,omitempty"` // optional spell target override, e.g. single_ally/all_allies
	SpellID    string `json:"spell_id,omitempty"`
	AbilityID  string `json:"ability_id,omitempty"`
	ItemID     string `json:"item_id,omitempty"` // consumable id for type=item (potion, ether, ...)
}

// GameState is the full state sent to the client.
type GameState struct {
	EquipmentBuilds     [4][]inventory.EquipmentBuild `json:"equipment_builds"`
	EquipmentBuildLimit int                           `json:"equipment_build_limit"`
	FinalEncounter      *FinalEncounterState          `json:"final_encounter,omitempty"`
	QuestVisitNodeID    string                        `json:"quest_visit_node_id,omitempty"`
	Discovered          map[string]bool               `json:"discovered"` // monster IDs encountered in this save
	Dungeon             *DungeonState                 `json:"dungeon,omitempty"`
	DungeonEntry        *DungeonEntryState            `json:"dungeon_entry,omitempty"`
	DungeonEntries      []DungeonEntryState           `json:"dungeon_entries,omitempty"`
	ActiveDungeonID     string                        `json:"active_dungeon_id,omitempty"`
	ID                  string                        `json:"id"`
	Phase               string                        `json:"phase"`                   // world, combat, quest_complete, victory, defeat
	XPBefore            []int                         `json:"xp_before,omitempty"`     // XP values before combat for victory animation
	LevelBefore         []int                         `json:"level_before,omitempty"`  // levels before combat for victory animation
	XPThresholds        [][]int                       `json:"xp_thresholds,omitempty"` // per-character XP thresholds at each level crossed
	// DiedThisFight[i] is true for any party member whose IsAlive() was false
	// at the moment victory-XP was distributed. Survives restParty() so the
	// client can render the victory screen correctly. Reset at encounter start.
	DiedThisFight []bool             `json:"died_this_fight,omitempty"`
	Party         []PartyMemberState `json:"party"`
	Enemies       []EnemyState       `json:"enemies,omitempty"`
	Formation     string             `json:"formation,omitempty"`
	// EncounterStart is "preemptive" or "ambush" when the current encounter
	// started with one side getting a free first round. Empty for normal.
	EncounterStart        string                   `json:"encounter_start,omitempty"`
	Quests                []QuestState             `json:"quests"`
	BuildingSideQuests    []BuildingSideQuestState `json:"building_side_quests,omitempty"`
	CurrentQ              int                      `json:"current_quest"`
	Gold                  int                      `json:"gold"`
	Potions               int                      `json:"potions"`
	Ethers                int                      `json:"ethers"`
	HiEthers              int                      `json:"hi_ethers"`
	XEthers               int                      `json:"x_ethers"`
	Items                 []ItemState              `json:"items"`
	KeyItems              []KeyItemState           `json:"key_items,omitempty"`
	Gems                  []GemState               `json:"gems,omitempty"`
	GemRecipes            []GemRecipeState         `json:"gem_recipes,omitempty"`
	Equipment             [4]EquipState            `json:"equipment"`
	Location              string                   `json:"location"`
	Message               string                   `json:"message,omitempty"`
	CombatLog             []string                 `json:"combat_log,omitempty"`
	CombatActions         []CombatActionEntry      `json:"combat_actions,omitempty"`
	LastRoundActions      []MemberActionReq        `json:"last_round_actions,omitempty"`
	TileMap               *locality.TileMap        `json:"tilemap,omitempty"`
	WorldCheckpoint       *WorldCheckpoint         `json:"world_checkpoint,omitempty"`
	CurrentLocation       LocationState            `json:"current_location"`
	SettlementMap         *settlements.Map         `json:"settlement_map,omitempty"`
	SettlementEntryNodeID string                   `json:"settlement_entry_node_id,omitempty"`
	ShopItems             []ShopItemState          `json:"shop_items,omitempty"`
	Transport             TransportInfo            `json:"transport"`
	CollectedHiddenItems  map[string]bool          `json:"collected_hidden_items,omitempty"`
	TriggeredFlags        map[string]bool          `json:"triggered_flags,omitempty"`
	NaturalDiscoveries    []NaturalDiscoveryState  `json:"natural_discoveries,omitempty"`
	PendingChestClaim     *PendingChestClaimState  `json:"pending_chest_claim,omitempty"`
	ShowcaseMode          bool                     `json:"showcase_mode,omitempty"`
	ShowcaseTitle         string                   `json:"showcase_title,omitempty"`
	ShowcaseTips          []string                 `json:"showcase_tips,omitempty"`
	BattleCharacterAudit  *BattleCharacterAudit    `json:"battle_character_audit,omitempty"`
}

// BattleCharacterAudit is a read-only renderer catalog attached only to the
// disposable debug showcase. Every composition is derived from shared class
// and item metadata by the authoritative server.
type BattleCharacterAudit struct {
	Identities      []BattleAuditIdentity `json:"identities"`
	AnimationStates []string              `json:"animation_states"`
	EffectModes     []string              `json:"effect_modes"`
	EffectFamilies  []string              `json:"effect_families"`
	IntensityTiers  []int                 `json:"intensity_tiers"`
}

// BattleAuditIdentity describes one base or promoted runtime visual identity.
type BattleAuditIdentity struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	BaseClassID    string                 `json:"base_class_id"`
	Promoted       bool                   `json:"promoted"`
	SupportsShield bool                   `json:"supports_shield"`
	Equipment      []BattleAuditEquipment `json:"equipment"`
}

// BattleAuditEquipment is one server-composed equipment presentation option.
type BattleAuditEquipment struct {
	Type           string              `json:"type"`
	ItemID         string              `json:"item_id,omitempty"`
	ItemName       string              `json:"item_name"`
	LayerAvailable bool                `json:"layer_available"`
	Composition    sprites.Composition `json:"composition"`
}

// TransportInfo is the transport tier state sent to the client.
type TransportInfo struct {
	CurrentTier   string  `json:"current_tier"`
	TierName      string  `json:"tier_name"`
	Sprite        string  `json:"sprite"`
	EncounterMult float64 `json:"encounter_rate_mult"`
	CrossesWater  bool    `json:"crosses_water"`
	Flies         bool    `json:"flies"`
}

type ItemState struct {
	GemChanges     []GemChangePreviewState `json:"gem_changes,omitempty"`
	SocketPreviews []GemSocketPreviewState `json:"socket_previews,omitempty"`
	ID             string                  `json:"id"`
	InstanceID     string                  `json:"instance_id,omitempty"`
	Kind           string                  `json:"kind,omitempty"`
	Category       string                  `json:"category,omitempty"`
	Name           string                  `json:"name"`
	IconKey        string                  `json:"icon_key,omitempty"`
	Count          int                     `json:"count"`
	Rarity         string                  `json:"rarity,omitempty"`
	ItemLevel      int                     `json:"item_level,omitempty"`
	RequiredLevel  int                     `json:"required_level,omitempty"`
	Affixes        []ItemAffixState        `json:"affixes,omitempty"`
	Sockets        []ItemSocketState       `json:"sockets,omitempty"`
	AllowedClasses []string                `json:"allowed_classes,omitempty"`
	Stats          map[string]int          `json:"stats,omitempty"`
	// Power is set on weapon items (id starts with "wpn_") so the client
	// can show equip-delta previews without shipping the weapon catalog.
	Power int `json:"power,omitempty"`
	// Absorb is set on armor items (id starts with "arm_") for the same reason.
	Absorb int `json:"absorb,omitempty"`
	// Consumable metadata (issue #144). Populated for every entry in
	// shared/items.json consumables so the FF-style Item menu can render
	// descriptions, filter tabs, and grey out unusable items without the
	// client shipping a duplicate catalog.
	Description  string `json:"description,omitempty"`
	Effect       string `json:"effect,omitempty"`
	CombatUsable bool   `json:"combat_usable,omitempty"`
	WorldUsable  bool   `json:"world_usable,omitempty"`
}

// KeyItemState exposes authoritative key-item ownership without leaking the
// inventory representation. Exploration clients can therefore distinguish a
// consumed Strange Coin from the Ancient Ring it unlocks.
type KeyItemState struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// NaturalDiscoveryState projects one authored discovery assigned to a
// concrete natural locality node. Claimed and Revealed remain separate so a
// locked passage can be known to the player without paying out.
type NaturalDiscoveryState struct {
	NodeID      string `json:"node_id"`
	DiscoveryID string `json:"discovery_id"`
	Kind        string `json:"kind"`
	Title       string `json:"title"`
	Prompt      string `json:"prompt"`
	Claimed     bool   `json:"claimed"`
	Revealed    bool   `json:"revealed"`
}

type ItemAffixState struct {
	Name  string `json:"name"`
	Stat  string `json:"stat"`
	Value int    `json:"value"`
}

type ItemSocketState struct {
	Index     int    `json:"index"`
	GemID     string `json:"gem_id,omitempty"`
	GemName   string `json:"gem_name,omitempty"`
	Color     string `json:"color,omitempty"`
	GlowColor string `json:"glow_color,omitempty"`
	Stat      string `json:"stat,omitempty"`
	Value     int    `json:"value,omitempty"`
}

type GemState struct {
	ID            string           `json:"id"`
	Name          string           `json:"name"`
	Count         int              `json:"count"`
	Tier          int              `json:"tier"`
	RequiredLevel int              `json:"required_level"`
	Description   string           `json:"description"`
	Color         string           `json:"color"`
	GlowColor     string           `json:"glow_color"`
	Effects       []GemEffectState `json:"effects"`
}

type GemEffectState struct {
	Kind  string `json:"kind"`
	Stat  string `json:"stat"`
	Value int    `json:"value"`
}

type GemRecipeState struct {
	Known         bool             `json:"known"`
	DiscoveryHint string           `json:"discovery_hint"`
	Description   string           `json:"description"`
	BlockReason   string           `json:"block_reason,omitempty"`
	ID            string           `json:"id"`
	Name          string           `json:"name"`
	RequiredLevel int              `json:"required_level"`
	Inputs        []GemAmountState `json:"inputs"`
	Output        GemAmountState   `json:"output"`
	Craftable     bool             `json:"craftable"`
}

type GemAmountState struct {
	GemID         string           `json:"gem_id"`
	GemName       string           `json:"gem_name"`
	Count         int              `json:"count"`
	Owned         int              `json:"owned"`
	Tier          int              `json:"tier"`
	RequiredLevel int              `json:"required_level"`
	Description   string           `json:"description"`
	Color         string           `json:"color"`
	GlowColor     string           `json:"glow_color"`
	Effects       []GemEffectState `json:"effects"`
}

type EquipState struct {
	WeaponID          string           `json:"weapon_id"`
	WeaponInstanceID  string           `json:"weapon_instance_id,omitempty"`
	WeaponName        string           `json:"weapon_name"`
	WeaponPower       int              `json:"weapon_power,omitempty"`
	WeaponHitPct      int              `json:"weapon_hit_pct,omitempty"`
	WeaponCritPct     int              `json:"weapon_crit_pct,omitempty"`
	WeaponElement     string           `json:"weapon_element,omitempty"`
	WeaponItem        *ItemState       `json:"weapon_item,omitempty"`
	ArmorID           string           `json:"armor_id"`
	ArmorInstanceID   string           `json:"armor_instance_id,omitempty"`
	ArmorName         string           `json:"armor_name"`
	ArmorAbsorb       int              `json:"armor_absorb,omitempty"`
	ArmorMagicDefense int              `json:"armor_magic_defense,omitempty"`
	ArmorEvadePenalty int              `json:"armor_evade_penalty,omitempty"`
	ArmorElement      string           `json:"armor_element,omitempty"`
	ArmorItem         *ItemState       `json:"armor_item,omitempty"`
	Effective         map[string]int   `json:"effective"`
	Base              map[string]int   `json:"base"`
	Bonuses           map[string]int   `json:"bonuses,omitempty"`
	Loadout           []EquipSlotState `json:"loadout"`
}

// EquipSlotState is the client projection of one authored loadout position.
// Empty slots remain present so the UI can grow without inferring slot rules.
type EquipSlotState struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Group      string     `json:"group"`
	Accepts    []string   `json:"accepts"`
	ItemID     string     `json:"item_id,omitempty"`
	InstanceID string     `json:"instance_id,omitempty"`
	Item       *ItemState `json:"item,omitempty"`
}

type ShopItemState struct {
	StockID       string              `json:"stock_id"`
	ID            string              `json:"id"`
	InstanceID    string              `json:"instance_id,omitempty"`
	Name          string              `json:"name"`
	IconKey       string              `json:"icon_key,omitempty"`
	Type          string              `json:"type"` // weapon, armor, consumable, spell
	Category      string              `json:"category,omitempty"`
	Stats         map[string]int      `json:"stats,omitempty"`
	Rarity        string              `json:"rarity,omitempty"`
	ItemLevel     int                 `json:"item_level,omitempty"`
	RequiredLevel int                 `json:"required_level,omitempty"`
	Affixes       []ItemAffixState    `json:"affixes,omitempty"`
	Sockets       []ItemSocketState   `json:"sockets,omitempty"`
	Price         int                 `json:"price"`
	Power         int                 `json:"power,omitempty"`
	Absorb        int                 `json:"absorb,omitempty"`
	HitPct        int                 `json:"hit_pct,omitempty"`
	CritPct       int                 `json:"crit_pct,omitempty"`
	MagicDefense  int                 `json:"magic_defense,omitempty"`
	EvadePenalty  int                 `json:"evade_penalty,omitempty"`
	Element       string              `json:"element,omitempty"`
	Classes       string              `json:"classes,omitempty"`
	ClassIDs      []string            `json:"class_ids,omitempty"`
	Owned         bool                `json:"owned,omitempty"`
	School        string              `json:"school,omitempty"`
	SpellLevel    int                 `json:"spell_level,omitempty"`
	Learners      []SpellLearnerState `json:"learners,omitempty"`
}

type SpellLearnerState struct {
	Name     string `json:"name"`
	CanLearn bool   `json:"can_learn"`
	Reason   string `json:"reason,omitempty"`
}

type PartyMemberState struct {
	Name        string              `json:"name"`
	ClassID     string              `json:"class_id"`
	ClassName   string              `json:"class_name"`
	Row         string              `json:"row"`
	SpriteID    string              `json:"sprite_id"`
	Composition sprites.Composition `json:"composition"`
	Promoted    bool                `json:"promoted"`
	Level       int                 `json:"level"`
	HP          int                 `json:"hp"`
	MaxHP       int                 `json:"max_hp"`
	MP          int                 `json:"mp"`
	MaxMP       int                 `json:"max_mp"`
	STR         int                 `json:"str"`
	AGI         int                 `json:"agi"`
	INT         int                 `json:"int_stat"`
	VIT         int                 `json:"vit"`
	LCK         int                 `json:"lck"`
	XP          int                 `json:"xp"`
	XPNext      int                 `json:"xp_next"`
	Status      string              `json:"status"`
	Spells      []SpellState        `json:"spells,omitempty"`
	Abilities   []string            `json:"abilities,omitempty"`
}

type SpellState struct {
	ID           string                             `json:"id"`
	Name         string                             `json:"name"`
	Description  string                             `json:"description,omitempty"`
	Target       string                             `json:"target"`
	TargetModes  []string                           `json:"target_modes,omitempty"`
	Effect       string                             `json:"effect"`
	MPCost       int                                `json:"mp_cost"`
	Power        int                                `json:"power,omitempty"`
	Element      string                             `json:"element,omitempty"`
	StatusEffect string                             `json:"status_effect,omitempty"`
	CuresStatus  string                             `json:"cures_status,omitempty"`
	BuffStat     string                             `json:"buff_stat,omitempty"`
	AIPolicy     string                             `json:"ai_policy,omitempty"`
	Presentation *gamedata.BattleEffectPresentation `json:"presentation,omitempty"`
	Castable     bool                               `json:"castable_in_combat"`
}

type EnemyState struct {
	ID          int      `json:"id"`
	MonsterID   string   `json:"monster_id,omitempty"`
	Name        string   `json:"name"`
	HP          int      `json:"hp"`
	MaxHP       int      `json:"max_hp"`
	Size        string   `json:"size"`
	Status      string   `json:"status"`
	IsUndead    bool     `json:"is_undead"`
	Weaknesses  []string `json:"weaknesses,omitempty"`
	Resistances []string `json:"resistances,omitempty"`
}

// isMonsterUndead looks up a live enemy name against the loaded monster
// catalog and reports whether it's tagged as undead. Exposed on
// EnemyState so the client can let heal spells target undead enemies
// for damage (FF1 canon — resolveHealSpell handles the rest) without
// hardcoding a name list.
func (g *Game) isMonsterUndead(name string) bool {
	if m := g.monsterByName(name); m != nil {
		return m.IsUndead
	}
	return false
}

func (g *Game) monsterByName(name string) *gamedata.Monster {
	for i := range g.gd.Monsters {
		if g.gd.Monsters[i].Name == name {
			return &g.gd.Monsters[i]
		}
	}
	return nil
}

func (g *Game) buildEnemyState(e *combat.Combatant) EnemyState {
	state := EnemyState{
		ID:        e.ID,
		MonsterID: e.MonsterID,
		Name:      e.Name,
		HP:        e.CurrentHP,
		MaxHP:     e.MaxHP,
		Size:      e.Size,
		Status:    string(e.Status),
		IsUndead:  g.isMonsterUndead(e.Name),
	}
	if m := g.monsterByName(e.Name); m != nil {
		state.Weaknesses = append([]string(nil), m.Weaknesses...)
		state.Resistances = append([]string(nil), m.Resistances...)
	}
	return state
}

// CombatActionEntry carries structured metadata for a single combat log line.
// Sent alongside combat_log so the client can drive animations without parsing text.
type CombatActionEntry struct {
	Kind          string                             `json:"kind"`                  // attack, spell, ability, heal, item, counter, info
	Element       string                             `json:"element,omitempty"`     // fire, ice, lightning, holy, dark, none
	DamageType    string                             `json:"damage_type,omitempty"` // physical, magical
	ActorID       int                                `json:"actor_id,omitempty"`
	ActorName     string                             `json:"actor_name,omitempty"`
	TargetID      int                                `json:"target_id,omitempty"`
	TargetName    string                             `json:"target_name,omitempty"`
	Damage        int                                `json:"damage,omitempty"`
	Killed        bool                               `json:"killed,omitempty"`
	Crit          bool                               `json:"crit,omitempty"`
	Missed        bool                               `json:"missed,omitempty"`
	Hits          []CombatHitEntry                   `json:"hits,omitempty"`
	ActionID      string                             `json:"action_id,omitempty"`
	ActionName    string                             `json:"action_name,omitempty"`
	CinematicTier string                             `json:"cinematic_tier,omitempty"`
	SpellName     string                             `json:"spell_name,omitempty"`
	TargetMode    string                             `json:"target_mode,omitempty"`
	Presentation  *gamedata.BattleEffectPresentation `json:"presentation,omitempty"`
	Initiative    int                                `json:"initiative,omitempty"` // weighted turn-order roll for this actor
}

// CombatHitEntry represents a single hit within a multi-hit attack.
type CombatHitEntry struct {
	Damage int  `json:"damage"`
	Crit   bool `json:"crit,omitempty"`
	Missed bool `json:"missed,omitempty"`
}

type QuestState struct {
	Objectives *generator.ObjectiveProgress `json:"objectives,omitempty"`
	Actions    []generator.QuestAction      `json:"actions,omitempty"`

	ID           string `json:"id"`
	TemplateID   string `json:"template_id,omitempty"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Completion   string `json:"completion,omitempty"`
	Act          int    `json:"act"`
	Completed    bool   `json:"completed"`
	Hidden       bool   `json:"hidden,omitempty"`
	IsPromotion  bool   `json:"is_promotion,omitempty"`
	IsSideQuest  bool   `json:"is_side_quest,omitempty"`
	GiverName    string `json:"giver_name,omitempty"`
	GiverNodeID  string `json:"giver_node_id,omitempty"`
	TargetName   string `json:"target_name,omitempty"`
	TargetNodeID string `json:"target_node_id,omitempty"`
	// Promotion-quest fields. DungeonNodeID/DungeonName are the trial-dungeon
	// target; PromoStage drives the three-stage HUD (0=seek giver, 1=find
	// proof, 2=return to giver). ProofItemID is the key item the turn-in
	// consumes.
	DungeonNodeID string           `json:"dungeon_node_id,omitempty"`
	DungeonName   string           `json:"dungeon_name,omitempty"`
	ProofItemID   string           `json:"proof_item_id,omitempty"`
	BossMonsterID string           `json:"boss_monster_id,omitempty"`
	PromoStage    int              `json:"promo_stage,omitempty"`
	Reward        QuestRewardState `json:"reward"`
}

// MarshalJSON keeps unrevealed quests as opaque slots while preserving the
// established wire shape for visible and completed quests.
func (q QuestState) MarshalJSON() ([]byte, error) {
	if q.Hidden {
		return json.Marshal(struct {
			Hidden bool `json:"hidden"`
		}{Hidden: true})
	}
	type questStateJSON QuestState
	return json.Marshal(questStateJSON(q))
}

type BuildingSideQuestState struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	Description    string           `json:"description"`
	Completion     string           `json:"completion,omitempty"`
	GiverName      string           `json:"giver_name,omitempty"`
	GiverNodeID    string           `json:"giver_node_id,omitempty"`
	TargetName     string           `json:"target_name,omitempty"`
	TargetNodeID   string           `json:"target_node_id,omitempty"`
	SourceNodeID   string           `json:"source_node_id,omitempty"`
	SourceNodeName string           `json:"source_node_name,omitempty"`
	BuildingType   string           `json:"building_type,omitempty"`
	Status         string           `json:"status"`
	Completed      bool             `json:"completed"`
	Reward         QuestRewardState `json:"reward"`
}

type QuestRewardState struct {
	XP   int `json:"xp"`
	Gold int `json:"gold"`
}

// Game holds the live state of one game session.
type Game struct {
	dungeon             *DungeonProgress
	dungeons            map[string]*DungeonProgress
	activeDungeonID     string
	id                  string
	gd                  *gamedata.GameData
	rng                 *rand.Rand
	rngSeed             int64
	loc                 *locality.Locality
	walk                *locality.WalkResult
	tileMap             *locality.TileMap
	worldCheckpoint     *WorldCheckpoint
	settlementMap       *settlements.Map
	settlementInteriors map[string]locality.MapSpawn
	location            LocationState
	party               []*character.Character
	spellBooks          map[string]*magic.SpellBook
	inv                 *inventory.Inventory
	questVisitNodeID    string
	quests              []generator.Quest
	buildingSideQuests  map[string]generator.BuildingSideQuest
	currentQ            int
	phase               string // world, combat, quest_complete, victory, defeat
	enemies             []*combat.Combatant
	spellBuffs          map[int][]combat.CombatBuff // slot -> buffs active for current encounter
	combatLog           []string
	combatActions       []CombatActionEntry
	message             string
	diff                balance.Difficulty
	xpBefore            []int // snapshot before combat for victory animation
	levelBefore         []int // snapshot before combat for victory animation
	// diedThisFight is captured at the exact moment the combat-victory block
	// distributes XP (before restParty heals dead members). Exposed to the
	// client via GameState.DiedThisFight.
	diedThisFight            []bool
	discovered               map[string]bool // bestiary: monster IDs encountered
	collectedHiddenItems     map[string]bool // town hidden-item keys already picked up
	triggeredFlags           map[string]bool // generic persistent event flags + chest-open state
	naturalDiscoveryClaimed  map[string]bool // node/discovery pairs already rewarded
	naturalDiscoveryRevealed map[string]bool // node/discovery pairs the player inspected
	visitedNodes             map[string]bool // node IDs the player has entered (sequence-break tracking)
	formation                string          // current encounter layout type
	worldEncounterCount      int             // successful overworld encounters started on this save
	lootRollSeq              uint64          // persisted sequence for isolated deterministic loot rolls
	shopStocks               map[string]*ShopStock
	lastRoundActions         []MemberActionReq
	pendingChestClaim        *PendingChestClaim
	// encounterStart records preemptive/ambush state for the current fight so
	// the first call to ResolveTurn can skip one side's actions.
	encounterStart combat.EncounterStart
	// combatRound is 0 until the first ResolveTurn completes; used to gate
	// the first-round side-skip enforced by encounterStart.
	combatRound      int
	promotionOffered bool // midpoint promotion has already fired
	finalEncounter   *FinalEncounterProgress

	// scriptedBoss marks the currently running combat as a scripted quest
	// encounter (today: the promotion trial guardian). The victory handler in
	// game_combat.go uses this to drop the proof item, advance promo_stage,
	// and return directly to the world phase instead of showing a
	// quest-complete screen for a fight that didn't complete a quest.
	scriptedBoss  bool
	showcaseMode  bool
	showcaseTitle string
	showcaseTips  []string
	battleAudit   *BattleCharacterAudit
	trans         *transport.State // current transport tier & unlocks
	mu            sync.Mutex
}

func (g *Game) State() GameState {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.prepareFinalQuest()

	state := GameState{
		ID:                   g.id,
		Phase:                g.phase,
		CurrentQ:             g.currentQ,
		Gold:                 g.inv.Gold,
		Potions:              g.inv.Consumables["potion"],
		Ethers:               g.inv.Consumables["ether"],
		HiEthers:             g.inv.Consumables["hi_ether"],
		XEthers:              g.inv.Consumables["x_ether"],
		Message:              g.message,
		CombatLog:            g.combatLog,
		CombatActions:        g.combatActions,
		LastRoundActions:     cloneMemberActionReqs(g.lastRoundActions),
		ShowcaseMode:         g.showcaseMode,
		ShowcaseTitle:        g.showcaseTitle,
		ShowcaseTips:         append([]string(nil), g.showcaseTips...),
		BattleCharacterAudit: cloneBattleCharacterAudit(g.battleAudit),
	}

	if g.loc != nil {
		state.Location = g.loc.Name
		state.TileMap = g.tileMap
	}
	state.WorldCheckpoint = cloneWorldCheckpoint(g.worldCheckpoint)
	g.fillLocationState(&state)

	state.Transport = g.buildTransportInfo()
	state.CollectedHiddenItems = g.collectedHiddenItems
	state.TriggeredFlags = cloneBoolMap(g.triggeredFlags)
	g.fillNaturalDiscoveryState(&state)
	state.PendingChestClaim = clonePendingChestClaimState(g.pendingChestClaim)
	g.fillInventoryState(&state)
	g.fillExtras(&state)

	for i, c := range g.party {
		state.Party = append(state.Party, g.buildPartyMemberState(c, i))
	}

	for _, e := range g.enemies {
		if e.CurrentHP > 0 {
			state.Enemies = append(state.Enemies, g.buildEnemyState(e))
		}
	}
	if g.phase == "combat" {
		state.Formation = g.formation
		// Only advertise the opening surprise outcome on round 0 — the
		// client's battle scene triggers the banner + auto-wait handler
		// whenever encounter_start is populated, so leaking it into
		// round 1+ loops into infinite ambushes (issue raised by player).
		if g.combatRound == 0 && g.encounterStart != combat.EncounterStartNormal {
			state.EncounterStart = string(g.encounterStart)
		}
	}

	for _, q := range g.quests {
		state.Quests = append(state.Quests, questToState(&q))
	}
	g.fillBuildingSideQuestState(&state)

	return state
}

func cloneMemberActionReqs(in []MemberActionReq) []MemberActionReq {
	if len(in) == 0 {
		return nil
	}
	out := make([]MemberActionReq, len(in))
	copy(out, in)
	return out
}

// questToState converts a generator.Quest to a wire-level QuestState,
// preserving all promotion-quest metadata so the client HUD can drive the
// three-stage flow without inspecting server internals.
func questToState(q *generator.Quest) QuestState {
	if q.Hidden {
		return QuestState{Hidden: true}
	}
	var progress *generator.ObjectiveProgress
	if q.Objectives != nil {
		copy := *q.Objectives
		progress = &copy
	}
	state := QuestState{
		Objectives:    progress,
		ID:            q.ID,
		TemplateID:    q.TemplateID,
		Name:          q.Name,
		Description:   q.Description,
		Completion:    q.Completion,
		Act:           q.Act,
		Completed:     q.Completed,
		Hidden:        q.Hidden,
		IsPromotion:   q.IsPromotion,
		IsSideQuest:   q.IsSideQuest,
		GiverName:     q.GiverName,
		GiverNodeID:   q.GiverNodeID,
		TargetName:    q.TargetName,
		TargetNodeID:  q.TargetNodeID,
		DungeonNodeID: q.DungeonNodeID,
		DungeonName:   q.DungeonName,
		ProofItemID:   q.ProofItemID,
		BossMonsterID: q.BossMonsterID,
		PromoStage:    q.PromoStage,
		Reward:        QuestRewardState{XP: q.Reward.XP, Gold: q.Reward.Gold},
	}
	if progress != nil {
		state.Actions = append([]generator.QuestAction(nil), q.Actions...)
		if progress.Step >= 0 && progress.Step < len(q.Actions) && !q.Completed {
			action := q.Actions[progress.Step]
			state.TargetNodeID, state.TargetName = action.Location, action.Detail
		}
	}
	return state
}

func buildingSideQuestToState(q *generator.BuildingSideQuest) BuildingSideQuestState {
	return BuildingSideQuestState{
		ID:             q.ID,
		Name:           q.Name,
		Description:    q.Description,
		Completion:     q.Completion,
		GiverName:      q.GiverName,
		GiverNodeID:    q.GiverNodeID,
		TargetName:     q.TargetName,
		TargetNodeID:   q.TargetNodeID,
		SourceNodeID:   q.SourceNodeID,
		SourceNodeName: q.SourceNodeName,
		BuildingType:   q.BuildingType,
		Status:         q.Status,
		Completed:      q.Status == generator.BuildingQuestCompleted,
		Reward:         QuestRewardState{XP: q.Reward.XP, Gold: q.Reward.Gold},
	}
}

func (g *Game) ProcessAction(req GameActionRequest) (result *GameState, err error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Panic recovery. A nil-deref or index-out-of-bounds inside the action
	// handler used to surface as an HTTP 500 with an empty body (Go's default
	// ServeMux behavior): the client's JSON parse then threw
	// "Unexpected end of JSON input" and the Battle scene locked up because
	// it had no gameState to react to (issue #138). Recovering here lets us
	// log a full stack trace server-side AND return a typed error so the
	// HTTP handler can emit a proper JSON error body.
	defer func() {
		if r := recover(); r != nil {
			log.Printf("panic in ProcessAction (phase=%q type=%q): %v\n%s",
				g.phase, req.Type, r, debug.Stack())
			result = nil
			err = fmt.Errorf("%w: %v", ErrInternalAction, r)
		}
	}()

	allowedDungeonFieldAction := req.Type == "item" || req.Type == "spell" || g.phase == "quest_complete" && req.Type == "advance"
	if g.inDungeon() && (g.phase == "world" || g.phase == "quest_complete") && !allowedDungeonFieldAction {
		return nil, fmt.Errorf("use exploration actions inside the adventure")
	}
	g.combatLog = nil
	g.combatActions = nil
	g.message = ""

	switch g.phase {
	case "world":
		return g.processWorldAction(req)
	case "combat":
		return g.processCombatAction(req)
	case "quest_complete":
		if req.Type == "" || req.Type == "advance" {
			return g.processAdvance(req)
		}
		g.phase = "world"
		return g.processWorldAction(req)
	default:
		state := g.stateUnlocked()
		return &state, nil
	}
}

// buildPartyMemberState renders a single character into the state payload,
// honoring promotion (display name + sprite swap) and surfacing class abilities.
// The slot argument is the party-slot index; it is used to look up the
// character's equipment in g.inv for sprite composition.
func (g *Game) buildPartyMemberState(c *character.Character, slot int) PartyMemberState {
	cls := g.gd.ClassByID(c.ClassID)
	className := ""
	spriteID := c.ClassID
	promotesTo := ""
	if cls != nil {
		className = cls.Name
		if c.Promoted && cls.PromotedName != "" {
			className = cls.PromotedName
		}
		if c.Promoted && cls.PromotesTo != "" {
			spriteID = cls.PromotesTo
			promotesTo = cls.PromotesTo
		}
	}
	var equip inventory.EquipmentSlots
	if g.inv != nil && slot >= 0 && slot < len(g.inv.Equipment) {
		equip = g.inv.Equipment[slot]
	}
	composition := sprites.Compose(sprites.Input{
		ClassID:    c.ClassID,
		Promoted:   c.Promoted,
		PromotesTo: promotesTo,
		Equip:      equip,
		Palettes:   &g.gd.Palettes,
		Lookup:     sprites.LookupFromGameData(g.gd),
	})
	pm := PartyMemberState{
		Name:        c.Name,
		ClassID:     c.ClassID,
		ClassName:   className,
		Row:         string(c.Row),
		SpriteID:    spriteID,
		Composition: composition,
		Promoted:    c.Promoted,
		Level:       c.Level,
		HP:          c.CurrentHP,
		MaxHP:       c.MaxHP,
		MP:          c.CurrentMP,
		MaxMP:       c.MaxMP,
		STR:         c.STR,
		AGI:         c.AGI,
		INT:         c.INT,
		VIT:         c.VIT,
		LCK:         c.LCK,
		XP:          c.XP,
		XPNext:      character.XPToNextLevel(c.Level, &g.gd.Stats.XPCurve),
		Status:      string(c.Status),
	}
	if cls != nil && len(cls.Abilities) > 0 {
		pm.Abilities = append(pm.Abilities, cls.Abilities...)
	}
	if sb, ok := g.spellBooks[c.Name]; ok {
		for _, spellIDs := range sb.KnownSpells {
			for _, sid := range spellIDs {
				sp := g.gd.SpellByID(sid)
				if sp != nil {
					pm.Spells = append(pm.Spells, SpellState{
						ID:           sid,
						Name:         sp.Name,
						Description:  sp.Description,
						Target:       sp.Target,
						TargetModes:  append([]string(nil), sp.TargetModes...),
						Effect:       sp.Effect,
						MPCost:       sp.MPCost,
						Power:        sp.Power,
						Element:      sp.Element,
						StatusEffect: sp.StatusEffect,
						CuresStatus:  sp.CuresStatus,
						BuffStat:     sp.BuffStat,
						AIPolicy:     sp.AIPolicy,
						Presentation: sp.Presentation,
						Castable:     isCombatCastableEffect(sp.Effect),
					})
				}
			}
		}
	}
	return pm
}

func (g *Game) fillExtras(state *GameState) {
	state.QuestVisitNodeID = g.questVisitNodeID
	state.Discovered = cloneBoolMap(g.discovered)
	// XP/level before combat (for victory animation)
	if len(g.xpBefore) > 0 {
		state.XPBefore = g.xpBefore
		state.LevelBefore = g.levelBefore
		// Build per-character XP thresholds from pre-combat level through current level
		state.XPThresholds = make([][]int, len(g.party))
		for i, c := range g.party {
			startLvl := c.Level
			if i < len(g.levelBefore) {
				startLvl = g.levelBefore[i]
			}
			for lvl := startLvl; lvl <= c.Level; lvl++ {
				state.XPThresholds[i] = append(state.XPThresholds[i], character.XPToNextLevel(lvl, &g.gd.Stats.XPCurve))
			}
		}
	}
	if len(g.diedThisFight) > 0 {
		state.DiedThisFight = append([]bool(nil), g.diedThisFight...)
	}
}

func (g *Game) snapshotVictoryXPProgress() {
	g.xpBefore = make([]int, len(g.party))
	g.levelBefore = make([]int, len(g.party))
	g.diedThisFight = make([]bool, len(g.party))
	for i, c := range g.party {
		g.xpBefore[i] = c.XP
		g.levelBefore[i] = c.Level
	}
}

func (g *Game) fillInventoryState(state *GameState) {
	state.EquipmentBuilds = g.inv.EquipmentBuildsSnapshot()
	state.EquipmentBuildLimit = EquipmentBuildLimit
	// Items: every consumable (potions, ethers, cures, tent, revive, …) AND
	// any weapons/armor stored in the inventory map. Potions and ethers
	// are ALSO exposed on flat fields for HUD/shop code predating #144, but
	// the FF-style Item menu relies on the unified Items slice as the single
	// source of truth.
	for id, count := range g.inv.Consumables {
		if count <= 0 {
			continue
		}
		name := id
		item := ItemState{ID: id, Name: name, Count: count}
		// Enrich consumables with the full metadata the client needs to
		// render descriptions, filter tabs, and grey out unusable items.
		if c := g.findConsumable(id); c != nil {
			item.Name = c.Name
			item.Description = c.Description
			item.Effect = c.Effect
			item.CombatUsable = c.CombatUsable
			item.WorldUsable = c.WorldUsable
		}
		// Static legacy equipment shares the same metadata as rolled gear.
		if baseID, ok := staticEquipmentBaseID(id); ok {
			if base := g.gd.EquipmentBaseByID(baseID); base != nil {
				baseState := baseItemState(base)
				baseState.ID, baseState.Count = id, count
				item = baseState
			}
		}
		state.Items = append(state.Items, item)
	}
	for id, instance := range g.inv.Instances {
		if g.inv.InstanceEquipped(id) {
			continue
		}
		item, err := g.rolledItemState(id, instance)
		if err == nil {
			state.Items = append(state.Items, item)
		}
	}
	sort.Slice(state.Items, func(i, j int) bool { return state.Items[i].ID < state.Items[j].ID })
	for _, id := range g.inv.KeyItems {
		item := KeyItemState{ID: id, Name: id}
		if definition := g.gd.KeyItemByID(id); definition != nil {
			item.Name = definition.Name
			item.Description = definition.Description
		}
		state.KeyItems = append(state.KeyItems, item)
	}
	sort.Slice(state.KeyItems, func(i, j int) bool { return state.KeyItems[i].ID < state.KeyItems[j].ID })
	g.fillGemState(state)

	// Equipment per party slot
	for i := 0; i < len(g.party) && i < 4; i++ {
		eq := g.inv.Equipment[i]
		es := EquipState{
			WeaponID: eq.WeaponID, WeaponInstanceID: eq.WeaponInstanceID,
			ArmorID: eq.ArmorID, ArmorInstanceID: eq.ArmorInstanceID,
			Bonuses:   g.inv.LoadoutStats(i, g.gd),
			Effective: g.inv.ResolveEffectiveStats(g.party[i], i, g.gd).Values(),
			Base:      inventory.ResolveStats(g.party[i], nil, g.gd.ClassByID(g.party[i].ClassID)).Values(),
		}
		if w := g.gd.WeaponByID(eq.WeaponID); w != nil {
			es.WeaponName = w.Name
			es.WeaponPower = w.Power
			es.WeaponHitPct = w.HitPct
			es.WeaponCritPct = w.CritPct
			es.WeaponElement = w.Element
		}
		if a := g.gd.ArmorByID(eq.ArmorID); a != nil {
			es.ArmorName = a.Name
			es.ArmorAbsorb = a.Absorb
			es.ArmorMagicDefense = a.MagicDefense
			es.ArmorEvadePenalty = a.EvadePenalty
			es.ArmorElement = a.ElementResist
		}
		if eq.WeaponInstanceID != "" {
			if resolved, err := inventory.ResolveInstance(g.inv.Instance(eq.WeaponInstanceID), g.gd); err == nil {
				es.WeaponName = resolved.Name
				es.WeaponPower = resolved.Power
			}
			if item, err := g.rolledItemState(eq.WeaponInstanceID, g.inv.Instance(eq.WeaponInstanceID)); err == nil {
				es.WeaponItem = &item
			}
		}
		if eq.ArmorInstanceID != "" {
			if resolved, err := inventory.ResolveInstance(g.inv.Instance(eq.ArmorInstanceID), g.gd); err == nil {
				es.ArmorName = resolved.Name
				es.ArmorAbsorb = resolved.Absorb
			}
			if item, err := g.rolledItemState(eq.ArmorInstanceID, g.inv.Instance(eq.ArmorInstanceID)); err == nil {
				es.ArmorItem = &item
			}
		}
		slotDefs := append([]gamedata.EquipmentSlotDefinition(nil), g.gd.Items.EquipmentSlots...)
		sort.SliceStable(slotDefs, func(i, j int) bool { return slotDefs[i].Order < slotDefs[j].Order })
		for _, def := range slotDefs {
			ref := eq.Equipped(def.ID)
			slot := EquipSlotState{
				ID: def.ID, Name: def.Name, Group: def.Group,
				Accepts: append([]string(nil), def.Accepts...),
				ItemID:  ref.ItemID, InstanceID: ref.InstanceID,
			}
			if ref.InstanceID != "" {
				if item, err := g.rolledItemState(ref.InstanceID, g.inv.Instance(ref.InstanceID)); err == nil {
					slot.Item = &item
				}
			} else if base := g.gd.EquipmentBaseByID(ref.ItemID); base != nil {
				item := baseItemState(base)
				slot.Item = &item
			}
			es.Loadout = append(es.Loadout, slot)
		}
		state.Equipment[i] = es
	}
}

func (g *Game) stateUnlocked() GameState {
	g.prepareFinalQuest()
	state := GameState{
		ID: g.id, Phase: g.phase, CurrentQ: g.currentQ,
		Gold:             g.inv.Gold,
		Potions:          g.inv.Consumables["potion"],
		Ethers:           g.inv.Consumables["ether"],
		HiEthers:         g.inv.Consumables["hi_ether"],
		XEthers:          g.inv.Consumables["x_ether"],
		Message:          g.message,
		CombatLog:        g.combatLog,
		CombatActions:    g.combatActions,
		LastRoundActions: cloneMemberActionReqs(g.lastRoundActions),
	}
	if g.loc != nil {
		state.Location = g.loc.Name
	}
	g.fillLocationState(&state)

	state.Transport = g.buildTransportInfo()
	state.CollectedHiddenItems = g.collectedHiddenItems
	state.TriggeredFlags = cloneBoolMap(g.triggeredFlags)
	g.fillNaturalDiscoveryState(&state)
	state.PendingChestClaim = clonePendingChestClaimState(g.pendingChestClaim)
	g.fillInventoryState(&state)
	g.fillExtras(&state)
	for i, c := range g.party {
		state.Party = append(state.Party, g.buildPartyMemberState(c, i))
	}
	for _, e := range g.enemies {
		if e.CurrentHP > 0 {
			state.Enemies = append(state.Enemies, g.buildEnemyState(e))
		}
	}
	if g.phase == "combat" {
		state.Formation = g.formation
		// Only advertise the opening surprise outcome on round 0 — the
		// client's battle scene triggers the banner + auto-wait handler
		// whenever encounter_start is populated, so leaking it into
		// round 1+ loops into infinite ambushes (issue raised by player).
		if g.combatRound == 0 && g.encounterStart != combat.EncounterStartNormal {
			state.EncounterStart = string(g.encounterStart)
		}
	}
	for _, q := range g.quests {
		state.Quests = append(state.Quests, questToState(&q))
	}
	g.fillBuildingSideQuestState(&state)
	return state
}

func (g *Game) fillBuildingSideQuestState(state *GameState) {
	if len(g.buildingSideQuests) == 0 {
		return
	}
	keys := make([]string, 0, len(g.buildingSideQuests))
	for key := range g.buildingSideQuests {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		q := g.buildingSideQuests[key]
		if q.Status == generator.BuildingQuestAvailable {
			continue
		}
		questCopy := q
		state.BuildingSideQuests = append(state.BuildingSideQuests, buildingSideQuestToState(&questCopy))
	}
}

// buildTransportInfo creates the transport payload for the client.
func (g *Game) buildTransportInfo() TransportInfo {
	if g.trans == nil {
		return TransportInfo{CurrentTier: "T1", TierName: "Foot", EncounterMult: 1.0}
	}
	tiers := g.gd.Transport.Tiers
	td := g.trans.CurrentTierData(tiers)
	if td == nil {
		return TransportInfo{CurrentTier: g.trans.CurrentTier, TierName: "Unknown", EncounterMult: 1.0}
	}
	sprite := td.Name
	tierName := td.Name
	if skin, ok := g.gd.Transport.ConquestSkins[td.ID]; ok {
		sprite = skin.Sprite
		if skin.Name != "" {
			tierName = skin.Name
		}
	}
	return TransportInfo{
		CurrentTier:   td.ID,
		TierName:      tierName,
		Sprite:        sprite,
		EncounterMult: td.EncounterRateMult,
		CrossesWater:  td.CrossesWater,
		Flies:         td.Flies,
	}
}

// logCombat appends a text line and its structured metadata in lockstep.
func (g *Game) logCombat(text string, action CombatActionEntry) {
	g.combatLog = append(g.combatLog, text)
	g.combatActions = append(g.combatActions, action)
}

// resetEncounterStartState clears the preemptive/ambush marker and round
// counter. Called at every combat-exit point (victory, defeat, successful
// flee) so the next encounter starts clean.
func (g *Game) resetEncounterStartState() {
	g.encounterStart = combat.EncounterStartNormal
	g.combatRound = 0
}

func cloneBoolMap(in map[string]bool) map[string]bool {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]bool, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

// rollEncounterStartForNewFight resets the round counter and picks the
// preemptive/ambush/normal outcome for a freshly-generated encounter. AGI
// averages use only living combatants so a poisoned-down party or a softened
// enemy group still biases the roll sensibly. Must be called after g.enemies
// is populated.
func (g *Game) rollEncounterStartForNewFight() {
	g.combatRound = 0
	partyAGIs := make([]int, 0, len(g.party))
	for i, c := range g.party {
		if c != nil && c.CurrentHP > 0 {
			partyAGIs = append(partyAGIs, g.inv.ResolveEffectiveStats(c, i, g.gd).AGI)
		}
	}
	enemyAGIs := make([]int, 0, len(g.enemies))
	for _, e := range g.enemies {
		if e != nil && e.CurrentHP > 0 {
			enemyAGIs = append(enemyAGIs, e.AGI)
		}
	}
	g.encounterStart = combat.RollEncounterStart(
		combat.AverageAGI(partyAGIs),
		combat.AverageAGI(enemyAGIs),
		g.rng,
	)
	switch g.encounterStart {
	case combat.EncounterStartPreemptive:
		g.logCombat("Preemptive strike!", CombatActionEntry{Kind: "info"})
	case combat.EncounterStartAmbush:
		g.logCombat("Ambushed!", CombatActionEntry{Kind: "info"})
	}
}
