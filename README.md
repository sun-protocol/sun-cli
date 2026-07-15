# sun-cli

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Network](https://img.shields.io/badge/Network-TRON-red)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)

> A CLI for AI-driven and human-operated DeFi workflows on TRON via the **SUN.IO / SUNSWAP** ecosystem.

`@sun-protocol/sun-cli` connects your terminal, scripts, or AI agents to SUN.IO. Use it to **query** prices, pools, farms, and history; **quote** swap routes; and **execute** swaps, liquidity ops, and contract calls — all with machine-friendly output for automation.

---

## Table of Contents

- [Highlights](#highlights)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Getting Help](#getting-help)
  - [Built-In Help](#built-in-help)
  - [Shell Completion](#shell-completion)
- [Configuration](#configuration)
  - [Wallet](#wallet)
  - [Network](#network)
- [Command Reference](#command-reference)
  - [Wallet & Portfolio](#wallet--portfolio)
  - [Price & Discovery](#price--discovery)
  - [Swap](#swap)
  - [Liquidity](#liquidity)
  - [Protocol & History](#protocol--history)
  - [Generic Contract](#generic-contract)
  - [SunPump](#sunpump)
  - [Nile E2E Self-Test](#nile-e2e-self-test)
- [Global Flags](#global-flags)
- [Output Formats](#output-formats)
- [Built-In Token Symbols](#built-in-token-symbols)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Development](#development)
- [License](#license)

---

## Highlights

- **Read anything** — token prices, pools, farms, positions, transaction history, and protocol metrics
- **Quote and route** — best-route quotes across SUNSwap V1/V2/V3/V4
- **Execute on-chain** — swaps, liquidity management (V2/V3/V4), and arbitrary contract writes
- **Meme tokens** — SunPump discovery, one-command token launching, and bonding-curve trading
- **Automate** — JSON output, field filters, `--dry-run`, and `--yes` for non-interactive use
- **Read-only out of the box** — no wallet required for queries and quotes

---

## Installation

```bash
npm install -g @sun-protocol/sun-cli
```

Requires Node.js **20+**.

---

## Quick Start

### 1. Get a token price

```bash
$ sun price TRX
```

```text
✔ Fetching prices...
┌───────┬────────────────┐
│ Token │ Price (USD)    │
├───────┼────────────────┤
│ TRX   │ 0.301739439813 │
└───────┴────────────────┘
```

### 2. Find the highest-APY pools

```bash
$ sun pool top-apy --page-size 5
```

```text
✔ Fetching top APY pools...
┌────────────────────────────────────┬────────┬─────────┬────────┬────────────────┐
│ Pool                               │ Token0 │ Token1  │ APY    │ TVL            │
├────────────────────────────────────┼────────┼─────────┼────────┼────────────────┤
│ TXX1i3BWKBuTxUmTERCztGyxSSpRagEcjX │ TRX    │ USDCOLD │ 29.13% │ $215,543.763   │
│ TDJUxxbmxwC5gUHXm2on4ZHJwjzwkBcJ8s │ TEM    │ WTRX    │ 27.50% │ $168,679.435   │
│ TVrZ3PjjFGbnp44p6SGASAKrJWAUjCHmCA │ TRX    │ ETH     │ 14.61% │ $286,068.322   │
│ TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE │ TRX    │ USDT    │ 13.60% │ $1,179,854.455 │
│ TDR7rpU33hToG8qo9i676V56bzcjkpjqox │ WTRX   │ SUNDOG  │ 8.38%  │ $782,507.15    │
└────────────────────────────────────┴────────┴─────────┴────────┴────────────────┘
```

### 3. Quote a swap (no wallet needed)

```bash
$ sun swap:quote TRX USDT 1000000 --network nile
```

```text
✔ Fetching quote...
Found 3 route(s) for swap:

  Path:         TRX → WIN → USDJ → USDT
  Pools:        v1 → v2 → old3pool
  Amount In:    1.000000
  Amount Out:   66.028258
  Price Impact: -0.183279

  (2 more route(s) available, use --all to see them)
```

### 4. Execute a swap (wallet required)

```bash
$ sun swap TRX USDT 1000000 --network nile --yes
```

```text
Swap Preview
  Token In   TRX (T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb)
  Token Out  USDT (TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf)
  Amount In  1000000
  Slippage   0.50%
  Network    nile

✔ Executing swap...

Swap executed successfully
  TxID:        4b2ae5186666d30c9f034489813a43ad8edc771f7228759b5e6145a6f134834e
  Tronscan:    https://nile.tronscan.org/#/transaction/4b2ae518...
  Route:       TRX → WIN → USDJ → USDT
  Amount Out:  66.028258
  Price Impact:-0.183279
```

> **Note:** Write operations (`swap`, `liquidity`, `contract send`) require a configured wallet. See [Configuration](#configuration).

---

## Getting Help

### Built-In Help

Every command level supports `--help` (or `-h`). Use it to discover options, subcommands, and flag aliases without leaving the terminal.

| Command                    | What it shows                                                          |
| -------------------------- | ---------------------------------------------------------------------- |
| `sun --help`               | Top-level overview, global flags, full command list                    |
| `sun --version`            | Installed CLI version                                                  |
| `sun <group> --help`       | Subcommand group help (e.g. `sun pool --help`, `sun liquidity --help`) |
| `sun <group> <cmd> --help` | Leaf command help with all options (e.g. `sun pool top-apy --help`)    |
| `sun help <command>`       | Equivalent to `<command> --help`                                       |

```bash
sun --help                       # global flags + command list
sun pool --help                  # all pool subcommands
sun pool top-apy --help          # options for `pool top-apy`
sun help swap                    # equivalent to `sun swap --help`
sun --version                    # print installed version
```

### Shell Completion

Tab completion is **not bundled**. The two snippets below give you top-level command-name completion in your shell — drop them in your shell rc file and re-source it.

**zsh** (`~/.zshrc`):

```zsh
_sun_cmds() {
  compadd -- wallet price swap swap:quote swap:quote-raw swap:exact-input \
    token pool protocol tx position pair farm liquidity contract sunpump e2e help
}
compdef _sun_cmds sun
```

**bash** (`~/.bashrc`):

```bash
_sun_cmds() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "wallet price swap swap:quote swap:quote-raw \
    swap:exact-input token pool protocol tx position pair farm liquidity \
    contract sunpump e2e help" -- "$cur") )
}
complete -F _sun_cmds sun
```

For richer completion (subcommands, flags, token symbols), wrap the CLI with [`omelette`](https://github.com/f/omelette) or [`tabtab`](https://github.com/mklabs/tabtab) — neither is required for normal use.

---

## Configuration

### Wallet

Wallets are managed by [`agent-wallet`](https://github.com/BofAI/agent-wallet?tab=readme-ov-file#quick-start) — install and configure it first. Legacy `TRON_PRIVATE_KEY`, `TRON_MNEMONIC`, and `TRON_MNEMONIC_ACCOUNT_INDEX` variables are no longer read.

You can override wallet settings per-invocation with these root flags:

| Flag                               | Purpose                          |
| ---------------------------------- | -------------------------------- |
| `-k, --private-key <key>`          | One-shot private key             |
| `-m, --mnemonic <phrase>`          | One-shot mnemonic                |
| `-i, --mnemonic-account-index <n>` | Mnemonic account index           |
| `-p, --agent-wallet-password <pw>` | Override `AGENT_WALLET_PASSWORD` |
| `-d, --agent-wallet-dir <dir>`     | Override `AGENT_WALLET_DIR`      |

See [`agent-wallet`](https://github.com/BofAI/agent-wallet?tab=readme-ov-file#quick-start) for file formats and the full set of `AGENT_WALLET_*` options.

### Network

| Variable           | Purpose                                 | Default   |
| ------------------ | --------------------------------------- | --------- |
| `TRON_NETWORK`     | Target network (`mainnet`, `nile`, …)   | `mainnet` |
| `TRONGRID_API_KEY` | TronGrid API key for higher rate limits | —         |
| `TRON_RPC_URL`     | Custom RPC endpoint                     | —         |

```bash
export TRON_NETWORK=mainnet
export TRONGRID_API_KEY="<YOUR_KEY>"
export TRON_RPC_URL=https://your-tron-rpc.example
```

---

## Command Reference

### Wallet & Portfolio

```bash
sun wallet address
sun wallet balances
sun wallet balances --owner TYourAddress --tokens TRX,TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

sun position list --owner TYourAddress
sun position tick <poolAddress>
sun farm positions --owner TYourAddress
```

### Price & Discovery

**Prices:**

```bash
sun price TRX
sun price USDT
sun price --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
```

**Tokens, pools, pairs, farms:**

```bash
sun token list --protocol V3
sun token search USDT
sun token approve --token USDT --spender <spenderAddress> --amount 1000000

sun pool list --token TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
sun pool search "TRX USDT"
sun pool top-apy --page-size 10
sun pool hooks

sun pair info --token TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
sun farm list
```

### Swap

**High-level:**

```bash
sun swap TRX USDT 1000000 --slippage 0.005
sun -k <private_key> --network nile --yes swap TRX USDT 1000000
```

**Quote only:**

```bash
sun swap:quote TRX USDT 1000000
sun swap:quote TRX USDT 1000000 --all
```

**Low-level router calls:**

```bash
sun swap:quote-raw   --router <routerAddress> --args '[...]'
sun swap:exact-input --router <routerAddress> --args '[...]' --value 1000000
```

A successful broadcast response includes `txid`, route details (when available), and a `tronscanUrl` for the active network.

### Liquidity

**V2:**

```bash
sun liquidity v2:add    --token-a TRX --token-b USDT --amount-a 1000000 --amount-b 290000
sun liquidity v2:remove --token-a TRX --token-b USDT --liquidity 500000
```

**V3:**

```bash
sun liquidity v3:mint     --token0 TRX --token1 USDT --amount0 1000000
sun liquidity v3:increase --token-id 123 --amount0 500000
sun liquidity v3:decrease --token-id 123 --liquidity 1000
sun liquidity v3:collect  --token-id 123
```

**V4:**

```bash
sun liquidity v4:mint     --token0 TRX --token1 USDT --amount0 1000000
sun liquidity v4:mint     --token0 TRX --token1 USDT --amount0 1000000 --create-pool
sun liquidity v4:increase --token-id 123 --token0 TRX --token1 USDT --amount0 500000
sun liquidity v4:decrease --token-id 123 --liquidity 1000 --token0 TRX --token1 USDT
sun liquidity v4:collect  --token-id 123
sun liquidity v4:info     --pm <positionManager> --token-id 123
```

### Protocol & History

**Protocol-wide analytics:**

```bash
sun protocol info
sun protocol vol-history    --start 2026-01-01 --end 2026-03-01
sun protocol users-history  --start 2026-01-01 --end 2026-03-01
sun protocol tx-history     --start 2026-01-01 --end 2026-03-01
sun protocol pools-history  --start 2026-01-01 --end 2026-03-01
sun protocol liq-history    --start 2026-01-01 --end 2026-03-01
```

**Per-pool and transaction history:**

```bash
sun pool vol-history <poolAddress> --start 2026-01-01 --end 2026-03-01
sun pool liq-history <poolAddress> --start 2026-01-01 --end 2026-03-01
sun tx scan --type swap --token TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --start 2026-01-01
```

### Generic Contract

Read or write to any TRON smart contract:

```bash
sun contract read <contractAddress> balanceOf --args '["TYourAddress"]'
sun contract send <contractAddress> transfer  --args '["TRecipient","1000000"]' --value 0
```

`contract send` returns a `tronscanUrl` on successful broadcast.

### SunPump

Access to SunPump — read-only API for discovery (token launches, trending lists,
holder portfolios), token creation via the agent endpoint (`launch`), and
on-chain trade commands (`buy`/`sell`/`quote-buy`/`quote-sell`/`state`) that talk
to the bonding-curve contract through `@sun-sdk/*`. Read-only API calls and `launch`
need no wallet; trade commands do.

SunPump is **mainnet only** — both the API host (`https://api-v2.sunpump.meme/pump-api`)
and the on-chain bonding-curve contract. Passing `--network nile` (or any non-mainnet
value) to a `sunpump` subcommand will fail fast.

```bash
sun sunpump token king-of-hill                     # current king-of-the-hill token
sun sunpump token list --size 20 --sort marketCap,desc
sun sunpump token search <keyword> --size 10
sun sunpump token get <contractAddress>            # token detail
sun sunpump token holders <contractAddress> --size 20
sun sunpump token ranking --type MARKET_CAP --size 10        # also: VOLUME_24H, PRICE_CHANGE_24H

sun sunpump tx token <contractAddress> --size 20   # swap history for a token
sun sunpump tx user <walletAddress> --size 20      # swap history for a wallet

sun sunpump portfolio <walletAddress> --include-zero
```

Launch a new token through the SunPump agent endpoint (server-side creation —
no wallet needed; asks for confirmation, `--yes` to skip, `--dry-run` to preview):

```bash
sun sunpump launch --name MyToken --symbol MTK \
  --description "my meme token" --image ./logo.png \
  --twitter-url https://x.com/mytoken --website-url https://mytoken.xyz
```

`--image <path>` reads a local file and sends it as base64; pass `--image-base64`
to supply the encoded string directly. On success the CLI prints the new token's
contract address and creation tx hash.

Trade on the bonding curve (requires a wallet; pre-launch tokens only — once a token
migrates to SunSwap, use `sun swap` instead):

```bash
sun sunpump state <contractAddress>                       # 0 NOT_EXIST · 1 TRADING · 2 READY_TO_LAUNCH · 3 LAUNCHED
sun sunpump quote-buy  <contractAddress> --trx 10         # preview, no tx
sun sunpump quote-sell <contractAddress> --amount 1000

sun sunpump buy  <contractAddress> --trx 10                                 # spend 10 TRX
sun sunpump buy  <contractAddress> --trx 10 --slippage 0.1                  # 10% slippage
sun sunpump sell <contractAddress> --amount 1000                            # sell 1000 tokens (assumes 18 decimals)
sun sunpump sell <contractAddress> --amount 1000 --decimals 6               # override token decimals
sun --dry-run sunpump buy <contractAddress> --trx 10                        # show params without sending
```

`--trx` and `--amount` accept decimal values; CLI scales by TRX-Sun (1e6) and token
decimals (default 18) before calling the contract. Default slippage is 5% (meme tokens
move fast); pass `--slippage 0.005` for 0.5% or `--min-out <raw>` for an exact floor in
base units.

Endpoints requiring a signed message (`favors`) accept `--user-address`,
`--signature`, `--signed-message` flags. Override the base URL with
`SUNPUMP_API_BASE_URL` only when you have a custom mainnet-compatible host.

### Nile E2E Self-Test

Run CLI-level self-tests against Nile to verify `sun-cli` is wired to `sun-sdk`
core functions:

```bash
npm run test:e2e:nile
# or
sun e2e nile
```

By default this runs read-only checks, swap quote checks, contract reads, wallet
queries when a wallet is configured, and dry-run coverage for write commands.
It does not broadcast transactions.

```bash
sun e2e nile --write
```

`--write` adds real Nile transactions for the small configurable write set. Use a
funded Nile test wallet and keep amounts tiny. Optional environment variables:

| Variable              | Purpose                                          | Default          |
| --------------------- | ------------------------------------------------ | ---------------- |
| `SUN_E2E_OWNER`       | Owner address for owner-scoped checks            | wallet           |
| `SUN_E2E_ROUTER`      | Nile V2 router used by approve/V2 liquidity      | `TYMj...E25p`    |
| `SUN_E2E_SPENDER`     | Spender used by `token approve`                  | router           |
| `SUN_E2E_TOKEN_ID`    | Position token id for position dry-runs          | `1`              |
| `SUN_E2E_LIQUIDITY`   | Liquidity amount for remove/decrease checks      | `1`              |
| `SUN_E2E_SWAP_IN`     | Token in for write swap                          | `TRX`            |
| `SUN_E2E_SWAP_OUT`    | Token out for write swap                         | `SUN`            |
| `SUN_E2E_SWAP_AMOUNT` | Raw token-in amount for write swap               | `1000000`        |
| `SUN_E2E_V2_TOKEN_A`  | Token A for V2 liquidity checks                  | Nile USDT        |
| `SUN_E2E_V2_TOKEN_B`  | Token B for V2 liquidity checks                  | `TDqj...fKKk`    |
| `SUN_E2E_V2_AMOUNT_A` | Token A amount for write V2 add liquidity        | `100000`         |
| `SUN_E2E_V2_AMOUNT_B` | Optional token B amount for write V2 add liquidity; omitted by default so CLI auto-quotes from reserves | unset |
| `SUN_E2E_V2_REMOVE_LIQUIDITY` | LP amount for write V2 remove liquidity | `SUN_E2E_LIQUIDITY` |
| `SUN_E2E_CL_TOKEN0`   | Token0 for V3/V4 concentrated liquidity dry-runs | Nile USDT        |
| `SUN_E2E_CL_TOKEN1`   | Token1 for V3/V4 concentrated liquidity dry-runs | `TDqj...fKKk`    |
| `SUN_E2E_V4_PM`       | V4 position manager used by `v4:info`            | Nile SDK default |

---

## Global Flags

Inherited by every subcommand:

| Flag                               | Description                            |
| ---------------------------------- | -------------------------------------- |
| `--output <format>`                | Output format: `table`, `json`, `tsv`  |
| `--json`                           | Shortcut for `--output json`           |
| `--fields <list>`                  | Comma-separated field filter           |
| `--network <network>`              | Override `TRON_NETWORK`                |
| `-k, --private-key <key>`          | One-shot private key                   |
| `-m, --mnemonic <phrase>`          | One-shot mnemonic                      |
| `-i, --mnemonic-account-index <n>` | Mnemonic account index                 |
| `-p, --agent-wallet-password <pw>` | Override `AGENT_WALLET_PASSWORD`       |
| `-d, --agent-wallet-dir <dir>`     | Override `AGENT_WALLET_DIR`            |
| `-y, --yes`                        | Skip confirmation prompts              |
| `--dry-run`                        | Print intent without sending the write |

**Examples:**

```bash
sun --json price TRX
sun --output tsv pool top-apy --page-size 10
sun --fields address,network wallet address
sun --json --fields txid,tronscanUrl swap TRX USDT 1000000
sun --dry-run contract send TContract transfer --args '["TRecipient","1000000"]'
```

---

## Output Formats

| Mode                | When to use                                  |
| ------------------- | -------------------------------------------- |
| `table` _(default)_ | Human-friendly terminal output               |
| `json`              | Machine-readable JSON for scripts and agents |
| `tsv`               | Tab-separated values for shell pipelines     |

```bash
sun pool top-apy --page-size 5
sun --json wallet address
sun --output tsv token list --protocol V3
```

---

## Built-In Token Symbols

Most commands accept these symbols anywhere a token is expected.

| Symbol | Address                              | Decimals |
| ------ | ------------------------------------ | -------- |
| `TRX`  | `T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb` | 6        |
| `WTRX` | `TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR` | 6        |
| `USDT` | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6        |
| `USDC` | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` | 6        |
| `USDD` | `TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn` | 18       |
| `SUN`  | `TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S` | 18       |
| `JST`  | `TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9` | 18       |
| `BTT`  | `TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4` | 18       |
| `WIN`  | `TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7` | 6        |

Symbols and raw addresses are interchangeable:

```bash
sun swap TRX USDT 1000000
sun swap T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t 1000000
```

---

## Troubleshooting

Quick lookup for the most common errors:

| Error                    | Category     | Jump to                                         |
| ------------------------ | ------------ | ----------------------------------------------- |
| `unknown command 'nile'` | CLI parsing  | [▸ Flag placement](#error-unknown-command-nile) |
| `No wallet configured`   | Wallet setup | [▸ Wallet sources](#error-no-wallet-configured) |
| `Swap failed`            | Execution    | [▸ Swap diagnostics](#error-swap-failed)        |

### Error: `unknown command 'nile'`

> **Category:** CLI argument parsing — root flags placed after the subcommand.

Root flags must come **before** the subcommand:

```bash
sun --network nile swap TRX USDT 1000000
```

When invoking through npm, separate args with `--`:

```bash
npm run start -- --network nile swap TRX USDT 1000000
```

### Error: `No wallet configured`

> **Category:** Wallet configuration — no credential source detected.

Set exactly one wallet source:

- `AGENT_WALLET_PRIVATE_KEY`
- `AGENT_WALLET_MNEMONIC`
- `AGENT_WALLET_PASSWORD`

…or pass the equivalent root flag (`-k`, `-m`, `-p`) for that invocation.

### Error: `Swap failed`

> **Category:** Transaction execution — broadcast or routing rejected.

Common causes:

- Wallet not configured
- Unsupported token symbol
- Insufficient balance
- RPC or router API failure
- Stale or invalid route parameters

Run `swap:quote` first, then re-run with `--yes` once the quote looks right.

---

## Security

- Treat `AGENT_WALLET_PRIVATE_KEY`, `AGENT_WALLET_MNEMONIC`, and `AGENT_WALLET_PASSWORD` as secrets.
- Prefer environment variables over CLI flags — shell history and process lists can leak secrets.
- Use a dedicated automation wallet, not your treasury wallet.
- Use `--dry-run` before any high-value write.
- Verify token addresses carefully when not using built-in symbols.
- Quotes are estimates, not guarantees — markets move.

---

## Development

```bash
npm install
npm run build
npm test
npm run lint
npm run test:e2e:nile
```

Run from source:

```bash
npm run dev -- price TRX
```

---

## License

MIT
