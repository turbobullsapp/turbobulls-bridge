# Security

## Reporting a problem

Please report security problems privately: use **Report a vulnerability** on this repository's
Security tab, or email hello@turbobulls.com. Do not open a public issue. Never paste an API key
into an issue, even a revoked one.

## Supported versions

Only the latest release gets fixes, security fixes included. Updating is the fix for a problem
found in an older version.

| Version | Fixes |
|---|---|
| 1.x (latest) | Yes |
| Older | No |

## What the bridge is designed to guarantee

- **It only listens on your computer.** It binds to `127.0.0.1` unless you pass `--host`, which
  only makes sense inside a container that publishes the port to `127.0.0.1` alone.
- **It only answers the Turbobulls app.** Every request must carry the `Origin`
  `https://app.turbobulls.com` (or `http://localhost:3000` with `--dev`). Requests from any other
  website, and requests without an `Origin` (how a website could send one blind), are refused.
- **It cannot be reached through a look-alike address.** Every request must name `127.0.0.1:47821`,
  `localhost:47821` or `[::1]:47821` as its `Host`, which defeats DNS rebinding.
- **It cannot be used as a proxy.** No request carries a URL. The bridge builds each provider
  request itself, for the four provider APIs it knows and the custom sources you wrote into its
  config file; the app can only name a source, never add one or change its address. A symbol is
  encoded and can never change the host or climb out of the address's path. Redirects are never
  followed, so a request, and any key or header in it, cannot be carried to another host. The
  bridge stops reading any answer past a size limit and refuses answers with too many rows. No
  request ever sends cookies.
- **Your keys stay on your computer.** They come from environment variables or a config file the
  bridge creates readable only by you, and warns about if others can read it. A key is sent only
  to the provider it belongs to, as a header where the provider accepts one (EODHD, Twelve Data,
  Finnhub). Alpha Vantage only accepts it in the address, which the bridge never logs or reports.
  Keys never appear in log lines, error messages or answers to the app.
- **Turbobulls learns nothing.** The bridge never contacts Turbobulls. The app talks to it on your
  computer, and only sends a provider name, a symbol and dates. It never sends portfolio data. The
  app sees the names you give your own sources, never their addresses or keys.
- **Its logs hold no symbols.** A log line names the path and the outcome only. Requests refused
  for coming from another site or address are logged once, then counted once a minute, so a web
  page cannot flood the log.

## What it cannot protect against

- **Programs on your computer.** The `Origin` check stops websites, not programs. Any program that
  can reach this computer's `127.0.0.1` (another user account, a container) can send the app's
  `Origin` and run searches and price requests with your keys. A program that takes port 47821
  before the bridge starts could pretend to be it; the app treats every answer as untrusted data,
  but would show that program's prices. Run the bridge on a computer only you use.
- **Your own files.** Software running with your user's rights can read your config file, the same
  as any other file of yours.
- **Windows permissions.** On Windows the config file lives in your local profile folder, which
  Windows keeps private to your account by default; the bridge cannot check its permissions the way
  it does on macOS and Linux.

Keep your computer and Node.js up to date.

## Releases

Releases are built by GitHub Actions from tagged commits of `main`, after a maintainer approves
them. The container image is made from the npm package, and both carry a signed record of where
they were built; each GitHub release also has that record as a file next to the package.
[RELEASING.md](RELEASING.md) has the rules and the commands to check a release yourself.
