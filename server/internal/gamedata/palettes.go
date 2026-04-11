package gamedata

// Palettes is the tier-to-color configuration consumed by the sprites
// composition layer. Keys are item tiers (1..N); values are hex color
// strings including the leading '#'. A missing tier entry means "no
// accent" and the client should render the base sprite unchanged.
type Palettes struct {
	WeaponTiers map[int]string `json:"weapon_tiers"`
	ArmorTiers  map[int]string `json:"armor_tiers"`
}
