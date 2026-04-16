package locality

import "testing"

func TestFillTerrain_GeneratesExpandedBiomeVariety(t *testing.T) {
	const (
		mapW = 200
		mapH = 160
	)

	tiles := make([][]int, mapH)
	for y := range tiles {
		tiles[y] = make([]int, mapW)
	}

	fillTerrain(tiles, mapW, mapH, 181)

	var foundMarsh, foundLake, foundSnow, foundMountain bool
	for _, row := range tiles {
		for _, tile := range row {
			switch TileType(tile) {
			case TileMarsh:
				foundMarsh = true
			case TileLake:
				foundLake = true
			case TileSnow:
				foundSnow = true
			case TileMountain:
				foundMountain = true
			}
		}
	}

	if !foundMarsh {
		t.Fatal("fillTerrain should generate at least one marsh tile for the issue #181 biome variety pass")
	}
	if !foundLake {
		t.Fatal("fillTerrain should generate at least one lake tile for the issue #181 biome variety pass")
	}
	if !foundSnow {
		t.Fatal("fillTerrain should generate at least one snow tile for the issue #181 biome variety pass")
	}
	if !foundMountain {
		t.Fatal("fillTerrain should generate at least one mountain tile for the issue #181 biome variety pass")
	}
}
