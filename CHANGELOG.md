# Changelog

All notable changes to `@sun-protocol/sun-cli` are documented in this file. Format
loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `sun sunpump launch` — create a token through the SunPump agent endpoint
  (`POST /ai/agentTokenLaunch`). Server-side creation: the platform signs and
  broadcasts the creation transaction, so no local wallet is needed. Required
  `--name`/`--symbol`/`--description`; optional `--image <path>` (read and
  sent as base64) or `--image-base64`, social URLs, `--tweet-username`.
  Prints a summary and asks for confirmation (`--yes` skips); honours
  `--dry-run`. On success prints the new token's contract address, creation
  tx hash and logo URL. Mainnet only.

## [1.2.0] — 2026-05-22

End-to-end SunPump support: read-only discovery for the SunPump meme-token
launchpad, plus on-chain trading against the SunPump bonding-curve contract
via `sun-kit`. Mainnet only.

### Added

#### `sun sunpump` — read-only data (no wallet required)

- `token list` — paginated token list with filters and sort
- `token get <addr>` — token detail (price, market cap, holders, social links, listed CEXes); human mode prints a labelled key/value view, `--json` returns the raw object
- `token search <q>` / `token search-v2 <q>` — fuzzy search
- `token by-owner <addr>` — tokens created by a wallet
- `token holders <addr>` / `token holders-v2 <addr>` — top holders with a `Type` column distinguishing pools from users
- `token favors` — signed-message favourites lookup
- `token ranking --type MARKET_CAP|VOLUME_24H|PRICE_CHANGE_24H`
- `token king-of-hill`
- `token pump-list` — raw SunSwap-compatible token list
- `tx token <addr>` / `tx user <addr>` — swap history with filters
- `portfolio <wallet>` — wallet's SunPump positions with TRX value

#### `sun sunpump` — on-chain trading (wallet required)

- `state <addr>` — on-chain state with named label: `0 NOT_EXIST` / `1 TRADING` / `2 READY_TO_LAUNCH` / `3 LAUNCHED`
- `quote-buy <addr> --trx <decimal>` — read-only buy preview
- `quote-sell <addr> --amount <decimal> [--decimals 18]` — read-only sell preview
- `buy <addr> --trx <decimal> [--slippage 0.05] [--min-out <raw>]` — spend TRX, receive tokens
- `sell <addr> --amount <decimal> [--decimals 18] [--slippage 0.05] [--min-out <raw>]` — sell tokens for TRX (auto-handles first-time TRC20 approval)

All write commands go through `writeAction`: wallet check → signed summary → confirmation prompt → broadcast → Tronscan link. `--dry-run` and `--yes` work as expected. Decimal inputs (`--trx 10`, `--amount 1000`) are scaled internally by `1e6` (TRX → Sun) and `10^decimals` (tokens → raw uint256). Buy/sell summaries pre-fetch a quote so the user sees expected output and fee before confirming.

#### Output & formatting improvements

- New table configs: `tokenTable` with a `tokenPriceUsd` fallback (no more `$0` rows when the API omits the TRX/USD rate — falls back to `marketCap / totalSupply`); `holderTable` reading the correct `percentage` field with auto-detected fraction/percent units; `portfolioTable`; key/value detail view for `token get`.
- `extractList` recognises `tokens` (alongside the existing `swaps`/`holders`); `readPagination` descends into `pageData` / `metadata` and treats `size` as a `pageSize` alias.
- HTTP errors from SunPump now surface the API's `msg` field, e.g. `SunPump request failed: 400 Bad Request (/token/getRanking) — Validation error: No enum constant ...`.

### Breaking

- **Nile testnet removed** for SunPump. The host (`tn-api.sunpump.meme`) is internal-only and the test deployment is being retired. Every `sunpump` subcommand throws on non-mainnet:

  ```
  SunPump is only available on mainnet (got "nile").
  Drop --network or pass --network mainnet.
  ```

  `sun swap`, `sun price`, `sun pool …` and other non-SunPump commands continue to support nile / shasta.

- **Trimmed API surface.** The following were intentionally removed (not core to trading/discovery):

  | Removed                                                         | Reason                               |
  | --------------------------------------------------------------- | ------------------------------------ |
  | `sunpump home` (`stats` / `data` / `banners`)                   | Site-chrome data                     |
  | `sunpump tx ticker`                                             | Server hard-capped at ~15 rows       |
  | `sunpump kline` (`v1` / `v2` / `v3`)                            | Three near-identical OHLCV variants  |
  | `sunpump red-packet` (`get` / `remain` / `by-user` / `summary`) | Sun Agent campaign feature           |
  | `sunpump campaign` (`list` / `banners`)                         | Marketing banners                    |
  | `sunpump referral` (`rewards` / `invites`)                      | Back-office reporting                |
  | `sunpump admin-summary`                                         | Requires an admin password           |
  | `sunpump quota`                                                 | Third-platform integration, internal |

### Notes & gotchas

- **State enum off-by-one.** `sun-kit`'s exported `SunPumpTokenState` lists `LAUNCHED = 2`, but the on-chain contract returns `3` for tokens that have migrated to SunSwap. The CLI re-labels: state `3` prints as `LAUNCHED (3)`. Trust the printed label, not the raw int.
- **Quotes ignore on-chain state.** `quote-buy` returns a price even for `LAUNCHED` tokens (and `quote-sell` may revert with `REVERT opcode executed`). The actual `buy` / `sell` pre-checks state and throws `SUNPUMP_LAUNCHED` cleanly — call `sunpump state` first if you're routing logic.
- **First sell ≠ one transaction.** When the wallet has zero allowance, the SDK auto-sends `approve(SunPump, 2^256-1)` before the sell tx. Only the final sell tx hash is returned in `tronscanUrl`.
- **Default slippage** for bonding-curve trading is `0.05` (5%) — meme tokens are volatile. Tighten with `--slippage 0.005` or pass `--min-out <raw>` for an exact floor.

### Companion release

[`sunpump-agent-skill`](https://github.com/sun-protocol/skills/tree/main/sunpump-agent-skill)
**v1.2.0** ships in parallel — pins this CLI version, documents the new
`buy/sell/quote-*/state` commands as the pre-launch trade path with `sun swap`
as the post-launch path, and updates pre-validation checklists to enforce
`--network mainnet`.

Install:

```bash
npm install -g @sun-protocol/sun-cli@^1.2.0
npx skills add sun-protocol/skills
```
