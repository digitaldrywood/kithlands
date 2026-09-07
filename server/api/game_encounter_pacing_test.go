package api

import (
	"math"
	"math/rand/v2"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/generator"
	"github.com/digitaldrywood/kithlands/internal/locality"
)

func pacingLane(t *testing.T, g *Game, tile locality.TileType) [2]WorldPosition {
	t.Helper()
	a := WorldPosition{g.worldCheckpoint.X, g.worldCheckpoint.Y}
	node := g.location.WorldNodeID
	for _, offset := range []WorldPosition{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
		b := WorldPosition{a.X + offset.X, a.Y + offset.Y}
		if validateWorldCheckpointPosition(g.tileMap, g.loc, g.worldTraversal(), b, node) != nil {
			continue
		}
		g.tileMap.Tiles[a.Y][a.X] = int(tile)
		g.tileMap.Tiles[b.Y][b.X] = int(tile)
		return [2]WorldPosition{a, b}
	}
	t.Fatal("no pacing lane")
	return [2]WorldPosition{}
}

func walkPacingLane(t *testing.T, g *Game, lane [2]WorldPosition, n int) GameState {
	t.Helper()
	p := lane[n%2]
	state, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "world-step", WorldPosition: &p, WorldNodeID: g.location.WorldNodeID})
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func TestEncounterPacingIntervalsAndModifiers(t *testing.T) {
	for _, tc := range []struct {
		name                  string
		tile                  locality.TileType
		difficulty, transport float64
		want                  int
	}{
		{"grass", locality.TileGrass, 1, 1, 80},
		{"easy", locality.TileGrass, .5, 1, 160},
		{"hard", locality.TileGrass, 1.3, 1, 62},
		{"mount", locality.TileGrass, 1, .75, 107},
		{"road", locality.TilePath, 1, 1, 400},
		{"dark grass", locality.TileDarkGrass, 1, 1, 40},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := newTownTestGame(t)
			g.gd.EncounterPacing.MinimumGrassSteps = 80
			g.gd.EncounterPacing.MaximumGrassSteps = 80
			g.diff.EncounterRateMult = tc.difficulty
			g.gd.Transport.Tiers[0].EncounterRateMult = tc.transport
			lane := pacingLane(t, g, tc.tile)
			for n := 1; n <= tc.want; n++ {
				state := walkPacingLane(t, g, lane, n)
				if (state.Phase == "combat") != (n == tc.want) {
					t.Fatalf("step %d phase %s; wanted encounter at %d", n, state.Phase, tc.want)
				}
			}
			if g.encounterTravel.Initialized {
				t.Fatal("new encounter did not reset interval")
			}
		})
	}
}

func TestEncounterPacingRetriesAndRejectedMoves(t *testing.T) {
	g := newTownTestGame(t)
	lane := pacingLane(t, g, locality.TileGrass)
	walkPacingLane(t, g, lane, 1)
	before := g.encounterTravel
	walkPacingLane(t, g, lane, 1)
	if g.encounterTravel != before {
		t.Fatal("duplicate consumed distance")
	}
	far := WorldPosition{lane[1].X + 5, lane[1].Y}
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "world-step", WorldPosition: &far}); err == nil {
		t.Fatal("accepted teleport")
	}
	if g.encounterTravel != before {
		t.Fatal("rejected move consumed distance")
	}
	g.encounterTravel.Remaining = 1
	g.encounterTravel.Steps = 20
	state := walkPacingLane(t, g, lane, 2)
	if state.Phase != "combat" {
		t.Fatal("expected combat")
	}
	count := g.worldEncounterCount
	retry := walkPacingLane(t, g, lane, 2)
	if retry.Phase != "combat" || g.worldEncounterCount != count {
		t.Fatal("combat response retry started another fight")
	}
}

func TestEncounterPacingSaveAndGrace(t *testing.T) {
	g := newTownTestGame(t)
	lane := pacingLane(t, g, locality.TileGrass)
	for n := 1; n <= 17; n++ {
		walkPacingLane(t, g, lane, n)
	}
	before := g.encounterTravel
	saved, err := g.ToSaveState("pacing", "test-user")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	if restored.encounterTravel != before {
		t.Fatalf("save changed interval: %#v != %#v", restored.encounterTravel, before)
	}
	// Checkpoint/menu operations retain progress.
	p := lane[1]
	if _, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "arrive-world-node", WorldNodeID: g.location.WorldNodeID, WorldPosition: &p}); err != nil {
		t.Fatal(err)
	}
	if g.encounterTravel != before {
		t.Fatal("checkpoint reset interval")
	}
	g.encounterTravel = EncounterTravelState{Initialized: true, Remaining: 1}
	for n := 1; n <= 12; n++ {
		if walkPacingLane(t, g, lane, n+1).Phase == "combat" {
			t.Fatal("encounter inside grace")
		}
	}
	if walkPacingLane(t, g, lane, 14).Phase != "combat" {
		t.Fatal("encounter not triggered after grace")
	}
}

