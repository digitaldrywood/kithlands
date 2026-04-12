package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func newTestGame(t *testing.T) *api.Game {
	t.Helper()
	gd := gamedata.Load("../../shared")
	gm := api.NewGameManager(gd, "../../shared")
	game, err := gm.CreateGame(api.NewGameRequest{
		TownName:    "Cadott",
		People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
		Places:      []string{"School", "Store"},
		BigBuilding: "Town Hall",
		Party: []api.PartyMemberReq{
			{Name: "Hero", ClassID: "warrior"},
			{Name: "Sparks", ClassID: "cinder"},
		},
		Difficulty: "normal",
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	return game
}

func TestGetNPCDialogue_Shop(t *testing.T) {
	game := newTestGame(t)
	resp := game.GetNPCDialogue("shop")
	if resp == nil {
		t.Fatal("expected dialogue for shop node, got nil")
	}
	if resp.NPCName != "Merchant" {
		t.Errorf("npc_name = %q, want Merchant", resp.NPCName)
	}
	if resp.Sprite != "npc_merchant" {
		t.Errorf("sprite = %q, want npc_merchant", resp.Sprite)
	}
	if len(resp.Lines) < 3 {
		t.Errorf("expected at least 3 dialogue lines, got %d", len(resp.Lines))
	}
}

func TestGetNPCDialogue_Inn(t *testing.T) {
	game := newTestGame(t)
	resp := game.GetNPCDialogue("inn")
	if resp == nil {
		t.Fatal("expected dialogue for inn node, got nil")
	}
	if resp.NPCName != "Innkeeper" {
		t.Errorf("npc_name = %q, want Innkeeper", resp.NPCName)
	}
	if resp.Sprite != "npc_innkeeper" {
		t.Errorf("sprite = %q, want npc_innkeeper", resp.Sprite)
	}
	if len(resp.Lines) < 3 {
		t.Errorf("expected at least 3 dialogue lines, got %d", len(resp.Lines))
	}
}

func TestGetNPCDialogue_Temple(t *testing.T) {
	game := newTestGame(t)
	resp := game.GetNPCDialogue("temple")
	if resp == nil {
		t.Fatal("expected dialogue for temple node, got nil")
	}
	if resp.NPCName != "Priestess" {
		t.Errorf("npc_name = %q, want Priestess", resp.NPCName)
	}
	if resp.Sprite != "npc_priestess" {
		t.Errorf("sprite = %q, want npc_priestess", resp.Sprite)
	}
	if len(resp.Lines) < 3 {
		t.Errorf("expected at least 3 dialogue lines, got %d", len(resp.Lines))
	}
}

func TestGetNPCDialogue_Person(t *testing.T) {
	game := newTestGame(t)
	resp := game.GetNPCDialogue("person_0")
	if resp == nil {
		t.Fatal("expected dialogue for person node, got nil")
	}
	if resp.NPCName != "Bob" {
		t.Errorf("npc_name = %q, want Bob", resp.NPCName)
	}
	if resp.Sprite != "npc_elder" {
		t.Errorf("sprite = %q, want npc_elder", resp.Sprite)
	}
	if len(resp.Lines) < 3 {
		t.Errorf("expected at least 3 dialogue lines, got %d", len(resp.Lines))
	}
}

func TestGetNPCDialogue_NotFound(t *testing.T) {
	game := newTestGame(t)
	resp := game.GetNPCDialogue("nonexistent")
	if resp != nil {
		t.Errorf("expected nil for nonexistent node, got %+v", resp)
	}
}

func TestGetNPCDialogue_DefaultGuard(t *testing.T) {
	game := newTestGame(t)
	// "central" node is a landmark without shop/inn/temple tags
	resp := game.GetNPCDialogue("central")
	if resp == nil {
		t.Fatal("expected dialogue for central node, got nil")
	}
	if resp.NPCName != "Guard" {
		t.Errorf("npc_name = %q, want Guard", resp.NPCName)
	}
	if resp.Sprite != "npc_guard" {
		t.Errorf("sprite = %q, want npc_guard", resp.Sprite)
	}
	if len(resp.Lines) < 3 {
		t.Errorf("expected at least 3 dialogue lines, got %d", len(resp.Lines))
	}
}

func TestGetNPCDialogue_Blacksmith(t *testing.T) {
	game := newTestGame(t)
	resp := game.GetNPCDialogue("smithy")
	if resp == nil {
		t.Fatal("expected dialogue for smithy node, got nil")
	}
	if resp.NPCName != "Blacksmith" {
		t.Errorf("npc_name = %q, want Blacksmith", resp.NPCName)
	}
	if resp.Sprite != "npc_blacksmith" {
		t.Errorf("sprite = %q, want npc_blacksmith", resp.Sprite)
	}
	if len(resp.Lines) < 3 {
		t.Errorf("expected at least 3 dialogue lines, got %d", len(resp.Lines))
	}
}

// TestGetNPCDialogue_Deterministic verifies the same game+node always
// produces identical dialogue lines (deterministic seed).
func TestGetNPCDialogue_Deterministic(t *testing.T) {
	game := newTestGame(t)

	for _, nodeID := range []string{"shop", "inn", "temple", "smithy", "person_0", "central"} {
		first := game.GetNPCDialogue(nodeID)
		second := game.GetNPCDialogue(nodeID)
		if first == nil || second == nil {
			t.Fatalf("node %q returned nil", nodeID)
		}
		if len(first.Lines) != len(second.Lines) {
			t.Errorf("node %q: line count changed: %d vs %d", nodeID, len(first.Lines), len(second.Lines))
			continue
		}
		for i := range first.Lines {
			if first.Lines[i] != second.Lines[i] {
				t.Errorf("node %q line %d changed: %q vs %q", nodeID, i, first.Lines[i], second.Lines[i])
			}
		}
	}
}

// TestGetNPCDialogue_Variety verifies that different games produce different
// dialogue for the same node type (different gameID seeds).
func TestGetNPCDialogue_Variety(t *testing.T) {
	gd := gamedata.Load("../../shared")
	gm := api.NewGameManager(gd, "../../shared")

	makeGame := func() *api.Game {
		t.Helper()
		g, err := gm.CreateGame(api.NewGameRequest{
			TownName:    "Cadott",
			People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
			Places:      []string{"School", "Store"},
			BigBuilding: "Town Hall",
			Party: []api.PartyMemberReq{
				{Name: "Hero", ClassID: "warrior"},
				{Name: "Sparks", ClassID: "cinder"},
			},
			Difficulty: "normal",
		})
		if err != nil {
			t.Fatalf("create game: %v", err)
		}
		return g
	}

	// Create multiple games; at least one pair should produce different pool
	// lines for the shop node. The first line is always the greeting so we
	// compare pool-selected lines (index 1+).
	const attempts = 5
	games := make([]*api.Game, attempts)
	for i := range games {
		games[i] = makeGame()
	}

	sawDifferent := false
	baseline := games[0].GetNPCDialogue("shop")
	for _, g := range games[1:] {
		resp := g.GetNPCDialogue("shop")
		// Compare all pool-selected lines (skip index 0 which is the fixed greeting).
		for i := 1; i < len(resp.Lines) && i < len(baseline.Lines); i++ {
			if resp.Lines[i] != baseline.Lines[i] {
				sawDifferent = true
				break
			}
		}
		if sawDifferent {
			break
		}
	}
	if !sawDifferent {
		t.Error("expected at least one game to produce different shop dialogue, but all were identical")
	}
}

// TestDialoguePoolSize validates that dialogue.json has >= 15 lines per archetype.
func TestDialoguePoolSize(t *testing.T) {
	gd := gamedata.Load("../../shared")
	required := []string{"merchant", "priestess", "elder", "innkeeper", "guard", "blacksmith"}
	for _, arch := range required {
		a, ok := gd.Dialogue.Archetypes[arch]
		if !ok {
			t.Errorf("missing archetype %q in dialogue pool", arch)
			continue
		}
		if len(a.Lines) < 15 {
			t.Errorf("archetype %q has %d lines, want >= 15", arch, len(a.Lines))
		}
	}
}
