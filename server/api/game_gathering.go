package api

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"time"

	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

type ResourceNodeState struct {
	SurfaceTile      int             `json:"surface_tile"`
	HabitatTiles     []WorldPosition `json:"habitat_tiles"`
	Habitat          string          `json:"habitat"`
	RespawnSeconds   int             `json:"respawn_seconds"`
	ReadyAt          int64           `json:"ready_at,omitempty"`
	RemainingSeconds int64           `json:"remaining_seconds,omitempty"`
	RequiredLevel    int             `json:"required_level,omitempty"`
	ID               string          `json:"id"`
	Name             string          `json:"name"`
	MaterialID       string          `json:"material_id"`
	Quantity         int             `json:"quantity"`
	Visual           string          `json:"visual"`
	X                int             `json:"x"`
	Y                int             `json:"y"`
	Gathered         bool            `json:"gathered"`
}
type MaterialState struct {
	Visual string `json:"visual"`
	Source string `json:"source"`
	ID     string `json:"id"`
	Name   string `json:"name"`
	Count  int    `json:"count"`
}
type FieldRecipeState struct {
	OutputIconKey string `json:"output_icon_key,omitempty"`
	gamedata.FieldRecipe
	OutputName  string         `json:"output_name"`
	OutputStats map[string]int `json:"output_stats,omitempty"`
	Craftable   bool           `json:"craftable"`
	BlockReason string         `json:"block_reason,omitempty"`
}

const (
	resourcePlacementLegacy = 1
	resourcePlacementTrails = 2
	resourcePlacementBiome  = 3
)

