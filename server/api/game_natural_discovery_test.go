package api

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

func TestNaturalDiscoveriesWizardFlowIsOneShotAndSaveCompatible(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}})
	nodeID := firstNaturalNodeID(t, game)
	game.quests = append(game.quests, generator.Quest{
		ID:          "hidden_without_far_prereq",
		Name:        "The Forgotten Shrine",
		Hidden:      true,
		IsSideQuest: true,
	})

	initial := game.State()
	if len(initial.NaturalDiscoveries) != 3 {
		t.Fatalf("wizard natural discoveries = %d, want 3", len(initial.NaturalDiscoveries))
	}
	wantOrder := []string{"weathered_trail_clue", "hidden_supply_cache", "strange_coin_passage"}
	for i, want := range wantOrder {
		got := initial.NaturalDiscoveries[i]
		if got.NodeID != nodeID || got.DiscoveryID != want || got.Claimed || got.Revealed {
			t.Fatalf("initial discovery[%d] = %+v, want %s at %s unclaimed/unrevealed", i, got, want, nodeID)
		}
	}

	// Generic quest interactions remain invalid at natural nodes, even after a
	// legitimate arrival, and must never claim exploration rewards.
	arriveAtWorldNode(t, game, nodeID)
	beforeQuest, beforeGold, beforePotions := game.currentQ, game.inv.Gold, game.inv.Consumables["potion"]
	if _, err := game.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: nodeID}); err == nil {
		t.Fatal("natural quest_advance unexpectedly accepted")
	}
	state := game.State()
	if game.currentQ != beforeQuest || state.Gold != beforeGold || state.Potions != beforePotions {
		t.Fatalf("quest_advance mutated progression/rewards: current=%d gold=%d potions=%d", game.currentQ, state.Gold, state.Potions)
	}
	for _, discovery := range state.NaturalDiscoveries {
		if discovery.Claimed || discovery.Revealed {
			t.Fatalf("quest_advance changed discovery state: %+v", discovery)
		}
	}

	state = processNaturalDiscoveryForTest(t, game, nodeID)
	assertNaturalDiscoveryState(t, state, "weathered_trail_clue", true, true)
	if !strings.Contains(state.Message, "Carved arrows") {
		t.Fatalf("clue message = %q", state.Message)
	}
	if !game.quests[len(game.quests)-1].Hidden {
		t.Fatal("clue interaction unexpectedly used passage-only hidden quest fallback")
	}

	state = processNaturalDiscoveryForTest(t, game, nodeID)
	assertNaturalDiscoveryState(t, state, "hidden_supply_cache", true, true)
	if state.Gold != beforeGold+40 || state.Potions != beforePotions+2 {
		t.Fatalf("cache rewards = gold %d potions %d, want %d/%d", state.Gold, state.Potions, beforeGold+40, beforePotions+2)
	}

	state = processNaturalDiscoveryForTest(t, game, nodeID)
	assertNaturalDiscoveryState(t, state, "strange_coin_passage", false, true)
	if !strings.Contains(state.Message, "coin-shaped hollow") {
		t.Fatalf("no-coin message = %q", state.Message)
	}
	if !game.quests[len(game.quests)-1].Hidden {
		t.Fatal("no-coin passage attempt revealed fallback quest")
	}
	if hasKeyItemState(state, "ancient_ring") {
		t.Fatal("no-coin passage granted ancient ring")
	}

	game.inv.AddKeyItem("strange_coin")
	state = processNaturalDiscoveryForTest(t, game, nodeID)
	assertNaturalDiscoveryState(t, state, "strange_coin_passage", true, true)
	if hasKeyItemState(state, "strange_coin") || !hasKeyItemState(state, "ancient_ring") {
		t.Fatalf("passage key items = %+v, want coin consumed and ring granted", state.KeyItems)
	}
	if hidden := questStateByID(t, state, "hidden_without_far_prereq"); hidden.Hidden {
		t.Fatal("successful passage did not reveal first hidden quest fallback")
	}
	if !strings.Contains(state.Message, "The Forgotten Shrine") {
		t.Fatalf("passage reveal message = %q", state.Message)
	}

	// A claimed replay returns authored exhausted copy and cannot consume a
	// newly acquired coin or duplicate cache rewards.
	game.inv.AddKeyItem("strange_coin")
	state = processNaturalDiscoveryForTest(t, game, nodeID)
	if !strings.Contains(state.Message, "stands open and silent") {
		t.Fatalf("claimed replay message = %q", state.Message)
	}
	if !hasKeyItemState(state, "strange_coin") || state.Gold != beforeGold+40 || state.Potions != beforePotions+2 {
		t.Fatalf("claimed replay mutated rewards: keys=%+v gold=%d potions=%d", state.KeyItems, state.Gold, state.Potions)
	}

	ss, err := game.ToSaveState("natural discoveries", "test-user")
	if err != nil {
		t.Fatalf("ToSaveState: %v", err)
	}
	loaded, err := FromSaveState(ss, game.gd, game.loc)
	if err != nil {
		t.Fatalf("FromSaveState: %v", err)
	}
	loadedState := loaded.State()
	for _, id := range wantOrder {
		assertNaturalDiscoveryState(t, loadedState, id, true, true)
	}
	if hidden := questStateByID(t, loadedState, "hidden_without_far_prereq"); hidden.Hidden {
		t.Fatal("hidden quest reveal lost on reload")
	}
	if !hasKeyItemState(loadedState, "ancient_ring") || !hasKeyItemState(loadedState, "strange_coin") {
		t.Fatalf("key item state lost on reload: %+v", loadedState.KeyItems)
	}

	// Saves predating this feature have no discovery maps. The Ancient Ring is
	// the legacy proof that the one-off Strange Coin passage was already opened.
	var world map[string]json.RawMessage
	if err := json.Unmarshal(ss.WorldState, &world); err != nil {
		t.Fatalf("unmarshal world state: %v", err)
	}
	delete(world, "natural_discovery_claimed")
	delete(world, "natural_discovery_revealed")
	ss.WorldState, err = json.Marshal(world)
	if err != nil {
		t.Fatalf("marshal legacy world state: %v", err)
	}
	legacy, err := FromSaveState(ss, game.gd, game.loc)
	if err != nil {
		t.Fatalf("load legacy world state: %v", err)
	}
	legacyState := legacy.State()
	assertNaturalDiscoveryState(t, legacyState, "weathered_trail_clue", false, false)
	assertNaturalDiscoveryState(t, legacyState, "hidden_supply_cache", false, false)
	assertNaturalDiscoveryState(t, legacyState, "strange_coin_passage", true, true)
	if !hasKeyItemState(legacyState, "ancient_ring") {
		t.Fatal("legacy Ancient Ring was lost during discovery migration")
	}
}

