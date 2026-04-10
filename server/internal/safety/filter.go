package safety

import (
	"strings"
	"unicode"
)

// Filter implements the 4-stage safety pipeline per Section 14.2.
type Filter struct {
	bannedTerms []string
}

func NewFilter() *Filter {
	return &Filter{
		bannedTerms: defaultBannedTerms,
	}
}

// CheckInput validates user input at wizard/CSV ingestion (stage 1).
// Returns an error message if the input is rejected.
func (f *Filter) CheckInput(text string) string {
	if len(text) > 200 {
		return "input too long (max 200 characters)"
	}

	lower := strings.ToLower(text)
	for _, term := range f.bannedTerms {
		if strings.Contains(lower, term) {
			return "input contains inappropriate content"
		}
	}

	// Character allowlist: letters, numbers, spaces, basic punctuation
	for _, r := range text {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && !unicode.IsSpace(r) &&
			!strings.ContainsRune(".,;:!?'-()&/#@_+", r) {
			return "input contains disallowed characters"
		}
	}

	return ""
}

// CheckLLMOutput validates LLM-generated text (stage 3).
// Returns cleaned text and whether it was modified.
func (f *Filter) CheckLLMOutput(text string) (string, bool) {
	modified := false
	lower := strings.ToLower(text)

	for _, term := range f.bannedTerms {
		if strings.Contains(lower, term) {
			modified = true
			text = ""
			break
		}
	}

	// Hard refusals per Section 14.4
	for _, phrase := range hardRefusalPhrases {
		if strings.Contains(lower, phrase) {
			return "", true
		}
	}

	return text, modified
}

// CheckQuestActions validates quest generation (stage 2).
// Returns true if the quest action combination is safe.
func (f *Filter) CheckQuestActions(actions []string) bool {
	// No harmful primitive combinations
	for _, a := range actions {
		lower := strings.ToLower(a)
		for _, bad := range forbiddenActions {
			if strings.Contains(lower, bad) {
				return false
			}
		}
	}
	return true
}

var defaultBannedTerms = []string{
	// Profanity - abbreviated list, would be expanded in production
	"fuck", "shit", "ass", "damn", "bitch", "crap",
	"dick", "cock", "pussy", "whore", "slut",
	// Slurs - abbreviated, would be comprehensive in production
	"nigger", "faggot", "retard", "kike", "spic",
}

var hardRefusalPhrases = []string{
	"sexual content",
	"kill the president",
	"bomb threat",
	"school shooting",
	"child abuse",
}

var forbiddenActions = []string{
	"burn down school",
	"harm children",
	"suicide",
}
