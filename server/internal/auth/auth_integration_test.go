//go:build integration

package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/digitaldrywood/kithlands/internal/testutil"
)

func TestRegisterOrLoginAndValidateToken(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	pool := testutil.NewIntegrationPool(t)
	service := NewService(pool)

	token, err := service.RegisterOrLogin(ctx, "  Player@Example.COM ")
	if err != nil {
		t.Fatalf("RegisterOrLogin() error = %v", err)
	}
	if token == "" {
		t.Fatal("RegisterOrLogin() returned empty token")
	}

	user, err := service.ValidateToken(ctx, token)
	if err != nil {
		t.Fatalf("ValidateToken() error = %v", err)
	}
	if user.Email != "player@example.com" {
		t.Fatalf("ValidateToken() email = %q, want %q", user.Email, "player@example.com")
	}

	var userCount int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE email = $1`, "player@example.com").Scan(&userCount); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if userCount != 1 {
		t.Fatalf("user count = %d, want 1", userCount)
	}

	token2, err := service.RegisterOrLogin(ctx, "player@example.com")
	if err != nil {
		t.Fatalf("second RegisterOrLogin() error = %v", err)
	}
	if token2 == token {
		t.Fatal("second RegisterOrLogin() returned the same token")
	}
}

func TestValidateTokenRejectsUnknownToken(t *testing.T) {
	t.Parallel()

	service := NewService(testutil.NewIntegrationPool(t))
	if _, err := service.ValidateToken(context.Background(), "missing-token"); err == nil {
		t.Fatal("ValidateToken() error = nil, want error")
	}
}

func TestMiddleware(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	pool := testutil.NewIntegrationPool(t)
	service := NewService(pool)

	token, err := service.RegisterOrLogin(ctx, "middleware@example.com")
	if err != nil {
		t.Fatalf("RegisterOrLogin() error = %v", err)
	}

	handler := service.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			t.Fatal("UserFromContext() = nil, want user")
		}
		if user.Email != "middleware@example.com" {
			t.Fatalf("UserFromContext() email = %q, want %q", user.Email, "middleware@example.com")
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	tests := []struct {
		name       string
		buildReq   func() *http.Request
		wantStatus int
	}{
		{
			name: "authorizes bearer token",
			buildReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/secure", nil)
				req.Header.Set("Authorization", "Bearer "+token)
				return req
			},
			wantStatus: http.StatusNoContent,
		},
		{
			name: "authorizes query token",
			buildReq: func() *http.Request {
				return httptest.NewRequest(http.MethodGet, "/ws?token="+token, nil)
			},
			wantStatus: http.StatusNoContent,
		},
		{
			name: "rejects missing token",
			buildReq: func() *http.Request {
				return httptest.NewRequest(http.MethodGet, "/secure", nil)
			},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name: "rejects invalid token",
			buildReq: func() *http.Request {
				req := httptest.NewRequest(http.MethodGet, "/secure", nil)
				req.Header.Set("Authorization", "Bearer invalid")
				return req
			},
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, tt.buildReq())

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}
