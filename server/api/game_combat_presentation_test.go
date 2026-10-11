package api

import (
	"strings"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/combat"
)

func TestMissedPhysicalActionsRemainInPresentationLog(t *testing.T) {
	for _, kind := range []combat.ActionKind{combat.ActionAttack, combat.ActionCounter} {
		t.Run(string(kind), func(t *testing.T) {
			target := &combat.Combatant{ID: 100, Name: "Goblin", CurrentHP: 20}
			game := &Game{enemies: []*combat.Combatant{target}}
			game.logResolvedCombatAction(nil, nil, combat.ResolvedAction{
				Kind: kind, ActorID: 0, ActorName: "Hero", TargetID: 100,
				Hits: []combat.Hit{{Missed: true}}, Initiative: 12,
			})
			if len(game.combatLog) != 1 || len(game.combatActions) != 1 {
				t.Fatalf("missed action disappeared: log=%v actions=%v", game.combatLog, game.combatActions)
			}
			action := game.combatActions[0]
			if !action.Missed || action.Damage != 0 || action.ActorName != "Hero" || action.TargetID != 100 || len(action.Hits) != 1 {
				t.Fatalf("miss presentation lost the authoritative result: %+v", action)
			}
			if !strings.Contains(game.combatLog[0], "Hero") || target.CurrentHP != 20 {
				t.Fatalf("presentation changed outcome: log=%v target=%+v", game.combatLog, target)
			}
		})
	}
}
