package api

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/digitaldrywood/kithlands/internal/character"
	"github.com/digitaldrywood/kithlands/internal/inventory"
	"github.com/google/uuid"
)

const EquipmentBuildLimit = 3

// Build previews contain current item views, never persisted stat snapshots.
type EquipmentBuildPreview struct {
	BuildID          string                 `json:"build_id"`
	Name             string                 `json:"name"`
	PartySlot        int                    `json:"party_slot"`
	CharacterName    string                 `json:"character_name"`
	Slots            []EquipmentBuildSlot   `json:"slots"`
	Changes          []EquipmentBuildChange `json:"changes"`
	Reasons          []string               `json:"reasons"`
	RequiresTransfer bool                   `json:"requires_transfer"`
	Token            string                 `json:"token,omitempty"`
}

type EquipmentBuildSlot struct {
	SlotID   string     `json:"slot_id"`
	SlotName string     `json:"slot_name"`
	Item     *ItemState `json:"item,omitempty"`
}

type EquipmentBuildChange struct {
	PartySlot     int        `json:"party_slot"`
	CharacterName string     `json:"character_name"`
	SlotID        string     `json:"slot_id"`
	SlotName      string     `json:"slot_name"`
	From          *ItemState `json:"from,omitempty"`
	To            *ItemState `json:"to,omitempty"`
}

func (g *Game) checkEquipmentBuildMemberLocked(partySlot int) error {
	if partySlot < 0 || partySlot >= len(g.party) || partySlot >= len(g.inv.Equipment) || g.party[partySlot] == nil {
		return fmt.Errorf("invalid party slot")
	}
	return g.checkEquipmentMutationLocked()
}

func (g *Game) SaveEquipmentBuild(partySlot int, id, name string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.checkEquipmentBuildMemberLocked(partySlot); err != nil {
		return err
	}
	name = strings.TrimSpace(name)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 32 {
		return fmt.Errorf("build name must contain 1–32 characters")
	}
	for _, r := range name {
		if (!unicode.IsGraphic(r) || unicode.IsSpace(r) && r != ' ') || strings.ContainsRune("<>", r) {
			return fmt.Errorf("build name must be plain text on one line")
		}
	}
	builds := g.inv.EquipmentBuilds[partySlot]
	index := slices.IndexFunc(builds, func(b inventory.EquipmentBuild) bool { return b.ID == id })
	if id != "" && index < 0 {
		return fmt.Errorf("saved build not found; refresh the character sheet")
	}
	for _, b := range builds {
		if b.ID != id && strings.EqualFold(b.Name, name) {
			return fmt.Errorf("a build named %q already exists; choose another name", name)
		}
	}
	if index < 0 && len(builds) >= EquipmentBuildLimit {
		return fmt.Errorf("each character can keep at most %d builds; delete or overwrite one first", EquipmentBuildLimit)
	}
	build := inventory.EquipmentBuild{ID: id, Name: name, Slots: make(map[string]inventory.EquippedItemRef)}
	if build.ID == "" {
		build.ID = uuid.NewString()
	}
	for _, slot := range g.gd.Items.EquipmentSlots {
		build.Slots[slot.ID] = g.inv.Equipment[partySlot].Equipped(slot.ID)
	}
	if index < 0 {
		builds = append(builds, build)
	} else {
		builds[index] = build
	}
	g.inv.EquipmentBuilds[partySlot] = builds
	return nil
}

func (g *Game) DeleteEquipmentBuild(partySlot int, id string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if err := g.checkEquipmentBuildMemberLocked(partySlot); err != nil {
		return err
	}
	builds := g.inv.EquipmentBuilds[partySlot]
	index := slices.IndexFunc(builds, func(b inventory.EquipmentBuild) bool { return b.ID == id })
	if index < 0 {
		return fmt.Errorf("saved build not found; refresh the character sheet")
	}
	g.inv.EquipmentBuilds[partySlot] = slices.Delete(builds, index, index+1)
	return nil
}

func (g *Game) PreviewEquipmentBuild(partySlot int, id string) (EquipmentBuildPreview, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	preview, _, err := g.planEquipmentBuildLocked(partySlot, id)
	return preview, err
}

func (g *Game) ApplyEquipmentBuild(partySlot int, id, token string, confirmTransfer bool) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	preview, working, err := g.planEquipmentBuildLocked(partySlot, id)
	if err != nil {
		return err
	}
	if len(preview.Reasons) > 0 {
		return fmt.Errorf("cannot apply build: %s", strings.Join(preview.Reasons, "; "))
	}
	if token == "" || token != preview.Token {
		return fmt.Errorf("this preview is stale; preview the build again before applying")
	}
	if preview.RequiresTransfer && !confirmTransfer {
		return fmt.Errorf("review and confirm the item transfers from other party members")
	}
	g.inv = working
	return nil
}

func (g *Game) buildItemView(ref inventory.EquippedItemRef) *ItemState {
	if ref.ItemID == "" && ref.InstanceID == "" {
		return nil
	}
	candidate, err := g.recommendationCandidateForRef(ref, "", "balanced")
	if err == nil {
		return &candidate.state
	}
	// Keep unavailable intentions visible without pretending they are owned.
	name := ref.ItemID
	if base := g.gd.EquipmentBaseByID(ref.ItemID); base != nil {
		name = base.Name
	}
	return &ItemState{Name: name, ID: ref.ItemID, InstanceID: ref.InstanceID}
}

