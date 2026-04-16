package api

import (
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"runtime/debug"
	"sort"
	"strings"
	"sync"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/magic"
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
}

type GameActionRequest struct {
	Type     string            `json:"type"` // attack, spell, item, flee, encounter, quest_advance
	TargetID int               `json:"target_id,omitempty"`
	SpellID  string            `json:"spell_id,omitempty"`
	ItemID   string            `json:"item_id,omitempty"`
	SlotIdx  int               `json:"slot_idx,omitempty"`
	NodeID   string            `json:"node_id,omitempty"` // node ID for quest_advance / sequence-break checks
	TileType *int              `json:"tile_type,omitempty"`
	Actions  []MemberActionReq `json:"actions,omitempty"` // per-member actions for combat
}

type MemberActionReq struct {
	Slot      int    `json:"slot"` // party slot 0-3
	Type      string `json:"type"` // attack, spell, item, defend, ability
	TargetID  int    `json:"target_id"`
	SpellID   string `json:"spell_id,omitempty"`
	AbilityID string `json:"ability_id,omitempty"`
	ItemID    string `json:"item_id,omitempty"` // consumable id for type=item (potion, ether, ...)
}

// GameState is the full state sent to the client.
type GameState struct {
	ID           string  `json:"id"`
	Phase        string  `json:"phase"`                   // world, combat, quest_complete, victory, defeat
	XPBefore     []int   `json:"xp_before,omitempty"`     // XP values before combat for victory animation
	LevelBefore  []int   `json:"level_before,omitempty"`  // levels before combat for victory animation
	XPThresholds [][]int `json:"xp_thresholds,omitempty"` // per-character XP thresholds at each level crossed
	// DiedThisFight[i] is true for any party member whose IsAlive() was false
	// at the moment victory-XP was distributed. Survives restParty() so the
	// client can render the victory screen correctly. Reset at encounter start.
	DiedThisFight []bool             `json:"died_this_fight,omitempty"`
	Party         []PartyMemberState `json:"party"`
	Enemies       []EnemyState       `json:"enemies,omitempty"`
	Formation     string             `json:"formation,omitempty"`
	// EncounterStart is "preemptive" or "ambush" when the current encounter
	// started with one side getting a free first round. Empty for normal.
	EncounterStart       string                   `json:"encounter_start,omitempty"`
	Quests               []QuestState             `json:"quests"`
	BuildingSideQuests   []BuildingSideQuestState `json:"building_side_quests,omitempty"`
	CurrentQ             int                      `json:"current_quest"`
	Gold                 int                      `json:"gold"`
	Potions              int                      `json:"potions"`
	Ethers               int                      `json:"ethers"`
	HiEthers             int                      `json:"hi_ethers"`
	XEthers              int                      `json:"x_ethers"`
	Items                []ItemState              `json:"items"`
	Equipment            [4]EquipState            `json:"equipment"`
	Location             string                   `json:"location"`
	Message              string                   `json:"message,omitempty"`
	CombatLog            []string                 `json:"combat_log,omitempty"`
	CombatActions        []CombatActionEntry      `json:"combat_actions,omitempty"`
	LastRoundActions     []MemberActionReq        `json:"last_round_actions,omitempty"`
	TileMap              *locality.TileMap        `json:"tilemap,omitempty"`
	ShopItems            []ShopItemState          `json:"shop_items,omitempty"`
	Transport            TransportInfo            `json:"transport"`
	CollectedHiddenItems map[string]bool          `json:"collected_hidden_items,omitempty"`
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
	ID    string `json:"id"`
	Name  string `json:"name"`
	Count int    `json:"count"`
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

type EquipState struct {
	WeaponID          string `json:"weapon_id"`
	WeaponName        string `json:"weapon_name"`
	WeaponPower       int    `json:"weapon_power,omitempty"`
	WeaponHitPct      int    `json:"weapon_hit_pct,omitempty"`
	WeaponCritPct     int    `json:"weapon_crit_pct,omitempty"`
	WeaponElement     string `json:"weapon_element,omitempty"`
	ArmorID           string `json:"armor_id"`
	ArmorName         string `json:"armor_name"`
	ArmorAbsorb       int    `json:"armor_absorb,omitempty"`
	ArmorMagicDefense int    `json:"armor_magic_defense,omitempty"`
	ArmorEvadePenalty int    `json:"armor_evade_penalty,omitempty"`
	ArmorElement      string `json:"armor_element,omitempty"`
}

type ShopItemState struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	Type         string              `json:"type"` // weapon, armor, consumable, spell
	Price        int                 `json:"price"`
	Power        int                 `json:"power,omitempty"`
	Absorb       int                 `json:"absorb,omitempty"`
	HitPct       int                 `json:"hit_pct,omitempty"`
	CritPct      int                 `json:"crit_pct,omitempty"`
	MagicDefense int                 `json:"magic_defense,omitempty"`
	EvadePenalty int                 `json:"evade_penalty,omitempty"`
	Element      string              `json:"element,omitempty"`
	Classes      string              `json:"classes,omitempty"`
	ClassIDs     []string            `json:"class_ids,omitempty"`
	Owned        bool                `json:"owned,omitempty"`
	School       string              `json:"school,omitempty"`
	SpellLevel   int                 `json:"spell_level,omitempty"`
	Learners     []SpellLearnerState `json:"learners,omitempty"`
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
	XP          int                 `json:"xp"`
	XPNext      int                 `json:"xp_next"`
	Status      string              `json:"status"`
	Spells      []SpellState        `json:"spells,omitempty"`
	Abilities   []string            `json:"abilities,omitempty"`
}

