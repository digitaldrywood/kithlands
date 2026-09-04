package api

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"github.com/digitaldrywood/kithlands/internal/locality"
	"github.com/digitaldrywood/kithlands/internal/save"
)

// This unmodified gameplay checkpoint was earned through ordinary movement,
// battles, shopping and saves in the 2026-09-04 readiness campaign. Auth data
// and unrelated save metadata are deliberately excluded from the fixture.
func finalCheckpoint(t *testing.T, seed uint64) *Game {
	t.Helper()
	b, err := os.ReadFile("testdata/final-campaign-checkpoint.json")
	if err != nil {
		t.Fatal(err)
	}
	var ss save.SaveState
	var extra struct {
		Locality locality.Locality `json:"locality"`
	}
	if err := json.Unmarshal(b, &ss); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(b, &extra); err != nil {
		t.Fatal(err)
	}
	g, err := FromSaveState(&ss, gamedata.Load("../../shared"), &extra.Locality)
	if err != nil {
		t.Fatal(err)
	}
	g.rng = rand.New(rand.NewPCG(seed, 0))
	return g
}
func startFinal(t *testing.T, g *Game) *GameState {
	t.Helper()
	s, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: g.finalQuest().TargetNodeID})
	if err != nil {
		t.Fatal(err)
	}
	if s.Phase != "combat" || !s.FinalEncounter.Active {
		t.Fatalf("arrival did not start boss: %s", s.Phase)
	}
	return s
}
func finalActions(s GameState, heal bool) []MemberActionReq {
	target := s.Enemies[0]
	for _, e := range s.Enemies {
		if e.HP > 0 && (target.HP <= 0 || e.MonsterID != "bellbound_regent") {
			target = e
		}
	}
	lowest := 0
	for i, m := range s.Party {
		if m.HP > 0 && (s.Party[lowest].HP <= 0 || m.HP*s.Party[lowest].MaxHP < s.Party[lowest].HP*m.MaxHP) {
			lowest = i
		}
	}
	var actions []MemberActionReq
	for i, m := range s.Party {
		if m.HP <= 0 {
			continue
		}
		a := MemberActionReq{Slot: i, Type: "attack", TargetID: target.ID}
		bestPower := 0
		for _, sp := range m.Spells {
			if !sp.Castable || sp.MPCost > m.MP {
				continue
			}
			if heal && m.ClassID == "mender" && sp.Effect == "heal" && s.Party[lowest].HP*2 < s.Party[lowest].MaxHP && sp.Power > bestPower {
				a.Type = "spell"
				a.SpellID = sp.ID
				a.TargetID = lowest
				bestPower = sp.Power
			}
		}
		if a.Type == "attack" {
			for _, sp := range m.Spells {
				if sp.Castable && sp.Effect == "damage" && sp.Element == "ice" && sp.MPCost <= m.MP && sp.Power > bestPower {
					a.Type = "spell"
					a.SpellID = sp.ID
					bestPower = sp.Power
				}
			}
		}
		actions = append(actions, a)
	}
	return actions
}
func finishFinal(t *testing.T, g *Game, heal bool) (GameState, int) {
	t.Helper()
	s := g.State()
	for turn := 1; turn <= 80; turn++ {
		next, err := g.ProcessAction(GameActionRequest{Type: "combat_round", Actions: finalActions(s, heal)})
		if err != nil {
			t.Fatal(err)
		}
		s = *next
		if s.Phase != "combat" {
			return s, turn
		}
	}
	t.Fatal("boss exceeded turn cap")
	return s, 80
}
func TestFinalEncounterBalance(t *testing.T) {
	for _, heal := range []bool{false, true} {
		t.Run(fmt.Sprintf("healing_%v", heal), func(t *testing.T) {
			wins, rounds := 0, 0
			for seed := uint64(1); seed <= 50; seed++ {
				g := finalCheckpoint(t, seed)
				startFinal(t, g)
				s, n := finishFinal(t, g, heal)
				rounds += n
				if s.Phase == "victory" {
					wins++
				}
			}
			t.Logf("unchanged natural level-20 checkpoint, seeds=1..50, guards-first, healing=%v: wins=%d/50 average_rounds=%.2f", heal, wins, float64(rounds)/50)
			if heal && wins < 35 {
				t.Fatalf("prepared natural party only won %d/50", wins)
			}
		})
	}
}
func TestFinalEncounterArrivalAndSave(t *testing.T) {
	g := finalCheckpoint(t, 1)
	gold := g.inv.Gold
	s, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: "unrelated"})
	if err != nil {
		t.Fatal(err)
	}
	if s.Phase == "victory" || g.finalQuest().Completed || gold != g.inv.Gold {
		t.Fatal("wrong arrival advanced finale")
	}
	saved, err := g.ToSaveState("Before the last bell", "test")
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := FromSaveState(saved, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	startFinal(t, loaded)
	if loaded.scriptedBoss || loaded.inDungeon() {
		t.Fatal("finale borrowed another encounter context")
	}
	if _, err := loaded.ToSaveState("midfight", "test"); err == nil {
		t.Fatal("saved incomplete battle state")
	}
	if !loaded.discovered[loaded.gd.FinalEncounter.ID] {
		t.Fatal("boss not discovered")
	}
}
func TestFinalEncounterVictoryOnceAndReload(t *testing.T) {
	g := finalCheckpoint(t, 1)
	startFinal(t, g)
	s, _ := finishFinal(t, g, true)
	if s.Phase != "victory" {
		t.Fatal("fixture failed to win")
	}
	gold, index := g.inv.Gold, g.currentQ
	for _, typ := range []string{"advance", "quest_advance", "combat_round", "item", "spell"} {
		if _, err := g.ProcessAction(GameActionRequest{Type: typ, NodeID: g.finalQuest().TargetNodeID}); err != nil {
			t.Fatal(err)
		}
	}
	if gold != g.inv.Gold || index != g.currentQ || !g.finalQuest().Completed {
		t.Fatal("replayed reward or completion")
	}
	saved, err := g.ToSaveState("Cleared", "test")
	if err != nil {
		t.Fatal(err)
	}
	for _, legacy := range []bool{false, true} {
		if legacy {
			var ws map[string]any
			if err := json.Unmarshal(saved.WorldState, &ws); err != nil {
				t.Fatal(err)
			}
			delete(ws, "final_encounter")
			saved.WorldState, err = json.Marshal(ws)
			if err != nil {
				t.Fatal(err)
			}
		}
		loaded, err := FromSaveState(saved, g.gd, g.loc)
		if err != nil {
			t.Fatal(err)
		}
		if loaded.phase != "victory" || loaded.inv.Gold != gold || loaded.State().FinalEncounter.Conclusion == "" {
			t.Fatal("completed save lost ending or changed reward")
		}
	}
}
func TestFinalEncounterDefeatFleeAndRetry(t *testing.T) {
	for _, kind := range []string{"defeat", "flee"} {
		t.Run(kind, func(t *testing.T) {
			g := finalCheckpoint(t, 2)
			gold := g.inv.Gold
			startFinal(t, g)
			if kind == "defeat" {
				for _, c := range g.party {
					c.CurrentHP = 1
				}
				for _, e := range g.enemies {
					e.STR = 999
					e.HitPct = 999
				}
			} else {
				g.rng = rand.New(rand.NewPCG(1, 0))
			}
			for i := 0; i < 100 && g.phase == "combat"; i++ {
				typ := "wait"
				if kind == "flee" {
					typ = "flee"
				}
				if _, err := g.ProcessAction(GameActionRequest{Type: typ}); err != nil {
					t.Fatal(err)
				}
			}
			if g.phase != "world" || g.finalEncounterActive() || g.finalQuest().Completed || gold != g.inv.Gold {
				t.Fatalf("bad retry state: %s", g.phase)
			}
			if kind == "defeat" {
				for _, c := range g.party {
					if c.CurrentHP != c.MaxHP || c.Status != character.StatusNone {
						t.Fatal("party not recovered")
					}
				}
			}
			saved, err := g.ToSaveState("Retry", "test")
			if err != nil {
				t.Fatal(err)
			}
			loaded, err := FromSaveState(saved, g.gd, g.loc)
			if err != nil {
				t.Fatal(err)
			}
			startFinal(t, loaded)
		})
	}
}
func TestFinalEncounterMissingContentDoesNotComplete(t *testing.T) {
	g := finalCheckpoint(t, 1)
	g.gd.FinalEncounter.Monsters = []string{"missing"}
	g.gd.FinalEncounter.FullPartyMonsters = []string{"missing"}
	_, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: g.finalQuest().TargetNodeID})
	if err == nil || !strings.Contains(err.Error(), "progress is safe") || g.finalQuest().Completed || g.finalEncounterActive() {
		t.Fatal("failed setup did not preserve unfinished finale")
	}
}

func TestFinalEncounterLegacyOutcomePaths(t *testing.T) {
	for _, input := range []string{"spell", "item"} {
		t.Run(input, func(t *testing.T) {
			g := finalCheckpoint(t, 1)
			startFinal(t, g)
			// Isolate the final hit rather than relying on a particular random fight.
			for i, e := range g.enemies {
				e.CurrentHP = 0
				if i == 0 {
					e.CurrentHP = 1
					e.Status = character.StatusPoison
				}
			}
			var s *GameState
			var err error
			if input == "spell" {
				s, err = g.processCombatSpell(GameActionRequest{SpellID: "frost", TargetID: 100})
			} else {
				g.party[0].CurrentHP--
				s, err = g.ProcessAction(GameActionRequest{Type: "item", ItemID: "potion", TargetID: 0})
			}
			if err != nil {
				t.Fatal(err)
			}
			if s.Phase != "victory" || !g.finalQuest().Completed || g.finalEncounterActive() {
				t.Fatalf("legacy %s skipped final outcome: %s", input, s.Phase)
			}
		})
	}
}
