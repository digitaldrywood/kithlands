package combat

import (
	"math/rand/v2"
	"sort"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/gamedata"
)

// Combatant wraps a character or monster for combat resolution.
type Combatant struct {
	ID       int
	Name     string
	IsPlayer bool

	STR, AGI, INT, VIT, LCK int
	HitPct                  int
	MaxHP, CurrentHP        int
	Status                  character.Status

	WeaponPower int
	ArmorAbsorb int

	// Bare-hand damage for Brawlers: base + (level * STR/2)
	BareHandDamage int
}

// Action represents a combat action chosen by a combatant.
type Action struct {
	ActorID  int
	Kind     ActionKind
	TargetID int
}

type ActionKind string

const (
	ActionAttack ActionKind = "attack"
	ActionDefend ActionKind = "defend"
	ActionFlee   ActionKind = "flee"
)

// ResolvedAction is a single combat action after server resolution.
type ResolvedAction struct {
	ActorID   int        `json:"actor_id"`
	ActorName string     `json:"actor_name"`
	Kind      ActionKind `json:"kind"`
	TargetID  int        `json:"target_id"`
	Hits      []Hit      `json:"hits"`
	TotalDmg  int        `json:"total_damage"`
	TargetHP  int        `json:"target_hp"`
	Killed    bool       `json:"killed"`
}

type Hit struct {
	Damage int  `json:"damage"`
	Crit   bool `json:"crit"`
	Missed bool `json:"missed"`
}

// ResolveTurn resolves one round of combat per Section 6.1.
// Actions are sorted by AGI (ties broken by random roll), then resolved in order.
func ResolveTurn(
	party []*Combatant,
	enemies []*Combatant,
	actions []Action,
	stats *gamedata.CombatConfig,
	rng *rand.Rand,
) []ResolvedAction {
	allCombatants := make(map[int]*Combatant)
	for _, c := range party {
		allCombatants[c.ID] = c
	}
	for _, c := range enemies {
		allCombatants[c.ID] = c
	}

	// Sort actions by actor AGI descending, random tiebreak
	sort.Slice(actions, func(i, j int) bool {
		ai := allCombatants[actions[i].ActorID]
		aj := allCombatants[actions[j].ActorID]
		if ai.AGI != aj.AGI {
			return ai.AGI > aj.AGI
		}
		return rng.IntN(2) == 0
	})

	var results []ResolvedAction

	for _, action := range actions {
		actor := allCombatants[action.ActorID]
		if actor == nil || actor.CurrentHP <= 0 {
			continue
		}
		if actor.Status == character.StatusSleep || actor.Status == character.StatusStone || actor.Status == character.StatusDeath {
			continue
		}

		target := allCombatants[action.TargetID]
		if target == nil || target.CurrentHP <= 0 {
			// Retarget to first living enemy/ally
			target = retarget(actor, party, enemies)
			if target == nil {
				continue
			}
		}

		switch action.Kind {
		case ActionAttack:
			resolved := resolveAttack(actor, target, stats, rng)
			results = append(results, resolved)
		case ActionDefend:
			results = append(results, ResolvedAction{
				ActorID:   actor.ID,
				ActorName: actor.Name,
				Kind:      ActionDefend,
			})
		}
	}

	return results
}

// resolveAttack implements the damage formula from Section 6.2.
func resolveAttack(attacker, defender *Combatant, stats *gamedata.CombatConfig, rng *rand.Rand) ResolvedAction {
	numHits := 1 + attacker.HitPct/32

	var hits []Hit
	totalDmg := 0

	for i := 0; i < numHits; i++ {
		// Hit check per Section 6.3
		toHit := stats.BaseHitChance + attacker.HitPct - defender.AGI*2
		roll := rng.IntN(100) + 1
		if roll > toHit {
			hits = append(hits, Hit{Missed: true})
			continue
		}

		// Damage per Section 6.2
		baseDamage := attacker.STR + attacker.WeaponPower
		if attacker.BareHandDamage > 0 {
			baseDamage = attacker.BareHandDamage
		}
		mitigation := defender.ArmorAbsorb
		dmg := baseDamage - mitigation + rng.IntN(max(1, baseDamage/2)+1)
		if dmg < stats.MinDamagePerHit {
			dmg = stats.MinDamagePerHit
		}

		// Crit check per Section 6.2
		isCrit := false
		critChance := attacker.LCK / 4
		if critChance > 0 && rng.IntN(100) < critChance {
			dmg *= stats.CritMultiplier
			isCrit = true
		}

		totalDmg += dmg
		hits = append(hits, Hit{Damage: dmg, Crit: isCrit})
	}

	defender.CurrentHP -= totalDmg
	killed := false
	if defender.CurrentHP <= 0 {
		defender.CurrentHP = 0
		defender.Status = character.StatusDeath
		killed = true
	}

	return ResolvedAction{
		ActorID:   attacker.ID,
		ActorName: attacker.Name,
		Kind:      ActionAttack,
		TargetID:  defender.ID,
		Hits:      hits,
		TotalDmg:  totalDmg,
		TargetHP:  defender.CurrentHP,
		Killed:    killed,
	}
}

func retarget(actor *Combatant, party, enemies []*Combatant) *Combatant {
	var pool []*Combatant
	if actor.IsPlayer {
		pool = enemies
	} else {
		pool = party
	}
	for _, c := range pool {
		if c.CurrentHP > 0 && c.Status != character.StatusDeath && c.Status != character.StatusStone {
			return c
		}
	}
	return nil
}

// SelectEnemyTarget picks a party target using FF1-style weighted targeting per Section 6.4:
// 50% slot 0, 25% slot 1, 12.5% slot 2, 12.5% slot 3.
func SelectEnemyTarget(party []*Combatant, rng *rand.Rand) *Combatant {
	weights := []int{50, 25, 13, 12} // sums to 100

	for attempts := 0; attempts < 10; attempts++ {
		roll := rng.IntN(100)
		cumulative := 0
		for i, w := range weights {
			cumulative += w
			if roll < cumulative && i < len(party) {
				target := party[i]
				if target.CurrentHP > 0 && target.Status != character.StatusDeath && target.Status != character.StatusStone {
					return target
				}
				break
			}
		}
	}

	// Fallback: first living party member
	for _, c := range party {
		if c.CurrentHP > 0 && c.Status != character.StatusDeath && c.Status != character.StatusStone {
			return c
		}
	}
	return nil
}

// CheckVictory returns true if all enemies are defeated.
func CheckVictory(enemies []*Combatant) bool {
	for _, e := range enemies {
		if e.CurrentHP > 0 && e.Status != character.StatusDeath && e.Status != character.StatusStone {
			return false
		}
	}
	return true
}

// CheckDefeat returns true if all party members are defeated.
func CheckDefeat(party []*Combatant) bool {
	for _, c := range party {
		if c.CurrentHP > 0 && c.Status != character.StatusDeath && c.Status != character.StatusStone {
			return false
		}
	}
	return true
}
