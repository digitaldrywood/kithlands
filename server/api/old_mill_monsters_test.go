package api_test

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"slices"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/balance"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

type millProofEncounter struct {
	ID                   string   `json:"id"`
	Level                int      `json:"level"`
	RestBefore           bool     `json:"rest_before"`
	MonsterIDs           []string `json:"monster_ids"`
	FourMemberMonsterIDs []string `json:"four_member_monster_ids"`
}

func millProofPack(t *testing.T) []millProofEncounter {
	t.Helper()
	b, err := os.ReadFile("../../shared/monster_packs/old_mill_proof.json")
	if err != nil {
		t.Fatal(err)
	}
	var pack struct {
		Encounters []millProofEncounter `json:"encounters"`
	}
	if err := json.Unmarshal(b, &pack); err != nil {
		t.Fatal(err)
	}
	if len(pack.Encounters) == 0 {
		t.Fatal("empty proof pack")
	}
	return pack.Encounters
}

func TestOldMillMonstersStayOutOfWorldPools(t *testing.T) {
	gd := gamedata.Load("../../shared")
	ids := map[string]bool{}
	names := map[string]bool{}
	for _, encounter := range millProofPack(t) {
		for _, id := range append(slices.Clone(encounter.MonsterIDs), encounter.FourMemberMonsterIDs...) {
			m := gd.MonsterByID(id)
			if m == nil {
				t.Fatalf("unknown proof monster %q", id)
			}
			if m.EncounterWeight != 0 {
				t.Fatalf("%s leaks into weighted world pool", id)
			}
			ids[id], names[m.Name] = true, true
		}
	}
	if len(ids) != 5 {
		t.Fatalf("pack has %d distinct monsters, want five", len(ids))
	}
	for _, f := range gd.Formations {
		for _, slot := range f.Slots {
			if ids[slot.MonsterID] {
				t.Fatalf("Old Mill enemy in global formation %s", f.ID)
			}
		}
	}
	for _, level := range []int{1, 2, 3, 5, 10, 99} {
		for seed := uint64(1); seed <= 100; seed++ {
			rng := rand.New(rand.NewPCG(seed, 0))
			for _, enemy := range balance.GenerateEncounter(gd.Monsters, level, balance.GetDifficulty("normal"), rng) {
				if names[enemy.Name] {
					t.Fatalf("level %d random pool produced %s", level, enemy.Name)
				}
			}
			for _, enemy := range balance.GenerateFormationEncounter(gd, level, balance.GetDifficulty("normal"), "", rng).Combatants {
				if ids[enemy.MonsterID] {
					t.Fatalf("level %d formation produced %s", level, enemy.MonsterID)
				}
			}
		}
	}
}

