package api

import (
	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/combat"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

func (g *Game) enemyMonster(e *combat.Combatant) *gamedata.Monster {
	if m := g.gd.MonsterByID(e.MonsterID); m != nil {
		return m
	}
	return g.monsterByName(e.Name)
}

func (g *Game) planEnemyActions(party []*combat.Combatant) []combat.Action {
	if g.combatRound == 0 && g.encounterStart == combat.EncounterStartPreemptive {
		return nil
	}
	var actions []combat.Action
	for _, e := range g.enemies {
		if action, ok := combat.PlanEnemyAction(e, party, g.enemyMonster(e), g.combatRound, g.rng); ok {
			actions = append(actions, action)
		}
	}
	return actions
}

func (g *Game) enemyAgility(id int) int {
	for _, e := range g.enemies {
		if e.ID == id {
			return e.AGI
		}
	}
	return 0
}

func (g *Game) enemyAbilityPlans() map[int]string {
	plans := make(map[int]string)
	for _, e := range g.enemies {
		if combat.EnemyPatternStep(g.enemyMonster(e), g.combatRound).Kind == "focus" {
			plans[e.ID] = "focus"
		}
	}
	return plans
}

// Legacy item/spell entry points use the same planner and logging as rounds.
func (g *Game) resolveLegacyEnemyTurn() []*combat.Combatant {
	party := g.makeCombatants()
	actions := g.planEnemyActions(party)
	plans := g.enemyAbilityPlans()
	for _, result := range combat.ResolveTurn(party, g.enemies, actions, &g.gd.Stats.Combat, g.rng) {
		g.logResolvedCombatAction(party, plans, result)
	}
	for i, member := range party {
		g.party[i].CurrentHP, g.party[i].Status = member.CurrentHP, member.Status
	}
	g.combatRound++
	return party
}

// This forecast uses the exact same pattern step as execution and never rolls
// RNG. Targets remain weighted at submission; statuses can interrupt the plan.
func (g *Game) enemyIntent(e *combat.Combatant) *EnemyIntentState {
	if g.phase != "combat" || e.CurrentHP <= 0 {
		return nil
	}
	if g.combatRound == 0 && g.encounterStart == combat.EncounterStartPreemptive {
		return &EnemyIntentState{Kind: "skip", Label: "Surprised: no action"}
	}
	switch e.Status {
	case character.StatusStone, character.StatusDeath:
		return &EnemyIntentState{Kind: "blocked", Label: "Unable to act"}
	case character.StatusSleep:
		return &EnemyIntentState{Kind: "sleep", Label: "Asleep: may wake on damage"}
	case character.StatusConfuse:
		return &EnemyIntentState{Kind: "confusion", Label: "Confused: random target"}
	}
	step := combat.EnemyPatternStep(g.enemyMonster(e), g.combatRound)
	return &EnemyIntentState{Kind: step.Kind, Label: "Plans: " + step.Label}
}
