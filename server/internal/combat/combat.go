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

	// Active damage buffs (focus, inspire). Highest DamageMult applies.
	Buffs []CombatBuff
	// Countering is set when a Brawler uses the counter ability this turn;
	// next hit they take triggers a reactive attack, then it clears.
	Countering bool

	MonsterID string // source monster ID for lookups
	Size      string // small, medium, large, boss
}

// CombatBuff is a short-duration damage multiplier applied to a combatant.
// DamageMult is expressed as a percentage (100 = unchanged, 150 = +50%).
type CombatBuff struct {
	Kind       string
	DamageMult int
	TurnsLeft  int
}

// Action represents a combat action chosen by a combatant.
type Action struct {
	ActorID   int
	Kind      ActionKind
	TargetID  int
	AbilityID string // populated when Kind == ActionAbility
}

type ActionKind string

const (
	ActionAttack  ActionKind = "attack"
	ActionDefend  ActionKind = "defend"
	ActionFlee    ActionKind = "flee"
	ActionAbility ActionKind = "ability"
	ActionCounter    ActionKind = "counter"     // reactive; emitted by ResolveTurn, not requested
	ActionPoisonTick ActionKind = "poison_tick" // emitted for poison damage at start of round
	ActionConfusion  ActionKind = "confusion"   // emitted when confused actor attacks randomly
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

	var results []ResolvedAction

	// Poison tick at start of round per Section 6.5: -5% max HP per turn.
	for _, group := range [][]*Combatant{party, enemies} {
		for _, c := range group {
			if c == nil || c.CurrentHP <= 0 {
				continue
			}
			dmg := ProcessPoison(c)
			if dmg > 0 {
				results = append(results, ResolvedAction{
					ActorID:   c.ID,
					ActorName: c.Name,
					Kind:      ActionPoisonTick,
					TargetID:  c.ID,
					Hits:      []Hit{{Damage: dmg}},
					TotalDmg:  dmg,
					TargetHP:  c.CurrentHP,
					Killed:    c.Status == character.StatusDeath,
				})
			}
		}
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

	for _, action := range actions {
		actor := allCombatants[action.ActorID]
		if actor == nil || actor.CurrentHP <= 0 {
			continue
		}
		if actor.Status == character.StatusSleep || actor.Status == character.StatusStone || actor.Status == character.StatusDeath {
			continue
		}

		// Confusion: confused actors attack a random combatant per Section 6.5.
		if ProcessConfusion(actor, rng) {
			allLiving := allLivingCombatants(party, enemies)
			if len(allLiving) == 0 {
				continue
			}
			confuseTarget := allLiving[rng.IntN(len(allLiving))]
			resolved := resolveAttack(actor, confuseTarget, stats, rng)
			resolved.Kind = ActionConfusion
			results = append(results, resolved)
			// Wake sleeping targets hit by confusion attack.
			if resolved.TotalDmg > 0 && confuseTarget.Status == character.StatusSleep {
				ProcessSleepOnDamage(confuseTarget)
			}
			continue
		}

		target := allCombatants[action.TargetID]
		if target == nil || target.CurrentHP <= 0 {
			// Retarget to first living enemy/ally
			target = retarget(actor, party, enemies)
			// Self-targeted abilities (focus, counter) don't need a live enemy.
			if target == nil && !selfTargetAbility(action) {
				continue
			}
		}

		switch action.Kind {
		case ActionAttack:
			resolved := resolveAttack(actor, target, stats, rng)
			results = append(results, resolved)
			// Wake sleeping targets on damage per Section 6.5.
			if resolved.TotalDmg > 0 && target.Status == character.StatusSleep {
				ProcessSleepOnDamage(target)
			}
			// Counter hook: if the defender is alive and was countering, they
			// reactively attack back once. Only once per incoming action.
			if resolved.TotalDmg > 0 && target.CurrentHP > 0 && target.Countering {
				counter := resolveAttack(target, actor, stats, rng)
				counter.Kind = ActionCounter
				target.Countering = false
				results = append(results, counter)
			}
		case ActionDefend:
			results = append(results, ResolvedAction{
				ActorID:   actor.ID,
				ActorName: actor.Name,
				Kind:      ActionDefend,
			})
		case ActionAbility:
			allies := alliesOf(actor, party, enemies)
			resolved := ResolveAbility(actor, target, allies, action.AbilityID, stats, rng)
			results = append(results, resolved)
			// Wake sleeping targets hit by abilities (e.g. backstab).
			if resolved.TotalDmg > 0 && target != nil && target.Status == character.StatusSleep {
				ProcessSleepOnDamage(target)
			}
		}
	}

	// Tick buffs at end of round and clear any stale counters.
	TickBuffs(party, enemies)

	return results
}

// selfTargetAbility returns true if the action is a no-target ability.
func selfTargetAbility(a Action) bool {
	if a.Kind != ActionAbility {
		return false
	}
	switch a.AbilityID {
	case "focus", "counter", "inspire":
		return true
	}
	return false
}

// alliesOf returns the slice that contains the actor (party if player, enemies otherwise).
func alliesOf(actor *Combatant, party, enemies []*Combatant) []*Combatant {
	if actor.IsPlayer {
		return party
	}
	return enemies
}

// TickBuffs decrements all active buff durations and removes expired ones.
// It also clears any lingering Countering flags that were not consumed this round.
func TickBuffs(party, enemies []*Combatant) {
	for _, group := range [][]*Combatant{party, enemies} {
		for _, c := range group {
			if c == nil {
				continue
			}
			c.Countering = false
			if len(c.Buffs) == 0 {
				continue
			}
			kept := c.Buffs[:0]
			for _, b := range c.Buffs {
				b.TurnsLeft--
				if b.TurnsLeft > 0 {
					kept = append(kept, b)
				}
			}
			c.Buffs = kept
		}
	}
}

// ResolveAbility dispatches a class ability. Returns a ResolvedAction describing
// what happened so the caller can log / animate it. Inventory / monster-table
// side effects (e.g. Steal) are the caller's responsibility — this package does
// not depend on inventory.
func ResolveAbility(
	actor, target *Combatant,
	allies []*Combatant,
	abilityID string,
	stats *gamedata.CombatConfig,
	rng *rand.Rand,
) ResolvedAction {
	switch abilityID {
	case "focus":
		applyBuff(actor, CombatBuff{Kind: "focus", DamageMult: 150, TurnsLeft: 3})
		return ResolvedAction{
			ActorID: actor.ID, ActorName: actor.Name,
			Kind: ActionAbility, TargetID: actor.ID,
		}
	case "counter":
		actor.Countering = true
		return ResolvedAction{
			ActorID: actor.ID, ActorName: actor.Name,
			Kind: ActionAbility, TargetID: actor.ID,
		}
	case "inspire":
		for _, a := range allies {
			if a == nil || a.CurrentHP <= 0 {
				continue
			}
			applyBuff(a, CombatBuff{Kind: "inspire", DamageMult: 125, TurnsLeft: 3})
		}
		return ResolvedAction{
			ActorID: actor.ID, ActorName: actor.Name,
			Kind: ActionAbility, TargetID: actor.ID,
		}
	case "backstab":
		if target == nil || target.CurrentHP <= 0 {
			return ResolvedAction{ActorID: actor.ID, ActorName: actor.Name, Kind: ActionAbility}
		}
		return resolveBackstab(actor, target, stats, rng)
	case "steal":
		// No damage; signal only. Caller handles inventory.
		return ResolvedAction{
			ActorID: actor.ID, ActorName: actor.Name,
			Kind: ActionAbility, TargetID: targetID(target),
		}
	}
	return ResolvedAction{ActorID: actor.ID, ActorName: actor.Name, Kind: ActionAbility}
}

func targetID(target *Combatant) int {
	if target == nil {
		return 0
	}
	return target.ID
}

// applyBuff adds a buff, replacing any existing buff of the same kind so the
// duration always refreshes instead of stacking.
func applyBuff(c *Combatant, buff CombatBuff) {
	for i, existing := range c.Buffs {
		if existing.Kind == buff.Kind {
			c.Buffs[i] = buff
			return
		}
	}
	c.Buffs = append(c.Buffs, buff)
}

// damageMultiplier returns the largest DamageMult across the combatant's
// active buffs, or 100 (no change) if there are none.
func damageMultiplier(c *Combatant) int {
	mult := 100
	for _, b := range c.Buffs {
		if b.DamageMult > mult {
			mult = b.DamageMult
		}
	}
	return mult
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
		// Apply active damage buffs (focus, inspire).
		if mult := damageMultiplier(attacker); mult != 100 {
			baseDamage = baseDamage * mult / 100
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

// resolveBackstab is a single high-damage guaranteed-hit strike. Base damage
// is tripled (after existing buffs), still rolls for crit, and ignores
// multi-hit scaling. Armor mitigation still applies.
func resolveBackstab(attacker, defender *Combatant, stats *gamedata.CombatConfig, rng *rand.Rand) ResolvedAction {
	baseDamage := attacker.STR + attacker.WeaponPower
	if attacker.BareHandDamage > 0 {
		baseDamage = attacker.BareHandDamage
	}
	if mult := damageMultiplier(attacker); mult != 100 {
		baseDamage = baseDamage * mult / 100
	}
	baseDamage *= 3

	mitigation := defender.ArmorAbsorb
	dmg := baseDamage - mitigation + rng.IntN(max(1, baseDamage/2)+1)
	if dmg < stats.MinDamagePerHit {
		dmg = stats.MinDamagePerHit
	}

	isCrit := false
	critChance := attacker.LCK / 4
	if critChance > 0 && rng.IntN(100) < critChance {
		dmg *= stats.CritMultiplier
		isCrit = true
	}

	defender.CurrentHP -= dmg
	killed := false
	if defender.CurrentHP <= 0 {
		defender.CurrentHP = 0
		defender.Status = character.StatusDeath
		killed = true
	}

	return ResolvedAction{
		ActorID:   attacker.ID,
		ActorName: attacker.Name,
		Kind:      ActionAbility,
		TargetID:  defender.ID,
		Hits:      []Hit{{Damage: dmg, Crit: isCrit}},
		TotalDmg:  dmg,
		TargetHP:  defender.CurrentHP,
		Killed:    killed,
	}
}

// allLivingCombatants returns every combatant with HP > 0 and not dead/stoned.
func allLivingCombatants(party, enemies []*Combatant) []*Combatant {
	var out []*Combatant
	for _, group := range [][]*Combatant{party, enemies} {
		for _, c := range group {
			if c != nil && c.CurrentHP > 0 && c.Status != character.StatusDeath && c.Status != character.StatusStone {
				out = append(out, c)
			}
		}
	}
	return out
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
