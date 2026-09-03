BINARY := shimmr
VERSION := 0.1.0

# Where released binaries send signups and usage. Empty means a fully offline
# build that talks to nobody — that is the default, on purpose.
#   make build ENDPOINT=https://<ref>.supabase.co/functions
ENDPOINT ?=
ENDPOINT_PKG := github.com/pra2107tham/shimmr/internal/config.DefaultEndpoint
LDFLAGS := -s -w -X $(ENDPOINT_PKG)=$(ENDPOINT)
PLATFORMS := darwin/arm64 darwin/amd64 linux/amd64 linux/arm64 windows/amd64

.PHONY: build test race fmt vet check smoke install dist clean \
        db-start db-stop db-reset db-push db-test db-query functions-serve deploy backend-check \
        package package-all package-test publish publish-test licenses

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

# ------------------------------------------------------------- packaging
#
# A release archive is the Shimmr binary, the engine, and the licence notices,
# in one file with a checksum. Nothing is fetched at install time.
#
# ENGINE_SRC bundles a locally built engine for development. Releases take the
# engine from packaging/engine.json instead: a self-built engine has a
# different build fingerprint and would refuse to start alongside a customer's
# existing install (ADR 0007).
package:
	bash scripts/package.sh $(or $(GOOS),$(shell go env GOOS)) $(or $(GOARCH),$(shell go env GOARCH))

package-all:
	@for p in $(PLATFORMS); do \
		bash scripts/package.sh $${p%/*} $${p#*/} || exit 1; \
	done
	@echo; ls -lh dist/*.tar.gz dist/*.zip 2>/dev/null

# Packaging against a synthetic engine release: no network, no 300 MB download,
# and it fails if the archive we would ship is missing the engine or a notice.
package-test:
	bash scripts/package_test.sh

# Put a release where people can download it. ARTIFACT_HOST picks the host:
# supabase is live, r2 is a stub that refuses. Unset publishes nothing.
#   make publish ARTIFACT_HOST=supabase
publish:
	ARTIFACT_HOST=$(or $(ARTIFACT_HOST),none) bash scripts/publish_artifacts.sh dist $(VERSION)

# The object layout the installers depend on, against a stand-in Storage API.
publish-test:
	bash scripts/publish_test.sh

# Print everything we ship licences for. This is the obligation, so it is a
# first-class target rather than a buried flag.
licenses: build
	@./bin/$(BINARY) licenses

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

# ---------------------------------------------------------------- backend
#
# Everything below drives Supabase from this repo. Nothing here needs the
# dashboard.

# Local stack (Postgres, Edge runtime, Studio). Needs Docker.
db-start:
	supabase start

db-stop:
	supabase stop

# Rebuild the local database from migrations, then apply seed.sql.
db-reset:
	supabase db reset

# Apply migrations to the linked project.
db-push:
	supabase db push

# Assert the schema behaves. Point PGURL at any Postgres; defaults to the
# local Supabase stack.
PGURL ?= postgresql://postgres:postgres@localhost:54322/postgres
db-test:
	@for f in supabase/migrations/*.sql; do \
		echo "-- $$f"; psql "$(PGURL)" -v ON_ERROR_STOP=1 -q -f "$$f" || exit 1; \
	done
	@psql "$(PGURL)" -v ON_ERROR_STOP=1 -f supabase/tests/schema_test.sql

# Run every saved inspection query. `make db-query Q=01` runs just one.
Q ?=
db-query:
	@for f in supabase/queries/$(Q)*.sql; do \
		echo; echo "=== $$f"; \
		psql "$(PGURL)" -v ON_ERROR_STOP=1 -f "$$f" || exit 1; \
	done

# Serve the Edge Functions locally against the local stack.
functions-serve:
	supabase functions serve --no-verify-jwt

# Push migrations and functions to the linked project. CI does this on merge;
# this target is for when you need it by hand.
deploy:
	supabase db push
	supabase functions deploy signup
	supabase functions deploy usage

# What CI checks for the backend, minus the database service.
backend-check:
	deno fmt --check supabase/functions
	deno lint supabase/functions
	deno check supabase/functions/signup/index.ts supabase/functions/usage/index.ts

clean:
	rm -rf bin dist
