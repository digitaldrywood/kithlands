package generator

import (
	"fmt"
	"math/rand/v2"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// GenerateCampaign produces a full 3-act quest sequence per GDD Section 10.4:
//
//	Act 1   — 3-5 quests within 2 edges of spawn
//	Promotion (fixed story beat)
//	Act 2   — 4-6 quests at distance 3-4
//	Act 3   — 2-3 quests at distance 4-6
//	Boss    — final encounter
//
// A `sidePool` may be supplied to sprinkle surprise side quests per Section 16.
// Pass nil to skip side quests (tests or stripped builds).
//
// The total main-quest count lands in 11-16; side quests are trimmed so the
// total campaign size never exceeds `maxQuestsPerCampaign` (15 per issue #10).
func GenerateCampaign(loc *locality.Locality, spawnID string, rng *rand.Rand, sidePool []SideQuestEntry) []Quest {
	walk := locality.Walk(loc, spawnID)
	if walk.Spawn == nil {
		return nil
	}

	var quests []Quest
	idx := 0

	// Act 1: 3-5 close quests
	act1Count := 3 + rng.IntN(3)
	act1Templates := templatesForAct(1)
	for i := 0; i < act1Count; i++ {
		if len(act1Templates) == 0 {
			break
		}
		tmpl := act1Templates[rng.IntN(len(act1Templates))]
		quests = append(quests, instantiateQuest(tmpl, walk, loc, 1, idx, rng))
		idx++
	}

	// Promotion quest (fixed story beat)
	quests = append(quests, instantiatePromotionQuest(walk, loc, idx, rng))
	idx++

	// Act 2: 4-6 medium quests
	act2Count := 4 + rng.IntN(3)
	act2Templates := templatesForAct(2)
	for i := 0; i < act2Count; i++ {
		if len(act2Templates) == 0 {
			break
		}
		tmpl := act2Templates[rng.IntN(len(act2Templates))]
		quests = append(quests, instantiateQuest(tmpl, walk, loc, 2, idx, rng))
		idx++
	}

	// Act 3: 2-3 far quests
	act3Count := 2 + rng.IntN(2)
	act3Templates := templatesForAct(3)
	// Drop Q12 from Act 3 template picks — boss is appended separately.
	filtered := make([]QuestTemplate, 0, len(act3Templates))
	for _, t := range act3Templates {
		if t.ID != "Q12" {
			filtered = append(filtered, t)
		}
	}
	for i := 0; i < act3Count; i++ {
		if len(filtered) == 0 {
			break
		}
		tmpl := filtered[rng.IntN(len(filtered))]
		quests = append(quests, instantiateQuest(tmpl, walk, loc, 3, idx, rng))
		idx++
	}

	// Hard cap the main quest count before the boss. The act ranges above can
	// produce up to 5+1+6+3 = 15 quests; adding the boss would push to 16.
	// GDD 10.4 says 10-15 per campaign, so trim Act 2 (the fattest bucket)
	// until the main count leaves room for the boss.
	const maxQuestsPerCampaign = 15
	for len(quests)+1 > maxQuestsPerCampaign {
		// Drop the last Act 2 quest; fall back to last Act 3 if none.
		trimmed := false
		for i := len(quests) - 1; i >= 0; i-- {
			if quests[i].Act == 2 && !quests[i].IsPromotion {
				quests = append(quests[:i], quests[i+1:]...)
				trimmed = true
				break
			}
		}
		if !trimmed {
			for i := len(quests) - 1; i >= 0; i-- {
				if quests[i].Act == 3 {
					quests = append(quests[:i], quests[i+1:]...)
					trimmed = true
					break
				}
			}
		}
		if !trimmed {
			break
		}
	}

	// Boss
	quests = append(quests, instantiateBossQuest(walk, loc, idx, rng))

	// Side quests (surprise pool) — inserted before the boss so the boss stays last.
	if len(sidePool) > 0 {
		bossIdx := len(quests) - 1
		mainCount := len(quests)
		budget := maxQuestsPerCampaign - mainCount
		if budget > 0 {
			// Distribute: up to 1 side quest per act, capped by budget.
			sideQuests := make([]Quest, 0, budget)
			for _, act := range []int{1, 2, 3} {
				if len(sideQuests) >= budget {
					break
				}
				picks := selectSideQuests(sidePool, act, 1, rng)
				for _, p := range picks {
					if len(sideQuests) >= budget {
						break
					}
					q := instantiateSideQuest(p, walk, loc, idx, rng)
					if q.ID == "" {
						continue
					}
					sideQuests = append(sideQuests, q)
					idx++
				}
			}
			// Splice: keep main quests in order, insert side quests before boss.
			result := make([]Quest, 0, mainCount+len(sideQuests))
			result = append(result, quests[:bossIdx]...)
			result = append(result, sideQuests...)
			result = append(result, quests[bossIdx])
			quests = result
		}
	}

	return quests
}

func instantiateQuest(template QuestTemplate, walk *locality.WalkResult, loc *locality.Locality, act, idx int, rng *rand.Rand) Quest {
	targetNode := pickTargetNode(walk, act, rng)
	giverNode := pickGiverNode(walk)

	targetName := "the wilderness"
	targetID := ""
	if targetNode != nil {
		targetName = targetNode.Name
		targetID = targetNode.ID
	}

	giverID := ""
	giverName := "A stranger"
	if giverNode != nil {
		giverID = giverNode.ID
		giverName = giverNode.Name
	}

	itemHint := itemHintForTemplate(template.ID, rng)

	actions := buildActions(template, targetID, targetName, giverID, giverName, itemHint)

	desc, completion := fallbackDialogue(template.ID, giverName, targetName, itemHint, rng)

	xpReward := 50 * act
	goldReward := 30 * act

	return Quest{
		ID:           fmt.Sprintf("quest_%d", idx),
		TemplateID:   template.ID,
		Name:         fmt.Sprintf("%s: %s", template.Name, targetName),
		Description:  desc,
		Completion:   completion,
		GiverNodeID:  giverID,
		GiverName:    giverName,
		TargetNodeID: targetID,
		TargetName:   targetName,
		Actions:      actions,
		Reward:       QuestReward{XP: xpReward, Gold: goldReward},
		Act:          act,
	}
}

// instantiatePromotionQuest builds the fixed story-beat quest inserted between
// Act 1 and Act 2. Completing it is what flips `character.Promoted = true` in
// the game loop (see game_world.go / game_combat.go).
func instantiatePromotionQuest(walk *locality.WalkResult, loc *locality.Locality, idx int, rng *rand.Rand) Quest {
	// Prefer a medium-distance landmark for the trial; fall back to close, then spawn.
	var target *locality.Node
	switch {
	case len(walk.Medium) > 0:
		target = walk.Medium[rng.IntN(len(walk.Medium))]
	case len(walk.Close) > 0:
		target = walk.Close[rng.IntN(len(walk.Close))]
	default:
		target = walk.Spawn
	}

	targetName := "the ancient trial grounds"
	targetID := ""
	if target != nil {
		targetName = target.Name
		targetID = target.ID
	}

	giverName := "the elder"
	giverID := ""
	if g := pickGiverNode(walk); g != nil {
		giverName = g.Name
		giverID = g.ID
	}

	desc, completion := fallbackDialogue("promotion", giverName, targetName, "", rng)

	actions := []QuestAction{
		{Type: ActionGoto, Location: targetID, Detail: targetName},
		{Type: ActionKill, Target: "trial guardian", Location: targetID},
		{Type: ActionGoto, Location: giverID, Detail: giverName},
		{Type: ActionReport, Target: giverID, Detail: giverName},
	}

	return Quest{
		ID:           fmt.Sprintf("quest_promotion_%d", idx),
		TemplateID:   "promotion",
		Name:         fmt.Sprintf("Trial of Mastery: %s", targetName),
		Description:  desc,
		Completion:   completion,
		GiverNodeID:  giverID,
		GiverName:    giverName,
		TargetNodeID: targetID,
		TargetName:   targetName,
		Actions:      actions,
		Reward:       QuestReward{XP: 200, Gold: 100},
		Act:          1,
		IsPromotion:  true,
	}
}

// instantiateBossQuest builds the final Act 3 boss encounter.
func instantiateBossQuest(walk *locality.WalkResult, loc *locality.Locality, idx int, rng *rand.Rand) Quest {
	bossNode := walk.BigBad
	bossName := "the Dark Lord"
	bossID := ""
	if bossNode != nil {
		bossName = bossNode.Name
		bossID = bossNode.ID
	}

	spawnID := ""
	spawnName := loc.Name
	if walk.Spawn != nil {
		spawnID = walk.Spawn.ID
		spawnName = walk.Spawn.Name
	}

	giverName := "the town"
	giverID := spawnID
	if g := pickGiverNode(walk); g != nil {
		giverName = g.Name
		giverID = g.ID
	}

	desc, completion := fallbackDialogue("Q12", giverName, spawnName, bossName, rng)

	actions := []QuestAction{
		{Type: ActionGoto, Location: bossID, Detail: bossName},
		{Type: ActionKill, Target: "boss", Location: bossID},
		{Type: ActionGoto, Location: spawnID, Detail: spawnName},
		{Type: ActionReport, Target: spawnID, Detail: spawnName},
	}

	return Quest{
		ID:           fmt.Sprintf("quest_boss_%d", idx),
		TemplateID:   "Q12",
		Name:         fmt.Sprintf("Defeat %s", bossName),
		Description:  desc,
		Completion:   completion,
		GiverNodeID:  giverID,
		GiverName:    giverName,
		TargetNodeID: bossID,
		TargetName:   bossName,
		Actions:      actions,
		Reward:       QuestReward{XP: 500, Gold: 300},
		Act:          3,
	}
}

// pickTargetNode chooses an appropriate node for the quest's act. Falls back
// to the nearest tier available if the preferred tier is empty. Natural nodes
// are filtered out because the client only emits quest_advance via door/
// building interaction — a natural-node target would leave the quest
// uncompletable (issue #86).
func pickTargetNode(walk *locality.WalkResult, act int, rng *rand.Rand) *locality.Node {
	var tiers [][]*locality.Node
	switch act {
	case 1:
		tiers = [][]*locality.Node{walk.Close, walk.Medium, walk.Far}
	case 2:
		tiers = [][]*locality.Node{walk.Medium, walk.Close, walk.Far}
	case 3:
		tiers = [][]*locality.Node{walk.Far, walk.Medium, walk.Close}
	}
	for _, tier := range tiers {
		filtered := filterEnterableNodes(tier)
		if len(filtered) > 0 {
			return filtered[rng.IntN(len(filtered))]
		}
	}
	if walk.Spawn != nil && walk.Spawn.Kind != locality.NodeNatural {
		return walk.Spawn
	}
	return walk.Spawn
}

// filterEnterableNodes returns only nodes the player can actually enter via
// building/door interaction — i.e. excludes wilderness/natural nodes.
func filterEnterableNodes(nodes []*locality.Node) []*locality.Node {
	out := make([]*locality.Node, 0, len(nodes))
	for _, n := range nodes {
		if n == nil || n.Kind == locality.NodeNatural {
			continue
		}
		out = append(out, n)
	}
	return out
}

// pickGiverNode returns the first close-distance person node, falling back to
// any close node. Keeps the giver near the player's home base.
func pickGiverNode(walk *locality.WalkResult) *locality.Node {
	for _, n := range walk.Close {
		if n.Kind == locality.NodePerson {
			return n
		}
	}
	if len(walk.Close) > 0 {
		return walk.Close[0]
	}
	return walk.Spawn
}

// buildActions fills the action slots for a template given resolved
// giver/target identifiers.
func buildActions(template QuestTemplate, targetID, targetName, giverID, giverName, itemHint string) []QuestAction {
	actions := make([]QuestAction, 0, len(template.Actions))
	for _, aType := range template.Actions {
		action := QuestAction{Type: aType}
		switch aType {
		case ActionGoto:
			action.Location = targetID
			action.Detail = targetName
		case ActionKill:
			action.Target = "monsters"
			action.Location = targetID
		case ActionGet:
			action.Target = itemHint
			action.Location = targetID
		case ActionLearn:
			action.Target = itemHint
			action.Location = targetID
		case ActionGive, ActionReport:
			action.Target = giverID
			action.Detail = giverName
		case ActionEscort:
			action.Target = itemHint
			action.Location = giverID
			action.Detail = giverName
		}
		actions = append(actions, action)
	}
	return actions
}