func TestNaturalDiscoveryVisitRevealsMatchingSoftPrerequisiteWithoutCoin(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}})
	nodeID := firstNaturalNodeID(t, game)
	game.quests = append(game.quests, generator.Quest{
		ID:          "matching_hidden_quest",
		Name:        "The Marked Trail",
		Hidden:      true,
		SoftPrereq:  nodeID,
		IsSideQuest: true,
	})

	state := processNaturalDiscoveryForTest(t, game, nodeID)
	if hidden := questStateByID(t, state, "matching_hidden_quest"); hidden.Hidden {
		t.Fatal("matching soft-prerequisite quest stayed hidden")
	}
	if !strings.Contains(state.Message, "A hidden quest has been revealed: The Marked Trail") {
		t.Fatalf("shared reveal copy missing from %q", state.Message)
	}
}

func TestNaturalDiscoveriesDoNotRepeatAcrossExtraNodes(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}})
	game.loc.Nodes = append(game.loc.Nodes,
		locality.Node{ID: "natural_two", Kind: locality.NodeNatural, Name: "Willow Marsh"},
		locality.Node{ID: "natural_three", Kind: locality.NodeNatural, Name: "Granite Bluff"},
		locality.Node{ID: "natural_four", Kind: locality.NodeNatural, Name: "Pine Hollow"},
		locality.Node{ID: "natural_five", Kind: locality.NodeNatural, Name: "Fox Meadow"},
	)

	state := game.State()
	if len(state.NaturalDiscoveries) != 3 {
		t.Fatalf("three-node assignments = %d, want 3", len(state.NaturalDiscoveries))
	}
	seenDiscoveries := make(map[string]int)
	for _, discovery := range state.NaturalDiscoveries {
		seenDiscoveries[discovery.DiscoveryID]++
	}
	if len(seenDiscoveries) != 3 {
		t.Fatalf("unique discovery assignments = %v, want each authored definition once", seenDiscoveries)
	}
	for id, count := range seenDiscoveries {
		if count != 1 {
			t.Fatalf("discovery %s assigned %d times, want once", id, count)
		}
	}
	if seenDiscoveries["strange_coin_passage"] != 1 {
		t.Fatalf("Strange Coin passage assignments = %d, want one", seenDiscoveries["strange_coin_passage"])
	}
}

