.PHONY: play stop run test build demo migrate balance-sim client-dev client-build lint vet docker-up docker-down

# Start everything and open the game
play:
	@echo "Starting Kithlands..."
	@echo "Running migrations..."
	@psql -d kithlands -f server/internal/db/migrations/001_initial.sql 2>/dev/null || true
	@psql -d kithlands -f server/internal/db/migrations/002_localities.sql 2>/dev/null || true
	@echo "Starting Go server..."
	@cd server && go run ./cmd/kithlands &
	@sleep 2
	@echo "Starting Phaser client..."
	@cd client && npm run dev &
	@sleep 2
	@echo ""
	@echo "========================================="
	@echo "  KITHLANDS is running!"
	@echo "  Open http://localhost:3000"
	@echo "  Run 'make stop' to shut it down."
	@echo "========================================="

# Stop everything
stop:
	@echo "Stopping Kithlands..."
	@-pkill -f "go run ./cmd/kithlands" 2>/dev/null || true
	@-pkill -f "cmd/kithlands" 2>/dev/null || true
	@-pkill -f "vite" 2>/dev/null || true
	@echo "Stopped."

run:
	cd server && go run ./cmd/kithlands

build:
	cd server && go build -o kithlands ./cmd/kithlands

demo:
	cd server && go run ./cmd/demo

test:
	cd server && go test ./...

vet:
	cd server && go vet ./...

lint: vet

migrate:
	psql -d kithlands -f server/internal/db/migrations/001_initial.sql
	psql -d kithlands -f server/internal/db/migrations/002_localities.sql

balance-sim:
	cd server && go run ./cmd/balance_sim

client-dev:
	cd client && npm run dev

client-build:
	cd client && npm run build

docker-up:
	docker compose up -d

docker-down:
	docker compose down
