package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"slices"
	"strings"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/dungeon"
	"github.com/digitaldrywood/kithlands/internal/httpasset"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/settlements"
)

const LocationDungeon = "dungeon"

// DungeonProgress is additive JSONB save state. Combat is deliberately not
// checkpointed: saves are taken before an encounter or after its resolution.
type DungeonProgress struct {
	RecoveredFromDefeat    bool            `json:"-"`
	ID                     string          `json:"id"`
	RoomID                 string          `json:"room_id"`
	Position               dungeon.Point   `json:"position"`
	Flags                  map[string]bool `json:"flags"`
	Visited                []string        `json:"visited"`
	Journal                []string        `json:"journal"`
	Active                 bool            `json:"active"`
	Origin                 LocationState   `json:"origin"`
	ClaimedPayoffMaterials map[string]bool `json:"claimed_payoff_materials,omitempty"`
	PayoffClaimed          bool            `json:"payoff_claimed"`
	EncounterID            string          `json:"-"`
}

type DungeonEntryState struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	Label        string   `json:"label"`
	Description  string   `json:"description"`
	NodeID       string   `json:"node_id"`
	RouteNodeIDs []string `json:"route_node_ids,omitempty"`
	Completed    bool     `json:"completed"`
	Started      bool     `json:"started"`
	Objective    string   `json:"objective"`
	Journal      []string `json:"journal,omitempty"`
	RewardGold   int      `json:"reward_gold,omitempty"`
}
type DungeonActionState struct {
	Encounter *DungeonEncounterPreview `json:"encounter,omitempty"`
	ID        string                   `json:"id"`
	Label     string                   `json:"label"`
	Kind      string                   `json:"kind"`
	X         int                      `json:"x"`
	Y         int                      `json:"y"`
	Available bool                     `json:"available"`
	Reason    string                   `json:"reason,omitempty"`
	Completed bool                     `json:"completed"`
}
type DungeonEnemyPreview struct {
	MonsterID string `json:"monster_id"`
	Name      string `json:"name"`
	Tactics   string `json:"tactics"`
}
type DungeonEncounterPreview struct {
	Optional    bool                  `json:"optional"`
	Level       int                   `json:"level"`
	Enemies     []DungeonEnemyPreview `json:"enemies"`
	Description string                `json:"description"`
}
type DungeonState struct {
	RecoveredFromDefeat bool                 `json:"recovered_from_defeat,omitempty"`
	BattleBackground    string               `json:"battle_background,omitempty"`
	ID                  string               `json:"id"`
	Title               string               `json:"title"`
	LocalityName        string               `json:"locality_name"`
	RoomID              string               `json:"room_id"`
	RoomName            string               `json:"room_name"`
	Description         string               `json:"description"`
	Objective           string               `json:"objective"`
	Map                 *settlements.Map     `json:"map"`
	Position            dungeon.Point        `json:"position"`
	Actions             []DungeonActionState `json:"actions"`
	Visited             []string             `json:"visited"`
	Journal             []string             `json:"journal"`
	Complete            bool                 `json:"complete"`
}
type DungeonRequest struct {
	Type          string         `json:"type"`
	DX            int            `json:"dx,omitempty"`
	DY            int            `json:"dy,omitempty"`
	ActionID      string         `json:"action_id,omitempty"`
	NodeID        string         `json:"node_id,omitempty"`
	WorldPosition *WorldPosition `json:"world_position,omitempty"`
}

func (g *Game) dungeonDefinition() *dungeon.Definition {
	if g.gd == nil {
		return nil
	}
	id := g.activeDungeonID
	if id == "" && g.dungeon != nil {
		id = g.dungeon.ID
	}
	if id == "" {
		if len(g.gd.Dungeons) > 0 {
			return &g.gd.Dungeons[0]
		}
		return nil
	}
	for i := range g.gd.Dungeons {
		if g.gd.Dungeons[i].ID == id {
			return &g.gd.Dungeons[i]
		}
	}
	return nil
}

func (g *Game) dungeonDefinitionByID(id string) *dungeon.Definition {
	if g.gd == nil || id == "" {
		return nil
	}
	for i := range g.gd.Dungeons {
		if g.gd.Dungeons[i].ID == id {
			return &g.gd.Dungeons[i]
		}
	}
	return nil
}

