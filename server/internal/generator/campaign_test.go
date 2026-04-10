package generator

import (
	"math/rand/v2"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/locality"
)

// testLocality builds a minimal but walkable locality with enough close,
// medium, and far nodes to exercise the 3-act generator. The graph is a
// linear chain so distances are predictable: spawn -> c1 -> c2 -> m1 -> m2
// -> f1 -> f2.
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
			{ID: "m2", Kind: locality.NodeLandmark, Name: "Stone Circle", Importance: 30},
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

func TestGenerateCampaign_QuestCount(t *testing.T) {
	loc := testLocality(t)

	// Run several seeds and verify count stays within 10-15 per GDD 10.4.
	// Minimum: 3 act1 + 1 promo + 4 act2 + 2 act3 + 1 boss = 11.
	// Maximum is hard-capped at 15; Act 2 is trimmed when the roll would
	// produce more.
	for seed := uint64(1); seed <= 50; seed++ {
		rng := newRng(seed)
		quests := GenerateCampaign(loc, "spawn", rng, nil)
		if len(quests) < 11 {
			t.Errorf("seed %d: expected >= 11 quests, got %d", seed, len(quests))
		}
		if len(quests) > 15 {
			t.Errorf("seed %d: expected <= 15 quests (GDD 10.4 cap), got %d", seed, len(quests))
		}
	}
}

func TestGenerateCampaign_ExactlyOnePromotion(t *testing.T) {
	loc := testLocality(t)
	for seed := uint64(1); seed <= 10; seed++ {
		rng := newRng(seed)
		quests := GenerateCampaign(loc, "spawn", rng, nil)
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
		quests := GenerateCampaign(loc, "spawn", rng, nil)
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
		quests := GenerateCampaign(loc, "spawn", rng, nil)

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
		if act1 < 3 || act1 > 5 {
			t.Errorf("seed %d: Act 1 count %d outside [3,5]", seed, act1)
		}
		if act2 < 4 || act2 > 6 {
			t.Errorf("seed %d: Act 2 count %d outside [4,6]", seed, act2)
		}
		if act3 < 2 || act3 > 3 {
			t.Errorf("seed %d: Act 3 count %d outside [2,3]", seed, act3)
		}
		if boss != 1 {
			t.Errorf("seed %d: expected exactly 1 boss, got %d", seed, boss)
		}
	}
}

func TestGenerateCampaign_NoEmptyStrings(t *testing.T) {
	loc := testLocality(t)
	quests := GenerateCampaign(loc, "spawn", newRng(42), nil)
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
	a := GenerateCampaign(loc, "spawn", newRng(7), nil)
	b := GenerateCampaign(loc, "spawn", newRng(7), nil)
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
	quests := GenerateCampaign(loc, "nonexistent", newRng(1), nil)
	if quests != nil {
		t.Errorf("expected nil for missing spawn, got %d quests", len(quests))
	}
}

func TestGenerateCampaign_WithSidePool_CapsAt15(t *testing.T) {
	loc := testLocality(t)
	// Minimal supported pool to force insertion.
	pool := []SideQuestEntry{
		{ID: "sq_a", Name: "Side A", Act: 1, Template: "Q01", Rarity: "common"},
		{ID: "sq_b", Name: "Side B", Act: 2, Template: "Q04", Rarity: "common"},
		{ID: "sq_c", Name: "Side C", Act: 3, Template: "Q03", Rarity: "common"},
	}
	for seed := uint64(1); seed <= 10; seed++ {
		rng := newRng(seed)
		quests := GenerateCampaign(loc, "spawn", rng, pool)
		if len(quests) > 15 {
			t.Errorf("seed %d: expected <= 15 with side pool, got %d", seed, len(quests))
		}
		// Boss must still be last even after side insertion.
		if quests[len(quests)-1].TemplateID != "Q12" {
			t.Errorf("seed %d: boss is not last quest after side insertion", seed)
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
