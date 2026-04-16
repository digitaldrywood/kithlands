package locality

func EncounterTerrainTag(tile TileType) (string, bool) {
	switch tile {
	case TileGrass:
		return "grass", true
	case TilePath:
		return "path", true
	case TileBridge:
		return "path", true
	case TileWater:
		return "water", true
	case TileLake:
		return "water", true
	case TileRiver:
		return "water", true
	case TileTree:
		return "tree", true
	case TileBuilding:
		return "building", true
	case TileDoor:
		return "door", true
	case TileFloor:
		return "floor", true
	case TileRock:
		return "rock", true
	case TileBush:
		return "bush", true
	case TileDarkGrass:
		return "dark_grass", true
	case TileForest:
		return "forest", true
	case TileHill:
		return "hill", true
	case TileSnow:
		return "hill", true
	case TileMountain:
		return "hill", true
	case TileSand:
		return "sand", true
	case TileMarsh:
		return "dark_grass", true
	default:
		return "", false
	}
}
