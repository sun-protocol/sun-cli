# sun-cli

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Network](https://img.shields.io/badge/Network-TRON-red)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)

A CLI for AI-driven and human-operated DeFi workflows on the TRON network through the SUN.IO / SUNSWAP ecosystem.

## Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
  - [Install](#install)
  - [Example Commands](#example-commands)
  - [Configuration](#configuration)
    - [Wallet Configuration](#wallet-configuration)
    - [Network Configuration](#network-configuration)
- [Command Reference](#command-reference)
  - [Wallet & Portfolio](#wallet--portfolio)
  - [Price](#price)
  - [Token](#token)
  - [Swap](#swap)
  - [Pool](#pool)
  - [Liquidity](#liquidity)
  - [Position](#position)
  - [Pair](#pair)
  - [Farm](#farm)
  - [Protocol](#protocol)
  - [Transaction](#transaction)
  - [Contract](#contract)
- [Global Flags](#global-flags)
- [Output Modes](#output-modes)
- [Built-In Token Symbols](#built-in-token-symbols)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)
- [Development](#development)
- [License](#license)

## Overview

Connect your terminal, scripts, or AI agents to SUN.IO through a single CLI. With `@bankofai/sun-cli`, you can:

- **Query** token prices, pools, protocol metrics, farm data, positions, and transaction history
- **Quote** swap routes across SUNSwap routing paths
- **Execute** swaps, liquidity management, and contract writes with a configured wallet
- **Automate** machine-friendly workflows with compact JSON, field filtering, dry-run mode, and no-prompt execution

The CLI supports both interactive terminal usage and automation-oriented invocation patterns. Without wallet credentials, read-only commands still work.

## Quick Start

### Install

Install from npm:

```bash
npm install -g @bankofai/sun-cli
```

### Example Commands

Read-only:

```bash
$ sun price TRX
```

Example response for `sun price TRX`:

```text
✔ Fetching prices...
┌───────┬────────────────┐
│ Token │ Price (USD)    │
├───────┼────────────────┤
│ TRX   │ 0.301739439813 │
└───────┴────────────────┘
```

```bash
$ sun pool top-apy --page-size 5
```

Example response for `sun pool top-apy --page-size 5`:

```text
✔ Fetching top APY pools...
┌────────────────────────────────────┬────────┬─────────┬────────┬────────────────┐
│ Pool                               │ Token0 │ Token1  │ APY    │ TVL            │
├────────────────────────────────────┼────────┼─────────┼────────┼────────────────┤
│ TXX1i3BWKBuTxUmTERCztGyxSSpRagEcjX │ TRX    │ USDCOLD │ 29.13% │ $215,543.763   │
├────────────────────────────────────┼────────┼─────────┼────────┼────────────────┤
│ TDJUxxbmxwC5gUHXm2on4ZHJwjzwkBcJ8s │ TEM    │ WTRX    │ 27.50% │ $168,679.435   │
├────────────────────────────────────┼────────┼─────────┼────────┼────────────────┤
│ TVrZ3PjjFGbnp44p6SGASAKrJWAUjCHmCA │ TRX    │ ETH     │ 14.61% │ $286,068.322   │
├────────────────────────────────────┼────────┼─────────┼────────┼────────────────┤
│ TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE │ TRX    │ USDT    │ 13.60% │ $1,179,854.455 │
├────────────────────────────────────┼────────┼─────────┼────────┼────────────────┤
│ TDR7rpU33hToG8qo9i676V56bzcjkpjqox │ WTRX   │ SUNDOG  │ 8.38%  │ $782,507.15    │
└────────────────────────────────────┴────────┴─────────┴────────┴────────────────┘
```

```bash
$ sun swap:quote TRX USDT 1000000 --network nile
```

Example response for `sun swap:quote TRX USDT 1000000 --network nile`:

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

Wallet-aware: See [Wallet Configuration](#wallet-configuration).

```bash
$ sun wallet address
```

Example response for `sun wallet address`:

```json
{ "address": "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB", "network": "mainnet" }
```

```bash
$ sun swap TRX USDT 1000000 --network nile --yes
```

Example response for `sun swap TRX USDT 1000000 --network nile --yes`:

```text
Swap Preview
  Token In   TRX (T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb)
  Token Out  USDT (TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf)
  Amount In  1000000
  Slippage   0.50%
  Network    nile

✔ Executing swap...
{"txid":"4b2ae5186666d30c9f034489813a43ad8edc771f7228759b5e6145a6f134834e","route":{"amountIn":"1.000000","amountOut":"66.028258","symbols":["TRX","WIN","USDJ","USDT"],"poolVersions":["v1","v2","old3pool"],"impact":"-0.183279"},"tronscanUrl":"https://nile.tronscan.org/#/transaction/4b2ae5186666d30c9f034489813a43ad8edc771f7228759b5e6145a6f134834e"}

Swap executed successfully
  TxID: 4b2ae5186666d30c9f034489813a43ad8edc771f7228759b5e6145a6f134834e
  Tronscan: https://nile.tronscan.org/#/transaction/4b2ae5186666d30c9f034489813a43ad8edc771f7228759b5e6145a6f134834e
  Route: TRX → WIN → USDJ → USDT
  Amount Out: 66.028258
  Price Impact: -0.183279
```

Write operations such as `swap`, `liquidity`, and `contract send` require wallet credentials.

### Configuration

#### Wallet Configuration

Wallets are managed through [`agent-wallet`](https://github.com/BofAI/agent-wallet?tab=readme-ov-file#quick-start) file-backed configuration. Install and configure `agent-wallet` first. This repository no longer reads or maps legacy `TRON_PRIVATE_KEY`, `TRON_MNEMONIC`, or `TRON_MNEMONIC_ACCOUNT_INDEX` wallet variables.

> **Note**
> You can override wallet settings for a single invocation with root-level flags such as `-k`, `-m`, `-i`, `-p`, and `-d`. See [`agent-wallet`](https://github.com/BofAI/agent-wallet?tab=readme-ov-file#quick-start) for wallet file formats, local setup, and the full set of SDK-supported `AGENT_WALLET_*` options.

#### Network Configuration

- `TRON_NETWORK` — optional network override, defaults to `mainnet`
- `TRONGRID_API_KEY` — optional TronGrid API key for higher-rate mainnet access
- `TRON_RPC_URL` — optional custom TRON RPC endpoint

Example:

```bash
export TRON_NETWORK=mainnet
export TRONGRID_API_KEY="<YOUR_TRONGRID_API_KEY_HERE>"
export TRON_RPC_URL=https://your-tron-rpc.example
```

## Command Reference

> Legend: `<arg>` = required argument, `[arg]` = optional argument.
> Options marked with **(required)** must be provided. All others are optional.

### Wallet & Portfolio

#### `wallet address` (read)

Print the active wallet address.

```bash
sun wallet address
```

No additional options.

#### `wallet balances` (read)

Fetch wallet token balances.

```bash
sun wallet balances [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--owner <address>` | Wallet address to query | Active wallet |
| `--tokens <tokens>` | Comma-separated token list: `TRX,<TRC20_ADDRESS>,...` | `TRX` |

#### `position list` (read)

List liquidity positions.

```bash
sun position list [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--owner <address>` | Owner wallet address | — |
| `--pool <poolAddress>` | Filter by pool | — |
| `--protocol <protocol>` | Protocol filter (V2, V3, V4) | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

#### `position tick <poolAddress>` (read)

Get tick data for a pool.

```bash
sun position tick <poolAddress> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

### Price

#### `price [token]` (read)

Get token prices from SUN.IO. Accepts a built-in symbol or address.

```bash
sun price [token] [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--address <addresses>` | Comma-separated token contract addresses | — |

```bash
sun price TRX
sun price USDT
sun price --address TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
```

### Token

#### `token list` (read)

Fetch tokens by address or protocol.

```bash
sun token list [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--address <tokenAddress>` | Filter by token contract address | — |
| `--protocol <protocol>` | Protocol filter (V2, V3, V4) | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |
| `--sort <field>` | Sort field | — |
| `--no-blacklist` | Include blacklisted tokens | `false` |

#### `token search <keyword>` (read)

Fuzzy search for tokens by name or symbol.

```bash
sun token search <keyword> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

### Swap

#### `swap <tokenIn> <tokenOut> <amountIn>` (write)

Execute a token swap via SunSwap Universal Router.

```bash
sun swap <tokenIn> <tokenOut> <amountIn> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--slippage <n>` | Slippage tolerance as decimal (e.g. 0.005 = 0.5%) | `0.005` |

```bash
sun swap TRX USDT 1000000
sun swap TRX USDT 1000000 --slippage 0.01
```

#### `swap:quote <tokenIn> <tokenOut> <amountIn>` (read)

Get a swap quote without executing.

```bash
sun swap:quote <tokenIn> <tokenOut> <amountIn> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--all` | Show all available routes | `false` |

```bash
sun swap:quote TRX USDT 1000000
sun swap:quote TRX USDT 1000000 --all
```

#### `swap:quote-raw` (read)

Low-level router quote call.

```bash
sun swap:quote-raw [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--router <address>` | **(required)** Smart router contract address | — |
| `--fn <name>` | Quote function name | `quoteExactInput` |
| `--args <json>` | **(required)** Arguments as JSON array | — |
| `--abi <json>` | Router ABI as JSON array | — |

#### `swap:exact-input` (write)

Low-level router swap execution.

```bash
sun swap:exact-input [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--router <address>` | **(required)** Smart router contract address | — |
| `--fn <name>` | Swap function name | `swapExactInput` |
| `--args <json>` | **(required)** Arguments as JSON array | — |
| `--value <sun>` | TRX call value in Sun | — |
| `--abi <json>` | Router ABI as JSON array | — |

### Pool

#### `pool list` (read)

List pools with filters.

```bash
sun pool list [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--address <poolAddress>` | Filter by pool address | — |
| `--token <tokenOrAddress>` | Filter by token (symbol or address) | — |
| `--protocol <protocol>` | Protocol filter (V2, V3, V4) | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |
| `--sort <field>` | Sort field | — |
| `--no-blacklist` | Include blacklisted pools | `false` |

#### `pool search <keyword>` (read)

Search pools by keyword.

```bash
sun pool search <keyword> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

#### `pool top-apy` (read)

List top APY pools.

```bash
sun pool top-apy [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

#### `pool hooks` (read)

List registered pool hooks.

```bash
sun pool hooks
```

No additional options.

#### `pool vol-history <poolAddress>` (read)

Pool volume history over a date range.

```bash
sun pool vol-history <poolAddress> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--start <date>` | Start date (YYYY-MM-DD) | — |
| `--end <date>` | End date (YYYY-MM-DD) | — |

#### `pool liq-history <poolAddress>` (read)

Pool liquidity history over a date range.

```bash
sun pool liq-history <poolAddress> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--start <date>` | Start date (YYYY-MM-DD) | — |
| `--end <date>` | End date (YYYY-MM-DD) | — |

### Liquidity

#### `liquidity v2:add` (write)

Add V2 liquidity. Router address is auto-detected by network.

```bash
sun liquidity v2:add [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token-a <tokenOrSymbol>` | **(required)** Token A (symbol or address) | — |
| `--token-b <tokenOrSymbol>` | **(required)** Token B (symbol or address) | — |
| `--amount-a <raw>` | Amount of token A (raw units) | — |
| `--amount-b <raw>` | Amount of token B (raw units) | — |
| `--min-a <raw>` | Minimum amount A | — |
| `--min-b <raw>` | Minimum amount B | — |
| `--router <address>` | V2 router address | Auto by network |
| `--to <address>` | LP token recipient | Active wallet |
| `--deadline <timestamp>` | Transaction deadline | — |
| `--abi <json>` | Custom router ABI | — |

> Provide at least one of `--amount-a` or `--amount-b`. When only one is given, the other is auto-calculated from pool reserves.

#### `liquidity v2:remove` (write)

Remove V2 liquidity.

```bash
sun liquidity v2:remove [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token-a <tokenOrSymbol>` | **(required)** Token A | — |
| `--token-b <tokenOrSymbol>` | **(required)** Token B | — |
| `--liquidity <raw>` | **(required)** LP token amount to remove | — |
| `--min-a <raw>` | Minimum amount A | — |
| `--min-b <raw>` | Minimum amount B | — |
| `--router <address>` | V2 router address | Auto by network |
| `--to <address>` | Token recipient | Active wallet |
| `--deadline <timestamp>` | Transaction deadline | — |
| `--abi <json>` | Custom router ABI | — |

#### `liquidity v3:mint` (write)

Mint a new V3 concentrated liquidity position. Position Manager is auto-detected by network.

```bash
sun liquidity v3:mint [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token0 <tokenOrSymbol>` | **(required)** Token 0 (symbol or address) | — |
| `--token1 <tokenOrSymbol>` | **(required)** Token 1 (symbol or address) | — |
| `--fee <n>` | Pool fee tier | `3000` |
| `--tick-lower <n>` | Lower tick boundary | Auto by `sun-kit` |
| `--tick-upper <n>` | Upper tick boundary | Auto by `sun-kit` |
| `--amount0 <raw>` | Amount of token 0 | — |
| `--amount1 <raw>` | Amount of token 1 | — |
| `--min0 <raw>` | Minimum amount 0 | — |
| `--min1 <raw>` | Minimum amount 1 | — |
| `--pm <address>` | Position Manager address | Auto by network |
| `--recipient <address>` | NFT recipient | Active wallet |
| `--deadline <timestamp>` | Transaction deadline | — |
| `--abi <json>` | Custom ABI | — |

> Provide at least one of `--amount0` or `--amount1`. When only one is given, the other is auto-calculated. TRX is automatically converted to WTRX for V3 pool lookup.

#### `liquidity v3:increase` (write)

Increase liquidity on an existing V3 position.

```bash
sun liquidity v3:increase [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token-id <id>` | **(required)** Position NFT token ID | — |
| `--amount0 <raw>` | Amount of token 0 | — |
| `--amount1 <raw>` | Amount of token 1 | — |
| `--min0 <raw>` | Minimum amount 0 | — |
| `--min1 <raw>` | Minimum amount 1 | — |
| `--token0 <tokenOrSymbol>` | Token 0 (needed for single-sided auto-compute) | — |
| `--token1 <tokenOrSymbol>` | Token 1 (needed for single-sided auto-compute) | — |
| `--fee <n>` | Pool fee (needed for single-sided auto-compute) | `3000` |
| `--pm <address>` | Position Manager address | Auto by network |
| `--deadline <timestamp>` | Transaction deadline | — |
| `--abi <json>` | Custom ABI | — |

> When providing only one amount, `--token0`, `--token1`, and `--fee` are required for auto-calculation.

#### `liquidity v3:decrease` (write)

Decrease liquidity on an existing V3 position.

```bash
sun liquidity v3:decrease [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token-id <id>` | **(required)** Position NFT token ID | — |
| `--liquidity <raw>` | **(required)** Liquidity amount to remove | — |
| `--min0 <raw>` | Minimum amount 0 | — |
| `--min1 <raw>` | Minimum amount 1 | — |
| `--pm <address>` | Position Manager address | Auto by network |
| `--deadline <timestamp>` | Transaction deadline | — |
| `--abi <json>` | Custom ABI | — |

#### `liquidity v3:collect` (write)

Collect accumulated fees from a V3 position.

```bash
sun liquidity v3:collect [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token-id <id>` | **(required)** Position NFT token ID | — |
| `--recipient <address>` | Fee recipient | Active wallet |
| `--pm <address>` | Position Manager address | Auto by network |
| `--abi <json>` | Custom ABI | — |

#### `liquidity v4:mint` (write)

Mint a new V4 concentrated liquidity position.

```bash
sun liquidity v4:mint [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token0 <tokenOrSymbol>` | **(required)** Token 0 | — |
| `--token1 <tokenOrSymbol>` | **(required)** Token 1 | — |
| `--fee <n>` | Pool fee tier | — |
| `--tick-lower <n>` | Lower tick boundary | Auto by `sun-kit` |
| `--tick-upper <n>` | Upper tick boundary | Auto by `sun-kit` |
| `--amount0 <raw>` | Amount of token 0 | — |
| `--amount1 <raw>` | Amount of token 1 | — |
| `--slippage <n>` | Slippage tolerance | — |
| `--sqrt-price <value>` | Initial sqrtPriceX96 (for pool creation) | — |
| `--create-pool` | Create the pool if it doesn't exist | `false` |
| `--recipient <address>` | NFT recipient | Active wallet |
| `--deadline <timestamp>` | Transaction deadline | — |

#### `liquidity v4:increase` (write)

Increase liquidity on an existing V4 position.

```bash
sun liquidity v4:increase [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token-id <id>` | **(required)** Position NFT token ID | — |
| `--token0 <tokenOrSymbol>` | **(required)** Token 0 | — |
| `--token1 <tokenOrSymbol>` | **(required)** Token 1 | — |
| `--fee <n>` | Pool fee tier | — |
| `--amount0 <raw>` | Amount of token 0 | — |
| `--amount1 <raw>` | Amount of token 1 | — |
| `--slippage <n>` | Slippage tolerance | — |
| `--deadline <timestamp>` | Transaction deadline | — |

#### `liquidity v4:decrease` (write)

Decrease liquidity on an existing V4 position.

```bash
sun liquidity v4:decrease [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token-id <id>` | **(required)** Position NFT token ID | — |
| `--liquidity <raw>` | **(required)** Liquidity amount to remove | — |
| `--token0 <tokenOrSymbol>` | **(required)** Token 0 | — |
| `--token1 <tokenOrSymbol>` | **(required)** Token 1 | — |
| `--fee <n>` | Pool fee tier | — |
| `--min0 <raw>` | Minimum amount 0 | — |
| `--min1 <raw>` | Minimum amount 1 | — |
| `--slippage <n>` | Slippage tolerance | — |
| `--deadline <timestamp>` | Transaction deadline | — |

#### `liquidity v4:collect` (write)

Collect accumulated fees from a V4 position.

```bash
sun liquidity v4:collect [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token-id <id>` | **(required)** Position NFT token ID | — |
| `--token0 <tokenOrSymbol>` | Token 0 | — |
| `--token1 <tokenOrSymbol>` | Token 1 | — |
| `--fee <n>` | Pool fee tier | — |
| `--deadline <timestamp>` | Transaction deadline | — |

#### `liquidity v4:info` (read)

Get details about a V4 position.

```bash
sun liquidity v4:info [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--pm <address>` | **(required)** Position Manager address | — |
| `--token-id <id>` | **(required)** Position NFT token ID | — |

### Position

#### `position list` (read)

```bash
sun position list [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--owner <address>` | Owner address | — |
| `--pool <poolAddress>` | Filter by pool | — |
| `--protocol <protocol>` | Protocol filter | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

#### `position tick <poolAddress>` (read)

```bash
sun position tick <poolAddress> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

### Pair

#### `pair info` (read)

Get token pair information.

```bash
sun pair info [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--token <tokenAddress>` | Token contract address | — |
| `--protocol <protocol>` | Protocol filter | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

### Farm

#### `farm list` (read)

List farming pools.

```bash
sun farm list [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--farm <farmAddress>` | Filter by farm address | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

#### `farm tx` (read)

List farming transaction history.

```bash
sun farm tx [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--owner <address>` | Owner address | — |
| `--farm <farmAddress>` | Filter by farm | — |
| `--type <farmTxType>` | Transaction type | — |
| `--start <time>` | Start time (ISO or unix ms) | — |
| `--end <time>` | End time | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

#### `farm positions` (read)

List farming positions.

```bash
sun farm positions [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--owner <address>` | Owner address | — |
| `--farm <farmAddress>` | Filter by farm | — |
| `--page <n>` | Page number | `1` |
| `--page-size <n>` | Page size | `20` |

### Protocol

#### `protocol info` (read)

```bash
sun protocol info [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |

#### `protocol vol-history` (read)

```bash
sun protocol vol-history [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--start <date>` | Start date (YYYY-MM-DD) | — |
| `--end <date>` | End date (YYYY-MM-DD) | — |

#### `protocol users-history` (read)

```bash
sun protocol users-history [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--start <date>` | Start date | — |
| `--end <date>` | End date | — |

#### `protocol tx-history` (read)

```bash
sun protocol tx-history [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--start <date>` | Start date | — |
| `--end <date>` | End date | — |

#### `protocol pools-history` (read)

```bash
sun protocol pools-history [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--start <date>` | Start date | — |
| `--end <date>` | End date | — |

#### `protocol liq-history` (read)

```bash
sun protocol liq-history [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--start <date>` | Start date | — |
| `--end <date>` | End date | — |

### Transaction

#### `tx scan` (read)

Scan on-chain transaction history.

```bash
sun tx scan [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--protocol <protocol>` | Protocol filter | — |
| `--token <tokenAddress>` | Filter by token address | — |
| `--pool <poolAddress>` | Filter by pool address | — |
| `--type <type>` | Transaction type: `swap`, `add`, `withdraw` | — |
| `--start <time>` | Start time (ISO or unix ms) | — |
| `--end <time>` | End time | — |
| `--page-size <n>` | Page size | `20` |
| `--offset <offset>` | Pagination offset | — |

### Contract

#### `contract read <address> <functionName>` (read)

Read from any TRON smart contract.

```bash
sun contract read <address> <functionName> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--args <json>` | Arguments as JSON array | `[]` |
| `--abi <json>` | Contract ABI as JSON array | — |

```bash
sun contract read TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t balanceOf --args '["TYourAddress"]'
```

#### `contract send <address> <functionName>` (write)

Send a transaction to any TRON smart contract.

```bash
sun contract send <address> <functionName> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--args <json>` | Arguments as JSON array | `[]` |
| `--value <sun>` | TRX call value in Sun | — |
| `--abi <json>` | Contract ABI as JSON array | — |

```bash
sun contract send TRecipient transfer --args '["TRecipient","1000000"]' --value 0
```

`contract send` returns `tronscanUrl` when a transaction is broadcast successfully.

## Global Flags

All commands inherit these root-level flags:

| Flag | Description |
| ---------------------------------------- | --------------------------------------------------------- |
| `--output <format>` | Output format: `table`, `json`, `tsv` |
| `--json` | Shortcut for JSON output |
| `--fields <list>` | Comma-separated output field filter |
| `--network <network>` | Override `TRON_NETWORK` |
| `-k, --private-key <key>` | Provide a private key for this invocation only |
| `-m, --mnemonic <phrase>` | Provide a mnemonic for this invocation only |
| `-i, --mnemonic-account-index <index>` | Provide a mnemonic account index for this invocation only |
| `-p, --agent-wallet-password <password>` | Override `AGENT_WALLET_PASSWORD` for this invocation |
| `-d, --agent-wallet-dir <dir>` | Override `AGENT_WALLET_DIR` for this invocation |
| `-y, --yes` | Skip confirmation prompts |
| `--dry-run` | Print intent without sending the write action |

Examples:

```bash
sun --json price TRX
sun --output tsv pool top-apy --page-size 10
sun --fields address,network wallet address
sun -p your_agent_wallet_password wallet address
sun -k your_private_key --network nile --yes swap TRX USDT 1000000
sun --dry-run contract send TContract transfer --args '["TRecipient","1000000"]'
```

## Output Modes

`sun-cli` supports three output modes:

- **table** — default, human-friendly terminal output
- **json** — compact machine-readable JSON
- **tsv** — tab-separated values for shell pipelines

Examples:

```bash
sun pool top-apy --page-size 5
sun --json wallet address
sun --output tsv token list --protocol V3
sun --json --fields txid,tronscanUrl swap TRX USDT 1000000
```

## Built-In Token Symbols

Many commands accept token symbols in addition to TRON addresses.

| Symbol | Address | Decimals |
| ------ | ------------------------------------ | -------- |
| `TRX` | `T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb` | 6 |
| `WTRX` | `TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR` | 6 |
| `USDT` | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 |
| `USDCOLD` | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` | 6 |
| `USDD` | `TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn` | 18 |
| `SUN` | `TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S` | 18 |
| `JST` | `TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9` | 18 |
| `BTT` | `TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4` | 18 |
| `WIN` | `TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7` | 6 |

Example:

```bash
sun swap TRX USDT 1000000
sun swap T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t 1000000
```

## Troubleshooting

### `unknown command 'nile'`

Root flags must be placed before the subcommand:

```bash
sun --network nile swap TRX USDT 1000000
```

When using npm scripts, pass arguments after `--`:

```bash
npm run start -- --network nile swap TRX USDT 1000000
```

### `No wallet configured`

Set exactly one wallet source:

- `AGENT_WALLET_PRIVATE_KEY`
- `AGENT_WALLET_MNEMONIC`
- `AGENT_WALLET_PASSWORD`

Or provide the equivalent root-level flag for that invocation.

### `Swap failed`

Common causes:

- wallet not configured
- unsupported token symbol
- insufficient balance
- RPC / router API failure
- stale or invalid route parameters

Use `swap:quote` first and then retry with `--yes` only after the quote looks correct.

## Security Considerations

- Treat `AGENT_WALLET_PRIVATE_KEY`, `AGENT_WALLET_MNEMONIC`, and `AGENT_WALLET_PASSWORD` as secrets.
- Prefer environment variables over command-line wallet flags when possible, because shell history and process lists may expose secrets.
- Use a dedicated wallet for automation instead of a primary treasury wallet.
- Run `--dry-run` before high-value writes.
- Verify token addresses carefully when not using built-in symbols.
- Do not treat quotes as guaranteed execution results in volatile markets.

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

Run from source:

```bash
npm run dev -- price TRX
```

## License

MIT
