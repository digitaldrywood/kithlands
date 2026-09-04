package api

import (
	"context"
	"fmt"
	"hash/fnv"
	"math/rand/v2"
	"strings"
	"sync"
	"time"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/interiors"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/magic"
	"github.com/digitaldrywood/kithlands/internal/settlements"
	"github.com/digitaldrywood/kithlands/internal/transport"
)

// GameManager holds active game sessions.
type GameManager struct {
	gd                *gamedata.GameData
	sharedDir         string
	sidePool          []generator.SideQuestEntry
	buildingQuestPool []generator.BuildingSideQuestEntry
	interiorTemplates *interiors.Registry
	settlementMaps    *settlements.Registry
	games             map[string]*Game
	mu                sync.RWMutex
}

func NewGameManager(gd *gamedata.GameData, sharedDir string) *GameManager {
	gm := &GameManager{gd: gd, sharedDir: sharedDir, games: make(map[string]*Game)}
	if sharedDir != "" {
		if pool, err := generator.LoadSideQuestPool(sharedDir); err == nil {
			gm.sidePool = pool
		}
		if pool, err := generator.LoadBuildingSideQuestPool(sharedDir); err == nil {
			gm.buildingQuestPool = pool
		}
		registry, err := interiors.LoadDir(sharedDir)
		if err != nil {
			panic(fmt.Sprintf("loading interiors: %v", err))
		}
		gm.interiorTemplates = registry
		settlementMaps, err := settlements.LoadDir(sharedDir)
		if err != nil {
			panic(fmt.Sprintf("loading settlement maps: %v", err))
		}
		gm.settlementMaps = settlementMaps
	}
	return gm
}

func (gm *GameManager) CreateGame(req NewGameRequest) (*Game, error) {
	if len(req.Party) == 0 || len(req.Party) > 4 {
		return nil, fmt.Errorf("party must have 1-4 members")
	}

	rngSeed := req.RNGSeed
	if rngSeed == 0 {
		rngSeed = time.Now().UnixNano()
	}
	rng := rand.New(rand.NewPCG(uint64(rngSeed), 0))

	// Build locality -- OSM or wizard
	var loc *locality.Locality
	if req.UseOSM && req.Lat != 0 && req.Lng != 0 {
		var err error
		radiusM := milesToMeters(req.RadiusMiles)
		loc, err = locality.BuildFromOSM(context.Background(), req.Lat, req.Lng, radiusM, req.TownName)
		if err != nil {
			// Fall back to wizard if OSM fails
			loc = nil
		}
	}
	if loc == nil {
		var wizPeople []locality.WizardPerson
		for _, p := range req.People {
			wizPeople = append(wizPeople, locality.WizardPerson{Name: p.Name, Relation: p.Relation})
		}
		loc = locality.BuildFromWizard(locality.WizardInput{
			TownName:    req.TownName,
			People:      wizPeople,
			Places:      req.Places,
			BigBuilding: req.BigBuilding,
			Flavor:      "conquest",
			Difficulty:  req.Difficulty,
		})
	}

	// Add personal NPCs on top of OSM data
	if req.UseOSM {
		for i, p := range req.People {
			loc.Nodes = append(loc.Nodes, locality.Node{
				ID:         fmt.Sprintf("person_%d", i),
				Kind:       locality.NodePerson,
				Name:       p.Name,
				Tags:       []string{"person", p.Relation},
				Importance: 70,
			})
			if len(loc.Nodes) > 1 {
				loc.Edges = append(loc.Edges, locality.Edge{
					From:   fmt.Sprintf("person_%d", i),
					To:     loc.Nodes[0].ID,
					Kind:   locality.EdgeSocial,
					Weight: 0.5,
				})
			}
		}
	}

	// Create party
	var party []*character.Character
	spellBooks := make(map[string]*magic.SpellBook)
	inv := inventory.New()
	inv.Gold = 100
	inv.Consumables["potion"] = 5

	for _, pm := range req.Party {
		cls := gm.gd.ClassByID(pm.ClassID)
		if cls == nil {
			return nil, fmt.Errorf("unknown class: %s", pm.ClassID)
		}
		c := character.New(pm.Name, pm.ClassID, cls)
		if row := character.NormalizeRow(pm.Row); row != "" {
			c.Row = row
		}
		party = append(party, c)

		// Spell books for casters (unified MP pool lives on Character, GDD §8.1).
		if len(cls.Magic.Schools) > 0 {
			sb := magic.NewSpellBook()
			for _, spell := range gm.gd.Spells.Spells {
				for _, school := range cls.Magic.Schools {
					if spell.School == school && spell.SpellLevel == 1 {
						_ = sb.LearnSpell(spell.ID, spell.SpellLevel, gm.gd.Spells.ChargeTable.MaxSpellsPerLvl)
					}
				}
			}
			spellBooks[c.Name] = sb
		}
	}

	// Generate campaign
	spawnID := loc.Nodes[0].ID
	if req.SpawnNodeID != "" {
		// Verify the spawn node exists
		if n := loc.NodeByID(req.SpawnNodeID); n != nil {
			spawnID = req.SpawnNodeID
		}
	}
	quests := generator.GenerateCampaign(loc, spawnID, rng, gm.sidePool)
	generator.PrepareObjectives(quests, loc, spawnID, gm.gd.QuestObjectives)
	walk := locality.Walk(loc, spawnID)
	tileMap := locality.GenerateTileMap(loc, spawnID, walk)
	gm.applyInteriorTemplates(tileMap)
	buildingSideQuests := generator.GenerateBuildingSideQuests(loc, walk, rng, gm.buildingQuestPool)
	settlementMap := gm.settlementMaps.ForLocality(loc.Name)
	settlementInteriors, err := gm.buildSettlementInteriors(settlementMap)
	if err != nil {
		return nil, err
	}

	game := &Game{
		id:                  fmt.Sprintf("game_%d", time.Now().UnixNano()),
		gd:                  gm.gd,
		dungeons:            make(map[string]*DungeonProgress),
		rng:                 rng,
		loc:                 loc,
		walk:                walk,
		tileMap:             tileMap,
		settlementMap:       settlementMap,
		settlementInteriors: settlementInteriors,
		location: LocationState{
			Kind:        LocationWorld,
			WorldNodeID: spawnID,
		},
		party:                party,
		spellBooks:           spellBooks,
		inv:                  inv,
		quests:               quests,
		buildingSideQuests:   buildingSideQuests,
		currentQ:             0,
		phase:                "world",
		diff:                 balance.GetDifficulty(req.Difficulty),
		rngSeed:              rngSeed,
		discovered:           make(map[string]bool),
		collectedHiddenItems: make(map[string]bool),
		triggeredFlags:       make(map[string]bool),
		shopStocks:           make(map[string]*ShopStock),
		trans:                transport.NewState(),
	}
	if err := game.grantStarterLoot(); err != nil {
		return nil, fmt.Errorf("granting starter loot: %w", err)
	}

	gm.mu.Lock()
	gm.games[game.id] = game
	gm.mu.Unlock()

	return game, nil
}

