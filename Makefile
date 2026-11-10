.PHONY: build run frontend desktop run-desktop dev-api dev-web test clean
build:
	$(MAKE) frontend
	mkdir -p bin
	go build -o bin/famo ./cmd/famo
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
test:
	go test -race ./...
	cd web && npm run build
clean:
	rm -rf bin web/dist/assets web/dist/index.html
