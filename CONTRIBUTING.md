# Contributing

- Branch off `main` and open a pull request; nothing is committed to `main` directly. `main`
  only changes through pull requests whose checks pass (tests, CodeQL).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
  (`feat:`, `fix:`, `docs:`, `chore:` ...).
- Run `pnpm check` (typecheck, lint, tests, build) before pushing.
- Write plain words, and use `-` rather than a long dash.
- `src/shared/` is identical in `turbobulls-extension`. A change there is made in both repositories.
- Never paste a real API key into code, tests, fixtures, issues or pull requests.
- A change people will notice gets a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).
- Releases follow [RELEASING.md](RELEASING.md).