func TestNaturalDiscoveryRequiresAuthorizedWorldArrival(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}})
	nodeID := firstNaturalNodeID(t, game)
	targetX, targetY := naturalDiscoveryPositionForTest(t, game, nodeID)
	before := game.State()

	// Exact public marker coordinates are not authority. Unknown coordinate
	// fields are intentionally ignored by the action decoder, while the
	// server-owned graph arrival remains at spawn.
	forgedWire, err := json.Marshal(map[string]any{
		"type":     "natural_discovery",
		"node_id":  nodeID,
		"player_x": targetX,
		"player_y": targetY,
	})
	if err != nil {
		t.Fatalf("marshal forged discovery: %v", err)
	}
	var forged GameActionRequest
	if err := json.Unmarshal(forgedWire, &forged); err != nil {
		t.Fatalf("decode forged discovery: %v", err)
	}

	for _, tc := range []struct {
		name     string
		location LocationState
		action   GameActionRequest
	}{
		{name: "forged target coordinates from spawn", location: LocationState{Kind: LocationWorld, WorldNodeID: game.walk.Spawn.ID}, action: forged},
		{name: "settlement", location: LocationState{Kind: LocationSettlement, WorldNodeID: nodeID}, action: GameActionRequest{Type: "natural_discovery", NodeID: nodeID}},
		{name: "interior", location: LocationState{Kind: LocationInterior, WorldNodeID: nodeID}, action: GameActionRequest{Type: "natural_discovery", NodeID: nodeID}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			game.location = tc.location
			_, err := game.ProcessAction(tc.action)
			if err == nil {
				t.Fatal("unauthorized natural discovery unexpectedly accepted")
			}
			state := game.State()
			if state.Gold != before.Gold || state.Potions != before.Potions {
				t.Fatalf("rejected action changed rewards: gold=%d potions=%d", state.Gold, state.Potions)
			}
			for _, discovery := range state.NaturalDiscoveries {
				if discovery.Claimed || discovery.Revealed {
					t.Fatalf("rejected action changed discovery state: %+v", discovery)
				}
			}
		})
	}

	game.location = LocationState{Kind: LocationWorld, WorldNodeID: game.walk.Spawn.ID}
	arriveAtWorldNode(t, game, nodeID)
	state := processNaturalDiscoveryForTest(t, game, nodeID)
	assertNaturalDiscoveryState(t, state, "weathered_trail_clue", true, true)
}

func TestNaturalDiscoveryOwnedKeyRewardPreservesRequiredItem(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}})
	nodeID := firstNaturalNodeID(t, game)
	for _, id := range []string{"weathered_trail_clue", "hidden_supply_cache"} {
		game.naturalDiscoveryClaimed[naturalDiscoveryStateKey(nodeID, id)] = true
		game.naturalDiscoveryRevealed[naturalDiscoveryStateKey(nodeID, id)] = true
	}
	game.inv.AddKeyItem("ancient_ring")
	game.inv.AddKeyItem("strange_coin")

	state := processNaturalDiscoveryForTest(t, game, nodeID)
	assertNaturalDiscoveryState(t, state, "strange_coin_passage", true, true)
	if !hasKeyItemState(state, "strange_coin") || !hasKeyItemState(state, "ancient_ring") {
		t.Fatalf("owned passage reward consumed a key item: %+v", state.KeyItems)
	}
	if !strings.Contains(state.Message, "stands open and silent") {
		t.Fatalf("owned passage message = %q, want exhausted copy", state.Message)
	}
}

