package gamedata

import (
	"fmt"
	"strings"
	"testing"
)

func TestValidateRejectsInvalidDialogueMood(t *testing.T) {
	for _, mood := range []string{"", "unknown"} {
		t.Run(fmt.Sprintf("mood_%q", mood), func(t *testing.T) {
			gd := Load("../../../shared")
			arch := gd.Dialogue.Archetypes["blacksmith"]
			arch.Lines[0].Mood = mood
			gd.Dialogue.Archetypes["blacksmith"] = arch
			defer func() {
				err := recover()
				if err == nil || !strings.Contains(fmt.Sprint(err), "invalid mood") {
					t.Fatalf("validation panic = %v, want invalid mood", err)
				}
			}()
			gd.validate()
		})
	}
}
