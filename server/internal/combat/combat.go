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
	Row                     string

	WeaponPower           int
	LongRange             bool
	ArmorAbsorb           int
	EvadePenalty, CritPct int

	// Bare-hand damage for Brawlers: base + (level * STR/2)
	BareHandDamage int

	// Active damage buffs (focus, inspire). Highest DamageMult applies.
	Buffs []CombatBuff
	// Countering is set when a Brawler uses the counter ability this turn;
	// next hit they take triggers a reactive attack, then it clears.
	Countering bool

	MonsterID string // source monster ID for lookups
	Size      string // small, medium, large, boss

	// XPReward is the scaled XP this combatant pays out when defeated.
	// Set by balance.ScaleMonster at encounter-generation time so victory
	// resolution can read it directly instead of re-looking up the base
	// Monster by Name. Zero for player combatants.
	XPReward int
}

// CombatBuff is a short-duration stat bonus applied to a combatant.
// DamageMult is expressed as a percentage (100 = unchanged, 150 = +50%).
// HitPctBonus and ArmorAbsorbBonus are flat additions; ArmorAbsorbMult is a
// percentage multiplier (100 = unchanged, 200 = doubled) used by Aegis.
type CombatBuff struct {
	Kind             string
	DamageMult       int
	HitPctBonus      int
	ArmorAbsorbBonus int
	ArmorAbsorbMult  int
	TurnsLeft        int
}

// Action represents a combat action chosen by a combatant.
type Action struct {
	ActorID    int
	Kind       ActionKind
	TargetID   int
	AbilityID  string // populated when Kind == ActionAbility
	IgnoreRow  bool   // populated when Kind == ActionAbility
	Initiative int    // weighted initiative roll, assigned by ResolveTurn
}

type ActionKind string

const (
	ActionAttack     ActionKind = "attack"
	ActionDefend     ActionKind = "defend"
	ActionFlee       ActionKind = "flee"
	ActionAbility    ActionKind = "ability"
	ActionCounter    ActionKind = "counter"     // reactive; emitted by ResolveTurn, not requested
	ActionPoisonTick ActionKind = "poison_tick" // emitted for poison damage at start of round
	ActionConfusion  ActionKind = "confusion"   // emitted when confused actor attacks randomly
)

// ResolvedAction is a single combat action after server resolution.
type ResolvedAction struct {
	ActorID    int        `json:"actor_id"`
	ActorName  string     `json:"actor_name"`
	Kind       ActionKind `json:"kind"`
	TargetID   int        `json:"target_id"`
	Hits       []Hit      `json:"hits"`
	TotalDmg   int        `json:"total_damage"`
	TargetHP   int        `json:"target_hp"`
	Killed     bool       `json:"killed"`
	Initiative int        `json:"initiative,omitempty"`
}

type Hit struct {
	Damage int  `json:"damage"`
	Crit   bool `json:"crit"`
	Missed bool `json:"missed"`
}

// RollInitiative returns a weighted initiative value: the combatant's AGI plus
// a variable bonus scaled to AGI. Expected value grows with AGI so faster
// combatants still tend to act first, but the distributions overlap enough
// that slower combatants can occasionally land an upset first-strike. See
// GDD §6.1.
func RollInitiative(agi int, rng *rand.Rand) int {
	if agi < 0 {
		agi = 0
	}
	return agi + rng.IntN(agi/2+10)
}

func buildTurnOrderPriorities(party, enemies []*Combatant) map[int]int {
	priorities := make(map[int]int, len(party)+len(enemies))
	for slot, combatant := range party {
		if combatant != nil {
			priorities[combatant.ID] = slot
		}
	}
	base := len(party)
	for idx, combatant := range enemies {
		if combatant != nil {
			priorities[combatant.ID] = base + idx
		}
	}
	return priorities
}

func actionActsBefore(a, b Action, priorities map[int]int) bool {
	if a.Initiative != b.Initiative {
		return a.Initiative > b.Initiative
	}
	aPriority, aOK := priorities[a.ActorID]
	bPriority, bOK := priorities[b.ActorID]
	if aOK && bOK && aPriority != bPriority {
		return aPriority < bPriority
	}
	return a.ActorID < b.ActorID
}

