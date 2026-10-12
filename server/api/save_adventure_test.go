package api

import (
	"github.com/digitaldrywood/kithlands/internal/save"
	"testing"
)

func TestSaveAdventureIdentity(t *testing.T) {
	first := save.SaveState{ID: "first", UserID: "account", LocalityID: "town", RNGSeed: 42}
	snapshot := first
	snapshot.ID, snapshot.Name, snapshot.SaveType = "next", "Renamed", "autosave"
	if saveAdventureID(&first) != saveAdventureID(&snapshot) {
		t.Fatal("snapshots of one run must share an adventure")
	}
	for _, other := range []save.SaveState{
		{ID: "second", UserID: "account", LocalityID: "town", RNGSeed: 43},
		{ID: "second", UserID: "account", LocalityID: "other", RNGSeed: 42},
		{ID: "second", UserID: "other", LocalityID: "town", RNGSeed: 42},
	} {
		if saveAdventureID(&first) == saveAdventureID(&other) {
			t.Fatal("distinct runs, localities and accounts must stay separate")
		}
	}
	for _, legacy := range []save.SaveState{{ID: "legacy", RNGSeed: 0}, {ID: "incomplete", RNGSeed: 42}} {
		if saveAdventureID(&legacy) != legacy.ID {
			t.Fatal("unknown legacy identity must remain a separate save")
		}
	}
}