// Resource identities depend on saved map coordinates, not the active quest.
// Harvest deadlines persist across quest changes and save/load.
func (g *Game) resourceNodes() []ResourceNodeState {
	if g.resourceMap == g.tileMap && g.resourceNodeCache != nil {
		return g.resourceNodeSnapshot()
	}
	cfg := g.gd.Gathering
	if g.tileMap == nil || len(cfg.Resources) == 0 {
		return nil
	}
	anchorMap := g.tileMap
	if g.resourcePlacementVersion == resourcePlacementLegacy || g.resourcePlacementVersion == resourcePlacementTrails {
		if g.resourceAnchorMap == nil {
			if g.resourcePlacementVersion == resourcePlacementLegacy {
				g.resourceAnchorMap = locality.GenerateTileMapBeforePublicTrails(g.loc, g.walk.Spawn.ID, g.walk)
			} else {
				g.resourceAnchorMap = locality.GenerateTileMapBeforeBiomeCleanup(g.loc, g.walk.Spawn.ID, g.walk)
			}
		}
		anchorMap = g.resourceAnchorMap
	}
	start := WorldPosition{X: anchorMap.PlayerX, Y: anchorMap.PlayerY}
	targets := []string{}
	var stories GameState
	g.fillDungeonState(&stories)
	for _, entry := range stories.DungeonEntries {
		targets = append(targets, entry.NodeID)
	}
	for _, quest := range g.quests {
		targets = append(targets, quest.TargetNodeID)
	}
	for _, spawn := range anchorMap.Spawns {
		targets = append(targets, spawn.NodeID)
	}
	visited, occupied := map[string]bool{}, map[WorldPosition]bool{}
	nodes := []ResourceNodeState{}
	primary := []gamedata.GatheringResource{}
	counts := map[string]int{}
	for _, r := range cfg.Resources {
		if r.Placement == "" {
			primary = append(primary, r)
		}
	}
	routePaths := [][]WorldPosition{}
	primaryCount := 0
	routes := 0
	for _, target := range targets {
		if visited[target] {
			continue
		}
		visited[target] = true
		spawn := worldSpawn(anchorMap, target)
		if spawn == nil {
			continue
		}
		path := gatheringPath(anchorMap, start, WorldPosition{X: spawn.X, Y: spawn.Y})
		if len(path) < cfg.NodesPerRoute*2+3 {
			continue
		}
		added := 0
		for step := 3; step < len(path)-2 && added < cfg.NodesPerRoute; step += cfg.SpacingTiles {
			position := path[step]
			if occupied[position] {
				continue
			}
			nearDoor := false
			for _, door := range g.tileMap.Spawns {
				if checkpointAbs(position.X-door.X)+checkpointAbs(position.Y-door.Y) < 2 {
					nearDoor = true
					break
				}
			}
			if nearDoor {
				continue
			}
			resource := primary[primaryCount%len(primary)]
			primaryCount++
			id := fmt.Sprintf("%s:%d:%d", resource.ID, position.X, position.Y)
			nodes = append(nodes, ResourceNodeState{ID: id, Name: resource.Name, MaterialID: resource.MaterialID, Quantity: resource.Quantity, Visual: resource.Visual, X: position.X, Y: position.Y, Gathered: g.inv.GatheredResources[id]})
			occupied[position] = true
			added++
		}
		if added > 0 {
			routePaths = append(routePaths, path)
			routes++
		}
		if routes >= cfg.MaxRoutes {
			break
		}
	}
	for _, path := range routePaths {
		// Supplemental wood and scarce seams use route ends without changing
		// existing herb/iron coordinates or their saved depletion identities.
		for _, resource := range cfg.Resources {
			if resource.Placement != "route_end" || (resource.MaxPerMap > 0 && counts[resource.ID] >= resource.MaxPerMap) {
				continue
			}
			for step := len(path) - 3; step > 2; step-- {
				position := path[step]
				if occupied[position] {
					continue
				}
				nearDoor := false
				for _, door := range g.tileMap.Spawns {
					if checkpointAbs(position.X-door.X)+checkpointAbs(position.Y-door.Y) < 2 {
						nearDoor = true
						break
					}
				}
				if nearDoor {
					continue
				}
				id := fmt.Sprintf("%s:%d:%d", resource.ID, position.X, position.Y)
				nodes = append(nodes, ResourceNodeState{ID: id, Name: resource.Name, MaterialID: resource.MaterialID, Quantity: resource.Quantity, Visual: resource.Visual, X: position.X, Y: position.Y, Gathered: g.inv.GatheredResources[id], RequiredLevel: resource.RequiredLevel})
				occupied[position] = true
				counts[resource.ID]++
				break
			}
		}
	}

	g.placeResourceHabitats(nodes)
	valid := nodes[:0]
	for _, node := range nodes {
		if len(node.HabitatTiles) > 0 {
			valid = append(valid, node)
		}
	}
	nodes = valid
	g.resourceMap, g.resourceNodeCache = g.tileMap, nodes
	return g.resourceNodeSnapshot()
}

func (g *Game) resourceNodeSnapshot() []ResourceNodeState {
	nodes := append([]ResourceNodeState(nil), g.resourceNodeCache...)
	now := time.Now().Unix()
	g.inv.Normalize()
	for i := range nodes {
		node := &nodes[i]
		// Legacy permanent depletion gets one cooldown, started only once.
		if g.inv.GatheredResources[node.ID] && g.inv.ResourceReadyAt[node.ID] == 0 {
			g.inv.ResourceReadyAt[node.ID] = now + int64(node.RespawnSeconds)
		}
		node.ReadyAt = g.inv.ResourceReadyAt[node.ID]
		node.RemainingSeconds = max(0, node.ReadyAt-now)
		node.Gathered = node.RemainingSeconds > 0
	}
	return nodes
}

// Resource refresh is intentionally separate from full game state: an idle
// respawn cannot replace a newer movement, inventory or battle response.
func (s *Server) handleResourceStatus(w http.ResponseWriter, r *http.Request) {
	g := s.games.GetGame(r.PathValue("id"))
	if g == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	jsonResp(w, struct {
		Resources []ResourceNodeState `json:"resources"`
	}{g.resourceNodes()})
}

