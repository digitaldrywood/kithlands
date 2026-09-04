package gamedata

import "fmt"

// FinalEncounter is authored campaign content, separate from promotion and
// optional dungeons. It uses the ordinary monster and combat contracts.
type FinalEncounter struct {
	ID                string   `json:"id"`
	QuestTemplateID   string   `json:"quest_template_id"`
	Title             string   `json:"title"`
	QuestName         string   `json:"quest_name"`
	Description       string   `json:"description"`
	Objective         string   `json:"objective"`
	Arrival           string   `json:"arrival"`
	Defeat            string   `json:"defeat"`
	Flee              string   `json:"flee"`
	Conclusion        string   `json:"conclusion"`
	EndingTitle       string   `json:"ending_title"`
	GuardLevel        int      `json:"guard_level"`
	Level             int      `json:"level"`
	Monsters          []string `json:"monsters"`
	FullPartyMonsters []string `json:"full_party_monsters"`
	Formation         string   `json:"formation"`
	BattleBackground  string   `json:"battle_background"`
	Reward            struct {
		XP   int `json:"xp"`
		Gold int `json:"gold"`
	} `json:"reward"`
}

func (gd *GameData) validateFinalEncounter() {
	d := gd.FinalEncounter
	if d.ID == "" || d.QuestTemplateID != "Q12" || d.Level < 1 || d.GuardLevel < 1 || d.Title == "" || d.Objective == "" || d.Conclusion == "" || len(d.Monsters) == 0 || len(d.FullPartyMonsters) == 0 || d.Reward.XP < 0 || d.Reward.Gold < 0 {
		panic("gamedata: invalid final encounter")
	}
	for _, ids := range [][]string{d.Monsters, d.FullPartyMonsters} {
		boss := false
		for _, id := range ids {
			m := gd.MonsterByID(id)
			if m == nil {
				panic(fmt.Sprintf("gamedata: final encounter monster %q missing", id))
			}
			boss = boss || m.ID == d.ID && m.IsBoss && m.EncounterWeight == 0
		}
		if !boss {
			panic("gamedata: final encounter requires its authored boss")
		}
	}
}
