package locality

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

// WizardInput represents the 6-question wizard answers per Section 9.2.1.
type WizardInput struct {
	TownName     string           `json:"town_name"`
	People       []WizardPerson   `json:"people"`
	Places       []string         `json:"places"`
	BigBuilding  string           `json:"big_building"`
	Flavor       string           `json:"flavor"`
	Difficulty   string           `json:"difficulty"`
}

type WizardPerson struct {
	Name        string `json:"name"`
	Relation    string `json:"relation"` // friendly, neutral, rival
	Personality string `json:"personality,omitempty"`
}

// BuildFromWizard generates a ~12-node locality graph from wizard answers.
func BuildFromWizard(input WizardInput) *Locality {
	loc := &Locality{
		ID:        uuid.New().String(),
		Name:      input.TownName,
		Generated: time.Now(),
		Source:    "wizard",
	}

	// Central node: the big building
	centralID := "central"
	loc.Nodes = append(loc.Nodes, Node{
		ID:         centralID,
		Kind:       NodeLandmark,
		Name:       input.BigBuilding,
		Tags:       []string{"central", "landmark"},
		Importance: 90,
	})

	// People nodes
	for i, p := range input.People {
		nodeID := fmt.Sprintf("person_%d", i)
		tags := []string{"person", p.Relation}
		importance := 70
		if p.Relation == "rival" {
			importance = 80
		}

		loc.Nodes = append(loc.Nodes, Node{
			ID:          nodeID,
			Kind:        NodePerson,
			Name:        p.Name,
			Tags:        tags,
			Importance:  importance,
			Personality: p.Personality,
		})
	}

	// Place nodes
	for i, placeName := range input.Places {
		nodeID := fmt.Sprintf("place_%d", i)
		loc.Nodes = append(loc.Nodes, Node{
			ID:         nodeID,
			Kind:       NodePlace,
			Name:       placeName,
			Tags:       []string{"place"},
			Importance: 60,
		})
	}

	// Add some generated nodes to fill out to ~12
	fillers := []struct {
		id, name string
		kind     NodeKind
		tags     []string
		imp      int
	}{
		{"inn", "The Wayward Inn", NodeBusiness, []string{"commerce", "rest"}, 50},
		{"shop", "General Store", NodeBusiness, []string{"commerce", "shop"}, 55},
		{"wilderness_1", "Dark Forest", NodeNatural, []string{"wilderness", "danger"}, 40},
		{"wilderness_2", "Old Ruins", NodeLandmark, []string{"wilderness", "dungeon"}, 45},
	}

	for _, f := range fillers {
		loc.Nodes = append(loc.Nodes, Node{
			ID:         f.id,
			Kind:       f.kind,
			Name:       f.name,
			Tags:       f.tags,
			Importance: f.imp,
		})
	}

	// Build edges: create a connected graph
	// Central connects to all places and the inn/shop
	for i := range input.Places {
		loc.Edges = append(loc.Edges, Edge{
			From: centralID, To: fmt.Sprintf("place_%d", i),
			Kind: EdgeProximity, Weight: 0.8,
		})
	}
	loc.Edges = append(loc.Edges,
		Edge{From: centralID, To: "inn", Kind: EdgeProximity, Weight: 0.7},
		Edge{From: centralID, To: "shop", Kind: EdgeProximity, Weight: 0.7},
	)

	// People connect to places and to each other
	for i, p := range input.People {
		personID := fmt.Sprintf("person_%d", i)
		// Each person connects to a place
		if i < len(input.Places) {
			loc.Edges = append(loc.Edges, Edge{
				From: personID, To: fmt.Sprintf("place_%d", i),
				Kind: EdgeSocial, Weight: 0.6,
			})
		}
		// First person connects to central
		if i == 0 {
			loc.Edges = append(loc.Edges, Edge{
				From: personID, To: centralID,
				Kind: EdgeSocial, Weight: 0.5,
			})
		}
		// Rivals connect to central (they're the "power" figures)
		if p.Relation == "rival" {
			loc.Edges = append(loc.Edges, Edge{
				From: personID, To: centralID,
				Kind: EdgeFactional, Weight: 0.9,
			})
		}
	}

	// Wilderness connects to outer places, creating distance from spawn
	if len(input.Places) > 0 {
		loc.Edges = append(loc.Edges, Edge{
			From: fmt.Sprintf("place_%d", len(input.Places)-1),
			To: "wilderness_1", Kind: EdgeProximity, Weight: 0.4,
		})
	}
	loc.Edges = append(loc.Edges,
		Edge{From: "wilderness_1", To: "wilderness_2", Kind: EdgeProximity, Weight: 0.3},
		Edge{From: "inn", To: "wilderness_1", Kind: EdgeProximity, Weight: 0.5},
	)

	return loc
}