func (g *Game) dungeonEntryNode(def *dungeon.Definition) *locality.Node {
	if def == nil || g.walk == nil {
		return nil
	}
	if def.EntryRegion == "far" {
		var best *locality.Node
		bestDistance := -1
		candidates := append([]*locality.Node(nil), g.walk.Far...)
		candidates = append(candidates, g.walk.Medium...)
		candidates = append(candidates, g.walk.Close...)
		for _, node := range candidates {
			if node == nil || g.walk.Spawn != nil && node.ID == g.walk.Spawn.ID || g.walk.BigBad != nil && node.ID == g.walk.BigBad.ID {
				continue
			}
			distance, reachable := g.walk.DistanceMap[node.ID]
			if !reachable {
				continue
			}
			if distance > bestDistance || distance == bestDistance && best != nil && node.ID < best.ID {
				best = node
				bestDistance = distance
			}
		}
		return best
	}
	return g.walk.Spawn
}

func (g *Game) dungeonDefinitionAtNode(nodeID string) *dungeon.Definition {
	if nodeID == "" || g.gd == nil {
		return nil
	}
	for i := range g.gd.Dungeons {
		def := &g.gd.Dungeons[i]
		if node := g.dungeonEntryNode(def); node != nil && node.ID == nodeID {
			return def
		}
	}
	return nil
}

func (g *Game) worldNodeRoute(target string) []string {
	if g.loc == nil || target == "" {
		return nil
	}
	start := g.location.WorldNodeID
	if start == "" && g.walk != nil && g.walk.Spawn != nil {
		start = g.walk.Spawn.ID
	}
	if start == "" || start == target {
		return nil
	}
	previous := map[string]string{start: start}
	queue := []string{start}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if current == target {
			break
		}
		for _, neighbor := range g.loc.Neighbors(current) {
			if _, seen := previous[neighbor]; seen {
				continue
			}
			previous[neighbor] = current
			queue = append(queue, neighbor)
		}
	}
	if _, ok := previous[target]; !ok {
		return nil
	}
	reverse := []string{}
	for node := target; node != start; node = previous[node] {
		reverse = append(reverse, node)
	}
	route := make([]string, len(reverse))
	for i := range reverse {
		route[len(reverse)-1-i] = reverse[i]
	}
	return route
}

// WorldNodeRoute returns the adjacent locality nodes from the server-held
// world arrival to target. Callers still submit each hop through
// ProcessLocationTransition; the route itself never changes game state.
func (g *Game) WorldNodeRoute(target string) []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.worldNodeRoute(target)
}

func (g *Game) dungeonProgress(id string) *DungeonProgress {
	if g.dungeons != nil {
		if progress := g.dungeons[id]; progress != nil {
			return progress
		}
	}
	if g.dungeon != nil && g.dungeon.ID == id {
		return g.dungeon
	}
	return nil
}

