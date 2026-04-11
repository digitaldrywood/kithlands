package api

import "github.com/digitaldrywood/kithlands/internal/character"

// ForceVictoryForTest kills every enemy in the current encounter and runs
// the normal combat-victory path so the game transitions into the post-fight
// quest_complete / promotion phases. Exposed only for tests.
func ForceVictoryForTest(g *Game) {
	g.mu.Lock()
	for _, e := range g.enemies {
		e.CurrentHP = 0
	}
	g.mu.Unlock()
	// A harmless attack action runs the victory-resolution block.
	_, _ = g.ProcessAction(GameActionRequest{
		Type: "attack",
		Actions: []MemberActionReq{
			{Slot: 0, Type: "defend"},
		},
	})
}

// KillPartyMemberForTest drops the party member at idx to 0 HP and marks
// them dead. Exposed only for tests.
func KillPartyMemberForTest(g *Game, idx int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.party[idx].CurrentHP = 0
	g.party[idx].Status = character.StatusDeath
}

// PartyXPForTest returns the raw XP of the party member at idx. Exposed only
// for tests.
func PartyXPForTest(g *Game, idx int) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.party[idx].XP
}

// PartyHPForTest returns the current HP of the party member at idx. Exposed
// only for tests.
func PartyHPForTest(g *Game, idx int) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.party[idx].CurrentHP
}

// GiveItemForTest adds n of the given consumable to inventory. Exposed only
// for tests.
func GiveItemForTest(g *Game, id string, n int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.inv.Consumables[id] += n
}

// ClearQuestsForTest advances currentQ past the end of g.quests so a subsequent
// combat victory skips the quest-reward branch entirely and only exercises the
// monster-XP distribution path. Exposed only for tests.
func ClearQuestsForTest(g *Game) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.currentQ = len(g.quests)
}

// SetPartyHPForTest sets a party member's CurrentHP to the given value without
// touching status. Exposed only for tests; use this when you need to put a
// character at exactly N HP for a deterministic combat scenario.
func SetPartyHPForTest(g *Game, idx, hp int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.party[idx].CurrentHP = hp
}

// MakeEnemiesLethalForTest cranks every active enemy's STR / WeaponPower /
// BareHandDamage to a value that guarantees a one-shot kill on any party
// member. Used to deterministically force a same-round caster death in
// regression tests for the revive sync-back code path.
func MakeEnemiesLethalForTest(g *Game) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, e := range g.enemies {
		e.STR = 9999
		e.WeaponPower = 9999
		e.BareHandDamage = 9999
		e.HitPct = 100
	}
}
