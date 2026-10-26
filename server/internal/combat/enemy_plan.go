package combat

import (
	"github.com/digitaldrywood/kithlands/internal/gamedata"
	"math/rand/v2"
)

// EnemyPatternStep is pure: displaying intent never consumes randomness.
// A round is consumed even if an actor is interrupted, just like party actions.
func EnemyPatternStep(monster *gamedata.Monster, round int) gamedata.MonsterAction {
	if monster == nil || len(monster.BattlePattern) == 0 {
		return gamedata.MonsterAction{Kind: "attack", Label: "Attack"}
	}
	return monster.BattlePattern[max(0, round)%len(monster.BattlePattern)]
}

// PlanEnemyAction preserves weighted targeting and leaves interruption, confusion
// and retargeting to ResolveAction. Intent describes an action, not a guaranteed
// target or outcome. Sleeping actors may wake before their initiative.
func PlanEnemyAction(enemy *Combatant, party []*Combatant, monster *gamedata.Monster, round int, rng *rand.Rand) (Action, bool) {
	if enemy == nil || enemy.CurrentHP <= 0 {
		return Action{}, false
	}
	step := EnemyPatternStep(monster, round)
	if step.Kind == "defend" {
		return Action{ActorID: enemy.ID, Kind: ActionDefend, TargetID: enemy.ID}, true
	}
	if step.Kind == "focus" {
		return Action{ActorID: enemy.ID, Kind: ActionAbility, AbilityID: "focus", TargetID: enemy.ID}, true
	}
	target := SelectEnemyTarget(party, rng)
	if target == nil {
		return Action{}, false
	}
	return Action{ActorID: enemy.ID, Kind: ActionAttack, TargetID: target.ID}, true
}
