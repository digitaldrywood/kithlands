package locality

import "testing"

func TestEncounterTerrainTag_EncounterTerrainUsesDistinctTags(t *testing.T) {
	tests := []struct {
		name string
		tile TileType
		want string
	}{
		{name: "bridge maps to path", tile: TileBridge, want: "path"},
		{name: "marsh keeps its habitat", tile: TileMarsh, want: "marsh"},
		{name: "snow keeps its habitat", tile: TileSnow, want: "snow"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := EncounterTerrainTag(tt.tile)
			if !ok {
				t.Fatalf("EncounterTerrainTag(%v) returned ok=false", tt.tile)
			}
			if got != tt.want {
				t.Fatalf("EncounterTerrainTag(%v) = %q, want %q", tt.tile, got, tt.want)
			}
		})
	}
}

func TestEncounterTerrainTag_ZeroRateTerrainIsIneligible(t *testing.T) {
	t.Parallel()
	for _, tile := range []TileType{
		TileWater, TileLake, TileRiver, TileMountain, TileTree,
		TileBuilding, TileDoor, TileFloor, TileRock, TileBush,
	} {
		if tag, ok := EncounterTerrainTag(tile); ok {
			t.Errorf("EncounterTerrainTag(%v) = %q, true; want ineligible", tile, tag)
		}
	}
}
