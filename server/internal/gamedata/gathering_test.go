package gamedata

import "testing"

func TestGatheringRejectsInvalidContent(t *testing.T) {
	tests := []struct {
		name   string
		change func(*GameData)
	}{
		{"unbounded nodes", func(gd *GameData) { gd.Gathering.NodesPerRoute = 999 }},
		{"unknown material", func(gd *GameData) { gd.Gathering.Recipes[0].Inputs[0].MaterialID = "unknown" }},
		{"negative yield", func(gd *GameData) { gd.Gathering.Resources[0].Quantity = -1 }},
		{"unknown output", func(gd *GameData) { gd.Gathering.Recipes[0].OutputID = "unknown" }},
		{"duplicate cost", func(gd *GameData) {
			gd.Gathering.Recipes[0].Inputs = append(gd.Gathering.Recipes[0].Inputs, gd.Gathering.Recipes[0].Inputs[0])
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gd := Load("../../../shared")
			tt.change(gd)
			if gd.ValidateGathering() == nil {
				t.Fatal("accepted invalid gathering data")
			}
		})
	}
}