func TestOldMillEnemyResponseRetainsStableIDAfterContentRename(t *testing.T) {
	gd := gamedata.Load("../../shared")
	gd.MonsterByID("mill_bat").Name = "Rafter Glider"
	game, err := api.NewGameManager(gd, "").CreateGame(api.NewGameRequest{
		TownName: "Cadott", Places: []string{"Mill", "Inn"}, BigBuilding: "Hall", Difficulty: "normal", RNGSeed: 42,
		Party: []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := game.DebugForceEncounter([]string{"mill_bat", "mill_bat"}, 1); err != nil {
		t.Fatal(err)
	}
	state := game.State()
	if state.Enemies[0].ID == state.Enemies[1].ID {
		t.Fatal("combatant IDs must remain unique")
	}
	for _, enemy := range state.Enemies {
		if enemy.MonsterID != "mill_bat" || enemy.Name != "Rafter Glider" {
			t.Fatalf("renamed enemy lost stable content ID: %#v", enemy)
		}
	}
}

func TestOldMillElementalMatchups(t *testing.T) {
	gd := gamedata.Load("../../shared")
	for _, encounter := range millProofPack(t) {
		for _, id := range encounter.MonsterIDs {
			monster := gd.MonsterByID(id)
			if monster == nil {
				t.Fatalf("missing monster %s", id)
			}
			target := &magic.SpellTarget{Weaknesses: monster.Weaknesses, Resistances: monster.Resistances}
			for _, spell := range gd.Spells.Spells {
				if spell.Effect != "damage" {
					continue
				}
				neutral := magic.ResolveSpellDamage(&spell, magic.CasterPower{}, &magic.SpellTarget{}, rand.New(rand.NewPCG(42, 0)))
				damage := magic.ResolveSpellDamage(&spell, magic.CasterPower{}, target, rand.New(rand.NewPCG(42, 0)))
				if slices.Contains(monster.Weaknesses, spell.Element) && damage <= neutral {
					t.Errorf("%s weakness to %s did not increase damage", id, spell.Element)
				}
				if slices.Contains(monster.Resistances, spell.Element) && damage >= neutral {
					t.Errorf("%s resistance to %s did not reduce damage", id, spell.Element)
				}
			}
		}
	}
}

// Exercises actual starter gear, learned spells, MP costs, turn order, potion
// consumption, level growth and loot. This is an isolated authored sequence,
// not a timing or traversal acceptance test for the dungeon itself.
func TestOldMillMonsterRouteBalance(t *testing.T) {
	gd := gamedata.Load("../../shared")
	encounters := millProofPack(t)
	for _, size := range []int{2, 4} {
		t.Run(fmt.Sprintf("party_%d", size), func(t *testing.T) {
			const runs = 100
			wipes := make([]int, len(encounters))
			turns := make([]int, len(encounters))
			attempts := make([]int, len(encounters))
			preBossLevels := 0
			for seed := 1; seed <= runs; seed++ {
				party := []api.PartyMemberReq{{Name: "Hero", ClassID: "warrior"}, {Name: "Sparks", ClassID: "cinder"}}
				if size == 4 {
					party = append(party, api.PartyMemberReq{Name: "Mercy", ClassID: "mender"}, api.PartyMemberReq{Name: "Shade", ClassID: "rogue"})
				}
				// Empty sharedDir avoids unrelated quest/interior content while
				// keeping the real loaded combat and starter-equipment catalog.
				game, err := api.NewGameManager(gd, "").CreateGame(api.NewGameRequest{TownName: "Cadott", Places: []string{"Mill", "Inn"}, BigBuilding: "Hall", Party: party, Difficulty: "normal", RNGSeed: int64(seed)})
				if err != nil {
					t.Fatal(err)
				}
				// Models a small supply cache, not an unlimited item strategy.
				if err := game.DebugGiveItem("potion", 4); err != nil {
					t.Fatal(err)
				}
				if err := game.DebugGiveItem("ether", 2); err != nil {
					t.Fatal(err)
				}
				for index, encounter := range encounters {
					attempts[index]++
					if encounter.RestBefore {
						game.DebugHealParty()
						preBossLevels += game.State().Party[0].Level
					}
					ids := encounter.MonsterIDs
					if size == 4 {
						ids = encounter.FourMemberMonsterIDs
					}
					if err := game.DebugForceEncounter(ids, encounter.Level); err != nil {
						t.Fatal(err)
					}
					state := game.State()
					for round := 0; round < 60 && state.Phase == "combat"; round++ {
						actions := millCombatActions(state)
						result, err := game.ProcessAction(api.GameActionRequest{Type: "attack", Actions: actions})
						if err != nil {
							t.Fatalf("seed=%d room=%s: %v", seed, encounter.ID, err)
						}
						state = *result
						turns[index]++
					}
					if state.Phase == "combat" {
						t.Fatalf("seed=%d room=%s exceeded round cap", seed, encounter.ID)
					}
					if state.Phase == "defeat" {
						wipes[index]++
						break
					}
					if state.Phase != "quest_complete" {
						t.Fatalf("unexpected victory phase %q", state.Phase)
					}
					if _, err := game.ProcessAction(api.GameActionRequest{Type: "advance"}); err != nil {
						t.Fatal(err)
					}
				}
			}
			totalWipes := 0
			for i, e := range encounters {
				totalWipes += wipes[i]
				if attempts[i] > 0 {
					t.Logf("%s: attempts=%d wipes=%d average_rounds=%.2f", e.ID, attempts[i], wipes[i], float64(turns[i])/float64(attempts[i]))
				}
			}
			bossAttempts := attempts[len(encounters)-1]
			if bossAttempts > 0 {
				t.Logf("pre-boss warrior average level=%.2f; route wins=%d/%d", float64(preBossLevels)/float64(bossAttempts), runs-totalWipes, runs)
			}
			if totalWipes > 10 {
				t.Fatalf("route wipes=%d/%d, want <=10%% with supplies and boss rest", totalWipes, runs)
			}
		})
	}
}

func millCombatActions(state api.GameState) []api.MemberActionReq {
	target := state.Enemies[0]
	for _, enemy := range state.Enemies {
		if enemy.HP > 0 {
			target = enemy
			break
		}
	}
	potions, ethers := state.Potions, state.Ethers
	actions := []api.MemberActionReq{}
	for slot, member := range state.Party {
		if member.HP <= 0 {
			continue
		}
		action := api.MemberActionReq{Slot: slot, Type: "attack", TargetID: target.ID}
		lowest := slot
		for i, ally := range state.Party {
			if ally.HP > 0 && ally.HP*state.Party[lowest].MaxHP < state.Party[lowest].HP*ally.MaxHP {
				lowest = i
			}
		}
		if state.Party[lowest].HP*3 < state.Party[lowest].MaxHP && potions > 0 {
			action.Type, action.ItemID, action.TargetID = "item", "potion", lowest
			potions--
		} else if member.ClassID == "cinder" && member.MP < 3 && ethers > 0 {
			action.Type, action.ItemID, action.TargetID = "item", "ether", slot
			ethers--
		} else {
			for _, spell := range member.Spells {
				if spell.ID == "spark" && spell.Castable && spell.MPCost <= member.MP {
					action.Type, action.SpellID = "spell", spell.ID
					break
				}
			}
		}
		actions = append(actions, action)
	}
	return actions
}
