package api_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/api"
)

func TestTransportInNewGame(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})
	state := game.State()

	if state.Transport.CurrentTier != "T1" {
		t.Errorf("transport tier: got %s, want T1", state.Transport.CurrentTier)
	}
	if state.Transport.TierName != "On foot" {
		t.Errorf("transport name: got %s, want On foot", state.Transport.TierName)
	}
	if state.Transport.EncounterMult != 1.0 {
		t.Errorf("encounter rate: got %f, want 1.0", state.Transport.EncounterMult)
	}
	if state.Transport.CrossesWater {
		t.Error("T1 should not cross water")
	}
	if state.Transport.Flies {
		t.Error("T1 should not fly")
	}
}

func TestTransportUpgradeThroughFullGame(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Sparks", ClassID: "cinder"},
	})

	seen := map[string]bool{}

	// Advance main quests by entering each quest's target node. Combat
	// victory no longer auto-completes quests (issue #86), so the only way
	// to progress the campaign is quest_advance from the world phase.
	for i := 0; i < 200; i++ {
		state := game.State()
		seen[state.Transport.CurrentTier] = true

		if state.Phase == "victory" {
			break
		}

		switch state.Phase {
		case "world":
			if state.CurrentQ >= len(state.Quests) {
				t.Fatalf("no more quests but phase still world")
			}
			target := state.Quests[state.CurrentQ].TargetNodeID
			if target == "" {
				t.Fatalf("quest[%d] has no target_node_id", state.CurrentQ)
			}
			if _, err := processCampaignAction(t, game, nextCampaignAction(state)); err != nil {
				t.Fatalf("quest_advance: %v", err)
			}
		case "combat":
			api.ForceVictoryForTest(game)
		case "quest_complete":
			_, err := game.ProcessAction(api.GameActionRequest{Type: "advance"})
			if err != nil {
				t.Fatalf("advance: %v", err)
			}
		case "promotion":
			_, err := game.Promote(true)
			if err != nil {
				t.Fatalf("promote: %v", err)
			}
		case "defeat":
			t.Skip("party wiped before completing the game")
		default:
			t.Fatalf("unexpected phase: %s", state.Phase)
		}
	}

	final := game.State()
	t.Logf("final transport tier: %s", final.Transport.CurrentTier)
	t.Logf("tiers seen: %v", seen)

	// Should have progressed past T1
	if !seen["T4"] && !seen["T5"] {
		t.Error("transport never upgraded beyond T1")
	}

	// Final tier should be T5 (all conditions met by end of game)
	if final.Transport.CurrentTier != "T5" {
		t.Errorf("final tier: got %s, want T5", final.Transport.CurrentTier)
	}
	if !final.Transport.Flies {
		t.Error("T5 should fly")
	}
	if !final.Transport.CrossesWater {
		t.Error("T5 should cross water")
	}
	if final.Transport.EncounterMult != 0.0 {
		t.Errorf("T5 encounter rate: got %f, want 0.0", final.Transport.EncounterMult)
	}
}

func TestOptionalBuildingQuestDoesNotGateCampaignProgression(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Sparks", ClassID: "cinder"},
	})
	accepted := game.InteractWithNPC("inn")
	if accepted == nil || accepted.GameState == nil || len(accepted.GameState.BuildingSideQuests) == 0 {
		t.Fatal("fixture did not accept an optional building quest")
	}
	optionalID := accepted.GameState.BuildingSideQuests[0].ID
	promotionSeen := false

	for i := 0; i < 200; i++ {
		state := game.State()
		if state.Phase == "victory" {
			break
		}
		switch state.Phase {
		case "world":
			if _, err := processCampaignAction(t, game, nextCampaignAction(state)); err != nil {
				t.Fatal(err)
			}
		case "combat":
			api.ForceVictoryForTest(game)
		case "quest_complete":
			if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
				t.Fatal(err)
			}
		case "promotion":
			promotionSeen = true
			if state.Transport.CurrentTier != "T4" {
				t.Fatalf("promotion transport = %s, want T4", state.Transport.CurrentTier)
			}
			if _, err := game.Promote(true); err != nil {
				t.Fatal(err)
			}
		default:
			t.Fatalf("unexpected phase %q", state.Phase)
		}
	}

	final := game.State()
	if final.Phase != "victory" || final.CurrentQ != len(final.Quests) {
		t.Fatalf("required route did not reach victory: phase=%s current=%d quests=%d", final.Phase, final.CurrentQ, len(final.Quests))
	}
	if !promotionSeen || final.Transport.CurrentTier != "T5" {
		t.Fatalf("story gates did not fire: promotion=%v transport=%s", promotionSeen, final.Transport.CurrentTier)
	}
	for _, side := range final.BuildingSideQuests {
		if side.ID == optionalID {
			if side.Completed {
				t.Fatalf("optional quest changed while completing main route: %+v", side)
			}
			return
		}
	}
	t.Fatalf("accepted optional quest %q disappeared", optionalID)
}

func TestTransportSpriteFromConquestSkins(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
	})
	state := game.State()

	// T1 sprite should come from conquest_skins
	if state.Transport.Sprite != "foot" {
		t.Errorf("T1 sprite: got %s, want foot", state.Transport.Sprite)
	}
}
