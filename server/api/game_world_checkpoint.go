package api

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"sort"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

var ErrInvalidWorldCheckpoint = errors.New("invalid world checkpoint")

// WorldPosition is the client-observed tile submitted to a server-owned world
// checkpoint update. The server supplies the node ID and map signature.
type WorldPosition struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// WorldCheckpoint is the last server-approved overworld tile. It survives
// settlements, interiors, battles, and dungeons so every return path has one
// authoritative destination.
type WorldCheckpoint struct {
	X            int    `json:"x"`
	Y            int    `json:"y"`
	WorldNodeID  string `json:"world_node_id"`
	MapSignature string `json:"map_signature"`
}

func cloneWorldCheckpoint(checkpoint *WorldCheckpoint) *WorldCheckpoint {
	if checkpoint == nil {
		return nil
	}
	clone := *checkpoint
	return &clone
}

func (g *Game) updateWorldCheckpointLocked(position WorldPosition, nodeID string) error {
	if g.location.Kind != LocationWorld {
		return fmt.Errorf("%w: updates require the world", ErrInvalidWorldCheckpoint)
	}
	if nodeID == "" || nodeID != g.location.WorldNodeID {
		return fmt.Errorf("%w: node does not match the current arrival", ErrInvalidWorldCheckpoint)
	}
	if err := validateWorldCheckpointPosition(g.tileMap, g.loc, g.worldTraversal(), position, nodeID); err != nil {
		return err
	}
	g.worldCheckpoint = &WorldCheckpoint{
		X:            position.X,
		Y:            position.Y,
		WorldNodeID:  nodeID,
		MapSignature: worldMapSignature(g.tileMap),
	}
	return nil
}

func (g *Game) worldTraversal() worldTraversal {
	if g == nil || g.trans == nil || g.gd == nil {
		return worldTraversal{}
	}
	tier := g.trans.CurrentTierData(g.gd.Transport.Tiers)
	if tier == nil {
		return worldTraversal{}
	}
	return worldTraversal{crossesWater: tier.CrossesWater, flies: tier.Flies}
}

type worldTraversal struct {
	crossesWater bool
	flies        bool
}

func validateWorldCheckpointPosition(tileMap *locality.TileMap, loc *locality.Locality, traversal worldTraversal, position WorldPosition, nodeID string) error {
	if tileMap == nil || loc == nil {
		return fmt.Errorf("%w: world map unavailable", ErrInvalidWorldCheckpoint)
	}
	if loc.NodeByID(nodeID) == nil || worldSpawn(tileMap, nodeID) == nil {
		return fmt.Errorf("%w: unknown world node", ErrInvalidWorldCheckpoint)
	}
	if !worldPositionInBounds(tileMap, position) {
		return fmt.Errorf("%w: tile is outside the world map", ErrInvalidWorldCheckpoint)
	}
	if !worldTileTraversable(locality.TileType(tileMap.Tiles[position.Y][position.X]), traversal) {
		return fmt.Errorf("%w: tile is not traversable with the current transport", ErrInvalidWorldCheckpoint)
	}
	if nearby := nearestWorldSpawn(tileMap, position, 3); nearby != nil && nearby.NodeID != nodeID {
		return fmt.Errorf("%w: tile belongs to world node %q", ErrInvalidWorldCheckpoint, nearby.NodeID)
	}
	return nil
}

func worldPositionInBounds(tileMap *locality.TileMap, position WorldPosition) bool {
	if tileMap == nil || position.X < 0 || position.Y < 0 || position.Y >= len(tileMap.Tiles) {
		return false
	}
	return position.X < len(tileMap.Tiles[position.Y])
}

func worldTileTraversable(tile locality.TileType, traversal worldTraversal) bool {
	switch tile {
	case locality.TileGrass, locality.TilePath, locality.TileDoor, locality.TileFloor,
		locality.TileDarkGrass, locality.TileHill, locality.TileSand, locality.TileMarsh,
		locality.TileSnow, locality.TileBridge:
		return true
	case locality.TileWater, locality.TileLake, locality.TileRiver:
		return traversal.crossesWater || traversal.flies
	case locality.TileTree, locality.TileRock, locality.TileBush, locality.TileForest,
		locality.TileMountain:
		return traversal.flies
	default:
		return false
	}
}

func nearestWorldSpawn(tileMap *locality.TileMap, position WorldPosition, maxDistance int) *locality.MapSpawn {
	var nearest *locality.MapSpawn
	nearestDistance := maxDistance + 1
	for i := range tileMap.Spawns {
		spawn := &tileMap.Spawns[i]
		distance := checkpointAbs(position.X-spawn.X) + checkpointAbs(position.Y-spawn.Y)
		if distance > maxDistance || distance >= nearestDistance {
			continue
		}
		nearest = spawn
		nearestDistance = distance
	}
	return nearest
}

