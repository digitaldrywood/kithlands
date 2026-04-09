package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// RegisterOrLogin creates a user if they don't exist, then creates a session token.
// For demo cut: skip email verification, just issue a token.
func (s *Service) RegisterOrLogin(ctx context.Context, email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return "", fmt.Errorf("email required")
	}

	var userID string
	err := s.db.QueryRow(ctx,
		`INSERT INTO users (email) VALUES ($1)
		 ON CONFLICT (email) DO UPDATE SET last_login_at = NOW()
		 RETURNING id`, email).Scan(&userID)
	if err != nil {
		return "", fmt.Errorf("creating user: %w", err)
	}

	token, err := generateToken()
	if err != nil {
		return "", fmt.Errorf("generating token: %w", err)
	}

	_, err = s.db.Exec(ctx,
		`INSERT INTO sessions (user_id, token, expires_at)
		 VALUES ($1, $2, $3)`,
		userID, token, time.Now().Add(30*24*time.Hour))
	if err != nil {
		return "", fmt.Errorf("creating session: %w", err)
	}

	return token, nil
}

// ValidateToken returns the user for a valid session token.
func (s *Service) ValidateToken(ctx context.Context, token string) (*User, error) {
	var user User
	err := s.db.QueryRow(ctx,
		`SELECT u.id, u.email FROM users u
		 JOIN sessions s ON s.user_id = u.id
		 WHERE s.token = $1 AND s.expires_at > NOW()`, token).
		Scan(&user.ID, &user.Email)
	if err != nil {
		return nil, fmt.Errorf("invalid or expired token")
	}
	return &user, nil
}

// Middleware extracts and validates the auth token from the request.
func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		token = strings.TrimPrefix(token, "Bearer ")

		if token == "" {
			// Also check query param for WebSocket connections
			token = r.URL.Query().Get("token")
		}

		if token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		user, err := s.ValidateToken(r.Context(), token)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type contextKey string

const userContextKey contextKey = "user"

// UserFromContext returns the authenticated user from the request context.
func UserFromContext(ctx context.Context) *User {
	u, _ := ctx.Value(userContextKey).(*User)
	return u
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