type SpellState struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Target       string `json:"target"`
	Effect       string `json:"effect"`
	MPCost       int    `json:"mp_cost"`
	Power        int    `json:"power,omitempty"`
	Element      string `json:"element,omitempty"`
	StatusEffect string `json:"status_effect,omitempty"`
	CuresStatus  string `json:"cures_status,omitempty"`
	BuffStat     string `json:"buff_stat,omitempty"`
	Castable     bool   `json:"castable_in_combat"`
}

type EnemyState struct {
	ID          int      `json:"id"`
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
		ID:       e.ID,
		Name:     e.Name,
		HP:       e.CurrentHP,
		MaxHP:    e.MaxHP,
		Size:     e.Size,
		Status:   string(e.Status),
		IsUndead: g.isMonsterUndead(e.Name),
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
	Kind       string           `json:"kind"`                  // attack, spell, ability, heal, item, counter, info
	Element    string           `json:"element,omitempty"`     // fire, ice, lightning, holy, dark, none
	DamageType string           `json:"damage_type,omitempty"` // physical, magical
	ActorID    int              `json:"actor_id,omitempty"`
	ActorName  string           `json:"actor_name,omitempty"`
	TargetID   int              `json:"target_id,omitempty"`
	TargetName string           `json:"target_name,omitempty"`
	Damage     int              `json:"damage,omitempty"`
	Killed     bool             `json:"killed,omitempty"`
	Crit       bool             `json:"crit,omitempty"`
	Missed     bool             `json:"missed,omitempty"`
	Hits       []CombatHitEntry `json:"hits,omitempty"`
	SpellName  string           `json:"spell_name,omitempty"`
	Initiative int              `json:"initiative,omitempty"` // weighted turn-order roll for this actor
}

// CombatHitEntry represents a single hit within a multi-hit attack.
type CombatHitEntry struct {
	Damage int  `json:"damage"`
	Crit   bool `json:"crit,omitempty"`
	Missed bool `json:"missed,omitempty"`
}

