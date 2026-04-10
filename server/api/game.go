package api

import (
	"math/rand/v2"
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
)

// Request/response types

type WizardRequest struct {
	TownName    string              `json:"town_name"`
	People      []WizardPersonReq   `json:"people"`
	Places      []string            `json:"places"`
	BigBuilding string              `json:"big_building"`
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
	Type     string              `json:"type"`     // attack, spell, item, flee, encounter, quest_advance
	TargetID int                 `json:"target_id,omitempty"`
	SpellID  string              `json:"spell_id,omitempty"`
	ItemID   string              `json:"item_id,omitempty"`
	SlotIdx  int                 `json:"slot_idx,omitempty"`
	Actions  []MemberActionReq   `json:"actions,omitempty"` // per-member actions for combat
}

type MemberActionReq struct {
	Slot     int    `json:"slot"`      // party slot 0-3
	Type     string `json:"type"`      // attack, spell, item, defend
	TargetID int    `json:"target_id"`
	SpellID  string `json:"spell_id,omitempty"`
}

// GameState is the full state sent to the client.
type GameState struct {
	ID        string              `json:"id"`
	Phase     string              `json:"phase"` // world, combat, quest_complete, victory, defeat
	XPBefore     []int               `json:"xp_before,omitempty"`      // XP values before combat for victory animation
	LevelBefore  []int               `json:"level_before,omitempty"`   // levels before combat for victory animation
	XPThresholds [][]int             `json:"xp_thresholds,omitempty"` // per-character XP thresholds at each level crossed
	Party     []PartyMemberState  `json:"party"`
	Enemies   []EnemyState        `json:"enemies,omitempty"`
	Quests    []QuestState        `json:"quests"`
	CurrentQ  int                 `json:"current_quest"`
	Gold      int                 `json:"gold"`
	Potions   int                 `json:"potions"`
	Items     []ItemState         `json:"items"`
	Equipment [4]EquipState       `json:"equipment"`
	Location  string              `json:"location"`
	Message   string              `json:"message,omitempty"`
	CombatLog []string            `json:"combat_log,omitempty"`
	TileMap   *locality.TileMap   `json:"tilemap,omitempty"`
	ShopItems []ShopItemState     `json:"shop_items,omitempty"`
}

type ItemState struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type EquipState struct {
	WeaponID   string `json:"weapon_id"`
	WeaponName string `json:"weapon_name"`
	ArmorID    string `json:"armor_id"`
	ArmorName  string `json:"armor_name"`
}

type ShopItemState struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"` // weapon, armor, consumable, spell
	Price    int    `json:"price"`
	Power    int    `json:"power,omitempty"`
	Absorb   int    `json:"absorb,omitempty"`
	Classes  string `json:"classes,omitempty"`
	Owned    bool   `json:"owned,omitempty"`
}

type PartyMemberState struct {
	Name      string `json:"name"`
	ClassID   string `json:"class_id"`
	ClassName string `json:"class_name"`
	Level     int    `json:"level"`
	HP        int    `json:"hp"`
	MaxHP     int    `json:"max_hp"`
	STR       int    `json:"str"`
	AGI       int    `json:"agi"`
	INT       int    `json:"int_stat"`
	XP        int    `json:"xp"`
	XPNext    int    `json:"xp_next"`
	Status    string `json:"status"`
	Spells    []SpellState `json:"spells,omitempty"`
}

type SpellState struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Charges int    `json:"charges"`
}

type EnemyState struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	HP   int    `json:"hp"`
	MaxHP int   `json:"max_hp"`
}

type QuestState struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Act         int    `json:"act"`
	Completed   bool   `json:"completed"`
}

// Game holds the live state of one game session.
type Game struct {
	id         string
	gd         *gamedata.GameData
	rng        *rand.Rand
	rngSeed    int64
	loc        *locality.Locality
	walk       *locality.WalkResult
	tileMap    *locality.TileMap
	party      []*character.Character
	spellBooks map[string]*magic.SpellBook
	inv        *inventory.Inventory
	quests     []generator.Quest
	currentQ   int
	phase      string // world, combat, quest_complete, victory, defeat
	enemies    []*combat.Combatant
	combatLog  []string
	message    string
	diff       balance.Difficulty
	xpBefore    []int // snapshot before combat for victory animation
	levelBefore []int // snapshot before combat for victory animation
	discovered map[string]bool // bestiary: monster IDs encountered
	mu         sync.Mutex
}

