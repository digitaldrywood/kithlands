package locality

import "testing"

func TestEncounterTerrainTag_ExpandedTerrainMapsToSupportedEncounters(t *testing.T) {
	tests := []struct {
		name string
		tile TileType
		want string
	}{
		{name: "bridge maps to path", tile: TileBridge, want: "path"},
		{name: "marsh maps to dark grass", tile: TileMarsh, want: "dark_grass"},
		{name: "lake maps to water", tile: TileLake, want: "water"},
		{name: "river maps to water", tile: TileRiver, want: "water"},
		{name: "snow maps to hill", tile: TileSnow, want: "hill"},
		{name: "mountain maps to hill", tile: TileMountain, want: "hill"},
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
