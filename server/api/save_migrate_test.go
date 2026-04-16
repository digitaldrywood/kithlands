package api

import (
	"encoding/json"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
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
