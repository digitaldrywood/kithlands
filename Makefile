.PHONY: run test build demo migrate balance-sim client-dev client-build lint vet

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
	@echo "Run migrations against DATABASE_URL"
	@echo "psql \$$DATABASE_URL -f server/internal/db/migrations/001_initial.sql"

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
