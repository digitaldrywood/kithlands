.PHONY: play stop run test build demo migrate balance-sim client-dev client-build lint vet fmt pre-commit docker-up docker-down

# Start everything and open the game
play: stop
	@echo "Starting Kithlands..."
	@echo "Running migrations..."
	@psql -d kithlands -f server/internal/db/migrations/001_initial.sql 2>/dev/null || true
	@psql -d kithlands -f server/internal/db/migrations/002_localities.sql 2>/dev/null || true
	@echo "Starting Go server (port $${PORT:-8080})..."
	@cd server && go run ./cmd/kithlands > /tmp/kithlands-server.log 2>&1 &
	@sleep 2
	@echo "Starting Phaser client..."
	@cd client && npx vite --host 0.0.0.0 > /tmp/kithlands-client.log 2>&1 &
	@sleep 2
	@echo ""
	@echo "========================================="
	@echo "  KITHLANDS is running!"
	@echo ""
	@echo "  Game:   http://localhost:3000"
	@if [ -n "$${TAILSCALE_HOSTNAME}" ]; then echo "  Network: http://$${TAILSCALE_HOSTNAME}:3000"; fi
	@echo ""
	@echo "  API:    http://localhost:$${PORT:-8080}"
	@if [ -n "$${TAILSCALE_HOSTNAME}" ]; then echo "  API:    http://$${TAILSCALE_HOSTNAME}:$${PORT:-8080}"; fi
	@echo ""
	@echo "  Logs:   /tmp/kithlands-server.log"
	@echo "          /tmp/kithlands-client.log"
	@echo "  Stop:   make stop"
	@echo "========================================="

# Stop everything
stop:
	@-pkill -f "go run ./cmd/kithlands" 2>/dev/null || true
	@-pkill -f "go-build.*kithlands" 2>/dev/null || true
	@-pkill -f "vite.*kithlands" 2>/dev/null || true
	@-pkill -f "node.*vite.*client" 2>/dev/null || true

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

lint:
	cd server && golangci-lint run ./...

fmt:
	cd server && gofmt -w .
	cd client && npx prettier --write .

pre-commit:
	pre-commit run --all-files

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
