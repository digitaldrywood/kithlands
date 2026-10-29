package gamedata

import "fmt"

func (gd *GameData) validateDungeons() {
	for _, d := range gd.Dungeons {
		if d.Payoff.ItemID != "" && !gd.validChestItemID(d.Payoff.ItemID) {
			panic(fmt.Sprintf("gamedata: adventure %s payoff unknown", d.ID))
		}
		gd.validateRewardMaterials(d.Payoff.Materials)
		for _, r := range d.Rooms {
			for _, a := range r.Actions {
				if a.Reward != nil && a.Reward.ItemID != "" && !gd.validChestItemID(a.Reward.ItemID) {
					panic(fmt.Sprintf("gamedata: adventure action %s reward unknown", a.ID))
				}
				if a.Reward != nil {
					gd.validateRewardMaterials(a.Reward.Materials)
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

func (gd *GameData) validateRewardMaterials(materials map[string]int) {
	for id, count := range materials {
		if gd.CraftMaterialByID(id) == nil || count <= 0 || count > 100 {
			panic(fmt.Sprintf("gamedata: invalid adventure material reward %q", id))
		}
	}
}
