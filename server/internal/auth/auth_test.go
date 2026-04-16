package auth

import (
	"context"
	"testing"
)

func TestGenerateToken(t *testing.T) {
	t.Parallel()

	token, err := generateToken()
	if err != nil {
		t.Fatalf("generateToken() error = %v", err)
	}

	if got, want := len(token), 64; got != want {
		t.Fatalf("len(token) = %d, want %d", got, want)
	}

	for _, r := range token {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			t.Fatalf("token contains non-hex rune %q", r)
		}
	}
}

func TestUserFromContext(t *testing.T) {
	t.Parallel()

	if got := UserFromContext(context.Background()); got != nil {
		t.Fatalf("UserFromContext(background) = %#v, want nil", got)
	}

	want := &User{ID: "user-1", Email: "player@example.com"}
	ctx := context.WithValue(context.Background(), userContextKey, want)
	got := UserFromContext(ctx)
	if got == nil {
		t.Fatal("UserFromContext(ctx) = nil, want user")
	}

	if *got != *want {
		t.Fatalf("UserFromContext(ctx) = %#v, want %#v", got, want)
	}
}
