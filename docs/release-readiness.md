# Release readiness

This repository separates local verification, integration verification, and release promotion. A passing test suite is not evidence that an artifact was published, trusted by Windows, recoverable, or observable in production.

## Gate checklist

### Development

- [ ] Confirm canonical repository, branch, exact HEAD, upstream, and a clean working tree.
- [ ] Run npm ci --ignore-scripts, node --test test/*.mjs, and git diff --check --exit-code.
- [ ] Confirm the tracked package-lock.json is used by CI.

### Integration

- [ ] Confirm hosted CI completed successfully for the exact candidate SHA.
- [ ] Confirm review and required-check enforcement on the default branch. If branch protection or rulesets are absent, record integration readiness as partial.
- [ ] Inspect workflow concurrency before interpreting a cancelled run.

### Release promotion

- [ ] Verify the artifact manifest against every artifact intended for publication.
- [ ] Verify Authenticode status and issuer. A self-issued certificate is local integrity evidence, not public publisher trust.
- [ ] Confirm the candidate version and tag do not already exist, then verify the tag points to the tested SHA.
- [ ] Push only the intended commit set and re-read the remote branch.
- [ ] Publish through the documented Cloudflare path, then fetch the public URL and verify status, filename, checksum, and version.

### Recovery and operations

- [ ] Record backup scheduler, destination, retention, checksum, and latest execution evidence.
- [ ] Complete a restore drill and record RPO/RTO. A backup UI or archive listing is not restore evidence.
- [ ] Record rollback to the previous known-good deployment.
- [ ] Record runtime error monitoring, alert ownership, and incident-response contact path.

## Current repository evidence

Local development and exact-SHA hosted CI were verified in the preceding audit. Branch protection or rulesets, release publication, public-trust signing, backup restore, rollback, and runtime observability remained unverified or blocked. Re-run live checks at the candidate SHA; this document is not a status cache.

## Promotion order

Keep local verification, commit, push, hosted-CI verification, tag, publication, and post-publication probe separate. Do not push, tag, publish, or deploy from this checklist without explicit operational authorization.
