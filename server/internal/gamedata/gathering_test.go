package gamedata

import "testing"

func TestGatheringRejectsInvalidContent(t *testing.T) {
	tests := []struct {
		name   string
		change func(*GameData)
	}{
		{"no primary resources", func(gd *GameData) {
			for i := range gd.Gathering.Resources {
				gd.Gathering.Resources[i].Placement = "route_end"
			}
		}},
		{"missing habitat", func(gd *GameData) { delete(gd.Gathering.Habitats, "rocky") }},
		{"invalid cooldown", func(gd *GameData) { gd.Gathering.Resources[0].RespawnSeconds = 0 }},
		{"invalid habitat radius", func(gd *GameData) {
			h := gd.Gathering.Habitats["meadow"]
			h.SearchRadius = 99
			gd.Gathering.Habitats["meadow"] = h
		}},
		{"negative supply price", func(gd *GameData) { gd.Gathering.Materials[0].BuyPrice = -1 }},
		{"duplicate material", func(gd *GameData) { gd.Gathering.Materials[0].ID = gd.Gathering.Resources[0].MaterialID }},
		{"invalid level gate", func(gd *GameData) { gd.Gathering.Recipes[0].RequiredLevel = 99 }},
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