type QuestState struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Completion   string `json:"completion,omitempty"`
	Act          int    `json:"act"`
	Completed    bool   `json:"completed"`
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
	id                 string
	gd                 *gamedata.GameData
	rng                *rand.Rand
	rngSeed            int64
	loc                *locality.Locality
	walk               *locality.WalkResult
	tileMap            *locality.TileMap
	party              []*character.Character
	spellBooks         map[string]*magic.SpellBook
	inv                *inventory.Inventory
	quests             []generator.Quest
	buildingSideQuests map[string]generator.BuildingSideQuest
	currentQ           int
	phase              string // world, combat, quest_complete, victory, defeat
	enemies            []*combat.Combatant
	spellBuffs         map[int][]combat.CombatBuff // slot -> buffs active for current encounter
	combatLog          []string
	combatActions      []CombatActionEntry
	message            string
	diff               balance.Difficulty
	xpBefore           []int // snapshot before combat for victory animation
	levelBefore        []int // snapshot before combat for victory animation
	// diedThisFight is captured at the exact moment the combat-victory block
	// distributes XP (before restParty heals dead members). Exposed to the
	// client via GameState.DiedThisFight.
	diedThisFight        []bool
	discovered           map[string]bool // bestiary: monster IDs encountered
	collectedHiddenItems map[string]bool // town hidden-item keys already picked up
	visitedNodes         map[string]bool // node IDs the player has entered (sequence-break tracking)
	formation            string          // current encounter layout type
	lastRoundActions     []MemberActionReq
	// encounterStart records preemptive/ambush state for the current fight so
	// the first call to ResolveTurn can skip one side's actions.
	encounterStart combat.EncounterStart
	// combatRound is 0 until the first ResolveTurn completes; used to gate
	// the first-round side-skip enforced by encounterStart.
	combatRound      int
	promotionOffered bool // midpoint promotion has already fired
	// scriptedBoss marks the currently running combat as a scripted quest
	// encounter (today: the promotion trial guardian). The victory handler in
	// game_combat.go uses this to drop the proof item, advance promo_stage,
	// and return directly to the world phase instead of showing a
	// quest-complete screen for a fight that didn't complete a quest.
	scriptedBoss bool
	trans        *transport.State // current transport tier & unlocks
	mu           sync.Mutex
}

func (g *Game) State() GameState {
	g.mu.Lock()
	defer g.mu.Unlock()

	state := GameState{
		ID:               g.id,
		Phase:            g.phase,
		CurrentQ:         g.currentQ,
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
		state.TileMap = g.tileMap
	}

	state.Transport = g.buildTransportInfo()
	state.CollectedHiddenItems = g.collectedHiddenItems
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
	return QuestState{
		ID:            q.ID,
		Name:          q.Name,
		Description:   q.Description,
		Completion:    q.Completion,
		Act:           q.Act,
		Completed:     q.Completed,
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
						Target:       sp.Target,
						Effect:       sp.Effect,
						MPCost:       sp.MPCost,
						Power:        sp.Power,
						Element:      sp.Element,
						StatusEffect: sp.StatusEffect,
						CuresStatus:  sp.CuresStatus,
						BuffStat:     sp.BuffStat,
						Castable:     isCombatCastableEffect(sp.Effect),
					})
				}
			}
		}
	}
	return pm
}

func (g *Game) fillExtras(state *GameState) {
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
		// Weapon/armor in inventory -- enrich with Power/Absorb so the
		// client can compute equip-delta previews (issue #96).
		if strings.HasPrefix(id, "wpn_") {
			if w := g.gd.WeaponByID(strings.TrimPrefix(id, "wpn_")); w != nil {
				item.Name = w.Name
				item.Power = w.Power
			}
		}
		if strings.HasPrefix(id, "arm_") {
			if a := g.gd.ArmorByID(strings.TrimPrefix(id, "arm_")); a != nil {
				item.Name = a.Name
				item.Absorb = a.Absorb
			}
		}
		state.Items = append(state.Items, item)
	}

	// Equipment per party slot
	for i := 0; i < len(g.party) && i < 4; i++ {
		eq := g.inv.Equipment[i]
		es := EquipState{WeaponID: eq.WeaponID, ArmorID: eq.ArmorID}
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
		state.Equipment[i] = es
	}
}

func (g *Game) stateUnlocked() GameState {
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

	state.Transport = g.buildTransportInfo()
	state.CollectedHiddenItems = g.collectedHiddenItems
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

// rollEncounterStartForNewFight resets the round counter and picks the
// preemptive/ambush/normal outcome for a freshly-generated encounter. AGI
// averages use only living combatants so a poisoned-down party or a softened
// enemy group still biases the roll sensibly. Must be called after g.enemies
// is populated.
func (g *Game) rollEncounterStartForNewFight() {
	g.combatRound = 0
	partyAGIs := make([]int, 0, len(g.party))
	for _, c := range g.party {
		if c != nil && c.CurrentHP > 0 {
			partyAGIs = append(partyAGIs, c.AGI)
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