func sortActionsByInitiative(actions []Action, party, enemies []*Combatant) {
	priorities := buildTurnOrderPriorities(party, enemies)
	sort.SliceStable(actions, func(i, j int) bool {
		return actionActsBefore(actions[i], actions[j], priorities)
	})
}

// ResolveTurn resolves one round of combat per Section 6.1.
// Each combatant rolls a weighted initiative (AGI + rand spread) once per
// round and actions are sorted descending by that roll. Equal initiatives are
// broken by party slot order so saved formation order matters consistently.
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

	results := ResolveRoundStart(party, enemies)

	// Roll a weighted initiative for each acting combatant once per round,
	// then sort descending by that roll. Ties still break on a coin flip.
	for i := range actions {
		if actor := allCombatants[actions[i].ActorID]; actor != nil {
			actions[i].Initiative = RollInitiative(actor.AGI, rng)
		}
	}
	sortActionsByInitiative(actions, party, enemies)

	for _, action := range actions {
		if CheckVictory(enemies) || CheckDefeat(party) {
			break
		}
		results = append(results, ResolveAction(party, enemies, action, stats, rng)...)
	}

	// Tick buffs at end of round and clear any stale counters.
	TickBuffs(party, enemies)

	return results
}

// ResolveRoundStart applies start-of-round effects before any queued action
// resolves. Today that means poison ticks per Section 6.5.
func ResolveRoundStart(party, enemies []*Combatant) []ResolvedAction {
	var results []ResolvedAction
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
	return results
}

