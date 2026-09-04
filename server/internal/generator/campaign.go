package generator

import (
	"fmt"
	"math/rand/v2"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

const RequiredCampaignQuestCount = 12

// GenerateCampaign produces the required 3-act quest sequence per GDD Section
// 10.4. The demo campaign deliberately contains twelve story beats:
//
//	Act 1   — 3 quests within 2 edges of spawn
//	Promotion (fixed story beat)
//	Act 2   — 4 quests at distance 3-4
//	Act 3   — 3 quests at distance 4-6
//	Boss    — final encounter
//
// Optional content has its own state machines and must never be inserted into
// this ordered slice: currentQ, promotion, transport, and Q12 all describe the
// required route only.
func GenerateCampaign(loc *locality.Locality, spawnID string, rng *rand.Rand, config CampaignConfig) []Quest {
	walk := locality.Walk(loc, spawnID)
	if walk.Spawn == nil {
		return nil
	}

	var quests []Quest
	idx := 0

	// Act 1: three close quests.
	act1 := config.Act(1)
	act1Templates := templatesForAct(1)
	for i := 0; i < act1.QuestCount; i++ {
		if len(act1Templates) == 0 {
			break
		}
		tmpl := act1Templates[rng.IntN(len(act1Templates))]
		quests = append(quests, instantiateQuest(tmpl, walk, loc, 1, idx, rng, act1.Reward))
		idx++
	}

	// Promotion quest (fixed story beat)
	quests = append(quests, instantiatePromotionQuest(walk, loc, idx, rng, config.PromotionReward))
	idx++

	// Act 2: four medium quests.
	act2 := config.Act(2)
	act2Templates := templatesForAct(2)
	for i := 0; i < act2.QuestCount; i++ {
		if len(act2Templates) == 0 {
			break
		}
		tmpl := act2Templates[rng.IntN(len(act2Templates))]
		quests = append(quests, instantiateQuest(tmpl, walk, loc, 2, idx, rng, act2.Reward))
		idx++
	}

	// Act 3: three far quests.
	act3 := config.Act(3)
	act3Templates := templatesForAct(3)
	// Drop Q12 from Act 3 template picks — boss is appended separately.
	filtered := make([]QuestTemplate, 0, len(act3Templates))
	for _, t := range act3Templates {
		if t.ID != "Q12" {
			filtered = append(filtered, t)
		}
	}
	for i := 0; i < act3.QuestCount; i++ {
		if len(filtered) == 0 {
			break
		}
		tmpl := filtered[rng.IntN(len(filtered))]
		quests = append(quests, instantiateQuest(tmpl, walk, loc, 3, idx, rng, act3.Reward))
		idx++
	}

	// Boss
	quests = append(quests, instantiateBossQuest(walk, loc, idx, rng))

	return quests
}

func instantiateQuest(template QuestTemplate, walk *locality.WalkResult, loc *locality.Locality, act, idx int, rng *rand.Rand, reward QuestReward) Quest {
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
		Reward:       reward,
		Act:          act,
	}
}

// instantiatePromotionQuest builds the FF1/DQ3-style promotion story beat: a
// named giver sends the party to a trial dungeon, where a scripted guardian
// drops a proof item that must be turned in to the giver before the promotion
// offer fires. Quest progression is driven by three `promo_stage` values,
// see server/api/game_world.go for the stage machine.
func instantiatePromotionQuest(walk *locality.WalkResult, loc *locality.Locality, idx int, rng *rand.Rand, reward QuestReward) Quest {
	dungeon := pickDungeonNode(walk, rng)

	dungeonName := "the ancient trial grounds"
	dungeonID := ""
	if dungeon != nil {
		dungeonName = dungeon.Name
		dungeonID = dungeon.ID
	}

	giverName := "the elder"
	giverID := ""
	if g := pickPromotionGiverNode(walk, dungeonID); g != nil {
		giverName = g.Name
		giverID = g.ID
	}

	desc, completion := fallbackDialogue("promotion", giverName, dungeonName, "", rng)

	actions := []QuestAction{
		{Type: ActionGoto, Location: giverID, Detail: giverName},
		{Type: ActionGoto, Location: dungeonID, Detail: dungeonName},
		{Type: ActionKill, Target: "trial_guardian", Location: dungeonID},
		{Type: ActionGet, Target: "proof_of_courage", Location: dungeonID},
		{Type: ActionGoto, Location: giverID, Detail: giverName},
		{Type: ActionReport, Target: giverID, Detail: giverName},
	}

	// Stage 0: HUD points at the giver so the player learns about the trial.
	return Quest{
		ID:            fmt.Sprintf("quest_promotion_%d", idx),
		TemplateID:    "promotion",
		Name:          fmt.Sprintf("Trial of Mastery: %s", dungeonName),
		Description:   desc,
		Completion:    completion,
		GiverNodeID:   giverID,
		GiverName:     giverName,
		TargetNodeID:  giverID, // stage 0 objective: seek the giver
		TargetName:    giverName,
		DungeonNodeID: dungeonID,
		DungeonName:   dungeonName,
		ProofItemID:   "proof_of_courage",
		BossMonsterID: "trial_guardian",
		PromoStage:    0,
		Actions:       actions,
		Reward:        reward,
		Act:           1,
		IsPromotion:   true,
	}
}

// pickDungeonNode prefers nodes tagged "dungeon" at medium distance, then
// close, then far. Falls back to the first enterable medium/close landmark if
// no dungeon-tagged node exists.
func pickDungeonNode(walk *locality.WalkResult, rng *rand.Rand) *locality.Node {
	for _, tier := range [][]*locality.Node{walk.Medium, walk.Close, walk.Far} {
		var dungeons []*locality.Node
		for _, n := range tier {
			if n == nil || n.Kind == locality.NodeNatural {
				continue
			}
			for _, tag := range n.Tags {
				if tag == "dungeon" {
					dungeons = append(dungeons, n)
					break
				}
			}
		}
		if len(dungeons) > 0 {
			return dungeons[rng.IntN(len(dungeons))]
		}
	}
	// Fallback: any enterable medium/close/far node, in that order.
	for _, tier := range [][]*locality.Node{walk.Medium, walk.Close, walk.Far} {
		filtered := filterEnterableNodes(tier)
		if len(filtered) > 0 {
			return filtered[rng.IntN(len(filtered))]
		}
	}
	return walk.Spawn
}

// pickPromotionGiverNode returns a giver distinct from the trial dungeon so
// the quest has real travel between stages. Prefers person nodes close to
// spawn; falls back to any close node that isn't the dungeon.
func pickPromotionGiverNode(walk *locality.WalkResult, dungeonID string) *locality.Node {
	for _, n := range walk.Close {
		if n == nil || n.ID == dungeonID {
			continue
		}
		if n.Kind == locality.NodePerson {
			return n
		}
	}
	for _, n := range walk.Close {
		if n == nil || n.ID == dungeonID {
			continue
		}
		return n
	}
	if walk.Spawn != nil && walk.Spawn.ID != dungeonID {
		return walk.Spawn
	}
	return pickGiverNode(walk)
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