// Paths use the same basic foot traversal as world movement, never water or
// blocked terrain. Resources therefore do not require a later transport unlock.
func gatheringPath(tileMap *locality.TileMap, start, target WorldPosition) []WorldPosition {
	if !worldPositionInBounds(tileMap, start) || !worldPositionInBounds(tileMap, target) {
		return nil
	}
	if start == target {
		return []WorldPosition{start}
	}
	// Index actual rows rather than metadata dimensions, including ragged test
	// maps. Zero means unseen; parent indices are stored plus one. Keep the
	// original neighbor order because route coordinates identify saved nodes.
	width := 0
	for _, row := range tileMap.Tiles {
		width = max(width, len(row))
	}
	previous := make([]int, width*len(tileMap.Tiles))
	startIndex := start.Y*width + start.X
	previous[startIndex] = startIndex + 1
	queue := make([]int, 1, len(previous))
	queue[0] = startIndex
	for index := 0; index < len(queue); index++ {
		currentIndex := queue[index]
		current := WorldPosition{X: currentIndex % width, Y: currentIndex / width}
		if current == target {
			path := []WorldPosition{current}
			for currentIndex != startIndex {
				currentIndex = previous[currentIndex] - 1
				current = WorldPosition{X: currentIndex % width, Y: currentIndex / width}
				path = append(path, current)
			}
			for a, b := 0, len(path)-1; a < b; a, b = a+1, b-1 {
				path[a], path[b] = path[b], path[a]
			}
			return path
		}
		for _, direction := range []WorldPosition{{X: 1}, {Y: 1}, {X: -1}, {Y: -1}} {
			next := WorldPosition{X: current.X + direction.X, Y: current.Y + direction.Y}
			if !worldPositionInBounds(tileMap, next) {
				continue
			}
			nextIndex := next.Y*width + next.X
			if previous[nextIndex] != 0 {
				continue
			}
			if !worldTileTraversable(locality.TileType(tileMap.Tiles[next.Y][next.X]), worldTraversal{}) {
				continue
			}
			previous[nextIndex] = currentIndex + 1
			queue = append(queue, nextIndex)
		}
	}
	return nil
}

func (g *Game) fieldRecipeBlockReason(recipe gamedata.FieldRecipe) string {
	if err := g.checkEquipmentMutationLocked(); err != nil {
		return "Finish the battle before crafting."
	}
	if g.maxPartyLevel() < recipe.RequiredLevel {
		return fmt.Sprintf("Party level %d required.", recipe.RequiredLevel)
	}
	for _, input := range recipe.Inputs {
		if g.inv.Materials[input.MaterialID] < input.Count {
			name := input.MaterialID
			if material := g.gd.CraftMaterialByID(input.MaterialID); material != nil {
				name = material.Name
			}
			return fmt.Sprintf("Need %d %s; have %d.", input.Count, name, g.inv.Materials[input.MaterialID])
		}
	}
	return ""
}

func (g *Game) fillGatheringState(state *GameState) {
	state.Resources = g.resourceNodes()
	for _, resource := range g.gd.Gathering.Resources {
		state.Materials = append(state.Materials, MaterialState{ID: resource.MaterialID, Name: resource.MaterialName, Count: g.inv.Materials[resource.MaterialID], Visual: resource.Visual, Source: resource.Source})
	}
	for _, m := range g.gd.Gathering.Materials {
		state.Materials = append(state.Materials, MaterialState{ID: m.ID, Name: m.Name, Count: g.inv.Materials[m.ID], Visual: m.Visual, Source: m.Source})
	}
	for _, recipe := range g.gd.Gathering.Recipes {
		preview := FieldRecipeState{FieldRecipe: recipe, BlockReason: g.fieldRecipeBlockReason(recipe)}
		preview.Craftable = preview.BlockReason == ""
		if base := g.gd.EquipmentBaseByID(recipe.OutputID); base != nil {
			preview.OutputIconKey = base.IconKey
			preview.OutputName = base.Name
			preview.OutputStats = cloneStats(base.Stats)
		} else if gem := g.gd.GemByID(recipe.OutputID); gem != nil {
			preview.OutputIconKey = gem.IconKey
			preview.OutputName = gem.Name
		} else if item := g.gd.ConsumableByID(recipe.OutputID); item != nil {
			preview.OutputName = item.Name
		}
		state.FieldRecipes = append(state.FieldRecipes, preview)
	}
}

