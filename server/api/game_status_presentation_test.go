package api

import (
	"encoding/json"
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/magic"
)

func TestStatusReceiptMatchesResolvedOutcome(t *testing.T) {
	for _, tc := range []struct {
		spell string
		slot  int
	}{
		{"sleep", 1}, {"mute", 2}, {"slow", 1},
	} {
		for _, applied := range []bool{true, false} {
			outcome := "resisted"
			if applied {
				outcome = "applied"
			}
			t.Run(tc.spell+"/"+outcome, func(t *testing.T) {
				gm := NewGameManager(loadSharedForTest(t), "../../shared")
				g, err := gm.DebugCreateShowcase()
				if err != nil {
					t.Fatal(err)
				}
				target := g.enemies[0]
				spell := g.gd.SpellByID(tc.spell)
				// Pick a deterministic roll without modifying the real spell chance.
				seed := uint64(1)
				for ; seed < 100; seed++ {
					if magic.ResolveStatusSpell(spell, target.VIT, rand.New(rand.NewPCG(seed, 0))) == applied {
						break
					}
				}
				if seed == 100 {
					t.Fatal("could not exercise both real status outcomes")
				}
				beforeHP, beforeMP := target.CurrentHP, g.party[tc.slot].CurrentMP
				g.rng = rand.New(rand.NewPCG(seed, 0))
				g.resolveScheduledSpell(g.makeCombatants(), MemberActionReq{Slot: tc.slot, Type: "spell", SpellID: tc.spell, TargetID: target.ID})
				if len(g.combatActions) != 1 {
					t.Fatalf("status receipt count = %d", len(g.combatActions))
				}
				data, err := json.Marshal(g.combatActions[0])
				if err != nil {
					t.Fatal(err)
				}
				var receipt map[string]any
				if err := json.Unmarshal(data, &receipt); err != nil {
					t.Fatal(err)
				}
				if receipt["status_outcome"] != outcome || receipt["status_effect"] != spell.StatusEffect || receipt["target_name"] != target.Name {
					t.Fatalf("status receipt loses server outcome: %s", data)
				}
				wantStatus := character.StatusNone
				if applied {
					wantStatus = character.Status(spell.StatusEffect)
				}
				if target.Status != wantStatus || target.CurrentHP != beforeHP || g.party[tc.slot].CurrentMP != beforeMP-spell.MPCost {
					t.Fatalf("status receipt disagrees with state: target=%+v MP=%d", target, g.party[tc.slot].CurrentMP)
				}
			})
		}
	}
}
