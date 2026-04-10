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
	if len(resp.Lines) == 0 {
		t.Error("expected at least one dialogue line")
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
	if len(resp.Lines) == 0 {
		t.Error("expected at least one dialogue line")
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
	if len(resp.Lines) == 0 {
		t.Error("expected at least one dialogue line")
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
	if len(resp.Lines) == 0 {
		t.Error("expected at least one dialogue line")
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
}