func TestEncounterPacingDistribution(t *testing.T) {
	g := newTownTestGame(t)
	g.rng = rand.New(rand.NewPCG(42, 99))
	lane := pacingLane(t, g, locality.TileGrass)
	total := 0
	min, max := 1000, 0
	for sample := 0; sample < 200; sample++ {
		g.phase = "world"
		g.encounterTravel = EncounterTravelState{}
		steps := 0
		for g.phase == "world" {
			target := lane[0]
			if g.worldCheckpoint.X == target.X && g.worldCheckpoint.Y == target.Y {
				target = lane[1]
			}
			if err := g.processWorldStepLocked(LocationTransitionRequest{WorldPosition: &target}); err != nil {
				t.Fatal(err)
			}
			steps++
			if steps > 100 {
				t.Fatal("interval exceeded maximum")
			}
		}
		if steps < 60 {
			t.Fatal("interval below minimum")
		}
		total += steps
		min = int(math.Min(float64(min), float64(steps)))
		max = int(math.Max(float64(max), float64(steps)))
	}
	mean := float64(total) / 200
	t.Logf("200 grass intervals: min=%d max=%d mean=%.2f", min, max, mean)
	if mean < 76 || mean > 84 || max-min < 30 {
		t.Fatal("encounter distribution outside pacing envelope")
	}
}

func TestProductionCannotRequestRandomEncounterDirectly(t *testing.T) {
	t.Setenv("KITHLANDS_DEBUG", "")
	g := newTownTestGame(t)
	s := &Server{games: &GameManager{games: map[string]*Game{g.id: g}}}
	req := httptest.NewRequest("POST", "/game/"+g.id+"/action", strings.NewReader(`{"type":"encounter"}`))
	req.SetPathValue("id", g.id)
	recorder := httptest.NewRecorder()
	s.handleGameAction(recorder, req)
	if recorder.Code != 400 || g.phase != "world" {
		t.Fatal("client bypassed encounter pacing")
	}
}

func TestEncounterPacingZeroRateAndDebugIsolation(t *testing.T) {
	t.Setenv("KITHLANDS_DEBUG", "")
	g := newTownTestGame(t)
	lane := pacingLane(t, g, locality.TileGrass)
	p := lane[1]
	_, err := g.ProcessLocationTransition(LocationTransitionRequest{TransitionID: "world-step", WorldPosition: &p, DebugNoEncounters: true})
	if err != nil {
		t.Fatal(err)
	}
	if !g.encounterTravel.Initialized {
		t.Fatal("production accepted debug bypass")
	}
	before := g.encounterTravel
	g.diff.EncounterRateMult = 0
	for n := 2; n < 20; n++ {
		walkPacingLane(t, g, lane, n)
	}
	if g.encounterTravel != before {
		t.Fatal("zero encounter rate consumed budget")
	}
}

func TestPendingQuestXPMigratesWithoutReawardingCompletedQuests(t *testing.T) {
	g := newTownTestGame(t)
	quests := []generator.Quest{
		{Act: 1, Completed: true, Reward: generator.QuestReward{XP: 120}},
		{Act: 1, Reward: generator.QuestReward{XP: 120, Gold: 30, Item: "potion"}},
		{Act: 1, IsSideQuest: true, Reward: generator.QuestReward{XP: 120}},
		{IsPromotion: true, Reward: generator.QuestReward{XP: 480}},
		{Act: 1, Reward: generator.QuestReward{XP: 999}},
	}
	refreshPendingCampaignXP(quests, 1, g.gd)
	if quests[0].Reward.XP != 120 || quests[1].Reward.XP != 180 || quests[2].Reward.XP != 120 || quests[3].Reward.XP != 600 || quests[4].Reward.XP != 999 {
		t.Fatal("incorrect pending quest XP migration")
	}
	if quests[1].Reward.Gold != 30 || quests[1].Reward.Item != "potion" {
		t.Fatal("XP migration changed other rewards")
	}
	refreshPendingCampaignXP(quests, 1, g.gd)
	if quests[1].Reward.XP != 180 {
		t.Fatal("XP migration is not idempotent")
	}
}