func (g *Game) activateDungeon(def *dungeon.Definition) *DungeonProgress {
	if g.dungeons == nil {
		g.dungeons = make(map[string]*DungeonProgress)
	}
	progress := g.dungeons[def.ID]
	if progress == nil {
		progress = &DungeonProgress{ID: def.ID, Flags: map[string]bool{}}
		g.dungeons[def.ID] = progress
	}
	for id, other := range g.dungeons {
		if id != def.ID && other != nil {
			other.Active = false
		}
	}
	g.activeDungeonID = def.ID
	g.dungeon = progress
	return progress
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
	if g.gd == nil {
		return
	}
	for i := range g.gd.Dungeons {
		def := &g.gd.Dungeons[i]
		node := g.dungeonEntryNode(def)
		if node == nil {
			continue
		}
		entry := DungeonEntryState{ID: def.ID, Title: g.dungeonText(def.Title), Label: def.EntryLabel, Description: g.dungeonText(def.Description), NodeID: node.ID, RouteNodeIDs: g.worldNodeRoute(node.ID)}
		entry.RewardGold = def.Payoff.Gold
		flags := map[string]bool{}
		if progress := g.dungeonProgress(def.ID); progress != nil {
			entry.Completed = progress.PayoffClaimed
			entry.Started = len(progress.Visited) > 0
			entry.Journal = slices.Clone(progress.Journal)
			flags = progress.Flags
		}
		for _, objective := range def.Objectives {
			if objective.Until == "" || !flags[objective.Until] {
				entry.Objective = g.dungeonText(objective.Text)
				break
			}
		}
		s.DungeonEntries = append(s.DungeonEntries, entry)
	}
	if len(s.DungeonEntries) > 0 {
		entry := s.DungeonEntries[0]
		s.DungeonEntry = &entry
	}
	s.ActiveDungeonID = g.activeDungeonID
	if !g.inDungeon() {
		return
	}
	def := g.dungeonDefinition()
	if def == nil {
		return
	}
	p := g.dungeon
	r := def.Room(p.RoomID)
	if r == nil {
		return
	}
	s.Dungeon = &DungeonState{ID: def.ID, Title: g.dungeonText(def.Title), LocalityName: g.dungeonText("{locality}"), RoomID: r.ID, RoomName: r.Name, Description: g.dungeonText(r.DescriptionFor(p.Flags)), Map: r.Presentation(p.Flags), BattleBackground: r.BattleBackground, RecoveredFromDefeat: p.RecoveredFromDefeat, Position: p.Position, Visited: slices.Clone(p.Visited), Journal: slices.Clone(p.Journal), Complete: p.Flags[def.CompleteFlag]}
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
		view := DungeonActionState{ID: a.ID, Label: a.Label, Kind: a.Kind, X: a.Position.X, Y: a.Position.Y, Available: available, Reason: g.dungeonText(a.Reason), Completed: completed}
		if a.Kind == "encounter" && a.Encounter != nil && !completed {
			view.Encounter = &DungeonEncounterPreview{Optional: a.Optional, Level: a.Encounter.Level, Description: g.dungeonText(a.Text)}
			for _, id := range g.dungeonEncounterIDs(a.Encounter) {
				if m := g.gd.MonsterByID(id); m != nil {
					view.Encounter.Enemies = append(view.Encounter.Enemies, DungeonEnemyPreview{MonsterID: id, Name: m.Name, Tactics: m.Tactics})
				}
			}
		}
		s.Dungeon.Actions = append(s.Dungeon.Actions, view)
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
	if req.Type == "enter" {
		if g.inDungeon() || (g.location.Kind != LocationWorld && g.location.Kind != LocationSettlement) {
			return GameState{}, fmt.Errorf("follow the trail from town")
		}
		def := g.dungeonDefinitionAtNode(req.NodeID)
		if def == nil {
			return GameState{}, fmt.Errorf("no authored adventure is bound to that world node")
		}
		if g.location.WorldNodeID != req.NodeID {
			return GameState{}, fmt.Errorf("reach this trail from its world node first")
		}
		if req.WorldPosition != nil {
			if g.location.Kind != LocationWorld {
				return GameState{}, fmt.Errorf("world position is unavailable outside the world")
			}
			if err := validateWorldArrivalPosition(g.tileMap, g.loc, g.worldTraversal(), *req.WorldPosition, req.NodeID); err != nil {
				return GameState{}, err
			}
			g.setWorldCheckpointLocked(*req.WorldPosition, req.NodeID)
		}
		p := g.activateDungeon(def)
		origin := g.location
		p.Origin = origin
		p.Active = true
		p.EncounterID = ""
		g.enterDungeonRoom(def.EntryRoom, def.EntryPosition)
		g.phase = "world"
		g.message = g.dungeonText(def.Description)
		return g.stateUnlocked(), nil
	}
	def := g.dungeonDefinition()
	if def == nil {
		return GameState{}, fmt.Errorf("this adventure is unavailable")
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
		cardinal := (req.DX == -1 || req.DX == 1) && req.DY == 0 || (req.DY == -1 || req.DY == 1) && req.DX == 0
		if !cardinal {
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
	for id, count := range r.Materials {
		if g.gd.CraftMaterialByID(id) == nil || count <= 0 || count > 100 || g.inv.Materials[id] > int(^uint(0)>>1)-count {
			return fmt.Errorf("invalid material reward %q", id)
		}
	}

	// A failed multi-item grant must neither partially grant loot nor consume
	// its once-only claim. Preserve the isolated loot sequence too.
	before := g.inv
	working := g.inv.Clone()
	if working == nil {
		return fmt.Errorf("inventory is unavailable")
	}
	g.inv = working
	seq := g.lootRollSeq
	count := r.Count
	if r.ItemID != "" && count == 0 {
		count = 1
	}
	for i := 0; i < count; i++ {
		if _, err := g.grantLoot(r.ItemID, max(r.Level, 1), r.Sockets); err != nil {
			g.inv = before
			g.lootRollSeq = seq
			return err
		}
	}
	g.inv.Normalize()
	for id, count := range r.Materials {
		g.inv.Materials[id] += count
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
		if p.ClaimedPayoffMaterials == nil {
			p.ClaimedPayoffMaterials = map[string]bool{}
		}
		for id := range def.Payoff.Materials {
			p.ClaimedPayoffMaterials[id] = true
		}
		g.message = g.dungeonText(def.ReturnText)
		p.Journal = append(p.Journal, g.message)
	} else {
		g.message = g.dungeonText(def.RetreatText)
	}
	p.Active = false
	p.EncounterID = ""
	g.activeDungeonID = ""
	// The return message replaces the completed battle presentation.
	g.combatLog = nil
	g.combatActions = nil
	g.location = p.Origin
	if g.location.Kind != LocationSettlement {
		g.location.Kind = LocationWorld
	}
	g.phase = "world"
	return nil
}
func (g *Game) dungeonEncounterIDs(e *dungeon.Encounter) []string {
	if len(g.party) >= 4 && len(e.FullParty) > 0 {
		return e.FullParty
	}
	return e.Monsters
}

func (g *Game) startDungeonEncounter(a *dungeon.Action) error {
	if a.Encounter == nil {
		return fmt.Errorf("encounter is unavailable")
	}
	e := a.Encounter
	ids := g.dungeonEncounterIDs(e)
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
	g.dungeon.RecoveredFromDefeat = false
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
	g.dungeon.RecoveredFromDefeat = true
	for _, c := range g.party {
		c.CurrentHP = c.MaxHP
		c.CurrentMP = c.MaxMP
		c.Status = character.StatusNone
	}
	g.enemies = nil
	g.phase = "world"
	g.enterDungeonRoom(def.EntryRoom, def.EntryPosition)
	g.message = g.dungeonText(def.DefeatText)
	return true
}
func (g *Game) restoreDungeon() {
	if g.dungeon == nil {
		g.activeDungeonID = ""
		return
	}
	def := g.dungeonDefinition()
	if def == nil {
		g.dungeon = nil
		g.activeDungeonID = ""
		return
	}
	p := g.dungeon
	if p.Flags == nil {
		p.Flags = map[string]bool{}
	}
	p.EncounterID = ""
	if !p.Active {
		g.activeDungeonID = ""
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
			images := append([]settlements.Layer(nil), room.Map.Layers...)
			for _, variant := range room.VisualVariants {
				images = append(images, settlements.Layer{Image: variant.Image})
			}
			for _, layer := range images {
				if layer.Image == "/api/data/dungeons/art/"+file {
					w.Header().Set("X-Content-Type-Options", "nosniff")
					asset := strings.TrimPrefix(layer.Image, "/api/data/dungeons/art/")
					httpasset.ServeApprovedFile(w, r, filepath.Join(s.games.sharedDir, "dungeons", "art"), asset)
					return
				}
			}
		}
	}
	http.NotFound(w, r)
}

// Old completed adventures receive newly introduced material rewards once.
// Claims are independent of remaining quantities so spending a core never
// causes it to be issued again on the next load.
func (g *Game) reconcileDungeonMaterialRewards() error {
	for _, progress := range g.dungeons {
		if progress == nil {
			continue
		}
		def := g.dungeonDefinitionByID(progress.ID)
		if def == nil || !progress.PayoffClaimed || !progress.Flags[def.CompleteFlag] {
			continue
		}
		missing := map[string]int{}
		for id, count := range def.Payoff.Materials {
			if !progress.ClaimedPayoffMaterials[id] {
				missing[id] = count
			}
		}
		if len(missing) == 0 {
			continue
		}
		if err := g.grantDungeonReward(dungeon.Reward{Materials: missing}); err != nil {
			return err
		}
		if progress.ClaimedPayoffMaterials == nil {
			progress.ClaimedPayoffMaterials = map[string]bool{}
		}
		for id := range missing {
			progress.ClaimedPayoffMaterials[id] = true
		}
	}
	return nil
}