func TestHiddenCurrentQuestCannotAdvanceOrLeak(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}})
	nodeID := firstQuestVisitNodeID(t, game)
	game.quests = []generator.Quest{{
		ID:           "secret_route",
		TemplateID:   "Q01",
		Name:         "The Secret Route",
		Description:  "Details that must remain hidden.",
		Completion:   "Hidden completion.",
		TargetNodeID: nodeID,
		TargetName:   "Secret Grove",
		Reward:       generator.QuestReward{XP: 25, Gold: 99},
		Hidden:       true,
		IsSideQuest:  true,
		SoftPrereq:   "another_node",
	}}
	game.currentQ = 0
	arriveAtWorldNode(t, game, nodeID)
	beforeGold := game.inv.Gold

	stateResult, err := game.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: nodeID})
	if err != nil {
		t.Fatalf("hidden quest advance: %v", err)
	}
	state := *stateResult
	if game.quests[0].Completed || game.currentQ != 0 || state.Gold != beforeGold {
		t.Fatalf("hidden quest advanced: completed=%v current=%d gold=%d", game.quests[0].Completed, game.currentQ, state.Gold)
	}
	if len(state.Quests) != 1 {
		t.Fatalf("quest projection length = %d, want one redacted slot", len(state.Quests))
	}
	hidden := state.Quests[0]
	if !hidden.Hidden || hidden.ID != "" || hidden.Name != "" || hidden.Description != "" || hidden.TargetNodeID != "" || hidden.Reward.Gold != 0 {
		t.Fatalf("hidden quest leaked wire details: %+v", hidden)
	}
	wire, err := json.Marshal(hidden)
	if err != nil {
		t.Fatalf("marshal hidden quest: %v", err)
	}
	if string(wire) != `{"hidden":true}` {
		t.Fatalf("hidden quest wire state = %s, want opaque marker", wire)
	}

	game.quests[0].Hidden = false
	revealed := game.State().Quests[0]
	if revealed.ID != "secret_route" || revealed.Name != "The Secret Route" || revealed.TargetNodeID != nodeID || revealed.Reward.Gold != 99 {
		t.Fatalf("revealed quest projection = %+v", revealed)
	}
}

func TestNaturalDiscoveryRejectsNonNaturalNode(t *testing.T) {
	game := newFormationTestGame(t, []PartyMemberReq{{Name: "Ayla", ClassID: "warrior"}})
	if _, err := game.ProcessAction(GameActionRequest{Type: "natural_discovery", NodeID: "central"}); err == nil {
		t.Fatal("non-natural discovery unexpectedly accepted")
	}
	if _, err := game.ProcessAction(GameActionRequest{Type: "natural_discovery", NodeID: "missing"}); err == nil {
		t.Fatal("missing natural discovery unexpectedly accepted")
	}
}

func TestNaturalDiscoveryAutosaveLabel(t *testing.T) {
	if got := autosaveTriggerLabels["natural_discovery"]; got != "Natural Discovery" {
		t.Fatalf("natural discovery autosave label = %q", got)
	}
}

func firstNaturalNodeID(t *testing.T, game *Game) string {
	t.Helper()
	for i := range game.loc.Nodes {
		if game.loc.Nodes[i].Kind == locality.NodeNatural {
			return game.loc.Nodes[i].ID
		}
	}
	t.Fatal("test locality has no natural node")
	return ""
}

func firstQuestVisitNodeID(t *testing.T, game *Game) string {
	t.Helper()
	for i := range game.loc.Nodes {
		node := &game.loc.Nodes[i]
		if node.ID == game.walk.Spawn.ID || node.Kind == locality.NodeNatural {
			continue
		}
		if _, reachable := game.walk.DistanceMap[node.ID]; reachable {
			return node.ID
		}
	}
	t.Fatal("test locality has no reachable non-natural quest node")
	return ""
}

func processNaturalDiscoveryForTest(t *testing.T, game *Game, nodeID string) GameState {
	t.Helper()
	arriveAtWorldNode(t, game, nodeID)
	state, err := game.ProcessAction(GameActionRequest{
		Type:   "natural_discovery",
		NodeID: nodeID,
	})
	if err != nil {
		t.Fatalf("natural_discovery %s: %v", nodeID, err)
	}
	return *state
}

func naturalDiscoveryPositionForTest(t *testing.T, game *Game, nodeID string) (int, int) {
	t.Helper()
	for _, spawn := range game.tileMap.Spawns {
		if spawn.NodeID == nodeID {
			return spawn.X, spawn.Y
		}
	}
	t.Fatalf("natural map spawn %s missing", nodeID)
	return 0, 0
}

func assertNaturalDiscoveryState(t *testing.T, state GameState, id string, claimed, revealed bool) {
	t.Helper()
	for _, discovery := range state.NaturalDiscoveries {
		if discovery.DiscoveryID == id {
			if discovery.Claimed != claimed || discovery.Revealed != revealed {
				t.Fatalf("discovery %s = claimed %v revealed %v, want %v/%v", id, discovery.Claimed, discovery.Revealed, claimed, revealed)
			}
			return
		}
	}
	t.Fatalf("discovery %s missing from %+v", id, state.NaturalDiscoveries)
}

func questStateByID(t *testing.T, state GameState, id string) QuestState {
	t.Helper()
	for _, quest := range state.Quests {
		if quest.ID == id {
			return quest
		}
	}
	t.Fatalf("quest %s missing", id)
	return QuestState{}
}

func hasKeyItemState(state GameState, id string) bool {
	for _, item := range state.KeyItems {
		if item.ID == id {
			return true
		}
	}
	return false
}
