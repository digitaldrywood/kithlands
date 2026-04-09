package generator

import (
	"fmt"
	"math/rand/v2"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// GenerateCampaign creates a quest sequence from a locality and spawn point.
// Demo cut: 5 quests (2 act-1, 2 act-2, 1 boss) per Section 18.3.
func GenerateCampaign(loc *locality.Locality, spawnID string, rng *rand.Rand) []Quest {
	walk := locality.Walk(loc, spawnID)
	if walk.Spawn == nil {
		return nil
	}

	var quests []Quest

	// Act 1: 2 quests from close nodes
	for i := 0; i < 2 && i < len(DemoTemplates)-1; i++ {
		template := DemoTemplates[i%2] // alternate Fetch / Bandit
		quest := instantiateQuest(template, walk, loc, 1, i, rng)
		quests = append(quests, quest)
	}

	// Act 2: 2 quests from medium nodes (or close if not enough)
	for i := 0; i < 2; i++ {
		template := DemoTemplates[i%2]
		quest := instantiateQuest(template, walk, loc, 2, i+2, rng)
		quests = append(quests, quest)
	}

	// Boss quest
	bossTemplate := DemoTemplates[2] // Q12 Boss
	bossQuest := instantiateBossQuest(bossTemplate, walk, loc, rng)
	quests = append(quests, bossQuest)

	return quests
}

func instantiateQuest(template QuestTemplate, walk *locality.WalkResult, loc *locality.Locality, act, idx int, rng *rand.Rand) Quest {
	// Pick target location based on act
	var targetNodes []*locality.Node
	switch act {
	case 1:
		targetNodes = walk.Close
	case 2:
		targetNodes = walk.Medium
		if len(targetNodes) == 0 {
			targetNodes = walk.Close
		}
	}

	var targetNode *locality.Node
	if len(targetNodes) > 0 {
		targetNode = targetNodes[rng.IntN(len(targetNodes))]
	}

	// Pick a giver from close nodes
	var giverNode *locality.Node
	for _, n := range walk.Close {
		if n.Kind == locality.NodePerson {
			giverNode = n
			break
		}
	}
	if giverNode == nil && len(walk.Close) > 0 {
		giverNode = walk.Close[0]
	}

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

	// Build quest actions
	var actions []QuestAction
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
			action.Target = "lost relic"
			action.Location = targetID
		case ActionGive, ActionReport:
			action.Target = giverID
			action.Detail = giverName
		}
		actions = append(actions, action)
	}

	xpReward := 50 * act
	goldReward := 30 * act

	return Quest{
		ID:          fmt.Sprintf("quest_%d", idx),
		TemplateID:  template.ID,
		Name:        fmt.Sprintf("%s: %s", template.Name, targetName),
		Description: fmt.Sprintf("%s needs your help at %s.", giverName, targetName),
		Completion:  fmt.Sprintf("You completed the task. %s is grateful.", giverName),
		GiverNodeID: giverID,
		Actions:     actions,
		Reward:      QuestReward{XP: xpReward, Gold: goldReward},
		Act:         act,
	}
}

func instantiateBossQuest(template QuestTemplate, walk *locality.WalkResult, loc *locality.Locality, rng *rand.Rand) Quest {
	bossNode := walk.BigBad
	bossName := "the Dark Lord"
	bossID := ""
	if bossNode != nil {
		bossName = bossNode.Name
		bossID = bossNode.ID
	}

	actions := []QuestAction{
		{Type: ActionGoto, Location: bossID, Detail: bossName},
		{Type: ActionKill, Target: "boss", Location: bossID},
		{Type: ActionGoto, Location: walk.Spawn.ID, Detail: walk.Spawn.Name},
		{Type: ActionReport, Target: walk.Spawn.ID, Detail: walk.Spawn.Name},
	}

	return Quest{
		ID:          "quest_boss",
		TemplateID:  template.ID,
		Name:        fmt.Sprintf("Defeat %s", bossName),
		Description: fmt.Sprintf("The shadow of %s looms over %s. End this.", bossName, loc.Name),
		Completion:  fmt.Sprintf("%s has fallen. %s is free.", bossName, loc.Name),
		GiverNodeID: walk.Spawn.ID,
		Actions:     actions,
		Reward:      QuestReward{XP: 500, Gold: 300},
		Act:         3,
	}
}
