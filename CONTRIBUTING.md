# Contributing Guide

This repository uses `main` as the production source for Docs and Studio, with
short-lived work branches and temporary versioned release branches.

## Branching Model

- `main`: protected, releasable, and the production source for Docs and Studio.
- `feat/<topic>`: product or package features.
- `fix/<topic>`: bug fixes.
- `docs/<topic>`: documentation-only changes.
- `release/<major.minor.patch>`: preparation and integration for one package
  release, for example `release/0.2.0`.

Do not use `next` or `studio/*` branches. Studio work belongs in `feat/*` or
`fix/*`.

## Development Flow

1. Create a short-lived branch from `main`.
2. Make focused changes and add tests.
3. Run the complete local verification:

```bash
pnpm test:ci
```

4. Open a pull request to `main`.
5. Review the applicable Docs and Studio Cloudflare Preview deployments.
6. Merge only after `CI Gate` passes.

Cloudflare may create a Preview as soon as an allowed non-production branch is
pushed. Opening a pull request adds the deployment link to GitHub; it does not
initiate the first branch deployment.

## Commit Message Convention

Use Conventional Commits with a package or application scope where useful.

- `feat(core): add X`
- `feat(studio): add Y`
- `fix(docs): correct Z`
- `chore(repo): update CI`

## Documentation Fixes

Documentation for the current package version may be corrected without a
package version bump:

```text
main
→ docs/fix-example
→ pull request and Docs Preview
→ merge to main
→ mazely.dev
```

## Studio Updates

Studio is continuously deployed and does not have to share the npm package
version:

```text
main
→ feat/studio-export
→ pull request and Studio Preview
→ merge to main
→ studio.mazely.dev
```

The deployed Studio displays the current `packages/mazely/package.json` version
as `vX.Y.Z`.

## Package Release Flow

1. Create `release/X.Y.Z` from `main`.
2. Implement and stabilize package changes on that branch.
3. Move the relevant changelog entries from `Unreleased` into a dated `X.Y.Z`
   section.
4. Set the same version in the root, `@mazely/core`, and `mazely`
   `package.json` files.
5. Update Docs and Studio integration for that version.
6. Open a pull request to `main` and review Docs and Studio Previews.
7. Merge after `CI Gate` passes.
8. Immediately tag the exact merged `main` commit as `vX.Y.Z` and push the tag.
9. Confirm the Release workflow publishes both npm packages and creates the
   GitHub Release.

The Release workflow rejects a tag that is not on `main`, does not match all
three package manifests, lacks changelog notes, fails the complete release
verification, or produces packages that cannot be installed, imported, and
typechecked as a clean consumer.

Cloudflare production builds begin after the merge to `main`, while npm
publishing begins after the tag is pushed. These systems are independent, so
this model permits a short period where the new Docs are deployed before npm
publishing finishes. If strict publish-before-Docs ordering becomes necessary,
disable automatic Docs production deployments and trigger them only after the
Release workflow succeeds.

## Pull Request Checklist

- [ ] Changes are scoped and documented.
- [ ] Tests were added or updated when behavior changed.
- [ ] `pnpm test:ci` passes locally.
- [ ] The commit and pull request title follow Conventional Commits.
- [ ] Relevant Cloudflare Previews were reviewed.
