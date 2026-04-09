package safety_test

import (
	"testing"

	"github.com/digitaldrywood/kithlands/internal/safety"
)

func TestCheckInputValid(t *testing.T) {
	f := safety.NewFilter()

	valid := []string{"Bob's Hardware", "Mrs Henderson", "Town Hall", "Fire Hall #3"}
	for _, input := range valid {
		if msg := f.CheckInput(input); msg != "" {
			t.Errorf("rejected valid input %q: %s", input, msg)
		}
	}
}

func TestCheckInputRejectsProfanity(t *testing.T) {
	f := safety.NewFilter()

	if msg := f.CheckInput("Bob the Fucker"); msg == "" {
		t.Error("should reject profanity")
	}
}

func TestCheckInputRejectsTooLong(t *testing.T) {
	f := safety.NewFilter()

	long := ""
	for i := 0; i < 201; i++ {
		long += "a"
	}
	if msg := f.CheckInput(long); msg == "" {
		t.Error("should reject input over 200 chars")
	}
}

func TestCheckLLMOutput(t *testing.T) {
	f := safety.NewFilter()

	clean, modified := f.CheckLLMOutput("The brave warrior enters the dungeon.")
	if modified {
		t.Error("should not modify clean text")
	}
	if clean == "" {
		t.Error("should return clean text")
	}
}

func TestCheckLLMOutputRejectsBanned(t *testing.T) {
	f := safety.NewFilter()

	_, modified := f.CheckLLMOutput("This contains fuck in it")
	if !modified {
		t.Error("should reject text with banned terms")
	}
}