func (g *Game) Gather(resourceID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.phase != "world" || g.location.Kind != LocationWorld || g.inDungeon() {
		return fmt.Errorf("gathering requires the overworld outside battle")
	}
	for _, resource := range g.resourceNodes() {
		if resource.ID != resourceID {
			continue
		}
		if resource.Gathered {
			return fmt.Errorf("this resource is recovering; ready in %d seconds", resource.RemainingSeconds)
		}
		checkpoint := g.worldCheckpoint
		if checkpoint == nil || checkpointAbs(checkpoint.X-resource.X)+checkpointAbs(checkpoint.Y-resource.Y) > 1 {
			return fmt.Errorf("walk next to the resource before gathering")
		}
		if g.maxPartyLevel() < resource.RequiredLevel {
			return fmt.Errorf("party level %d required to gather %s", resource.RequiredLevel, resource.Name)
		}
		if g.inv.Materials[resource.MaterialID] > math.MaxInt-resource.Quantity {
			return fmt.Errorf("too many materials")
		}
		g.inv.Normalize()
		g.inv.Materials[resource.MaterialID] += resource.Quantity
		g.inv.ResourceReadyAt[resource.ID] = time.Now().Unix() + int64(resource.RespawnSeconds)
		delete(g.inv.GatheredResources, resource.ID)
		g.message = fmt.Sprintf("Gathered %d materials from %s. Open Crafting from the party menu.", resource.Quantity, resource.Name)
		return nil
	}
	return fmt.Errorf("resource not found")
}

func (g *Game) CraftFieldRecipe(recipeID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, recipe := range g.gd.Gathering.Recipes {
		if recipe.ID != recipeID {
			continue
		}
		if reason := g.fieldRecipeBlockReason(recipe); reason != "" {
			return fmt.Errorf("%s", reason)
		}
		working := g.inv.Clone()
		working.Normalize()
		for _, input := range recipe.Inputs {
			working.Materials[input.MaterialID] -= input.Count
		}
		if base := g.gd.EquipmentBaseByID(recipe.OutputID); base != nil {
			instance := &inventory.EquipmentInstance{BaseID: base.ID, Kind: base.Kind, Category: base.Category, ItemLevel: recipe.ItemLevel, RequiredLevel: max(base.RequiredLevel, recipe.RequiredLevel), RarityID: recipe.RarityID, Sockets: make([]inventory.ItemSocket, recipe.Sockets)}
			if _, err := working.AddInstance(*instance); err != nil {
				return err
			}
		} else if g.gd.GemByID(recipe.OutputID) != nil {
			if working.Gems[recipe.OutputID] > math.MaxInt-recipe.OutputCount {
				return fmt.Errorf("too many gems")
			}
			working.Gems[recipe.OutputID] += recipe.OutputCount
			working.DiscoverGemRecipes(g.gd)
		} else {
			if working.Consumables[recipe.OutputID] > math.MaxInt-recipe.OutputCount {
				return fmt.Errorf("too many consumables")
			}
			working.Consumables[recipe.OutputID] += recipe.OutputCount
		}
		g.inv = working
		g.message = fmt.Sprintf("%s complete. Your inventory has been updated.", recipe.Name)
		return nil
	}
	return fmt.Errorf("recipe not found")
}

func (s *Server) handleGather(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ResourceID string `json:"resource_id"`
	}
	s.handleGatheringMutation(w, r, &req, func(g *Game) error { return g.Gather(req.ResourceID) })
}
func (s *Server) handleFieldCraft(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RecipeID string `json:"recipe_id"`
	}
	s.handleGatheringMutation(w, r, &req, func(g *Game) error { return g.CraftFieldRecipe(req.RecipeID) })
}
func (s *Server) handleGatheringMutation(w http.ResponseWriter, r *http.Request, req any, mutation func(*Game) error) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(req); err != nil {
		httpError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		httpError(w, "expected one request", http.StatusBadRequest)
		return
	}
	if err := mutation(game); err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, game.State())
}
