# Changelog

All notable changes are written down here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), as [RELEASING.md](RELEASING.md) explains.

## [Unreleased]

## [1.0.2] - 2026-10-29

### Added

- Each GitHub release carries the package's signed build record as a file,
  `turbobulls-bridge-<version>.tgz.sigstore.json`, to check a download against.

### Changed

- The container image is made from the npm package itself, so the two hold exactly the same code.

## [1.0.1] - 2026-10-29

### Changed

- The README's providers table says that showing Twelve Data's prices needs a paid plan.

## [1.0.0] - 2026-10-27

The first public release. It speaks version 1 of the protocol in [PROTOCOL.md](PROTOCOL.md).

### Added

- Prices for custom assets in Turbobulls from your own market-data provider, with your own API
  key: EODHD, Twelve Data, Alpha Vantage and Finnhub. For Firefox, or any browser without the
  extension.
- Sources of your own in the config file: any `https://` address that answers JSON or CSV.
- `init` creates the config file readable only by you; `test` checks each key and source with one
  small request.
- Listens on `127.0.0.1:47821` only and answers only `https://app.turbobulls.com`.
- No runtime dependencies; also a container image for `linux/amd64` and `linux/arm64`.

[Unreleased]: https://github.com/turbobullsapp/turbobulls-bridge/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/turbobullsapp/turbobulls-bridge/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/turbobullsapp/turbobulls-bridge/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/turbobullsapp/turbobulls-bridge/releases/tag/v1.0.0
