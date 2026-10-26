# Releasing

## Once, before the repository goes public

1. Reserve the npm name `turbobulls-bridge` from the organization's npm account (two-factor
   login on), before the README that tells people to run `npx turbobulls-bridge@...` is public.
2. On npmjs.com, set up **trusted publishing** for the package: this repository,
   `.github/workflows/release.yml`, environment `release`. No npm token is stored in GitHub.
3. In the repository settings, create the environment `release` with required reviewers, so no
   release publishes without a maintainer's approval.
4. Turn on private vulnerability reporting (Security tab).

## Each release

1. Bump `version` in `package.json` and `src/version.ts` (a test checks they match), and the
   version in the README's commands.
2. Merge to `main`, then push a tag `v<version>` on that commit.
3. Approve the `release` environment when the workflow asks. It publishes the npm package with
   provenance and the Docker image `ghcr.io/turbobullsapp/turbobulls-bridge:<version>`.
