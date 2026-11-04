.PHONY: build run dev-api dev-web test clean
build:
	cd web && npm ci && npm run build
	mkdir -p bin
	go build -o bin/famo ./cmd/famo
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
