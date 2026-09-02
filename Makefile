BINARY := shimmr
VERSION := 0.1.0
LDFLAGS := -s -w
PLATFORMS := darwin/arm64 darwin/amd64 linux/amd64 linux/arm64 windows/amd64

.PHONY: build test race fmt vet check smoke install dist clean

build:
	CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o bin/$(BINARY) ./cmd/shimmr

test:
	go test ./...

race:
	go test -race ./...

fmt:
	gofmt -w .

vet:
	go vet ./...

check: fmt vet test

# What CI runs end to end. Needs a built binary.
smoke: build
	./scripts/smoke.sh

install: build
	install -m 0755 bin/$(BINARY) /usr/local/bin/$(BINARY)

# One static binary per platform. No runtime for the customer to install.
dist:
	@mkdir -p dist
	@for p in $(PLATFORMS); do \
		os=$${p%/*}; arch=$${p#*/}; ext=""; \
		if [ "$$os" = "windows" ]; then ext=".exe"; fi; \
		echo "  $$os/$$arch"; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch \
			go build -ldflags="$(LDFLAGS)" \
			-o dist/$(BINARY)-$(VERSION)-$$os-$$arch$$ext ./cmd/shimmr || exit 1; \
	done
	@echo "\nBuilt:"; ls -1 dist/

clean:
	rm -rf bin dist
