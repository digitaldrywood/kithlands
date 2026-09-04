package api

import (
	"math/rand/v2"
	"testing"
)

func TestCombatItemTurnResolvesDefeat(t *testing.T) {
	g := newTownTestGame(t)
	if err := g.spawnScriptedBoss("slime"); err != nil {
		t.Fatal(err)
	}
	g.inv.Consumables["antidote"] = 100
	for i, c := range g.party {
		c.CurrentHP = 0
		if i == 0 {
			c.CurrentHP = 1
		}
	}
	for _, e := range g.enemies {
		e.STR = 1000
		e.HitPct = 1000
	}
	for i := 0; i < 20 && g.phase == "combat"; i++ {
		if _, err := g.ProcessAction(GameActionRequest{Type: "item", ItemID: "antidote", TargetID: 0}); err != nil {
			t.Fatal(err)
		}
	}
	if g.phase != "defeat" {
		t.Fatalf("item-turn wipe left phase %q, want defeat", g.phase)
	}
}
func TestFailedFleeDoesNotGrantPartyAttacks(t *testing.T) {
	for seed := uint64(1); seed <= 20; seed++ {
		g := newTownTestGame(t)
		if err := g.spawnScriptedBoss("slime"); err != nil {
			t.Fatal(err)
		}
		enemy := g.enemies[0]
		enemy.CurrentHP = 10000
		enemy.MaxHP = 10000
		enemy.STR = 0
		g.rng = rand.New(rand.NewPCG(seed, 0))
		state, err := g.ProcessAction(GameActionRequest{Type: "flee"})
		if err != nil {
			t.Fatal(err)
		}
		if state.Phase == "world" {
			continue
		}
		if enemy.CurrentHP != 10000 {
			t.Fatalf("failed escape also attacked enemy: HP=%d", enemy.CurrentHP)
		}
		return
	}
	t.Fatal("fixture did not exercise failed escape")
}