func (g *Game) State() GameState {
	g.mu.Lock()
	defer g.mu.Unlock()

	state := GameState{
		ID:        g.id,
		Phase:     g.phase,
		CurrentQ:  g.currentQ,
		Gold:      g.inv.Gold,
		Potions:   g.inv.Consumables["potion"],
		Message:   g.message,
		CombatLog: g.combatLog,
	}

	if g.loc != nil {
		state.Location = g.loc.Name
		state.TileMap = g.tileMap
	}

	g.fillInventoryState(&state)
	g.fillExtras(&state)

	for _, c := range g.party {
		cls := g.gd.ClassByID(c.ClassID)
		pm := PartyMemberState{
			Name:      c.Name,
			ClassID:   c.ClassID,
			ClassName: cls.Name,
			Level:     c.Level,
			HP:        c.CurrentHP,
			MaxHP:     c.MaxHP,
			STR:       c.STR,
			AGI:       c.AGI,
			INT:       c.INT,
			XP:        c.XP,
			XPNext:    character.XPToNextLevel(c.Level, &g.gd.Stats.XPCurve),
			Status:    string(c.Status),
		}

		if sb, ok := g.spellBooks[c.Name]; ok {
			for lvl, spellIDs := range sb.KnownSpells {
				for _, sid := range spellIDs {
					sp := g.gd.SpellByID(sid)
					if sp != nil {
						pm.Spells = append(pm.Spells, SpellState{
							ID:      sid,
							Name:    sp.Name,
							Charges: sb.Charges[lvl],
						})
					}
				}
			}
		}

		state.Party = append(state.Party, pm)
	}

	for _, e := range g.enemies {
		if e.CurrentHP > 0 {
			state.Enemies = append(state.Enemies, EnemyState{
				ID: e.ID, Name: e.Name, HP: e.CurrentHP, MaxHP: e.MaxHP,
			})
		}
	}

	for _, q := range g.quests {
		state.Quests = append(state.Quests, QuestState{
			Name: q.Name, Description: q.Description, Act: q.Act, Completed: q.Completed,
		})
	}

	return state
}

func (g *Game) ProcessAction(req GameActionRequest) (*GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.combatLog = nil
	g.message = ""

	switch g.phase {
	case "world":
		return g.processWorldAction(req)
	case "combat":
		return g.processCombatAction(req)
	case "quest_complete":
		return g.processAdvance(req)
	default:
		state := g.stateUnlocked()
		return &state, nil
	}
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
}

func (g *Game) fillInventoryState(state *GameState) {
	// Items (non-potion consumables and weapons in inventory)
	for id, count := range g.inv.Consumables {
		if id == "potion" || count <= 0 {
			continue
		}
		name := id
		for _, c := range g.gd.Items.Consumables {
			if c.ID == id {
				name = c.Name
				break
			}
		}
		// Weapon/armor in inventory
		if w := g.gd.WeaponByID(strings.TrimPrefix(id, "wpn_")); w != nil && strings.HasPrefix(id, "wpn_") {
			name = w.Name
		}
		if a := g.gd.ArmorByID(strings.TrimPrefix(id, "arm_")); a != nil && strings.HasPrefix(id, "arm_") {
			name = a.Name
		}
		state.Items = append(state.Items, ItemState{ID: id, Name: name, Count: count})
	}

	// Equipment per party slot
	for i := 0; i < len(g.party) && i < 4; i++ {
		eq := g.inv.Equipment[i]
		es := EquipState{WeaponID: eq.WeaponID, ArmorID: eq.ArmorID}
		if w := g.gd.WeaponByID(eq.WeaponID); w != nil {
			es.WeaponName = w.Name
		}
		if a := g.gd.ArmorByID(eq.ArmorID); a != nil {
			es.ArmorName = a.Name
		}
		state.Equipment[i] = es
	}
}

func (g *Game) stateUnlocked() GameState {
	state := GameState{
		ID: g.id, Phase: g.phase, CurrentQ: g.currentQ,
		Gold: g.inv.Gold, Potions: g.inv.Consumables["potion"],
		Message: g.message, CombatLog: g.combatLog,
	}
	if g.loc != nil {
		state.Location = g.loc.Name
	}

	g.fillInventoryState(&state)
	g.fillExtras(&state)
	for _, c := range g.party {
		cls := g.gd.ClassByID(c.ClassID)
		pm := PartyMemberState{
			Name: c.Name, ClassID: c.ClassID, ClassName: cls.Name,
			Level: c.Level, HP: c.CurrentHP, MaxHP: c.MaxHP,
			STR: c.STR, AGI: c.AGI, INT: c.INT, XP: c.XP,
			XPNext: character.XPToNextLevel(c.Level, &g.gd.Stats.XPCurve),
			Status: string(c.Status),
		}
		if sb, ok := g.spellBooks[c.Name]; ok {
			for lvl, ids := range sb.KnownSpells {
				for _, sid := range ids {
					sp := g.gd.SpellByID(sid)
					if sp != nil {
						pm.Spells = append(pm.Spells, SpellState{ID: sid, Name: sp.Name, Charges: sb.Charges[lvl]})
					}
				}
			}
		}
		state.Party = append(state.Party, pm)
	}
	for _, e := range g.enemies {
		if e.CurrentHP > 0 {
			state.Enemies = append(state.Enemies, EnemyState{ID: e.ID, Name: e.Name, HP: e.CurrentHP, MaxHP: e.MaxHP})
		}
	}
	for _, q := range g.quests {
		state.Quests = append(state.Quests, QuestState{Name: q.Name, Description: q.Description, Act: q.Act, Completed: q.Completed})
	}
	return state
}
