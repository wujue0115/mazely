# Cloudflare Pages Configuration

Docs and Studio use separate Cloudflare Pages projects connected to this GitHub
repository. GitHub Actions validates changes but does not deploy either site.

## Shared settings

Configure both projects with:

| Setting                          | Value                          |
| -------------------------------- | ------------------------------ |
| Production branch                | `main`                         |
| Automatic production deployments | Enabled                        |
| Root directory                   | Repository root (blank or `/`) |
| Build system                     | V2 or later                    |
| `NODE_VERSION`                   | `24`                           |
| `PNPM_VERSION`                   | `10.28.0`                      |
| `SKIP_DEPENDENCY_INSTALL`        | `1`                            |

The repository also pins these tools in `.node-version` and
`package.json#packageManager`. `SKIP_DEPENDENCY_INSTALL=1` prevents a separate
implicit install; each build command below performs one reproducible frozen
install.

For Preview branch control, select **Custom branches** and include:

```text
docs/*
feat/*
fix/*
release/*
```

Leave Preview excludes empty. Do not add `next` or `studio/*`.

Preview deployments are public by default. Enable a Cloudflare Access policy if
pre-release APIs or Studio features should be restricted to maintainers.

## Docs: `mazely-docs`

| Setting                | Value                                               |
| ---------------------- | --------------------------------------------------- |
| Custom domain          | `mazely.dev`                                        |
| Build command          | `pnpm install --frozen-lockfile && pnpm docs:build` |
| Build output directory | `docs/.vitepress/dist`                              |

Build watch include paths:

```text
docs/*
packages/mazely/package.json
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/prepare.ts
tsconfig.json
.node-version
```

The displayed Docs version comes from `packages/mazely/package.json`. Content
fixes for the currently published version do not require a version bump.

## Studio: `mazely-studio`

| Setting                | Value                                                 |
| ---------------------- | ----------------------------------------------------- |
| Custom domain          | `studio.mazely.dev`                                   |
| Build command          | `pnpm install --frozen-lockfile && pnpm studio:build` |
| Build output directory | `apps/studio/dist`                                    |

Build watch include paths:

```text
apps/studio/*
packages/core/*
packages/mazely/*
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/prepare.ts
tsconfig.json
.node-version
```

Package paths are included because Studio resolves the monorepo package source
directly. Studio displays the current `packages/mazely/package.json` version
using the `vX.Y.Z` format.

## Deployment behavior

| Event                    | GitHub Actions         | Cloudflare Pages               | npm              |
| ------------------------ | ---------------------- | ------------------------------ | ---------------- |
| Push allowed work branch | CI only for an open PR | Affected Preview project       | No               |
| Pull request to `main`   | `CI Gate`              | Preview links appear on the PR | No               |
| Merge to `main`          | CI                     | Affected production project    | No               |
| Push `vX.Y.Z` tag        | Release verification   | No deployment                  | Publish packages |

Build watch paths may prevent a Cloudflare project from creating a check run.
For this reason, branch protection must require GitHub Actions `CI Gate`, not
Cloudflare checks or the conditional project jobs.
