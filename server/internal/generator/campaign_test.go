package generator

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// testLocality builds a minimal but walkable locality with enough close,
// medium, and far nodes to exercise the 3-act generator. The graph is a
// linear chain so distances are predictable: spawn -> c1 -> c2 -> m1 -> m2
// -> f1 -> f2. m2 is tagged "dungeon" so the promotion quest has a valid
// trial target.
func testLocality(t *testing.T) *locality.Locality {
	t.Helper()
	loc := &locality.Locality{
		ID:   "test_loc",
		Name: "Testburg",
		Nodes: []locality.Node{
			{ID: "spawn", Kind: locality.NodePlace, Name: "Town Square", Importance: 10},
			{ID: "c1", Kind: locality.NodePerson, Name: "Baker", Importance: 5},
			{ID: "c2", Kind: locality.NodePlace, Name: "Old Mill", Importance: 15},
			{ID: "m1", Kind: locality.NodePlace, Name: "Crossroads", Importance: 20},
			{ID: "m2", Kind: locality.NodeLandmark, Name: "Stone Circle", Tags: []string{"dungeon"}, Importance: 30},
			{ID: "f1", Kind: locality.NodePlace, Name: "Old Ruins", Importance: 40},
			{ID: "f2", Kind: locality.NodeLandmark, Name: "Dark Tower", Importance: 80},
		},
		Edges: []locality.Edge{
			{From: "spawn", To: "c1", Kind: locality.EdgeProximity},
			{From: "c1", To: "c2", Kind: locality.EdgeProximity},
			{From: "c2", To: "m1", Kind: locality.EdgeProximity},
			{From: "m1", To: "m2", Kind: locality.EdgeProximity},
			{From: "m2", To: "f1", Kind: locality.EdgeProximity},
			{From: "f1", To: "f2", Kind: locality.EdgeProximity},
		},
	}
	return loc
}

func newRng(seed uint64) *rand.Rand {
	return rand.New(rand.NewPCG(seed, 0))
}

func testCampaignConfig() CampaignConfig {
	return CampaignConfig{
		RequiredQuestCount: RequiredCampaignQuestCount,
		Acts: map[string]CampaignActConfig{
			"1": {QuestCount: 3, Reward: QuestReward{XP: 120, Gold: 30}},
			"2": {QuestCount: 4, Reward: QuestReward{XP: 240, Gold: 60}},
			"3": {QuestCount: 3, Reward: QuestReward{XP: 360, Gold: 90}},
		},
		PromotionReward: QuestReward{XP: 480, Gold: 100},
	}
}

func TestCampaignConfigValidate(t *testing.T) {
	config := testCampaignConfig()
	if err := config.Validate(); err != nil {
		t.Fatalf("valid campaign config: %v", err)
	}

	config.Acts["2"] = CampaignActConfig{QuestCount: 5, Reward: QuestReward{XP: 240, Gold: 60}}
	if err := config.Validate(); err == nil {
		t.Fatal("expected mismatched act counts to fail validation")
	}
}

func TestGenerateCampaign_QuestCount(t *testing.T) {
	loc := testLocality(t)

	// Three Act 1 + promotion + four Act 2 + three Act 3 + Q12.
	for seed := uint64(1); seed <= 50; seed++ {
		rng := newRng(seed)
		quests := GenerateCampaign(loc, "spawn", rng, testCampaignConfig())
		if len(quests) != RequiredCampaignQuestCount {
			t.Errorf("seed %d: expected %d required quests, got %d", seed, RequiredCampaignQuestCount, len(quests))
		}
	}
}

func TestGenerateCampaign_PromotionQuestHasTrialFields(t *testing.T) {
	loc := testLocality(t)
	for seed := uint64(1); seed <= 20; seed++ {
		rng := newRng(seed)
		quests := GenerateCampaign(loc, "spawn", rng, testCampaignConfig())
		var promo *Quest
		for i := range quests {
			if quests[i].IsPromotion {
				promo = &quests[i]
				break
			}
		}
		if promo == nil {
			t.Fatalf("seed %d: no promotion quest generated", seed)
		}
		if promo.GiverNodeID == "" {
			t.Errorf("seed %d: promotion quest missing GiverNodeID", seed)
		}
		if promo.DungeonNodeID == "" {
			t.Errorf("seed %d: promotion quest missing DungeonNodeID", seed)
		}
		if promo.GiverNodeID == promo.DungeonNodeID {
			t.Errorf("seed %d: promotion giver and dungeon are the same node %q", seed, promo.GiverNodeID)
		}
		if promo.ProofItemID != "proof_of_courage" {
			t.Errorf("seed %d: ProofItemID = %q, want proof_of_courage", seed, promo.ProofItemID)
		}
		if promo.BossMonsterID != "trial_guardian" {
			t.Errorf("seed %d: BossMonsterID = %q, want trial_guardian", seed, promo.BossMonsterID)
		}
		if promo.TargetNodeID != promo.GiverNodeID {
			t.Errorf("seed %d: stage-0 TargetNodeID = %q, want GiverNodeID %q", seed, promo.TargetNodeID, promo.GiverNodeID)
		}
		if promo.PromoStage != 0 {
			t.Errorf("seed %d: PromoStage = %d, want 0", seed, promo.PromoStage)
		}
		// The dungeon node must actually be tagged "dungeon" when one exists in the locality.
		dungeonNode := loc.NodeByID(promo.DungeonNodeID)
		if dungeonNode == nil {
			t.Errorf("seed %d: DungeonNodeID %q not in locality", seed, promo.DungeonNodeID)
			continue
		}
		hasDungeonTag := false
		for _, tag := range dungeonNode.Tags {
			if tag == "dungeon" {
				hasDungeonTag = true
				break
			}
		}
		if !hasDungeonTag {
			t.Errorf("seed %d: chose node %q as dungeon but it is not tagged", seed, dungeonNode.ID)
		}
	}
}

