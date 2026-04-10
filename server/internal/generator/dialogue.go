package generator

import (
	"fmt"
	"math/rand/v2"
)

// fallbackDialogue returns a quest description and completion message for a
// template when no LLM is available. Per GDD Section 10.5, the engine must
// never block on the LLM: this provides varied, template-specific flavor text.
//
// Each template has multiple variants picked by rng so repeated quests of the
// same template in a campaign don't all read identically. LLM-enhanced text
// replaces this once the gateway is wired up.
//
// Format args are always (giver, target, itemHint) — variants reference them
// as %[1]s, %[2]s, %[3]s explicitly to avoid implicit-index drift.
func fallbackDialogue(templateID, giver, target, itemHint string, rng *rand.Rand) (desc, completion string) {
	variants := dialogueVariants[templateID]
	if len(variants) == 0 {
		return fmt.Sprintf("%s needs your help at %s.", giver, target),
			fmt.Sprintf("You completed the task. %s is grateful.", giver)
	}
	v := variants[rng.IntN(len(variants))]
	return fmt.Sprintf(v.desc, giver, target, itemHint),
		fmt.Sprintf(v.completion, giver, target, itemHint)
}

// dialogueVariant holds a description + completion pair.
type dialogueVariant struct {
	desc       string
	completion string
}

// dialogueVariants maps template IDs to fallback text variants.
// Placeholders: %[1]s = giver, %[2]s = target, %[3]s = item/thing hint.
var dialogueVariants = map[string][]dialogueVariant{
	"Q01": {
		{
			desc:       "%[1]s says: \"I lost my %[3]s somewhere near %[2]s. Will you bring it back to me?\"",
			completion: "%[1]s clasps the %[3]s and smiles. \"You've done me a great kindness.\"",
		},
		{
			desc:       "%[1]s asks you to retrieve a %[3]s from %[2]s before nightfall.",
			completion: "The %[3]s is returned. %[1]s nods in quiet thanks.",
		},
	},
	"Q02": {
		{
			desc:       "%[1]s hands you a sealed %[3]s. \"Take this to %[2]s. They'll know what it means.\"",
			completion: "The %[3]s is delivered. %[1]s breathes easier knowing the task is done.",
		},
		{
			desc:       "%[1]s needs a %[3]s carried to %[2]s — and it can't wait.",
			completion: "You return from %[2]s. %[1]s looks relieved.",
		},
	},
	"Q03": {
		{
			desc:       "%[1]s whispers: \"Something's wrong at %[2]s. Find out what, and come back to me.\"",
			completion: "%[1]s listens to your report gravely. \"So that's the truth of it.\"",
		},
		{
			desc:       "%[1]s asks you to investigate the strange happenings at %[2]s.",
			completion: "Your findings settle over %[1]s like a weight. \"Thank you for your eyes.\"",
		},
	},
	"Q04": {
		{
			desc:       "%[1]s says: \"Bandits have made %[2]s unsafe. Clear them out and I'll reward you well.\"",
			completion: "%[1]s exhales. \"The road through %[2]s is ours again. Well done.\"",
		},
		{
			desc:       "%[1]s needs %[2]s cleared of the monsters that have moved in.",
			completion: "With %[2]s safe, %[1]s can sleep through the night once more.",
		},
	},
	"Q05": {
		{
			desc:       "%[1]s pleads with you: \"Please, find my %[3]s. Last I heard, they were near %[2]s.\"",
			completion: "%[1]s embraces the %[3]s you brought home. \"I can't thank you enough.\"",
		},
		{
			desc:       "%[1]s has lost a %[3]s and hopes you can track them through %[2]s.",
			completion: "The %[3]s is safe. %[1]s weeps with relief.",
		},
	},
	"Q12": {
		{
			desc:       "The shadow of %[3]s looms over %[2]s. %[1]s begs you to end it.",
			completion: "%[3]s has fallen. %[1]s and all of %[2]s will remember this day.",
		},
	},
	"promotion": {
		{
			desc:       "%[1]s says: \"Prove your mastery at %[2]s. Return to me when you are ready to claim your true name.\"",
			completion: "%[1]s nods with pride. \"You have passed the trial. Rise, promoted.\"",
		},
	},
}

// itemHintForTemplate returns a small themed noun to plug into dialogue
// variants as the %[3]s arg. Pools are per-template so a Fetch reads
// differently from a Lost Person quest.
func itemHintForTemplate(templateID string, rng *rand.Rand) string {
	pool, ok := itemHintPools[templateID]
	if !ok || len(pool) == 0 {
		return "keepsake"
	}
	return pool[rng.IntN(len(pool))]
}

var itemHintPools = map[string][]string{
	"Q01": {"lost relic", "family heirloom", "old locket", "traveler's pack"},
	"Q02": {"letter", "parcel", "sealed box", "bundle of herbs"},
	"Q03": {"strange clue", "torn page", "witness account"},
	"Q04": {"raid report", "bloody flag", "bandit sigil"},
	"Q05": {"missing friend", "wayward child", "lost apprentice"},
	"Q12": {"great evil", "dark lord", "ancient terror"},
}
