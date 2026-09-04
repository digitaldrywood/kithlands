package api

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
)

// TestMigrateLegacyMP verifies that characters loaded from pre-MP saves
// (zero MaxMP/CurrentMP) have their MP pool recomputed from the class curve
// (GDD §8.1 rewrite).
func TestMigrateLegacyMP(t *testing.T) {
	gd := gamedata.Load("../../shared")

	tests := []struct {
		name     string
		classID  string
		level    int
		wantMP   int
		wantZero bool
	}{
		{
			name:    "cinder level 1",
			classID: "cinder",
			level:   1,
			wantMP:  10, // starting_stats.mmp = 10, 0 levels gained
		},
		{
			name:    "cinder level 5",
			classID: "cinder",
			level:   5,
			wantMP:  10 + 4*5, // starting + 4 levels * mp_per_level
		},
		{
			name:    "mender level 10",
			classID: "mender",
			level:   10,
			wantMP:  10 + 9*5,
		},
		{
			name:    "wayfarer level 1",
			classID: "wayfarer",
			level:   1,
			wantMP:  5,
		},
		{
			name:     "warrior level 1 stays zero",
			classID:  "warrior",
			level:    1,
			wantZero: true,
		},
		{
			name:     "brawler level 5 stays zero",
			classID:  "brawler",
			level:    5,
			wantZero: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cls := gd.ClassByID(tt.classID)
			if cls == nil {
				t.Fatalf("class %q missing from game data", tt.classID)
			}

			// Simulate a legacy-save character: MaxMP == 0.
			c := &character.Character{
				Name:    "Test",
				ClassID: tt.classID,
				Level:   tt.level,
				MaxHP:   cls.StartingStats.MHP,
			}

			migrateLegacyMP([]*character.Character{c}, gd)

			if tt.wantZero {
				if c.MaxMP != 0 {
					t.Errorf("non-caster MaxMP: got %d, want 0", c.MaxMP)
				}
				if c.CurrentMP != 0 {
					t.Errorf("non-caster CurrentMP: got %d, want 0", c.CurrentMP)
				}
				return
			}

			if c.MaxMP != tt.wantMP {
				t.Errorf("MaxMP: got %d, want %d", c.MaxMP, tt.wantMP)
			}
			if c.CurrentMP != c.MaxMP {
				t.Errorf("CurrentMP should equal MaxMP after migration: got %d/%d", c.CurrentMP, c.MaxMP)
			}
		})
	}
}

// TestMigrateLegacyMPSkipsInitialized verifies that characters already carrying
// MP values are left alone (guards against stomping a live caster's current MP).
func TestMigrateLegacyMPSkipsInitialized(t *testing.T) {
	gd := gamedata.Load("../../shared")

	c := &character.Character{
		Name:      "Raistlin",
		ClassID:   "cinder",
		Level:     5,
		MaxMP:     30,
		CurrentMP: 7, // mid-battle: partially drained
	}

	migrateLegacyMP([]*character.Character{c}, gd)

	if c.MaxMP != 30 {
		t.Errorf("MaxMP should not change: got %d, want 30", c.MaxMP)
	}
	if c.CurrentMP != 7 {
		t.Errorf("CurrentMP should not change: got %d, want 7", c.CurrentMP)
	}
}

