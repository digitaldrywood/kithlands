package api

import (
	"context"
	"fmt"
	"math/rand/v2"
	"sync"
	"time"

	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

// GameManager holds active game sessions.
type GameManager struct {
	gd    *gamedata.GameData
	games map[string]*Game
	mu    sync.RWMutex
}

func NewGameManager(gd *gamedata.GameData) *GameManager {
	return &GameManager{gd: gd, games: make(map[string]*Game)}
}

func (gm *GameManager) CreateGame(req NewGameRequest) (*Game, error) {
	if len(req.Party) == 0 || len(req.Party) > 4 {
		return nil, fmt.Errorf("party must have 1-4 members")
	}

	rngSeed := time.Now().UnixNano()
	rng := rand.New(rand.NewPCG(uint64(rngSeed), 0))

	// Build locality -- OSM or wizard
	var loc *locality.Locality
	if req.UseOSM && req.Lat != 0 && req.Lng != 0 {
		var err error
		loc, err = locality.BuildFromOSM(context.Background(), req.Lat, req.Lng, req.TownName)
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
				ID:   fmt.Sprintf("person_%d", i),
				Kind: locality.NodePerson,
				Name: p.Name,
				Tags: []string{"person", p.Relation},
				Importance: 70,
			})
			if len(loc.Nodes) > 1 {
				loc.Edges = append(loc.Edges, locality.Edge{
					From: fmt.Sprintf("person_%d", i),
					To:   loc.Nodes[0].ID,
					Kind: locality.EdgeSocial,
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

	for i, pm := range req.Party {
		cls := gm.gd.ClassByID(pm.ClassID)
		if cls == nil {
			return nil, fmt.Errorf("unknown class: %s", pm.ClassID)
		}
		c := character.New(pm.Name, pm.ClassID, cls)
		party = append(party, c)

		// Equip starting gear
		switch pm.ClassID {
		case "warrior":
			_, _ = inv.EquipWeapon(i, "short_sword", pm.ClassID, gm.gd)
			_, _ = inv.EquipArmor(i, "leather_armor", pm.ClassID, gm.gd)
		case "cinder":
			_, _ = inv.EquipWeapon(i, "wooden_staff", pm.ClassID, gm.gd)
			_, _ = inv.EquipArmor(i, "cloth_robe", pm.ClassID, gm.gd)
		case "mender":
			_, _ = inv.EquipWeapon(i, "wooden_club", pm.ClassID, gm.gd)
			_, _ = inv.EquipArmor(i, "cloth_robe", pm.ClassID, gm.gd)
		case "rogue":
			_, _ = inv.EquipWeapon(i, "rusty_dagger", pm.ClassID, gm.gd)
			_, _ = inv.EquipArmor(i, "leather_armor", pm.ClassID, gm.gd)
		case "wayfarer":
			_, _ = inv.EquipWeapon(i, "short_sword", pm.ClassID, gm.gd)
			_, _ = inv.EquipArmor(i, "leather_armor", pm.ClassID, gm.gd)
		}

		// Spell books for casters
		if len(cls.Magic.Schools) > 0 {
			sb := magic.NewSpellBook()
			sb.UpdateCharges(c.Level, cls, &gm.gd.Spells, false)
			sb.RestoreAllCharges()
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
	quests := generator.GenerateCampaign(loc, loc.Nodes[0].ID, rng)
	walk := locality.Walk(loc, loc.Nodes[0].ID)
	tileMap := locality.GenerateTileMap(loc, loc.Nodes[0].ID)

	game := &Game{
		id:         fmt.Sprintf("game_%d", time.Now().UnixNano()),
		gd:         gm.gd,
		rng:        rng,
		loc:        loc,
		walk:       walk,
		tileMap:    tileMap,
		party:      party,
		spellBooks: spellBooks,
		inv:        inv,
		quests:     quests,
		currentQ:   0,
		phase:      "world",
		diff:       balance.GetDifficulty(req.Difficulty),
		rngSeed:    rngSeed,
		discovered: make(map[string]bool),
	}

	gm.mu.Lock()
	gm.games[game.id] = game
	gm.mu.Unlock()

	return game, nil
}

func (gm *GameManager) GetGame(id string) *Game {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	return gm.games[id]
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
