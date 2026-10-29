package api

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/generator"
)

func startTrailFight(t *testing.T, g *Game) {
	t.Helper()
	q := &g.quests[0]
	arriveAtWorldNode(t, g, q.TargetNodeID)
	s, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: q.TargetNodeID})
	if err != nil || s.Phase != "combat" || !g.objectiveEncounterActive() || q.Objectives.Step != 1 || q.Completed {
		t.Fatalf("arrival did not start unresolved quest fight: state=%+v err=%v", s, err)
	}
}

func TestTrailQuestRequiresItsEncounterAndReport(t *testing.T) {
	g := objectiveTestGame(t, "Q04")
	q := &g.quests[0]
	gold := g.inv.Gold
	if _, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: q.TargetNodeID}); err == nil {
		t.Fatal("remote quest arrival accepted")
	}
	startTrailFight(t, g)
	if g.inv.Gold != gold || g.currentQ != 0 {
		t.Fatal("arrival awarded quest reward")
	}
	if _, err := g.ToSaveState("midfight", "test"); err == nil {
		t.Fatal("saved incomplete combat")
	}
	// A client kill action cannot substitute for the victory resolver.
	if _, err := g.processQuestObjective(objectiveAction(g)); err == nil {
		t.Fatal("client claimed a victory")
	}
	// Isolate victory resolution here; native combat tests fight the full roster.
	for _, enemy := range g.enemies {
		enemy.CurrentHP = 0
	}
	g.resolveCombatOutcome(g.makeCombatants())
	if q.Completed || q.Objectives.Step != 2 || q.Objectives.Clue == "" || g.objectiveEncounterActive() {
		t.Fatal("victory did not preserve the pending report")
	}
	ss, err := g.ToSaveState("cleared trail", "test")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := FromSaveState(ss, g.gd, g.loc)
	if err != nil {
		t.Fatal(err)
	}
	q = &restored.quests[0]
	if q.Objectives.Step != 2 || q.Objectives.Clue == "" || q.Completed {
		t.Fatal("load lost pending victory report")
	}
	arriveAtWorldNode(t, restored, q.GiverNodeID)
	if _, err := restored.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: q.GiverNodeID}); err != nil {
		t.Fatal(err)
	}
	before := restored.inv.Gold
	req := objectiveAction(restored)
	if _, err := restored.ProcessAction(req); err != nil {
		t.Fatal(err)
	}
	if !q.Completed || restored.inv.Gold != before+q.Reward.Gold || restored.currentQ != 1 {
		t.Fatal("report did not award quest exactly once")
	}
	if _, err := restored.ProcessAction(req); err == nil || restored.inv.Gold != before+q.Reward.Gold {
		t.Fatal("report replay awarded or accepted")
	}
}

func TestTrailQuestRetreatDefeatAndSaveRecovery(t *testing.T) {
	for _, defeat := range []bool{false, true} {
		t.Run(map[bool]string{false: "flee", true: "defeat"}[defeat], func(t *testing.T) {
			g := objectiveTestGame(t, "Q04")
			startTrailFight(t, g)
			gold := g.inv.Gold
			if defeat {
				for _, c := range g.party {
					c.CurrentHP = 0
				}
				g.resolveCombatOutcome(g.makeCombatants())
			} else {
				g.rng = rand.New(rand.NewPCG(2, 0))
				for attempts := 0; g.phase == "combat" && attempts < 50; attempts++ {
					if _, err := g.ProcessAction(GameActionRequest{Type: "flee"}); err != nil {
						t.Fatal(err)
					}
				}
			}
			if g.phase != "world" || g.objectiveEncounterActive() || g.quests[0].Objectives.Step != 1 || g.inv.Gold != gold || g.quests[0].Completed {
				t.Fatal("retreat awarded or lost unresolved objective")
			}
			wantMessage := g.gd.QuestObjectives["Q04"].Encounter.Flee
			if defeat {
				wantMessage = g.gd.QuestObjectives["Q04"].Encounter.Defeat
			}
			if g.message != wantMessage {
				t.Fatalf("wrong recovery outcome: %q", g.message)
			}
			// Retreat must not trap the player out of shops or recovery stops.
			other := g.quests[0].GiverNodeID
			arriveAtWorldNode(t, g, other)
			if _, err := g.ProcessAction(GameActionRequest{Type: "quest_advance", NodeID: other}); err != nil || g.phase != "world" {
				t.Fatalf("retry blocked ordinary travel: %v", err)
			}
			ss, err := g.ToSaveState("retry", "test")
			if err != nil {
				t.Fatal(err)
			}
			restored, err := FromSaveState(ss, g.gd, g.loc)
			if err != nil {
				t.Fatal(err)
			}
			startTrailFight(t, restored)
		})
	}
}

