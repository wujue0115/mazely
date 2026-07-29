# Recommended Repository Rules

Use a branch ruleset for `main` and a tag ruleset for `v*`.

## `main`

- Block direct pushes and force pushes.
- Require a pull request before merging.
- Require at least one approval.
- Dismiss stale approvals after new commits.
- Require all conversations to be resolved.
- Require the branch to be up to date before merging.
- Require the GitHub Actions check `CI Gate`.
- Prefer squash merge or rebase merge to keep a linear history.

Require only `CI Gate`, not the conditional `Docs CI`, `Studio CI`, or
Cloudflare Pages checks. Conditional jobs report success when skipped, while a
Cloudflare project skipped by build watch paths does not create a check run.
`CI Gate` always exists and fails if any CI job that needed to run failed.

## `release/*`

Release branches are temporary preparation branches, not deployment sources.
They may receive normal pushes and produce Cloudflare Preview deployments. The
pull request back to `main` is protected by the `main` rules above.

If multiple maintainers commit directly to a long-lived release branch, add a
separate ruleset for `release/*`; it is not required for the default
short-lived workflow.

## `v*` tags

- Restrict creation and deletion of release tags to maintainers.
- Create a tag only from the exact `main` commit that passed `CI Gate`.
- Use the npm token in GitHub Actions secrets for the first publication.
- After both packages exist, configure npm Trusted Publishing for
  `.github/workflows/release.yml`, verify an OIDC release, and remove the
  long-lived token.
- Do not require Cloudflare deployment checks for tag creation; tags publish
  npm packages and do not deploy Docs or Studio.
