package locality

func EncounterTerrainTag(tile TileType) (string, bool) {
	switch tile {
	case TileGrass:
		return "grass", true
	case TilePath:
		return "path", true
	case TileBridge:
		return "path", true
	case TileDarkGrass:
		return "dark_grass", true
	case TileForest:
		return "forest", true
	case TileHill:
		return "hill", true
	case TileSnow:
		return "snow", true
	case TileSand:
		return "sand", true
	case TileMarsh:
		return "marsh", true
	default:
		return "", false
	}
}
