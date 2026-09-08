package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"

	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/settlements"
)

const (
	LocationWorld      = "world"
	LocationSettlement = "settlement"
	LocationInterior   = "interior"
)

// LocationState is the server-owned navigation state within the current
// locality. Phase remains responsible for combat and quest flow.
type LocationState struct {
	Kind        string             `json:"kind"`
	MapID       string             `json:"map_id,omitempty"`
	Anchor      string             `json:"anchor,omitempty"`
	WorldNodeID string             `json:"world_node_id,omitempty"`
	Interior    *locality.MapSpawn `json:"interior,omitempty"`
}

type LocationTransitionRequest struct {
	DebugNoEncounters bool           `json:"debug_no_encounters,omitempty"`
	TransitionID      string         `json:"transition_id"`
	WorldNodeID       string         `json:"world_node_id,omitempty"`
	WorldPosition     *WorldPosition `json:"world_position,omitempty"`
}

// ProcessLocationTransition applies only transitions authored in the active
// settlement map. The two protocol transitions bridge the world and an
// interior back to that content-driven graph.
func (g *Game) ProcessLocationTransition(req LocationTransitionRequest) (GameState, error) {
	g.mu.Lock()
	// A retried step that started combat must return the same result without rolling again.
	if req.TransitionID == "world-step" && g.phase == "combat" && g.location.Kind == LocationWorld && req.WorldPosition != nil && g.worldCheckpoint != nil && req.WorldPosition.X == g.worldCheckpoint.X && req.WorldPosition.Y == g.worldCheckpoint.Y {
		state := g.stateUnlocked()
		g.mu.Unlock()
		return state, nil
	}
	if g.phase != "world" && g.phase != "quest_complete" {
		g.mu.Unlock()
		return GameState{}, fmt.Errorf("location transitions are unavailable during %s", g.phase)
	}

	var err error
	switch g.location.Kind {
	case LocationWorld:
		switch req.TransitionID {
		case "world-step":
			err = g.processWorldStepLocked(req)
		case "arrive-world-node":
			err = g.arriveWorldNodeLocked(req.WorldNodeID, req.WorldPosition)
		default:
			err = g.enterSettlementLocked(req)
		}
	case LocationSettlement:
		err = g.followSettlementTransitionLocked(req.TransitionID)
	case LocationInterior:
		err = g.exitInteriorLocked(req.TransitionID)
	default:
		err = fmt.Errorf("invalid current location %q", g.location.Kind)
	}
	g.mu.Unlock()
	if err != nil {
		return GameState{}, err
	}
	return g.State(), nil
}

// arriveWorldNodeLocked handles legacy graph travel. Physical world-step
// requests instead prove arrival with an adjacent, traversable tile.
func (g *Game) arriveWorldNodeLocked(nodeID string, position *WorldPosition) error {
	return g.recordWorldArrivalLocked(nodeID, position, false)
}

// A validated adjacent tile step proves physical arrival independently of the
// locality graph. Legacy node-only travel still requires an authored edge.
func (g *Game) recordWorldArrivalLocked(nodeID string, position *WorldPosition, walked bool) error {
	if g.loc == nil || g.walk == nil || g.walk.Spawn == nil {
		return fmt.Errorf("world navigation is unavailable")
	}
	if nodeID == "" || g.loc.NodeByID(nodeID) == nil {
		return fmt.Errorf("unknown world node")
	}
	current := g.location.WorldNodeID
	if current == "" {
		current = g.walk.Spawn.ID
	}
	if nodeID == current {
		g.location.WorldNodeID = current
		if position != nil {
			return g.updateWorldCheckpointLocked(*position, current)
		}
		return nil
	}
	if !walked && !slices.Contains(g.loc.Neighbors(current), nodeID) {
		return fmt.Errorf("world node %q is not adjacent to the current arrival", nodeID)
	}
	if position != nil {
		if err := validateWorldArrivalPosition(g.tileMap, g.loc, g.worldTraversal(), *position, nodeID); err != nil {
			return err
		}
	}
	g.location.WorldNodeID = nodeID
	if position != nil {
		g.setWorldCheckpointLocked(*position, nodeID)
	} else if recovered := recoverWorldCheckpointNearNode(g.tileMap, g.loc, g.worldTraversal(), nodeID, worldMapSignature(g.tileMap)); recovered != nil {
		g.worldCheckpoint = recovered
	}
	return nil
}