func (gm *GameManager) applyInteriorTemplates(tileMap *locality.TileMap) {
	if gm == nil || gm.interiorTemplates == nil || tileMap == nil {
		return
	}
	for i := range tileMap.Spawns {
		spawn := &tileMap.Spawns[i]
		spawn.Interior = gm.interiorTemplates.Pick(spawn.BuildingType, spawn.InteriorSeed)
	}
}

func (gm *GameManager) buildSettlementInteriors(townMap *settlements.Map) (map[string]locality.MapSpawn, error) {
	if townMap == nil {
		return nil, nil
	}

	spawns := make(map[string]locality.MapSpawn)
	for _, interaction := range townMap.Layer("interactions").Objects {
		if interaction.Type != "door" {
			continue
		}
		destinationID := interaction.Property("destination_id")
		buildingType := interaction.Property("building_type")
		seed := stableInteriorSeed(destinationID)
		spawn := locality.MapSpawn{
			NodeID:       destinationID,
			Name:         interaction.Property("display_name"),
			Kind:         "building",
			Tags:         splitSettlementTags(interaction.Property("tags")),
			BuildingType: buildingType,
			InteriorSeed: seed,
			Interior:     gm.interiorTemplates.Pick(buildingType, seed),
		}
		if spawn.Interior == nil {
			return nil, fmt.Errorf("settlement %q door %q has no %q interior template", townMap.Property("id"), interaction.Name, buildingType)
		}
		spawns[destinationID] = spawn
	}
	return spawns, nil
}

func stableInteriorSeed(id string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(id))
	return int64(h.Sum64() & 0x7fffffffffffffff)
}

func splitSettlementTags(value string) []string {
	var tags []string
	for _, tag := range strings.Split(value, ",") {
		if tag = strings.TrimSpace(tag); tag != "" {
			tags = append(tags, tag)
		}
	}
	return tags
}

func (gm *GameManager) attachSettlementMap(game *Game) error {
	if gm == nil || game == nil || game.loc == nil {
		return nil
	}
	game.settlementMap = gm.settlementMaps.ForLocality(game.loc.Name)
	interiors, err := gm.buildSettlementInteriors(game.settlementMap)
	if err != nil {
		return err
	}
	game.settlementInteriors = interiors
	return nil
}

func (gm *GameManager) GetGame(id string) *Game {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	return gm.games[id]
}

func milesToMeters(miles float64) int {
	if miles <= 0 {
		return 2400 // default ~1.5 miles
	}
	if miles < 0.5 {
		miles = 0.5
	}
	if miles > 30 {
		miles = 30
	}
	return int(miles * 1609.34)
}

func buildLocality(req WizardRequest) *locality.Locality {
	var people []locality.WizardPerson
	for _, p := range req.People {
		people = append(people, locality.WizardPerson{Name: p.Name, Relation: p.Relation})
	}
	return locality.BuildFromWizard(locality.WizardInput{
		TownName:    req.TownName,
		People:      people,
		Places:      req.Places,
		BigBuilding: req.BigBuilding,
		Flavor:      "conquest",
		Difficulty:  "normal",
	})
}
