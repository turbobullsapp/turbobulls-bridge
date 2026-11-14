# Your own sources

Prices that none of the built-in providers carry (a pension fund's daily price, a small exchange, a
spreadsheet you publish yourself) can come from any `https://` address that answers JSON or CSV,
or from a file served on your own computer.
The Connector app reads them from the `sources` list in its config file; the
[Turbobulls Connector extension](https://github.com/turbobullsapp/turbobulls-extension) keeps the
same settings on its settings page.

In Turbobulls a source appears among your custom data sources, without search: you type the symbol.
Turbobulls sees the names you give your sources, never their addresses or keys.

## Example

```json
{
  "keys": { "eodhd": "" },
  "sources": [
    {
      "id": "ecbusd",
      "name": "ECB euro in dollars",
      "url": "https://data-api.ecb.europa.eu/service/data/EXR/D.{SYMBOL}.EUR.SP00.A?format=csvdata&startPeriod={FROM}&endPeriod={TO}",
      "format": "csv",
      "csv": { "date": "TIME_PERIOD", "close": "OBS_VALUE" },
      "currency": "USD",
      "symbolHint": "Currency code, like USD",
      "testSymbol": "USD"
    },
    {
      "id": "mypension",
      "name": "My pension fund",
      "url": "https://api.example.com/funds/{SYMBOL}/prices?from={FROM}&to={TO}",
      "format": "json",
      "json": { "items": "data.prices", "date": "day", "close": "nav" },
      "currency": "EUR",
      "headers": { "X-Api-Key": "{KEY}" },
      "key": "your-key-for-this-source",
      "testSymbol": "RO1234"
    }
  ]
}
```

Run `turbobulls-bridge test` after adding a source: it fetches the last 30 days and shows what it
read, or why nothing matched.

## Settings

| Setting | What it is |
|---|---|
| `id` | 2 to 32 lower-case letters and digits, starting with a letter |
| `name` | What the app shows, up to 40 characters |
| `url` | An `https://` address, or `http://localhost` or `http://127.0.0.1` (any port) for one on your own computer. Placeholders: `{SYMBOL}`, `{FROM}` and `{TO}` (YYYY-MM-DD), `{FROM_UNIX}` and `{TO_UNIX}` (seconds), `{KEY}`. None may sit in the host name. |
| `format` | `json` or `csv` |
| `json` | `items`: dot path to the list (empty for the whole answer); `date`: dot path to the date in each item (leave it out when the list is an object keyed by date); `close`: dot path to the price |
| `csv` | `date` and `close`: column names from the header row, or column numbers from 1; `delimiter`: `,` (default), `;` or a tab |
| `dateFormat` | `YYYY-MM-DD` (default), `DD/MM/YYYY`, `MM/DD/YYYY`, `DD.MM.YYYY`, `YYYYMMDD`, `unix`, `unixms` |
| `decimal` | `.` (default) or `,` when prices are written like `1.234,56` |
| `currency` | Three letters (`EUR`), or `GBp` / `GBX` for pence: prices are then divided by 100 |
| `headers` | Up to 5 extra request headers; a value can hold `{KEY}` |
| `key` | The key for this source, used where the address or a header says `{KEY}` |
| `symbolHint` | Label for the app's symbol box, like "Fund code" |
| `testSymbol` | A symbol `turbobulls-bridge test` asks for, to check the source |

## Answers it can read

A JSON answer can hold:

- a list of items: `[{ "day": "2026-10-23", "nav": 12.4 }]`;
- an object keyed by date: `{ "2026-10-23": { "USD": 1.12 } }`;
- two parallel lists of dates and prices: `{ "t": [...], "c": [...] }`, with `date` and `close`
  pointing at them.

A CSV answer needs a header row, or column numbers in `csv.date` and `csv.close`.

## Prices kept on your computer

For prices you keep yourself, such as a fund priced from monthly statements, the address can be on
your own computer: `http://localhost` or `http://127.0.0.1`, on any port. Plain `http://` is
accepted only for these two, since such a request never leaves the computer. Every other address
needs `https://`, a machine elsewhere on your network included.

Any small web server can serve the file. For example, in the folder that holds `pension.csv`:

```sh
python3 -m http.server 8090 --bind 127.0.0.1
```

Then the source's `url` is `http://localhost:8090/{SYMBOL}.csv`, and its symbol is `pension`. The
server has to be running when Turbobulls asks for prices.

Serve a folder that holds only your price files, and keep `--bind 127.0.0.1`: without it, anyone on
the same network, such as a cafe's Wi-Fi, can open that folder.

In the Docker image, `localhost` is the container itself, not your computer, so a server on your
computer is out of its reach. Run the Connector app with `npx turbobulls-bridge` for a source like
this.

## Rules

- **No redirects.** The Connector never follows one: give it the address the data finally comes
  from. A link that redirects, such as some spreadsheet "publish to the web" links, will not work.
  So a request, and any key or header in it, goes only to the address you wrote.
- **Your keys stay yours.** A source's key is used only where its address or a header says `{KEY}`,
  and it never appears in an answer to the app, a message or a log.
- **Use only sources whose terms allow this use.**
