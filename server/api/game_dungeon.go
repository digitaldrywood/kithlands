package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"slices"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/dungeon"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/settlements"
)

const LocationDungeon = "dungeon"

// DungeonProgress is additive JSONB save state. Combat is deliberately not
// checkpointed: saves are taken before an encounter or after its resolution.
type DungeonProgress struct {
	ID            string          `json:"id"`
	RoomID        string          `json:"room_id"`
	Position      dungeon.Point   `json:"position"`
	Flags         map[string]bool `json:"flags"`
	Visited       []string        `json:"visited"`
	Journal       []string        `json:"journal"`
	Active        bool            `json:"active"`
	Origin        LocationState   `json:"origin"`
	PayoffClaimed bool            `json:"payoff_claimed"`
	EncounterID   string          `json:"-"`
}

type DungeonEntryState struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Label       string `json:"label"`
	Description string `json:"description"`
	NodeID      string `json:"node_id"`
	Completed   bool   `json:"completed"`
}
type DungeonActionState struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Kind      string `json:"kind"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
	Completed bool   `json:"completed"`
}
type DungeonState struct {
	ID           string               `json:"id"`
	Title        string               `json:"title"`
	LocalityName string               `json:"locality_name"`
	RoomID       string               `json:"room_id"`
	RoomName     string               `json:"room_name"`
	Description  string               `json:"description"`
	Objective    string               `json:"objective"`
	Map          *settlements.Map     `json:"map"`
	Position     dungeon.Point        `json:"position"`
	Actions      []DungeonActionState `json:"actions"`
	Visited      []string             `json:"visited"`
	Journal      []string             `json:"journal"`
	Complete     bool                 `json:"complete"`
}
type DungeonRequest struct {
	Type     string `json:"type"`
	DX       int    `json:"dx,omitempty"`
	DY       int    `json:"dy,omitempty"`
	ActionID string `json:"action_id,omitempty"`
	NodeID   string `json:"node_id,omitempty"`
}

func (g *Game) dungeonDefinition() *dungeon.Definition {
	if g.gd == nil {
		return nil
	}
	if g.dungeon == nil {
		if len(g.gd.Dungeons) > 0 {
			return &g.gd.Dungeons[0]
		}
		return nil
	}
	for i := range g.gd.Dungeons {
		if g.gd.Dungeons[i].ID == g.dungeon.ID {
			return &g.gd.Dungeons[i]
		}
	}
	return nil
}
func (g *Game) inDungeon() bool { return g.dungeon != nil && g.dungeon.Active }
func (g *Game) dungeonText(text string) string {
	name := "your town"
	if g.loc != nil && g.loc.Name != "" {
		name = g.loc.Name
	}
	return strings.ReplaceAll(text, "{locality}", name)
}
func (g *Game) fillDungeonState(s *GameState) {
	def := g.dungeonDefinition()
	if def == nil {
		return
	}
	node := ""
	if g.walk != nil {
		node = g.walk.Spawn.ID
	}
	s.DungeonEntry = &DungeonEntryState{ID: def.ID, Title: g.dungeonText(def.Title), Label: def.EntryLabel, Description: g.dungeonText(def.Description), NodeID: node}
	if g.dungeon != nil {
		s.DungeonEntry.Completed = g.dungeon.PayoffClaimed
	}
	if !g.inDungeon() {
		return
	}
	p := g.dungeon
	r := def.Room(p.RoomID)
	if r == nil {
		return
	}
	s.Dungeon = &DungeonState{ID: def.ID, Title: g.dungeonText(def.Title), LocalityName: g.dungeonText("{locality}"), RoomID: r.ID, RoomName: r.Name, Description: g.dungeonText(r.Description), Map: r.Map, Position: p.Position, Visited: slices.Clone(p.Visited), Journal: slices.Clone(p.Journal), Complete: p.Flags[def.CompleteFlag]}
	for _, o := range def.Objectives {
		if o.Until == "" || !p.Flags[o.Until] {
			s.Dungeon.Objective = g.dungeonText(o.Text)
			break
		}
	}
	for _, a := range r.Actions {
		available := true
		for _, f := range a.Requires {
			if !p.Flags[f] {
				available = false
			}
		}
		completed := a.Flag != "" && p.Flags[a.Flag]
		if completed && !a.Repeatable {
			available = false
		}
		s.Dungeon.Actions = append(s.Dungeon.Actions, DungeonActionState{ID: a.ID, Label: a.Label, Kind: a.Kind, X: a.Position.X, Y: a.Position.Y, Available: available, Reason: g.dungeonText(a.Reason), Completed: completed})
	}
}

// ProcessDungeon accepts input intents, never client-supplied locations,
// progress flags, destinations, monster IDs, or rewards.
func (g *Game) ProcessDungeon(req DungeonRequest) (GameState, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.phase != "world" && g.phase != "quest_complete" {
		return GameState{}, fmt.Errorf("finish the current encounter before exploring")
	}
	def := g.dungeonDefinition()
	if def == nil {
		return GameState{}, fmt.Errorf("this adventure is unavailable")
	}
	if req.Type == "enter" {
		if g.inDungeon() || (g.location.Kind != LocationWorld && g.location.Kind != LocationSettlement) {
			return GameState{}, fmt.Errorf("follow the trail from town")
		}
		if req.NodeID != "" && (g.walk == nil || req.NodeID != g.walk.Spawn.ID) {
			return GameState{}, fmt.Errorf("this trail belongs to your home locality")
		}
		if g.dungeon == nil {
			g.dungeon = &DungeonProgress{ID: def.ID, Flags: map[string]bool{}}
		}
		p := g.dungeon
		p.Origin = g.location
		p.Active = true
		p.EncounterID = ""
		g.enterDungeonRoom(def.EntryRoom, def.EntryPosition)
		g.phase = "world"
		g.message = g.dungeonText(def.Description)
		return g.stateUnlocked(), nil
	}
	if !g.inDungeon() || g.location.Kind != LocationDungeon {
		return GameState{}, fmt.Errorf("enter the adventure before exploring")
	}
	p := g.dungeon
	room := def.Room(p.RoomID)
	if room == nil {
		return GameState{}, fmt.Errorf("the current room is unavailable")
	}
	switch req.Type {
	case "move":
		if !((req.DX == -1 || req.DX == 1) && req.DY == 0 || (req.DY == -1 || req.DY == 1) && req.DX == 0) {
			return GameState{}, fmt.Errorf("move one tile at a time")
		}
		next := dungeon.Point{X: p.Position.X + req.DX, Y: p.Position.Y + req.DY}
		if !room.Walkable(next) {
			return GameState{}, fmt.Errorf("the path is blocked")
		}
		p.Position = next
		g.message = ""
	case "interact":
		action := room.Action(req.ActionID)
		if action == nil {
			return GameState{}, fmt.Errorf("that interaction is not in this room")
		}
		if absInt(action.Position.X-p.Position.X)+absInt(action.Position.Y-p.Position.Y) > 1 {
			return GameState{}, fmt.Errorf("move closer to %s", action.Label)
		}
		for _, flag := range action.Requires {
			if !p.Flags[flag] {
				return GameState{}, fmt.Errorf("%s", g.dungeonText(action.Reason))
			}
		}
		if action.Flag != "" && p.Flags[action.Flag] && !action.Repeatable {
			return GameState{}, fmt.Errorf("already completed: %s", action.Label)
		}
		if err := g.interactDungeon(def, action); err != nil {
			return GameState{}, err
		}
	case "retreat":
		if err := g.leaveDungeon(def); err != nil {
			return GameState{}, err
		}
	default:
		return GameState{}, fmt.Errorf("unknown exploration action")
	}
	return g.stateUnlocked(), nil
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
func (g *Game) enterDungeonRoom(id string, position dungeon.Point) {
	p := g.dungeon
	p.RoomID = id
	p.Position = position
	if !slices.Contains(p.Visited, id) {
		p.Visited = append(p.Visited, id)
	}
	g.location = LocationState{Kind: LocationDungeon, MapID: p.ID + "/" + id, WorldNodeID: p.Origin.WorldNodeID}
}
func (g *Game) interactDungeon(def *dungeon.Definition, a *dungeon.Action) error {
	switch a.Kind {
	case "door":
		g.enterDungeonRoom(a.Destination, a.Arrival)
	case "exit":
		return g.leaveDungeon(def)
	case "encounter":
		return g.startDungeonEncounter(a)
	case "rest":
		g.restParty()
	case "treasure":
		if a.Reward == nil {
			return fmt.Errorf("this treasure has no reward")
		}
		if err := g.grantDungeonReward(*a.Reward); err != nil {
			return err
		}
	case "hint", "switch":
	default:
		return fmt.Errorf("unsupported interaction")
	}
	if a.Flag != "" {
		g.dungeon.Flags[a.Flag] = true
	}
	g.message = g.dungeonText(a.Text)
	if a.Text != "" && !slices.Contains(g.dungeon.Journal, g.message) {
		g.dungeon.Journal = append(g.dungeon.Journal, g.message)
	}
	return nil
}
func (g *Game) grantDungeonReward(r dungeon.Reward) error {
	// A failed multi-item grant must neither partially grant loot nor consume
	// its once-only claim. Preserve the isolated loot sequence too.
	before, err := json.Marshal(g.inv)
	if err != nil {
		return err
	}
	seq := g.lootRollSeq
	count := r.Count
	if r.ItemID != "" && count == 0 {
		count = 1
	}
	for i := 0; i < count; i++ {
		if _, err := g.grantLoot(r.ItemID, max(r.Level, 1), r.Sockets); err != nil {
			var restored inventory.Inventory
			if restoreErr := json.Unmarshal(before, &restored); restoreErr != nil {
				return fmt.Errorf("restore reward transaction: %w", restoreErr)
			}
			g.inv = &restored
			g.lootRollSeq = seq
			return err
		}
	}
	g.inv.Gold += r.Gold
	return nil
}
func (g *Game) leaveDungeon(def *dungeon.Definition) error {
	p := g.dungeon
	if p.Flags[def.CompleteFlag] && !p.PayoffClaimed {
		if err := g.grantDungeonReward(def.Payoff); err != nil {
			return err
		}
		p.PayoffClaimed = true
		g.message = g.dungeonText(def.ReturnText)
		p.Journal = append(p.Journal, g.message)
	} else {
		g.message = g.dungeonText(def.RetreatText)
	}
	p.Active = false
	p.EncounterID = ""
	g.location = p.Origin
	if g.location.Kind != LocationSettlement {
		g.location.Kind = LocationWorld
	}
	g.phase = "world"
	return nil
}
func (g *Game) startDungeonEncounter(a *dungeon.Action) error {
	if a.Encounter == nil {
		return fmt.Errorf("encounter is unavailable")
	}
	e := a.Encounter
	ids := e.Monsters
	if len(g.party) >= 4 && len(e.FullParty) > 0 {
		ids = e.FullParty
	}
	enemies := make([]*combat.Combatant, 0, len(ids))
	for i, id := range ids {
		m := g.gd.MonsterByID(id)
		if m == nil {
			return fmt.Errorf("encounter monster unavailable")
		}
		c := balance.ScaleMonster(m, 100+i, e.Level, g.diff)
		c.MonsterID = m.ID
		c.Size = m.Size
		enemies = append(enemies, c)
	}
	g.snapshotVictoryXPProgress()
	g.enemies = enemies
	g.formation = "standard"
	g.phase = "combat"
	g.spellBuffs = nil
	g.scriptedBoss = false
	g.resetEncounterStartState()
	g.dungeon.EncounterID = a.ID
	if g.discovered == nil {
		g.discovered = map[string]bool{}
	}
	for _, id := range ids {
		g.discovered[id] = true
	}
	g.message = g.dungeonText(a.Text)
	g.combatLog = nil
	g.combatActions = nil
	return nil
}
func (g *Game) completeDungeonEncounter() {
	if !g.inDungeon() || g.dungeon.EncounterID == "" {
		return
	}
	def := g.dungeonDefinition()
	if def == nil {
		return
	}
	room := def.Room(g.dungeon.RoomID)
	if room == nil {
		return
	}
	a := room.Action(g.dungeon.EncounterID)
	if a != nil {
		g.dungeon.Flags[a.Flag] = true
	}
	g.dungeon.EncounterID = ""
}
func (g *Game) recoverDungeonDefeat() bool {
	if !g.inDungeon() {
		return false
	}
	def := g.dungeonDefinition()
	if def == nil {
		return false
	}
	g.dungeon.EncounterID = ""
	g.restParty()
	g.enemies = nil
	g.phase = "world"
	g.enterDungeonRoom(def.EntryRoom, def.EntryPosition)
	g.message = g.dungeonText(def.DefeatText)
	return true
}
func (g *Game) restoreDungeon() {
	if g.dungeon == nil {
		return
	}
	def := g.dungeonDefinition()
	if def == nil {
		g.dungeon = nil
		return
	}
	p := g.dungeon
	if p.Flags == nil {
		p.Flags = map[string]bool{}
	}
	p.EncounterID = ""
	if !p.Active {
		return
	}
	room := def.Room(p.RoomID)
	if room == nil || !room.Walkable(p.Position) {
		p.RoomID = def.EntryRoom
		p.Position = def.EntryPosition
	}
	g.enterDungeonRoom(p.RoomID, p.Position)
}
func (s *Server) handleDungeon(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req DungeonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpError(w, "invalid exploration input", http.StatusBadRequest)
		return
	}
	state, err := game.ProcessDungeon(req)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, state)
}
func (s *Server) handleDungeonArt(w http.ResponseWriter, r *http.Request) {
	file := r.PathValue("file")
	if filepath.Base(file) != file {
		http.NotFound(w, r)
		return
	}
	for _, def := range s.gd.Dungeons {
		for _, room := range def.Rooms {
			for _, layer := range room.Map.Layers {
				if layer.Image == "/api/data/dungeons/art/"+file {
					w.Header().Set("X-Content-Type-Options", "nosniff")
					http.ServeFile(w, r, filepath.Join(s.games.sharedDir, "dungeons", "art", file))
					return
				}
			}
		}
	}
	http.NotFound(w, r)
}
