package generator

import (
	"fmt"
	"strconv"
)

// CampaignConfig is the shared-data pacing contract for the required route.
// Optional quests intentionally live outside it and cannot affect these gates.
type CampaignConfig struct {
	RequiredQuestCount int                          `json:"required_quest_count"`
	Acts               map[string]CampaignActConfig `json:"acts"`
	PromotionReward    QuestReward                  `json:"promotion_reward"`
}

type CampaignActConfig struct {
	QuestCount int         `json:"quest_count"`
	Reward     QuestReward `json:"reward"`
}

func (c CampaignConfig) Act(number int) CampaignActConfig {
	return c.Acts[strconv.Itoa(number)]
}

func (c CampaignConfig) Validate() error {
	if c.RequiredQuestCount != RequiredCampaignQuestCount {
		return fmt.Errorf("campaign required_quest_count = %d, want %d", c.RequiredQuestCount, RequiredCampaignQuestCount)
	}
	total := 2 // promotion and Q12
	for act := 1; act <= 3; act++ {
		config, ok := c.Acts[strconv.Itoa(act)]
		if !ok || config.QuestCount < 1 {
			return fmt.Errorf("campaign act %d needs a positive quest_count", act)
		}
		if config.Reward.XP <= 0 || config.Reward.Gold < 0 {
			return fmt.Errorf("campaign act %d has invalid reward", act)
		}
		total += config.QuestCount
	}
	if total != c.RequiredQuestCount {
		return fmt.Errorf("campaign act counts plus promotion and Q12 total %d, want %d", total, c.RequiredQuestCount)
	}
	if c.PromotionReward.XP <= 0 || c.PromotionReward.Gold < 0 {
		return fmt.Errorf("campaign promotion has invalid reward")
	}
	return nil
}
