package api_test

import (
	"fmt"
	"testing"

	"github.com/digitaldrywood/kithlands/api"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func TestFirstEncounterUsesTutorialFightAndNeutralStart(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Spark", ClassID: "cinder"},
	})

	state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
	if err != nil {
		t.Fatalf("encounter: %v", err)
	}
	if state.Phase != "combat" {
		t.Fatalf("phase = %q, want combat", state.Phase)
	}
	if state.EncounterStart != "" {
		t.Fatalf("encounter_start = %q, want empty for tutorial fight", state.EncounterStart)
	}
	if len(state.Enemies) != 1 {
		t.Fatalf("tutorial encounter enemy count = %d, want 1", len(state.Enemies))
	}
	if state.Enemies[0].Name != "Slime" {
		t.Fatalf("tutorial encounter enemy = %q, want Slime", state.Enemies[0].Name)
	}
}

func TestFirstSixSoloEncountersStayStarterSafe(t *testing.T) {
	game := newGameWithParty(t, []api.PartyMemberReq{
		{Name: "Spark", ClassID: "cinder"},
	})

	for idx := 0; idx < 6; idx++ {
		state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
		if err != nil {
			t.Fatalf("encounter[%d]: %v", idx, err)
		}
		if state.Phase != "combat" {
			t.Fatalf("encounter[%d] phase = %q, want combat", idx, state.Phase)
		}

		goblins := 0
		for _, enemy := range state.Enemies {
			if enemy.Name == "Goblin" {
				goblins++
			}
		}
		if idx == 0 {
			if len(state.Enemies) != 1 || state.Enemies[0].Name != "Slime" {
				t.Fatalf("encounter[0] = %#v, want a single Slime tutorial fight", state.Enemies)
			}
		} else {
			if len(state.Enemies) > 2 {
				t.Fatalf("encounter[%d] enemy count = %d, want <= 2 during starter-safe window", idx, len(state.Enemies))
			}
			if goblins > 1 {
				t.Fatalf("encounter[%d] goblin count = %d, want <= 1 during starter-safe window", idx, goblins)
			}
		}

		api.ForceWorldPhaseForTest(game)
	}
}

func TestIssue212_FirstEncounterNormalDifficultyHasNoSoloWipes(t *testing.T) {
	t.Helper()

	gd := gamedata.Load("../../shared")
	gm := api.NewGameManager(gd, "../../shared")

	classes := []string{"warrior", "brawler", "rogue", "mender", "cinder", "wayfarer"}
	const runs = 1000

	for _, classID := range classes {
		t.Run(classID, func(t *testing.T) {
			wipes := 0
			totalTurns := 0
			totalRemainingHPPct := 0.0
			minRemainingHPPct := 1.0

			for seed := 0; seed < runs; seed++ {
				game, err := gm.CreateGame(api.NewGameRequest{
					TownName:    "Cadott",
					People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
					Places:      []string{"School", "Store"},
					BigBuilding: "Town Hall",
					Party: []api.PartyMemberReq{
						{Name: fmt.Sprintf("%s_%d", classID, seed), ClassID: classID},
					},
					Difficulty: "normal",
					RNGSeed:    int64(seed + 1),
				})
				if err != nil {
					t.Fatalf("create game seed %d: %v", seed, err)
				}

				state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
				if err != nil {
					t.Fatalf("encounter seed %d: %v", seed, err)
				}

				finalState, turns := resolveEncounterWithBasicAttacks(t, game, state)
				totalTurns += turns
				if finalState.Phase == "defeat" {
					wipes++
					continue
				}

				hpPct := float64(finalState.Party[0].HP) / float64(finalState.Party[0].MaxHP)
				totalRemainingHPPct += hpPct
				if hpPct < minRemainingHPPct {
					minRemainingHPPct = hpPct
				}
			}

			t.Logf("first-encounter summary: class=%s runs=%d wipes=%d wipe_rate=%.1f%% avg_turns=%.2f avg_hp_remaining=%.1f%% min_hp_remaining=%.1f%%",
				classID,
				runs,
				wipes,
				float64(wipes)/runs*100,
				float64(totalTurns)/runs,
				totalRemainingHPPct/float64(runs-wipes)*100,
				minRemainingHPPct*100,
			)
			if wipes != 0 {
				t.Fatalf("class %s wiped %d/%d tutorial encounters", classID, wipes, runs)
			}
		})
	}
}

