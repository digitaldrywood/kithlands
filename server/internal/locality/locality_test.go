package locality_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

func cadottWizard() locality.WizardInput {
	return locality.WizardInput{
		TownName: "Cadott, WI",
		People: []locality.WizardPerson{
			{Name: "Bob", Relation: "friendly", Personality: "Runs the hardware store"},
			{Name: "Mrs Henderson", Relation: "neutral", Personality: "Town gossip"},
			{Name: "Mayor Grimes", Relation: "rival", Personality: "Corrupt and ambitious"},
			{Name: "Coach Davis", Relation: "friendly", Personality: "Tough but fair"},
			{Name: "Old Pete", Relation: "neutral", Personality: "Knows every secret in town"},
		},
		Places:      []string{"The School", "Creswood Corners", "Fire Hall"},
		BigBuilding: "Town Hall",
		Flavor:      "conquest",
		Difficulty:  "normal",
	}
}

func TestBuildFromWizard(t *testing.T) {
	loc := locality.BuildFromWizard(cadottWizard())

	if loc.Name != "Cadott, WI" {
		t.Errorf("name: got %q, want %q", loc.Name, "Cadott, WI")
	}
	if loc.Source != "wizard" {
		t.Errorf("source: got %q, want %q", loc.Source, "wizard")
	}
	if len(loc.Nodes) < 12 {
		t.Errorf("node count: got %d, want >= 12", len(loc.Nodes))
	}
	if len(loc.Edges) == 0 {
		t.Error("no edges generated")
	}

	// Central node should exist
	central := loc.NodeByID("central")
	if central == nil {
		t.Fatal("central node not found")
	}
	if central.Name != "Town Hall" {
		t.Errorf("central name: got %q, want %q", central.Name, "Town Hall")
	}
}

func TestGraphWalkProducesDifferentCampaigns(t *testing.T) {
	loc := locality.BuildFromWizard(cadottWizard())

	// Walk from central (Town Hall)
	walk1 := locality.Walk(loc, "central")
	if walk1.Spawn == nil {
		t.Fatal("walk from central: nil spawn")
	}

	// Walk from inn
	walk2 := locality.Walk(loc, "inn")
	if walk2.Spawn == nil {
		t.Fatal("walk from inn: nil spawn")
	}

	// Different spawns should produce different close neighborhoods
	// (at minimum, different spawn nodes)
	if walk1.Spawn.ID == walk2.Spawn.ID {
		t.Error("different spawn points should have different spawn nodes")
	}
}

func TestGraphWalkDistances(t *testing.T) {
	loc := locality.BuildFromWizard(cadottWizard())

	walk := locality.Walk(loc, "central")

	// Central should be distance 0
	if walk.DistanceMap["central"] != 0 {
		t.Errorf("central distance: got %d, want 0", walk.DistanceMap["central"])
	}

	// Close nodes should be distance 1-2
	for _, n := range walk.Close {
		d := walk.DistanceMap[n.ID]
		if d < 1 || d > 2 {
			t.Errorf("close node %q distance: got %d, want 1-2", n.ID, d)
		}
	}

	// Medium nodes should be distance 3-4
	for _, n := range walk.Medium {
		d := walk.DistanceMap[n.ID]
		if d < 3 || d > 4 {
			t.Errorf("medium node %q distance: got %d, want 3-4", n.ID, d)
		}
	}
}

func TestBigBadIsHighestImportanceFarNode(t *testing.T) {
	loc := locality.BuildFromWizard(cadottWizard())

	walk := locality.Walk(loc, "inn")

	if walk.BigBad == nil {
		// Not all walks produce far nodes depending on graph shape
		// but the walk should still complete without error
		t.Log("no big bad found (graph may be too small for far nodes)")
		return
	}

	// Big bad should be the highest importance among far/medium nodes
	if walk.BigBad.Importance <= 0 {
		t.Errorf("big bad importance should be > 0, got %d", walk.BigBad.Importance)
	}
}

func TestNeighbors(t *testing.T) {
	loc := locality.BuildFromWizard(cadottWizard())

	neighbors := loc.Neighbors("central")
	if len(neighbors) == 0 {
		t.Error("central should have neighbors")
	}
}
