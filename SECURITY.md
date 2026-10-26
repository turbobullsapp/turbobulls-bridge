# Security

## Reporting a problem

Please report security problems privately: use **Report a vulnerability** on this repository's
Security tab, or email hello@turbobulls.com. Do not open a public issue. Never paste an API key
into an issue, even a revoked one.

## What the bridge is designed to guarantee

- **It only listens on your computer.** It binds to `127.0.0.1` unless you pass `--host`, which
  only makes sense inside a container that publishes the port to `127.0.0.1` alone.
- **It only answers the Turbobulls app.** Every request must carry the `Origin`
  `https://app.turbobulls.com` (or `http://localhost:3000` with `--dev`). Requests from any other
  website, and requests without an `Origin` (how a website could send one blind), are refused.
- **It cannot be reached through a look-alike address.** Every request must name `127.0.0.1:47821`
  or `localhost:47821` as its `Host`, which defeats DNS rebinding.
- **It cannot be used as a proxy.** No request carries a URL. The bridge builds each provider
  request itself, and only for the four provider APIs it knows.
- **Your keys stay on your computer.** They come from environment variables or a config file the
  bridge creates readable only by you, and warns about if others can read it. A key is sent only
  to the provider it belongs to, as a header where the provider accepts one (EODHD, Twelve Data,
  Finnhub). Alpha Vantage only accepts it in the address, which the bridge never logs or reports.
  Keys never appear in log lines, error messages or answers to the app.
- **Turbobulls learns nothing.** The bridge never contacts Turbobulls. The app talks to it on your
  computer, and only sends a provider name, a symbol and dates. It never sends portfolio data.
- **Its logs hold no symbols.** A log line names the path and the outcome only.

## What it cannot protect against

Software already running on your computer with your user's rights can read your config file, the
same as any other file of yours. Keep your computer and Node.js up to date.

## Releases

Releases are built by GitHub Actions from tagged commits. The npm package is published with
provenance, so you can check it was built from this repository.
