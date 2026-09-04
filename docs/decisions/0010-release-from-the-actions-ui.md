# 0010 — Cut a release from the Actions UI; keep it a deliberate, one-at-a-time step

**Status:** Accepted
**Date:** 2026-09-04

## Context

`release.yml` only ever ran on a pushed `v*` tag. That's a real git operation
against a real clone with push access to this repository — something an
agent working through this repository's GitHub App does not have (tag pushes
and `workflow_dispatch` both came back 403 when tried). Every release so far
has needed a person to run `git tag && git push` by hand, from their own
machine, as the last step of otherwise-automated work.

`workflow_dispatch` already existed as an input, but only for `dry_run`: a
manual run built and checked artifacts and could never actually publish,
because the `publish` job's condition required `github.ref_type == 'tag'`,
which a branch-triggered dispatch never satisfies.

The other direction — release automatically on every merge to `main` — was
also on the table and rejected. `deploy.yml` already does that for the
backend, which is the right call there: a bad Edge Function is one more
deploy away from fixed. A bad CLI release is a binary someone has already
downloaded and run. PR #9 shipped a bug that PR #10 had to hotfix the same
day; auto-releasing a binary on every merge would have shipped that same bug
to an installed copy of Shimmr rather than to a Supabase project only we
depend on. "Nobody outside this repository has used it yet" is exactly the
phase where every release should still be a decision, not a side effect of a
merge.

## Decision

**Releasing stays manual and one-at-a-time. What changes is where "manual"
happens: a browser, not a terminal with push access.**

`workflow_dispatch` gains a `version` input. A new `tag` job runs only for a
non-dry-run manual dispatch: it validates the version is semver, checks the
tag doesn't already exist, and creates and pushes it using the workflow's own
`GITHUB_TOKEN` (`permissions: contents: write`, already granted). Everything
downstream — `package`, `publish`, the GitHub release, the object-storage
upload — is unchanged in substance; it just now reads the version from that
job's output when there's no tag ref to read it from directly, instead of
requiring one to already exist.

A plain `git tag vX.Y.Z && git push` still works exactly as before — the
`tag` job's `if` only fires for a manual dispatch, so a real tag push skips
it and proceeds exactly as it did pre-0010.

## Consequences

- Anyone with write access to this repository can cut a release from the
  Actions tab. No local clone, no push access to tags specifically, no
  waiting on whoever has that.
- The `dry_run` default stays `true`, so an accidental "Run workflow" click
  builds and checks but tags and publishes nothing — the same safety margin
  `dry_run` already provided.
- A pushed `GITHUB_TOKEN` tag does not itself re-trigger `release.yml`'s
  `push: tags` listener — GitHub does not let a workflow's own token retrigger
  workflows, to prevent recursion. That's fine here: `package` and `publish`
  run in the *same* dispatched run as the `tag` job, not in a second run
  triggered by the tag it pushed.
- The release notes' `tag_name` and the object-storage upload's version
  argument both had to become explicit rather than reading `github.ref_name`,
  because a dispatched run's own ref stays the branch it was run against even
  after the `tag` job pushes a real tag alongside it.

## Alternatives considered

- **Auto-release on every merge to `main`.** Rejected for the reason above:
  this product's whole posture is "verify before it reaches someone else,"
  and a CLI release is the one artifact a customer keeps running after we've
  moved on. Green CI is necessary, not sufficient — PR #9 was green.
- **A PR label or `VERSION` file bump triggers release on merge.** Keeps
  intent explicit without a manual step, and is worth revisiting once there
  are actual customers whose update cadence benefits from it. For now it adds
  a second place a release can be decided (a label, in addition to a click)
  for no benefit nobody's yet asked for.
- **A personal access token, so a pushed tag could retrigger the workflow
  normally.** Works, but adds a long-lived credential with repo push access
  to secrets for no gain over running `package`/`publish` in the same job the
  tag job pushed from.