func worldSpawn(tileMap *locality.TileMap, nodeID string) *locality.MapSpawn {
	if tileMap == nil {
		return nil
	}
	for i := range tileMap.Spawns {
		if tileMap.Spawns[i].NodeID == nodeID {
			return &tileMap.Spawns[i]
		}
	}
	return nil
}

func resolveWorldCheckpoint(saved *WorldCheckpoint, tileMap *locality.TileMap, loc *locality.Locality, traversal worldTraversal, campaignSpawnID string) *WorldCheckpoint {
	if tileMap == nil || loc == nil {
		return nil
	}
	signature := worldMapSignature(tileMap)
	if saved != nil && saved.MapSignature == signature {
		position := WorldPosition{X: saved.X, Y: saved.Y}
		if validateWorldCheckpointPosition(tileMap, loc, traversal, position, saved.WorldNodeID) == nil {
			return &WorldCheckpoint{
				X:            position.X,
				Y:            position.Y,
				WorldNodeID:  saved.WorldNodeID,
				MapSignature: signature,
			}
		}
	}

	if saved != nil && loc != nil && loc.NodeByID(saved.WorldNodeID) != nil {
		if recovered := recoverWorldCheckpointNearNode(tileMap, loc, traversal, saved.WorldNodeID, signature); recovered != nil {
			return recovered
		}
	}
	initialPosition := WorldPosition{X: tileMap.PlayerX, Y: tileMap.PlayerY}
	if validateWorldCheckpointPosition(tileMap, loc, traversal, initialPosition, campaignSpawnID) == nil {
		return &WorldCheckpoint{
			X:            initialPosition.X,
			Y:            initialPosition.Y,
			WorldNodeID:  campaignSpawnID,
			MapSignature: signature,
		}
	}
	return recoverWorldCheckpointNearNode(tileMap, loc, traversal, campaignSpawnID, signature)
}

func recoverWorldCheckpointNearNode(tileMap *locality.TileMap, loc *locality.Locality, traversal worldTraversal, nodeID, signature string) *WorldCheckpoint {
	spawn := worldSpawn(tileMap, nodeID)
	if spawn == nil || loc == nil || loc.NodeByID(nodeID) == nil {
		return nil
	}
	maxDistance := tileMap.Width + tileMap.Height
	for distance := 0; distance <= maxDistance; distance++ {
		for yOffset := -distance; yOffset <= distance; yOffset++ {
			xOffset := distance - checkpointAbs(yOffset)
			for _, x := range uniqueInts(spawn.X-xOffset, spawn.X+xOffset) {
				position := WorldPosition{X: x, Y: spawn.Y + yOffset}
				if validateWorldCheckpointPosition(tileMap, loc, traversal, position, nodeID) == nil {
					return &WorldCheckpoint{
						X:            position.X,
						Y:            position.Y,
						WorldNodeID:  nodeID,
						MapSignature: signature,
					}
				}
			}
		}
	}
	return nil
}

func uniqueInts(values ...int) []int {
	seen := make(map[int]bool, len(values))
	result := make([]int, 0, len(values))
	for _, value := range values {
		if seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func worldMapSignature(tileMap *locality.TileMap) string {
	if tileMap == nil {
		return ""
	}
	digest := sha256.New()
	writeHashString(digest, "kithlands-world-map-v1")
	for _, value := range []int{tileMap.Width, tileMap.Height, tileMap.TileSize, tileMap.PlayerX, tileMap.PlayerY} {
		writeHashInt(digest, value)
	}
	writeHashInt(digest, len(tileMap.Tiles))
	for _, row := range tileMap.Tiles {
		writeHashInt(digest, len(row))
		for _, tile := range row {
			writeHashInt(digest, tile)
		}
	}
	spawns := append([]locality.MapSpawn(nil), tileMap.Spawns...)
	sort.Slice(spawns, func(i, j int) bool { return spawns[i].NodeID < spawns[j].NodeID })
	for _, spawn := range spawns {
		writeHashString(digest, spawn.NodeID)
		writeHashInt(digest, spawn.X)
		writeHashInt(digest, spawn.Y)
	}
	return hex.EncodeToString(digest.Sum(nil))
}

func writeHashInt(digest hash.Hash, value int) {
	var data [8]byte
	binary.LittleEndian.PutUint64(data[:], uint64(int64(value)))
	digest.Write(data[:])
}

func writeHashString(digest hash.Hash, value string) {
	writeHashInt(digest, len(value))
	digest.Write([]byte(value))
}

func checkpointAbs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
