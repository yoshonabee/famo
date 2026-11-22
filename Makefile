.PHONY: build run frontend desktop run-desktop dev-api dev-web deploy-sync test clean
build:
	$(MAKE) frontend
	mkdir -p bin
	go build -o bin/famo ./cmd/famo
	go build -o bin/famo-agent ./cmd/famo-agent
frontend:
	cd web && npm ci && npm run build
desktop: frontend
	sh scripts/build-macos.sh
run-desktop: desktop
	open bin/Famo.app
run: build
	./bin/famo
dev-api:
	go run ./cmd/famo
dev-web:
	cd web && npm run dev
deploy-sync:
	@test -f sync/wrangler.local.jsonc || { echo "Missing sync/wrangler.local.jsonc. Copy sync/wrangler.example.jsonc and configure your deployment." >&2; exit 1; }
	npm --prefix web ci
	npm --prefix web run build:sync
	npm --prefix sync ci
	cd sync && npx wrangler deploy --config wrangler.local.jsonc
test:
	go test -race ./...
	cd web && npm run build
clean:
	rm -rf bin web/dist/assets web/dist/index.html
