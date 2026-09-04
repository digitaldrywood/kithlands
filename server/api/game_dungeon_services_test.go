package api

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/generator"
)

func dungeonServiceSnapshot(t *testing.T, g *Game) string {
	t.Helper()
	data, err := json.Marshal([]any{g.inv, g.party, g.spellBooks, g.buildingSideQuests, g.dungeon, g.phase, g.location, g.message})
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestDungeonRejectsRemotePurchasesAndSpellLearning(t *testing.T) {
	g := newShopSpellGame(t, []PartyMemberReq{{Name: "Nia", ClassID: "mender"}})
	setPartyLevel(t, g, 0, 4)
	setGold(t, g, 500)
	if _, _, _, err := g.validateSpellLearningLocked("Nia", "heal"); err != nil {
		t.Fatalf("spell must otherwise be learnable: %v", err)
	}
	enterTestDungeon(t, g)
	before := dungeonServiceSnapshot(t, g)
	for _, attempt := range []struct {
		name string
		run  func() error
	}{
		{"buy supplies", func() error { return g.BuyItem("potion", "consumable") }},
		{"learn spell", func() error { return g.LearnSpell("Nia", "heal") }},
	} {
		t.Run(attempt.name, func(t *testing.T) {
			if err := attempt.run(); err == nil {
				t.Fatal("remote town service accepted inside the dungeon")
			}
			if dungeonServiceSnapshot(t, g) != before {
				t.Fatal("rejected service changed inventory, spells, quests or dungeon state")
			}
		})
	}
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "retreat"}); err != nil {
		t.Fatal(err)
	}
	if err := g.BuyItem("potion", "consumable"); err != nil {
		t.Fatalf("town purchase after retreat: %v", err)
	}
	if err := g.LearnSpell("Nia", "heal"); err != nil {
		t.Fatalf("town spell learning after retreat: %v", err)
	}
}

func TestDungeonRejectsRemoteProprietorQuestTurnIn(t *testing.T) {
	g := newTownTestGame(t)
	var giver string
	for nodeID, quest := range g.buildingSideQuests {
		if quest.TargetNodeID != g.quests[g.currentQ].TargetNodeID {
			giver = nodeID
			break
		}
	}
	if giver == "" {
		t.Fatal("fixture needs a proprietor quest distinct from the main quest")
	}
	if response := g.InteractWithNPC(giver); response == nil {
		t.Fatal("could not accept proprietor quest before entering the dungeon")
	}
	quest := g.buildingSideQuests[giver]
	if quest.Status != generator.BuildingQuestAccepted {
		t.Fatalf("quest status after acceptance = %s", quest.Status)
	}
	if _, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: quest.TargetNodeID}); err != nil {
		t.Fatal(err)
	}
	if g.buildingSideQuests[giver].Status != generator.BuildingQuestReadyToTurnIn {
		t.Fatal("visiting the target did not make the quest ready")
	}
	enterTestDungeon(t, g)
	before := dungeonServiceSnapshot(t, g)
	if response := g.InteractWithNPC(giver); response != nil {
		t.Fatal("remote proprietor interaction accepted inside the dungeon")
	}
	if dungeonServiceSnapshot(t, g) != before {
		t.Fatal("rejected turn-in changed rewards, progression or dungeon state")
	}
	if _, err := g.ProcessDungeon(DungeonRequest{Type: "retreat"}); err != nil {
		t.Fatal(err)
	}
	gold := g.inv.Gold
	if response := g.InteractWithNPC(giver); response == nil || g.buildingSideQuests[giver].Status != generator.BuildingQuestCompleted {
		t.Fatal("normal turn-in after retreat failed")
	}
	if g.inv.Gold != gold+quest.Reward.Gold {
		t.Fatal("normal turn-in did not grant its authored gold reward")
	}
}
