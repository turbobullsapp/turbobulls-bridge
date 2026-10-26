# turbobulls-bridge

Prices from **your own** market-data subscription, for [Turbobulls](https://turbobulls.com).

If you pay for a data provider (EODHD, Twelve Data, Alpha Vantage or Finnhub), the bridge lets
Turbobulls price assets it does not cover with that provider's data. It runs on your own computer
and uses your own API key. Turbobulls never sees the key, and never sees which symbols you look up:
the app talks to the bridge on your computer, and the bridge talks to your provider.

The bridge is for Firefox and for anyone who prefers a program to a browser extension. In Chrome
and Edge, the [Turbobulls Connector extension](https://github.com/turbobullsapp/turbobulls-extension)
does the same job with nothing to keep running.

## What it can and cannot do

- It only reaches your provider's API (`eodhd.com`, `api.twelvedata.com`, `www.alphavantage.co`,
  `finnhub.io`), and only when the Turbobulls app asks for a search or for prices.
- It only listens on `127.0.0.1`, so nothing outside your computer can reach it.
- It only answers `https://app.turbobulls.com`. Any other website, and any request without the
  app's address, is refused.
- It never accepts a web address to fetch, so it cannot be used to reach anything else.
- It never writes your key into a log line, an error or an answer to the app.
- It has no dependencies beyond Node.js itself.

## Requirements

- [Node.js](https://nodejs.org) 22 or newer, or Docker.
- An API key from at least one provider:

| Provider | Key variable | Notes |
|---|---|---|
| [EODHD](https://eodhd.com) | `EODHD_API_KEY` | Stocks, ETFs and funds on most exchanges |
| [Twelve Data](https://twelvedata.com) | `TWELVEDATA_API_KEY` | Stocks, ETFs, forex and crypto |
| [Alpha Vantage](https://www.alphavantage.co) | `ALPHAVANTAGE_API_KEY` | The free plan allows few requests a day |
| [Finnhub](https://finnhub.io) | `FINNHUB_API_KEY` | Daily prices need a paid Finnhub plan |

What you can price depends on your plan with the provider, not on the bridge.

## Start it

1. Create the config file for your keys (it is made readable only by you):

   ```bash
   npx turbobulls-bridge@0.1.0 init
   ```

2. Open the file it names (`~/.config/turbobulls-bridge/config.json` on macOS and Linux,
   `%LOCALAPPDATA%\turbobulls-bridge\config.json` on Windows) and paste your key next to your
   provider:

   ```json
   { "keys": { "eodhd": "your-key-here", "twelvedata": "", "alphavantage": "", "finnhub": "" } }
   ```

3. Check the key, then start the bridge and leave it running while you use Turbobulls:

   ```bash
   npx turbobulls-bridge@0.1.0 test
   npx turbobulls-bridge@0.1.0
   ```

Always name the version (`@0.1.0`), so `npx` runs exactly the release you chose. You can set keys
as environment variables instead of the file (`EODHD_API_KEY`, `TWELVEDATA_API_KEY`,
`ALPHAVANTAGE_API_KEY`, `FINNHUB_API_KEY`); a variable wins over the file. After editing the file,
restart the bridge.

### With Docker

Put your keys in a file only you can read, one per line (`EODHD_API_KEY=your-key`), then:

```bash
chmod 600 ~/.config/turbobulls-bridge/bridge.env
docker run --rm -p 127.0.0.1:47821:47821 --env-file ~/.config/turbobulls-bridge/bridge.env ghcr.io/turbobullsapp/turbobulls-bridge:0.1.0
```

- Keep `127.0.0.1:` in front of the port. Without it (or with `-P`), Docker opens the bridge to
  your whole network, past most firewalls, and anyone on it could use your keys.
- Keep the port 47821: the app only looks there.
- Do not write a key on the `docker run` command line (`-e EODHD_API_KEY=...`): other users of
  the computer can read command lines, and your shell keeps them in its history.

## Use it in Turbobulls

In Turbobulls, open **Settings > Data sources** and turn on **Use the bridge on this computer**.
Chrome asks once whether Turbobulls may access devices on your local network: allow it, since the
bridge is on your own computer. Then, in a custom asset, choose **From my data provider**, search
for the symbol and pick it.

Turbobulls refreshes linked prices while the app is open on a computer running the bridge, and
your other devices (your phone included) receive them through the app's normal encrypted sync.

Browsers: Chrome, Edge and Firefox. Safari does not let a secure website talk to a program on your
computer, so the bridge does not work there.

## Commands

```text
turbobulls-bridge            Start the bridge
turbobulls-bridge init       Create the config file for your keys
turbobulls-bridge test       Check each key you set with one small request
turbobulls-bridge --help     Show every option
```

Environment variables besides the keys: `TURBOBULLS_BRIDGE_CONFIG` (config file to read),
`TURBOBULLS_BRIDGE_HOST` and `TURBOBULLS_BRIDGE_PORT` (the container image sets these; leave them
alone otherwise).

## Troubleshooting

- **"Port 47821 is already in use"**: the bridge is probably already running in another window.
- **The app says it cannot find the bridge**: check the bridge is running, that you allowed local
  network access in Chrome, and that nothing else (a VPN, a firewall) blocks `127.0.0.1:47821`.
- **"refused the API key"**: run `turbobulls-bridge test` and check the key in your provider's
  dashboard.
- **"plan does not include this data"**: your provider plan does not cover that symbol or that much
  history.

## How it works

The app and the bridge speak a small protocol: `hello`, `search` and `history`. See
[PROTOCOL.md](PROTOCOL.md). The provider code in `src/shared/` is identical in the extension.

## Development

```bash
pnpm install
pnpm check          # typecheck, lint, test, build
pnpm dev            # start with http://localhost:3000 allowed, for the app's dev server
```

## License

[MIT](LICENSE)