func TestTravelVictoryDoesNotClearTrailQuest(t *testing.T) {
	g := objectiveTestGame(t, "Q04")
	g.quests[0].Objectives.Step = 1
	g.completeObjectiveEncounter()
	if g.quests[0].Objectives.Step != 1 || g.quests[0].Objectives.Clue != "" {
		t.Fatal("unrelated victory advanced quest")
	}
	// Completed legacy quests remain completed and gain no new objective plan.
	g.quests[0] = generator.Quest{ID: "old", TemplateID: "Q04", Completed: true}
	generator.PrepareObjectives(g.quests, g.loc, g.walk.Spawn.ID, g.gd.QuestObjectives)
	if g.quests[0].Objectives != nil || !g.quests[0].Completed {
		t.Fatal("migration reopened a completed quest")
	}
}

// The authored opening threat must be winnable using the normal starting kit.
func TestTrailQuestFreshPartyBalance(t *testing.T) {
	data, err := os.ReadFile("../../shared/quick_start.json")
	if err != nil {
		t.Fatal(err)
	}
	var req NewGameRequest
	if err := json.Unmarshal(data, &req); err != nil {
		t.Fatal(err)
	}
	req.RNGSeed = 6
	base := objectiveTestGame(t, "Q04")
	gm := NewGameManager(base.gd, "../../shared")
	for _, size := range []int{2, 4} {
		t.Run(fmt.Sprintf("party_%d", size), func(t *testing.T) {
			wins := 0
			for seed := uint64(1); seed <= 50; seed++ {
				setup := req
				setup.Party = req.Party[:size]
				g, err := gm.CreateGame(setup)
				if err != nil {
					t.Fatal(err)
				}
				if g.quests[0].TemplateID != "Q04" {
					t.Fatal("seed no longer covers trail quest")
				}
				g.rng = rand.New(rand.NewPCG(seed, 0))
				startTrailFight(t, g)
				for turn := 0; g.phase == "combat" && turn < 40; turn++ {
					state := g.State()
					actions := finalActions(state, true)
					for i, a := range actions {
						if a.Type != "attack" || state.Party[a.Slot].ClassID != "cinder" {
							continue
						}
						for _, spell := range state.Party[a.Slot].Spells {
							if spell.Castable && spell.Effect == "damage" && spell.MPCost <= state.Party[a.Slot].MP {
								actions[i].Type, actions[i].SpellID = "spell", spell.ID
								break
							}
						}
					}
					// Use the real starting potions when the two-member party lacks Cure.
					if size == 2 && g.inv.Consumables["potion"] > 0 && len(actions) > 0 {
						lowest := -1
						for i, m := range state.Party {
							if m.HP > 0 && m.HP*10 < m.MaxHP*7 && (lowest < 0 || m.HP*state.Party[lowest].MaxHP < state.Party[lowest].HP*m.MaxHP) {
								lowest = i
							}
						}
						if lowest >= 0 {
							actions[0] = MemberActionReq{Slot: actions[0].Slot, Type: "item", ItemID: "potion", TargetID: lowest}
						}
					}
					if _, err := g.ProcessAction(GameActionRequest{Type: "combat_round", Actions: actions}); err != nil {
						t.Fatal(err)
					}
				}
				if g.quests[0].Objectives.Step == 2 {
					wins++
				}
			}
			t.Logf("normal starting party, native stats/spells, no item grants, seeds 1..50: %d wins", wins)
			if wins < 45 {
				t.Fatalf("opening threat only won %d/50", wins)
			}
		})
	}
}