func TestFromSaveStateMigratesLegacyCasterMP(t *testing.T) {
	game := newXPProgressTestGame(t, []PartyMemberReq{
		{Name: "Hero", ClassID: "warrior"},
		{Name: "Mage", ClassID: "cinder"},
	})

	ss, err := game.ToSaveState("legacy-mp", "test-user")
	if err != nil {
		t.Fatalf("ToSaveState: %v", err)
	}

	var party []*character.Character
	if err := json.Unmarshal(ss.Party, &party); err != nil {
		t.Fatalf("unmarshal party: %v", err)
	}
	party[1].Level = 5
	party[1].MaxMP = 0
	party[1].CurrentMP = 0

	partyJSON, err := json.Marshal(party)
	if err != nil {
		t.Fatalf("marshal party: %v", err)
	}
	ss.Party = partyJSON

	loaded, err := FromSaveState(ss, game.gd, game.loc)
	if err != nil {
		t.Fatalf("FromSaveState: %v", err)
	}

	const wantMP = 30
	if got := loaded.party[1].MaxMP; got != wantMP {
		t.Fatalf("loaded MaxMP = %d, want %d", got, wantMP)
	}
	if got := loaded.party[1].CurrentMP; got != wantMP {
		t.Fatalf("loaded CurrentMP = %d, want %d", got, wantMP)
	}

	state := loaded.State()
	if got := state.Party[1].MaxMP; got != wantMP {
		t.Fatalf("state MaxMP = %d, want %d", got, wantMP)
	}
	if got := state.Party[1].MP; got != wantMP {
		t.Fatalf("state MP = %d, want %d", got, wantMP)
	}
}

func TestMigrateRequiredCampaignRetiresLinearSideQuests(t *testing.T) {
	quests := []generator.Quest{
		{ID: "main-0", Completed: true},
		{ID: "side-complete", IsSideQuest: true, Completed: true},
		{ID: "main-1"},
		{ID: "side-pending", IsSideQuest: true},
		{ID: "boss", TemplateID: "Q12"},
	}

	got, current := migrateRequiredCampaign(quests, 2)
	if current != 1 {
		t.Fatalf("current quest = %d, want 1 after removing a completed side quest", current)
	}
	wantIDs := []string{"main-0", "main-1", "boss"}
	if len(got) != len(wantIDs) {
		t.Fatalf("required campaign length = %d, want %d", len(got), len(wantIDs))
	}
	for i, want := range wantIDs {
		if got[i].ID != want || got[i].IsSideQuest {
			t.Errorf("required quest %d = %+v, want %q", i, got[i], want)
		}
	}
}

func TestFromSaveStateRetiresLinearSideQuests(t *testing.T) {
	game := newXPProgressTestGame(t, []PartyMemberReq{{Name: "Hero", ClassID: "warrior"}})
	game.party[0].XP = 321
	game.inv.Gold = 777
	game.inv.Consumables["potion"] = 4
	game.quests = []generator.Quest{
		{ID: "main-0", TemplateID: "Q04", Completed: true},
		{ID: "legacy-side-q12", TemplateID: "Q12", IsSideQuest: true, Completed: true},
		{ID: "boss", TemplateID: "Q12"},
	}
	game.currentQ = 2
	game.finalEncounter = &FinalEncounterProgress{
		QuestID:  "legacy-side-q12",
		Defeated: true,
		Recovery: "defeat",
	}

	saved, err := game.ToSaveState("legacy-linear-side", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(saved, game.gd, game.loc)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.currentQ != 1 || len(loaded.quests) != 2 || loaded.quests[1].TemplateID != "Q12" {
		t.Fatalf("legacy route was not migrated: current=%d quests=%+v", loaded.currentQ, loaded.quests)
	}
	if loaded.finalEncounter != nil {
		t.Fatalf("stale side-quest finale progress survived migration: %+v", loaded.finalEncounter)
	}
	if loaded.party[0].XP != 321 {
		t.Fatalf("earned party XP changed during migration: got %d, want 321", loaded.party[0].XP)
	}
	if loaded.inv.Gold != 777 || loaded.inv.Consumables["potion"] != 4 {
		t.Fatalf("earned inventory changed during migration: gold=%d potions=%d", loaded.inv.Gold, loaded.inv.Consumables["potion"])
	}
}

func TestMigrateFinalEncounterProgressPreservesRetainedFinalQuest(t *testing.T) {
	progress := &FinalEncounterProgress{QuestID: "boss", Recovery: "defeat"}
	quests := []generator.Quest{{ID: "boss", TemplateID: "Q12"}}
	if got := migrateFinalEncounterProgress(progress, quests, "Q12"); got != progress {
		t.Fatalf("retained final-quest progress was cleared: got %+v", got)
	}
}