func (g *Game) enterSettlementLocked(req LocationTransitionRequest) error {
	if req.TransitionID != "enter-settlement" {
		return fmt.Errorf("transition %q is not available from the world", req.TransitionID)
	}
	if g.settlementMap == nil {
		return fmt.Errorf("no authored settlement is available here")
	}
	if g.walk == nil || req.WorldNodeID == "" || req.WorldNodeID != g.walk.Spawn.ID {
		return fmt.Errorf("settlement entry must use the active world node")
	}
	if req.WorldPosition != nil {
		if err := validateWorldArrivalPosition(g.tileMap, g.loc, g.worldTraversal(), *req.WorldPosition, req.WorldNodeID); err != nil {
			return err
		}
	}
	anchor, err := settlementWorldAnchor(g.settlementMap)
	if err != nil {
		return err
	}
	g.location = LocationState{
		Kind:        LocationSettlement,
		MapID:       g.settlementMap.Property("id"),
		Anchor:      anchor,
		WorldNodeID: req.WorldNodeID,
	}
	if req.WorldPosition != nil {
		g.setWorldCheckpointLocked(*req.WorldPosition, req.WorldNodeID)
	}
	return nil
}

func (g *Game) followSettlementTransitionLocked(transitionID string) error {
	interaction := g.settlementMap.Layer("interactions").Object(transitionID)
	if interaction == nil {
		return fmt.Errorf("unknown settlement transition %q", transitionID)
	}

	switch interaction.Property("destination_kind") {
	case LocationInterior:
		interior, ok := g.settlementInteriors[interaction.Property("destination_id")]
		if !ok || interior.Interior == nil {
			return fmt.Errorf("interior %q is unavailable", interaction.Property("destination_id"))
		}
		g.location = LocationState{
			Kind:        LocationInterior,
			MapID:       interior.NodeID,
			Anchor:      interaction.Property("return_anchor"),
			WorldNodeID: g.location.WorldNodeID,
			Interior:    cloneMapSpawn(&interior),
		}
		return nil
	case LocationWorld:
		g.location = LocationState{
			Kind:        LocationWorld,
			WorldNodeID: g.location.WorldNodeID,
		}
		return nil
	default:
		return fmt.Errorf("transition %q has unsupported destination", transitionID)
	}
}

func (g *Game) exitInteriorLocked(transitionID string) error {
	if transitionID != "exit-interior" {
		return fmt.Errorf("transition %q is not available from an interior", transitionID)
	}
	g.location = LocationState{
		Kind:        LocationSettlement,
		MapID:       g.settlementMap.Property("id"),
		Anchor:      g.location.Anchor,
		WorldNodeID: g.location.WorldNodeID,
	}
	return nil
}

func settlementWorldAnchor(townMap *settlements.Map) (string, error) {
	for _, interaction := range townMap.Layer("interactions").Objects {
		if interaction.Type == "exit" && interaction.Property("destination_kind") == LocationWorld {
			return interaction.Property("return_anchor"), nil
		}
	}
	return "", fmt.Errorf("settlement %q has no world entry anchor", townMap.Property("id"))
}

func cloneMapSpawn(spawn *locality.MapSpawn) *locality.MapSpawn {
	if spawn == nil {
		return nil
	}
	clone := *spawn
	clone.Tags = append([]string(nil), spawn.Tags...)
	return &clone
}

func (g *Game) fillLocationState(state *GameState) {
	g.fillDungeonState(state)
	g.fillFinalEncounterState(state)
	location := g.location
	location.Interior = cloneMapSpawn(g.location.Interior)
	state.CurrentLocation = location
	state.SettlementMap = g.settlementMap
	if g.settlementMap != nil && g.walk != nil {
		state.SettlementEntryNodeID = g.walk.Spawn.ID
	}
}

func (s *Server) handleLocationTransition(w http.ResponseWriter, r *http.Request) {
	game := s.games.GetGame(r.PathValue("id"))
	if game == nil {
		httpError(w, "game not found", http.StatusNotFound)
		return
	}
	var req LocationTransitionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TransitionID == "" {
		httpError(w, "transition_id required", http.StatusBadRequest)
		return
	}
	state, err := game.ProcessLocationTransition(req)
	if err != nil {
		httpError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonResp(w, state)
}