func TestIssue212_FirstEncounterStarterPartyNoEquipmentHasNoWipesOrDeaths(t *testing.T) {
	t.Helper()

	gd := gamedata.Load("../../shared")
	gm := api.NewGameManager(gd, "../../shared")

	const runs = 1000
	wipes := 0
	deathRuns := 0
	memberDeaths := 0
	totalRemainingHPPct := 0.0
	minRemainingHPPct := 1.0

	for seed := 0; seed < runs; seed++ {
		game, err := gm.CreateGame(api.NewGameRequest{
			TownName:    "Cadott",
			People:      []api.WizardPersonReq{{Name: "Bob", Relation: "friendly"}},
			Places:      []string{"School", "Store"},
			BigBuilding: "Town Hall",
			Party: []api.PartyMemberReq{
				{Name: "Pyre", ClassID: "cinder"},
				{Name: "Mercy", ClassID: "mender"},
				{Name: "Guard", ClassID: "warrior"},
			},
			Difficulty: "normal",
			RNGSeed:    int64(seed + 1),
		})
		if err != nil {
			t.Fatalf("create game seed %d: %v", seed, err)
		}
		api.ClearEquipmentForTest(game)

		state, err := game.ProcessAction(api.GameActionRequest{Type: "encounter"})
		if err != nil {
			t.Fatalf("encounter seed %d: %v", seed, err)
		}

		finalState, _ := resolveEncounterWithBasicAttacks(t, game, state)
		if finalState.Phase == "defeat" {
			wipes++
			deathRuns++
			memberDeaths += len(finalState.Party)
			continue
		}

		runDeaths := 0
		runRemaining := 0.0
		for _, member := range finalState.Party {
			if member.HP <= 0 {
				runDeaths++
				memberDeaths++
				continue
			}
			hpPct := float64(member.HP) / float64(member.MaxHP)
			runRemaining += hpPct
			if hpPct < minRemainingHPPct {
				minRemainingHPPct = hpPct
			}
		}
		if runDeaths > 0 {
			deathRuns++
		}
		totalRemainingHPPct += runRemaining / float64(len(finalState.Party))
	}

	t.Logf("first-encounter starter-party summary: party=cinder,mender,warrior equipment=none runs=%d wipes=%d wipe_rate=%.1f%% death_runs=%d death_run_rate=%.1f%% member_deaths=%d member_death_rate=%.1f%% avg_hp_remaining=%.1f%% min_hp_remaining=%.1f%%",
		runs,
		wipes,
		float64(wipes)/runs*100,
		deathRuns,
		float64(deathRuns)/runs*100,
		memberDeaths,
		float64(memberDeaths)/(float64(runs)*3)*100,
		totalRemainingHPPct/float64(runs)*100,
		minRemainingHPPct*100,
	)
	if wipes != 0 {
		t.Fatalf("starter party wiped %d/%d first encounters", wipes, runs)
	}
	if deathRuns != 0 || memberDeaths != 0 {
		t.Fatalf("starter party deaths detected: death_runs=%d member_deaths=%d", deathRuns, memberDeaths)
	}
}

func resolveEncounterWithBasicAttacks(t *testing.T, game *api.Game, state *api.GameState) (*api.GameState, int) {
	t.Helper()

	for round := 1; round <= 10; round++ {
		if state.Phase != "combat" {
			return state, round - 1
		}

		targetID := 0
		for _, enemy := range state.Enemies {
			if enemy.HP > 0 {
				targetID = enemy.ID
				break
			}
		}

		actions := make([]api.MemberActionReq, 0, len(state.Party))
		for slot, member := range state.Party {
			if member.HP <= 0 {
				continue
			}
			actions = append(actions, api.MemberActionReq{
				Slot:     slot,
				Type:     "attack",
				TargetID: targetID,
			})
		}

		next, err := game.ProcessAction(api.GameActionRequest{Type: "attack", Actions: actions})
		if err != nil {
			t.Fatalf("combat round %d: %v", round, err)
		}
		state = next
	}

	t.Fatalf("encounter did not resolve within 10 rounds")
	return nil, 0
}
