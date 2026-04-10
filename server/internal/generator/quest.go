package generator

// Quest grammar per Section 10.1: 9 primitive actions.
type ActionType string

const (
	ActionGoto   ActionType = "goto"
	ActionReport ActionType = "report"
	ActionLearn  ActionType = "learn"
	ActionGet    ActionType = "get"
	ActionGive   ActionType = "give"
	ActionKill   ActionType = "kill"
	ActionEscort ActionType = "escort"
	ActionDefend ActionType = "defend"
	ActionUse    ActionType = "use"
)

// QuestAction is one step in a quest sequence.
type QuestAction struct {
	Type     ActionType `json:"type"`
	Target   string     `json:"target"`   // node ID or item name
	Location string     `json:"location"` // node ID
	Detail   string     `json:"detail"`   // extra info for LLM
}

// Quest is a generated quest instance.
type Quest struct {
	ID           string        `json:"id"`
	TemplateID   string        `json:"template_id"`
	Name         string        `json:"name"`
	Description  string        `json:"description"` // from LLM or fallback
	Completion   string        `json:"completion"`  // completion message
	GiverNodeID  string        `json:"giver_node_id"`
	GiverName    string        `json:"giver_name"`
	TargetNodeID string        `json:"target_node_id"`
	TargetName   string        `json:"target_name"`
	Actions      []QuestAction `json:"actions"`
	Reward       QuestReward   `json:"reward"`
	Act          int           `json:"act"`
	IsPromotion  bool          `json:"is_promotion,omitempty"`
	IsSideQuest  bool          `json:"is_side_quest,omitempty"`
	Completed    bool          `json:"completed"`
}

type QuestReward struct {
	XP   int    `json:"xp"`
	Gold int    `json:"gold"`
	Item string `json:"item,omitempty"`
}

// QuestTemplate is a parameterized quest pattern per Section 10.3.
// Acts lists which acts a template is eligible for (GDD 10.3 matrix).
type QuestTemplate struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Actions []ActionType `json:"actions"`
	Acts    []int        `json:"acts"`
}

// Templates are the 6 v1 quest templates per issue scope (subset of GDD 10.3).
var Templates = []QuestTemplate{
	{
		ID:      "Q01",
		Name:    "Fetch",
		Actions: []ActionType{ActionGoto, ActionGet, ActionGoto, ActionGive},
		Acts:    []int{1, 2},
	},
	{
		ID:      "Q02",
		Name:    "Delivery",
		Actions: []ActionType{ActionGet, ActionGoto, ActionGive},
		Acts:    []int{1, 2},
	},
	{
		ID:      "Q03",
		Name:    "Investigation",
		Actions: []ActionType{ActionGoto, ActionLearn, ActionGoto, ActionReport},
		Acts:    []int{2, 3},
	},
	{
		ID:      "Q04",
		Name:    "Bandit Clearing",
		Actions: []ActionType{ActionGoto, ActionKill, ActionGoto, ActionReport},
		Acts:    []int{1, 2, 3},
	},
	{
		ID:      "Q05",
		Name:    "Lost Person",
		Actions: []ActionType{ActionLearn, ActionGoto, ActionEscort},
		Acts:    []int{1, 2},
	},
	{
		ID:      "Q12",
		Name:    "Boss",
		Actions: []ActionType{ActionGoto, ActionKill, ActionGoto, ActionReport},
		Acts:    []int{3},
	},
}

// DemoTemplates is kept as an alias for backwards compatibility with existing
// callers that may reference the old demo cut.
var DemoTemplates = Templates

// QuestTemplateByID returns a template by its ID, or nil if not found.
func QuestTemplateByID(id string) *QuestTemplate {
	for i := range Templates {
		if Templates[i].ID == id {
			return &Templates[i]
		}
	}
	return nil
}

// templatesForAct returns templates eligible for the given act.
func templatesForAct(act int) []QuestTemplate {
	var result []QuestTemplate
	for _, t := range Templates {
		for _, a := range t.Acts {
			if a == act {
				result = append(result, t)
				break
			}
		}
	}
	return result
}
