package api

import (
	"strings"
	"testing"
)

func enterCadottInn(t *testing.T, game *Game) {
	t.Helper()
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "enter-settlement", WorldNodeID: game.State().SettlementEntryNodeID}); err != nil {
		t.Fatal(err)
	}
	if _, err := game.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "inn-door"}); err != nil {
		t.Fatal(err)
	}
}

func TestCadottInnChestRequiresLocationAndAwardsOnce(t *testing.T) {
	game := newTownTestGame(t)
	const nodeID, chestID = "cadott-riverlight-inn", "gilded_guest_chest"
	gold := game.State().Gold
	if _, err := game.openChest(nodeID, chestID); err == nil {
		t.Fatal("remote inn chest claim succeeded")
	}
	if game.State().Gold != gold {
		t.Fatal("rejected claim changed gold")
	}
	enterCadottInn(t, game)
	spawn := game.State().CurrentLocation.Interior
	if spawn.Interior.ID != "inn_gilded_steps_2f" || len(spawn.Interior.Floors) != 2 {
		t.Fatalf("inn binding changed: %+v", spawn.Interior)
	}
	if _, err := game.openChest(nodeID, "not-a-chest"); err == nil {
		t.Fatal("invalid chest claim succeeded")
	}
	if _, err := game.openChest("cadott-general-store", "corner_goods_stash"); err == nil {
		t.Fatal("another interior's chest claim succeeded")
	}
	state, err := game.openChest(nodeID, chestID)
	if err != nil {
		t.Fatal(err)
	}
	if state.Gold != gold+180 {
		t.Fatalf("gold = %d, want %d", state.Gold, gold+180)
	}
	if _, err := game.openChest(nodeID, chestID); err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("repeat claim = %v", err)
	}
	if game.State().Gold != gold+180 {
		t.Fatal("repeat claim changed gold")
	}
	saved, err := game.ToSaveState("inn", "inn-test")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	// The manager restores shared settlement content when loading a save.
	gm := NewGameManager(game.gd, "../../shared")
	if err := gm.attachSettlementMap(loaded); err != nil {
		t.Fatal(err)
	}
	if loaded.State().CurrentLocation.Kind != LocationWorld {
		t.Fatal("existing overworld resume behavior changed")
	}
	enterCadottInn(t, loaded)
	if _, err := loaded.openChest(nodeID, chestID); err == nil || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("reloaded chest = %v", err)
	}
	if loaded.State().Gold != gold+180 {
		t.Fatal("reload changed chest reward")
	}
}

func TestCadottInnNPCsUseSharedDialogueWhileInside(t *testing.T) {
	game := newTownTestGame(t)
	const nodeID = "cadott-riverlight-inn"
	if game.InteractWithNPC(nodeID) != nil {
		t.Fatal("remote inn conversation succeeded")
	}
	enterCadottInn(t, game)
	for _, tc := range []struct{ id, name string }{{nodeID, "Innkeeper"}, {nodeID + "_npc1", "Traveler"}, {nodeID + "_npc2", "Guard"}} {
		response := game.InteractWithNPC(tc.id)
		if response == nil || response.Dialogue == nil {
			t.Fatalf("missing dialogue for %s", tc.id)
		}
		if response.Dialogue.NPCName != tc.name {
			t.Fatalf("NPC %s name = %s", tc.id, response.Dialogue.NPCName)
		}
		if len(response.Dialogue.Lines) < 3 {
			t.Fatalf("shared dialogue pool missing for %s", tc.id)
		}
	}
	if game.InteractWithNPC("cadott-general-store") != nil {
		t.Fatal("another interior conversation accepted")
	}
	if game.InteractWithNPC("unknown-inn") != nil {
		t.Fatal("unknown NPC accepted")
	}
}