func (g *Game) planEquipmentBuildLocked(partySlot int, id string) (EquipmentBuildPreview, *inventory.Inventory, error) {
	if err := g.checkEquipmentBuildMemberLocked(partySlot); err != nil {
		return EquipmentBuildPreview{}, nil, err
	}
	builds := g.inv.EquipmentBuilds[partySlot]
	index := slices.IndexFunc(builds, func(b inventory.EquipmentBuild) bool { return b.ID == id })
	if index < 0 {
		return EquipmentBuildPreview{}, nil, fmt.Errorf("saved build not found; refresh the character sheet")
	}
	build := builds[index]
	member := g.party[partySlot]
	preview := EquipmentBuildPreview{BuildID: id, Name: build.Name, PartySlot: partySlot, CharacterName: member.Name, Reasons: []string{}, Changes: []EquipmentBuildChange{}}
	slots := slices.Clone(g.gd.Items.EquipmentSlots)
	sort.SliceStable(slots, func(i, j int) bool { return slots[i].Order < slots[j].Order })
	unknown := []string{}
	for slot := range build.Slots {
		if g.gd.EquipmentSlotByID(slot) == nil {
			unknown = append(unknown, slot)
		}
	}
	slices.Sort(unknown)
	for _, slot := range unknown {
		preview.Reasons = append(preview.Reasons, fmt.Sprintf("slot %q no longer exists; delete this build and save current gear", slot))
	}
	seen := make(map[string]bool)
	candidates := make(map[string]recommendationCandidate)
	for _, slot := range slots {
		ref := build.Slots[slot.ID]
		item := g.buildItemView(ref)
		preview.Slots = append(preview.Slots, EquipmentBuildSlot{SlotID: slot.ID, SlotName: slot.Name, Item: item})
		if item == nil {
			continue
		}
		reason := ""
		if ref.InstanceID != "" {
			instance := g.inv.Instance(ref.InstanceID)
			if seen[ref.InstanceID] {
				reason = "the same item is referenced twice; delete this build and save current gear"
			}
			seen[ref.InstanceID] = true
			if instance == nil {
				reason = "item is missing or sold; recover it, or delete this build and save current gear"
			} else {
				// Instance identity wins over the saved base-ID display hint:
				// an upgrade of this same instance follows the build.
				ref.ItemID = instance.BaseID
			}
		}
		candidate, err := g.recommendationCandidateForRef(ref, "", "balanced")
		if ref.InstanceID == "" && err == nil {
			candidate.inventoryKey = equipmentStateID(candidate.category, ref.ItemID)
		}
		if reason == "" && err != nil {
			reason = err.Error()
		}
		if reason == "" && !g.recommendationCandidateFits(candidate, slot, member.ClassID, member.Level) {
			reason = fmt.Sprintf("not eligible for %s at level %d in this slot; check class and required level", member.Name, member.Level)
		}
		if reason != "" {
			preview.Reasons = append(preview.Reasons, fmt.Sprintf("%s · %s: %s", slot.Name, item.Name, reason))
			continue
		}
		candidates[slot.ID] = candidate
	}
	if len(preview.Reasons) > 0 {
		return preview, nil, nil
	}
	working := g.inv.Clone()
	// Clear first so ring swaps and static quantities are independent of slot order.
	for _, slot := range slots {
		ref := working.Equipment[partySlot].Equipped(slot.ID)
		if ref.ItemID == "" {
			continue
		}
		if ref.InstanceID == "" && g.gd.EquipmentBaseByID(ref.ItemID) == nil {
			preview.Reasons = append(preview.Reasons, fmt.Sprintf("%s contains unknown legacy gear; delete this build and save current gear", slot.Name))
			continue
		}
		if _, err := working.UnequipAt(partySlot, slot.ID, g.gd); err != nil {
			return preview, nil, err
		}
		returnRecommendedStaticToInventory(working, ref, g.gd)
	}
	for _, slot := range slots {
		candidate, ok := candidates[slot.ID]
		if !ok {
			continue
		}
		var err error
		if candidate.instanceID != "" {
			_, err = working.EquipInstanceAt(partySlot, slot.ID, candidate.instanceID, member.ClassID, member.Level, g.gd)
		} else {
			err = equipRecommendedStatic(working, partySlot, slot.ID, candidate, member.ClassID, g.gd)
		}
		if err != nil {
			preview.Reasons = append(preview.Reasons, fmt.Sprintf("%s · %s: %s; recover the item, or delete this build and save current gear", slot.Name, candidate.state.Name, err))
		}
	}
	if len(preview.Reasons) > 0 {
		return preview, nil, nil
	}
	for party, character := range g.party {
		if character == nil {
			continue
		}
		for _, slot := range slots {
			before := g.inv.Equipment[party].Equipped(slot.ID)
			after := working.Equipment[party].Equipped(slot.ID)
			if before == after {
				continue
			}
			preview.Changes = append(preview.Changes, EquipmentBuildChange{PartySlot: party, CharacterName: character.Name, SlotID: slot.ID, SlotName: slot.Name, From: g.buildItemView(before), To: g.buildItemView(after)})
			if party != partySlot {
				preview.RequiresTransfer = true
			}
		}
	}
	// Conservatively bind the review to inventory, eligibility, phase and resolved
	// item views. Socket/recipe changes invalidate a review but keep build identity.
	payload, err := json.Marshal(struct {
		Inventory *inventory.Inventory
		Party     []*character.Character
		Phase     string
		Preview   EquipmentBuildPreview
	}{g.inv, g.party, g.phase, preview})
	if err != nil {
		return preview, nil, fmt.Errorf("fingerprinting build preview: %w", err)
	}
	preview.Token = fmt.Sprintf("%x", sha256.Sum256(payload))
	return preview, working, nil
}