// ResolveAction resolves a single queued action against the live combat state.
// Callers are responsible for applying round-start and round-end effects.
func ResolveAction(
	party []*Combatant,
	enemies []*Combatant,
	action Action,
	stats *gamedata.CombatConfig,
	rng *rand.Rand,
) []ResolvedAction {
	allCombatants := make(map[int]*Combatant, len(party)+len(enemies))
	for _, c := range party {
		allCombatants[c.ID] = c
	}
	for _, c := range enemies {
		allCombatants[c.ID] = c
	}

	actor := allCombatants[action.ActorID]
	if actor == nil || actor.CurrentHP <= 0 {
		return nil
	}
	if actor.Status == character.StatusSleep || actor.Status == character.StatusStone || actor.Status == character.StatusDeath {
		return nil
	}

	// Confusion: confused actors attack a random combatant per Section 6.5.
	if ProcessConfusion(actor, rng) {
		allLiving := allLivingCombatants(party, enemies)
		if len(allLiving) == 0 {
			return nil
		}
		confuseTarget := allLiving[rng.IntN(len(allLiving))]
		resolved := resolveAttack(actor, confuseTarget, stats, rng)
		resolved.Kind = ActionConfusion
		resolved.Initiative = action.Initiative
		if resolved.TotalDmg > 0 && confuseTarget.Status == character.StatusSleep {
			ProcessSleepOnDamage(confuseTarget)
		}
		return []ResolvedAction{resolved}
	}

	target := allCombatants[action.TargetID]
	if target == nil || target.CurrentHP <= 0 {
		// Retarget to first living enemy/ally.
		target = retarget(actor, party, enemies)
		// Self-targeted abilities (focus, counter) don't need a live enemy.
		if target == nil && !selfTargetAbility(action) {
			return nil
		}
	}

	switch action.Kind {
	case ActionAttack:
		resolved := resolveAttack(actor, target, stats, rng)
		resolved.Initiative = action.Initiative
		results := []ResolvedAction{resolved}
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
		return results
	case ActionDefend:
		return []ResolvedAction{{
			ActorID:    actor.ID,
			ActorName:  actor.Name,
			Kind:       ActionDefend,
			Initiative: action.Initiative,
		}}
	case ActionAbility:
		allies := alliesOf(actor, party, enemies)
		resolved := ResolveAbility(actor, target, allies, action.AbilityID, action.IgnoreRow, stats, rng)
		resolved.Initiative = action.Initiative
		if resolved.TotalDmg > 0 && target != nil && target.Status == character.StatusSleep {
			ProcessSleepOnDamage(target)
		}
		return []ResolvedAction{resolved}
	default:
		return nil
	}
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
	ignoreRow bool,
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
		return resolveBackstab(actor, target, ignoreRow, stats, rng)
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

// EffectiveHitPct returns base HitPct plus any flat bonuses from active buffs.
func EffectiveHitPct(c *Combatant) int {
	pct := c.HitPct
	for _, b := range c.Buffs {
		pct += b.HitPctBonus
	}
	return pct
}

// EffectiveArmorAbsorb returns base armor absorb with multiplicative buffs
// applied first (Aegis doubles armor) and additive bonuses added on top.
func EffectiveArmorAbsorb(c *Combatant) int {
	armor := c.ArmorAbsorb
	mult := 100
	bonus := 0
	for _, b := range c.Buffs {
		if b.ArmorAbsorbMult > mult {
			mult = b.ArmorAbsorbMult
		}
		bonus += b.ArmorAbsorbBonus
	}
	if mult != 100 {
		armor = armor * mult / 100
	}
	return armor + bonus
}

func rollPhysicalDamage(baseDamage, mitigation, minDamage int, rng *rand.Rand) int {
	downSwing := max(1, baseDamage/4)
	upSwing := max(1, baseDamage/3)
	variance := rng.IntN(downSwing+upSwing+1) - downSwing
	dmg := baseDamage - mitigation + variance
	if dmg < minDamage {
		return minDamage
	}
	return dmg
}

func halveRoundedUp(v int) int {
	if v <= 1 {
		return v
	}
	return (v + 1) / 2
}

func physicalBaseDamage(attacker *Combatant) int {
	baseDamage := attacker.STR + attacker.WeaponPower
	if attacker.BareHandDamage > 0 {
		baseDamage = attacker.BareHandDamage + attacker.WeaponPower
	}
	if mult := damageMultiplier(attacker); mult != 100 {
		baseDamage = baseDamage * mult / 100
	}
	return baseDamage
}

func applyPhysicalRowModifiers(baseDamage int, attacker, defender *Combatant, applyRow bool) int {
	if !applyRow {
		return baseDamage
	}
	if attacker != nil && attacker.Row == "back" && !attacker.LongRange {
		baseDamage = halveRoundedUp(baseDamage)
	}
	if defender != nil && defender.Row == "back" {
		baseDamage = halveRoundedUp(baseDamage)
	}
	return baseDamage
}

// resolveAttack implements the damage formula from Section 6.2.
func resolveAttack(attacker, defender *Combatant, stats *gamedata.CombatConfig, rng *rand.Rand) ResolvedAction {
	attackerHitPct := EffectiveHitPct(attacker)
	numHits := 1 + attackerHitPct/32

	var hits []Hit
	totalDmg := 0

	for i := 0; i < numHits; i++ {
		// Hit check per Section 6.3
		toHit := stats.BaseHitChance + attackerHitPct - defender.Evade()
		roll := rng.IntN(100) + 1
		if roll > toHit {
			hits = append(hits, Hit{Missed: true})
			continue
		}

		// Damage per Section 6.2
		baseDamage := applyPhysicalRowModifiers(
			physicalBaseDamage(attacker),
			attacker,
			defender,
			true,
		)
		mitigation := EffectiveArmorAbsorb(defender)
		dmg := rollPhysicalDamage(baseDamage, mitigation, stats.MinDamagePerHit, rng)

		// Crit check per Section 6.2
		isCrit := false
		critChance := attacker.CritChance()
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
func resolveBackstab(attacker, defender *Combatant, ignoreRow bool, stats *gamedata.CombatConfig, rng *rand.Rand) ResolvedAction {
	baseDamage := physicalBaseDamage(attacker) * 3
	baseDamage = applyPhysicalRowModifiers(baseDamage, attacker, defender, !ignoreRow)

	mitigation := EffectiveArmorAbsorb(defender)
	dmg := rollPhysicalDamage(baseDamage, mitigation, stats.MinDamagePerHit, rng)

	isCrit := false
	critChance := attacker.CritChance()
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
