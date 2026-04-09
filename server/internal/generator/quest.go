package generator

// Quest grammar per Section 10.1: 9 primitive actions.
type ActionType string

const (
	ActionGoto    ActionType = "goto"
	ActionReport  ActionType = "report"
	ActionLearn   ActionType = "learn"
	ActionGet     ActionType = "get"
	ActionGive    ActionType = "give"
	ActionKill    ActionType = "kill"
	ActionEscort  ActionType = "escort"
	ActionDefend  ActionType = "defend"
	ActionUse     ActionType = "use"
)

// QuestAction is one step in a quest sequence.
type QuestAction struct {
	Type     ActionType `json:"type"`
	Target   string     `json:"target"`       // node ID or item name
	Location string     `json:"location"`      // node ID
	Detail   string     `json:"detail"`        // extra info for LLM
}

// Quest is a generated quest instance.
type Quest struct {
	ID          string        `json:"id"`
	TemplateID  string        `json:"template_id"`
	Name        string        `json:"name"`
	Description string        `json:"description"` // from LLM or fallback
	Completion  string        `json:"completion"`  // completion message
	GiverNodeID string        `json:"giver_node_id"`
	Actions     []QuestAction `json:"actions"`
	Reward      QuestReward   `json:"reward"`
	Act         int           `json:"act"`
	Completed   bool          `json:"completed"`
}

type QuestReward struct {
	XP   int    `json:"xp"`
	Gold int    `json:"gold"`
	Item string `json:"item,omitempty"`
}

// QuestTemplate is a parameterized quest pattern per Section 10.3.
type QuestTemplate struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Actions []ActionType `json:"actions"`
	Act     int          `json:"act"` // which act this template works for
}

// Demo cut templates: Fetch, Bandit clearing, Boss
var DemoTemplates = []QuestTemplate{
	{
		ID:      "Q01",
		Name:    "Fetch",
		Actions: []ActionType{ActionGoto, ActionGet, ActionGoto, ActionGive},
		Act:     1,
	},
	{
		ID:      "Q04",
		Name:    "Bandit Clearing",
		Actions: []ActionType{ActionGoto, ActionKill, ActionGoto, ActionReport},
		Act:     1,
	},
	{
		ID:      "Q12",
		Name:    "Boss",
		Actions: []ActionType{ActionGoto, ActionKill, ActionGoto, ActionReport},
		Act:     3,
	},
}
