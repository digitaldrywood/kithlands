package gamedata

import "fmt"

func (gd *GameData) validateDungeons() {
	for _, d := range gd.Dungeons {
		if d.Payoff.ItemID != "" && !gd.validChestItemID(d.Payoff.ItemID) {
			panic(fmt.Sprintf("gamedata: adventure %s payoff unknown", d.ID))
		}
		for _, r := range d.Rooms {
			for _, a := range r.Actions {
				if a.Reward != nil && a.Reward.ItemID != "" && !gd.validChestItemID(a.Reward.ItemID) {
					panic(fmt.Sprintf("gamedata: adventure action %s reward unknown", a.ID))
				}
				if a.Encounter != nil {
					for _, id := range append(append([]string{}, a.Encounter.Monsters...), a.Encounter.FullParty...) {
						if gd.MonsterByID(id) == nil {
							panic(fmt.Sprintf("gamedata: adventure action %s monster %s unknown", a.ID, id))
						}
					}
				}
			}
		}
	}
}
