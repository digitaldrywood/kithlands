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

// RevivePartyMemberForTest simulates a mid-combat revive (Phoenix Down, raise
// spell, etc.) by setting the member to 1 HP with no status. The in-game
// Phoenix Down path at game_combat.go:112 has a sync-back bug that overwrites
// this mutation from the combatants snapshot; tests that only need to verify
// "alive at victory gets XP" should use this helper to bypass it.
func RevivePartyMemberForTest(g *Game, idx int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.party[idx].CurrentHP = 1
	g.party[idx].Status = character.StatusNone
}

// ClearQuestsForTest advances currentQ past the end of g.quests so a subsequent
// combat victory skips the quest-reward branch entirely and only exercises the
// monster-XP distribution path. Exposed only for tests.
func ClearQuestsForTest(g *Game) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.currentQ = len(g.quests)
}