func TestGenerateCampaign_ExactlyOnePromotion(t *testing.T) {
	loc := testLocality(t)
	for seed := uint64(1); seed <= 10; seed++ {
		rng := newRng(seed)
		quests := GenerateCampaign(loc, "spawn", rng, testCampaignConfig())
		promos := 0
		for _, q := range quests {
			if q.IsPromotion {
				promos++
			}
		}
		if promos != 1 {
			t.Errorf("seed %d: expected exactly 1 promotion quest, got %d", seed, promos)
		}
	}
}

func TestGenerateCampaign_BossIsLast(t *testing.T) {
	loc := testLocality(t)
	for seed := uint64(1); seed <= 10; seed++ {
		rng := newRng(seed)
		quests := GenerateCampaign(loc, "spawn", rng, testCampaignConfig())
		if len(quests) == 0 {
			t.Fatalf("seed %d: no quests generated", seed)
		}
		last := quests[len(quests)-1]
		if last.TemplateID != "Q12" {
			t.Errorf("seed %d: expected last quest to be Q12 boss, got %s", seed, last.TemplateID)
		}
		if last.Act != 3 {
			t.Errorf("seed %d: expected boss Act=3, got %d", seed, last.Act)
		}
	}
}

func TestGenerateCampaign_ActDistribution(t *testing.T) {
	loc := testLocality(t)
	for seed := uint64(1); seed <= 10; seed++ {
		rng := newRng(seed)
		quests := GenerateCampaign(loc, "spawn", rng, testCampaignConfig())

		var act1, act2, act3, boss int
		for _, q := range quests {
			if q.IsPromotion {
				continue // promotion is tagged Act 1 but tracked separately
			}
			if q.TemplateID == "Q12" {
				boss++
				continue
			}
			switch q.Act {
			case 1:
				act1++
			case 2:
				act2++
			case 3:
				act3++
			}
		}
		if act1 != 3 {
			t.Errorf("seed %d: Act 1 count %d, want 3", seed, act1)
		}
		if act2 != 4 {
			t.Errorf("seed %d: Act 2 count %d, want 4", seed, act2)
		}
		if act3 != 3 {
			t.Errorf("seed %d: Act 3 count %d, want 3", seed, act3)
		}
		if boss != 1 {
			t.Errorf("seed %d: expected exactly 1 boss, got %d", seed, boss)
		}
	}
}

func TestGenerateCampaign_NoEmptyStrings(t *testing.T) {
	loc := testLocality(t)
	quests := GenerateCampaign(loc, "spawn", newRng(42), testCampaignConfig())
	for i, q := range quests {
		if q.Name == "" {
			t.Errorf("quest %d: empty Name", i)
		}
		if q.Description == "" {
			t.Errorf("quest %d: empty Description", i)
		}
		if q.ID == "" {
			t.Errorf("quest %d: empty ID", i)
		}
	}
}

func TestGenerateCampaign_Deterministic(t *testing.T) {
	loc := testLocality(t)
	a := GenerateCampaign(loc, "spawn", newRng(7), testCampaignConfig())
	b := GenerateCampaign(loc, "spawn", newRng(7), testCampaignConfig())
	if len(a) != len(b) {
		t.Fatalf("same seed produced different lengths: %d vs %d", len(a), len(b))
	}
	for i := range a {
		if a[i].ID != b[i].ID || a[i].Name != b[i].Name || a[i].Description != b[i].Description {
			t.Errorf("quest %d differs between runs with same seed", i)
		}
	}
}

func TestGenerateCampaign_NoSpawnReturnsNil(t *testing.T) {
	loc := &locality.Locality{ID: "empty", Nodes: nil}
	quests := GenerateCampaign(loc, "nonexistent", newRng(1), testCampaignConfig())
	if quests != nil {
		t.Errorf("expected nil for missing spawn, got %d quests", len(quests))
	}
}

func TestGenerateCampaign_ContainsOnlyRequiredQuests(t *testing.T) {
	quests := GenerateCampaign(testLocality(t), "spawn", newRng(1), testCampaignConfig())
	for i, quest := range quests {
		if quest.IsSideQuest {
			t.Errorf("quest %d (%s) is optional in the required campaign", i, quest.ID)
		}
	}
}

func TestQuestTemplateByID(t *testing.T) {
	cases := []struct {
		id    string
		want  bool
		wname string
	}{
		{"Q01", true, "Fetch"},
		{"Q04", true, "Bandit Clearing"},
		{"Q12", true, "Boss"},
		{"Q99", false, ""},
		{"", false, ""},
	}
	for _, c := range cases {
		got := QuestTemplateByID(c.id)
		if c.want && got == nil {
			t.Errorf("QuestTemplateByID(%q): expected template, got nil", c.id)
		}
		if !c.want && got != nil {
			t.Errorf("QuestTemplateByID(%q): expected nil, got %+v", c.id, got)
		}
		if c.want && got.Name != c.wname {
			t.Errorf("QuestTemplateByID(%q).Name = %q, want %q", c.id, got.Name, c.wname)
		}
	}
}

func TestTemplatesForAct(t *testing.T) {
	cases := []struct {
		act      int
		minCount int
	}{
		{1, 4}, // Q01, Q02, Q04, Q05
		{2, 5}, // Q01, Q02, Q03, Q04, Q05
		{3, 2}, // Q03, Q04, Q12
	}
	for _, c := range cases {
		got := templatesForAct(c.act)
		if len(got) < c.minCount {
			t.Errorf("templatesForAct(%d): expected at least %d templates, got %d", c.act, c.minCount, len(got))
		}
	}
}
