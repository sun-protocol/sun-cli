# sun-cli to sun-sdk Migration Design

Date: 2026-07-14
Status: Approved design, pending implementation plan

## Goal

Migrate `sun-cli` from `@sun-protocol/sun-kit` to `sun-sdk` without changing the public CLI contract.

The user-facing rule is strict: existing command names, options, defaults, input formats, JSON shapes, table/TSV fields, error payloads, exit codes, dry-run behavior, and confirmation behavior remain compatible. The migration should be invisible to existing users except for bug fixes and Nile SunPump support.

The dependency target is the `@sun-sdk/*` package set at version `0.1.2`, not `0.1.1`. `sun-sdk` must first receive the missing compatibility capabilities, publish `0.1.2`, and then `sun-cli` migrates to that version.

## Repositories

- `sun-cli`: `/Users/caleb/Documents/code/tron/github/sun-cli`
- `sun-sdk`: `/Users/caleb/Documents/code/tron/sdk/sun-sdk-design/sun-sdk`
- `sun-kit`: `/Users/caleb/Documents/code/tron/github/sun-kit`

## First-Principles Constraints

The goal is not to rename imports. The goal is to move protocol behavior, signing, broadcasting, chain constants, HTTP API access, and transaction construction into the SDK boundary.

`sun-cli` should keep only CLI responsibilities:

- command parsing
- option validation
- output formatting
- confirmation prompts
- private-key source adaptation
- compatibility mapping from SDK results to existing CLI results

The CLI must not rebuild protocol math locally when the SDK can own it. If the SDK lacks a required behavior, the SDK receives it first.

## Confirmed Scope

The migration release has two deliverables:

1. `@sun-sdk/*@0.1.2`
   - fills SDK gaps required by the current CLI
   - changes SDK package engines to Node `>=20`
   - supports Nile SunPump API
   - exposes APIs needed for current CLI behavior

2. Migrated `sun-cli`
   - removes `@sun-protocol/sun-kit`
   - depends on `@sun-sdk/*@0.1.2`
   - preserves current public CLI behavior
   - removes the incorrect blanket SunPump mainnet-only restriction

SDK capabilities that exist but are not currently exposed by the CLI are not added to the migration release unless they are required for compatibility. They will be implemented in a later additive CLI release.

## Version and Runtime Policy

`sun-sdk` root and published packages should support Node `>=20`.

The release gate must run on both Node 20 and Node 22:

- SDK unit/integration tests
- SDK CJS/ESM import smoke tests
- CLI build and compatibility tests
- CLI package install smoke tests

The CLI remains compatible with Node 20+.

## Architecture

Use a small local SDK adapter layer, not a single giant compatibility file and not direct SDK calls scattered through command files.

Adapter modules:

- `src/lib/sdk/factory.ts`
  - creates `SunApiClient`
  - creates TronWeb provider/runtime
  - creates `SunSDK`
  - centralizes network, RPC, API key, and chain config selection

- `src/lib/sdk/wallet.ts`
  - adapts `agent-wallet` to the SDK `WalletAdapter`
  - preserves existing private-key environment behavior
  - prevents private key or raw signed transaction logging

- `src/lib/sdk/compat.ts`
  - maps old CLI inputs to SDK inputs
  - maps SDK results back to old CLI result shapes
  - owns compatibility details such as min amount precedence, route shape, and tx result shape

- `src/lib/sdk/errors.ts`
  - maps SDK/runtime/API errors to existing CLI error codes and payloads
  - preserves `{ error, code, detail? }`

- `src/lib/sdk/types.ts`
  - contains adapter-local types only
  - avoids duplicating protocol domain models already owned by the SDK

Flow:

```text
Commander command
  -> command helper
  -> local SDK adapter
  -> sun-sdk API/protocol/runtime
  -> provider/wallet/RPC/API
  -> adapter compatibility result
  -> existing output layer
```

Command files should not output raw SDK objects. They should receive old CLI-shaped results from the adapter and pass them to the existing `output()` or `writeAction()` path.

## SDK 0.1.2 Required Changes

These are true SDK gaps for this migration:

- Change root and package engines to Node `>=20`.
- Add Nile SunPump API base URL:
  - `https://tn-api.sunpump.meme/pump-api`
- Add runtime generic ABI read/send helpers for:
  - `contract read`
  - `contract send`
  - `swap:quote-raw`
  - `swap:exact-input`
- Add runtime native TRX and TRC20 batch balance helper for `wallet balances`.
- Expose per-call contract overrides for routers, factories, position managers, and ABI overrides where current CLI options already accept them.
- Support explicit V2/V3 min amounts, with explicit min amount values taking precedence over slippage-derived values.
- Add V3 convenience behavior needed by current CLI:
  - automatic pool/position reads
  - optional ticks where current CLI allows them
  - single-side amount handling
  - tokenId-only increase/decrease paths
- Add V4 convenience behavior needed by current CLI:
  - derive `poolKey` from token/fee/hook inputs
  - derive liquidity/max/min amounts from old CLI amount options
  - preserve the old create-pool behavior
- Add SDK tests for all new compatibility capabilities.

These are not SDK gaps:

- `createTronWebRuntime` already exists.
- V4 pool read already exists.
- V3/V4 position read already exists.
- V4 remove already supports explicit min amounts.

## CLI Compatibility Rules

Before changing dependencies, capture the old CLI contract:

- command manifest
  - command path
  - positionals
  - options
  - required flags
  - defaults
  - aliases
  - global parameters

- output golden files
  - JSON
  - table
  - TSV
  - error payloads
  - exit codes
  - stdout/stderr split

- request semantics
  - query/body defaults
  - empty string handling
  - pagination fields
  - sorting fields
  - parameter names

Compatibility requirements:

- JSON field names, types, and nesting are strict.
- Table headers and column order are strict.
- TSV headers and column order are strict.
- Error payload remains `{ error, code, detail? }`.
- Dynamic values are compared structurally or semantically where needed.
- Colors and tiny whitespace differences in human table output are acceptable only if meaning and order do not change.
- SDK errors are never leaked directly when they would alter current CLI error semantics.

## Dry Run and Confirmation

Current dry-run behavior is preserved:

```json
{ "dryRun": true, "action": "...", "params": { "...": "..." } }
```

`--dry-run` must continue to short-circuit before wallet or SDK initialization. It must not require a wallet and must not emit SDK transaction plans in the migration release.

Current confirmation behavior is preserved:

- `--yes` skips confirmation.
- machine-readable modes such as `--json` skip confirmation.
- cancellation keeps the old output and exit behavior.

Real SDK transaction plan output can be added later as an additive feature, not in this compatibility migration.

## Transaction Output Rules

Existing write output remains stable.

The current CLI recursively finds `txid` and nested `txResult.txid`, then adds the explorer URL. That behavior stays.

Multi-transaction SDK execution must not expose new approval transaction lists unless the old CLI already did. Public output should continue to expose the final user-facing transaction shape expected by existing users.

SDK result objects must be normalized by `compat.ts` before reaching `output()`.

## SunPump Network Support

The old blanket `assertMainnet()` on SunPump commands is incorrect. SunPump supports Nile as well as mainnet.

SDK 0.1.2 must configure Nile HTTP API support:

```text
https://tn-api.sunpump.meme/pump-api
```

The CLI migration removes the blanket mainnet-only guard and uses chain-specific SDK configuration.

SunPump on-chain behavior should use the SDK pump module on both mainnet and Nile. SunPump HTTP commands should use the SDK pump API client on both mainnet and Nile.

## Advanced Override Options

Existing advanced options such as `--router`, `--pm`, and `--abi` are real behavior, not just parsed flags.

The migration must preserve them by exposing per-call SDK overrides. It is not acceptable to drop these options, ignore them, or convert them into no-op compatibility fields.

One explicit correction to the old plan: `liquidity v4:info` must not remove required `--pm` in the migration if removing it would break current input compatibility. The migration keeps existing input compatibility and makes the option effective.

## SDK Features Not Yet Exposed by CLI

These SDK capabilities can be considered for a later additive CLI release after the compatibility migration:

- real transaction plan output
- approval mode selection
- V2-specific swap commands
- explicit V4 pool initialize/read commands
- V3 position NFT detail command
- additional SunPump read helpers
- Scan and TronScan API expansions

They should be listed after migration but not mixed into the compatibility release.

## Testing Strategy

Testing has four layers.

### 1. SDK Tests

Run SDK tests on Node 20 and Node 22.

Coverage must include:

- Node `>=20` engine and runtime compatibility
- Nile Pump API base URL
- generic ABI read/send
- TRX and TRC20 batch balances
- per-call contract overrides
- explicit min amount precedence
- V3 automatic pool/position read paths
- V3 optional tick and single-side amount behavior
- V3 tokenId-only increase/decrease
- V4 poolKey/liquidity/max/min derivation
- V4 create-pool compatibility
- CJS and ESM imports

### 2. CLI Contract Tests

Before migration:

- generate command manifest
- record golden outputs
- record error and exit behavior
- record dry-run outputs

After migration:

- replay the same fixtures
- compare manifest and outputs
- verify write commands call the SDK adapter, not sun-kit
- verify no `@sun-protocol/sun-kit` import remains

HTTP/API commands should use mock fetch/provider fixtures for compatibility tests so remote API fluctuation does not mask output changes.

### 3. Nile Real Private-Key Signing Tests

Use a dedicated Nile test wallet. The private key is provided only through environment variables. Logs and artifacts must not include:

- private key
- mnemonic
- raw signed transaction
- full secret-bearing transaction body

All current write capabilities must be signed and broadcast on Nile:

- generic contract send
- swap
- V2 add liquidity
- V2 remove liquidity
- V3 mint
- V3 increase
- V3 decrease
- V3 collect
- V4 initialize
- V4 mint
- V4 increase
- V4 decrease
- V4 collect
- SunPump buy
- SunPump sell

Each test must verify more than a `txid`:

- receipt status is `SUCCESS`
- wallet address matches the test wallet
- network is Nile
- relevant state changed as expected
  - balances
  - positions
  - pool state
  - SunPump state

Record a sanitized test ledger:

- command
- network
- wallet address
- txid
- receipt status
- key before/after state

The ledger can be attached as a release artifact, but must not contain secrets.

The test runner must enforce budget and network gates before broadcasting:

- refuse mainnet for the full signing matrix
- check minimum Nile TRX balance
- check required token balances
- check configured fixture contracts/pools/tokens
- abort on unexpectedly high fee or value

### 4. Release Install Tests

Release sequence:

1. Build and pack SDK locally.
2. Test SDK packed artifacts in a clean consumer project.
3. Publish `@sun-sdk/*@0.1.2`.
4. Install published `@sun-sdk/*@0.1.2` into a clean CLI environment.
5. Run CLI build and compatibility tests.
6. Run Nile real-signing tests.
7. Publish the migrated CLI.

The migrated CLI may use exact `0.1.2` or a compatible range depending on package policy, but the migration release must resolve to `0.1.2`.

## Rollback Strategy

If compatibility fails before CLI publish:

- stop the CLI publish
- fix SDK or adapter
- rerun compatibility and Nile signing gates

If a CLI compatibility issue is found after publish:

- revert or republish CLI to the previous known-good version
- do not add a runtime fallback to sun-kit

Keeping both sun-kit and sun-sdk as runtime fallbacks would reintroduce two protocol implementations and weaken the migration goal.

If Nile signing fails because fixture assets or liquidity are missing:

- the migration is not considered passed
- replenish or recreate fixtures
- rerun the full signing matrix

## Implementation Plan Boundary

This document is the approved migration design. It intentionally does not include code edits.

The next step is to write an implementation plan that splits the work into:

- SDK 0.1.2 changes
- SDK release verification
- CLI compatibility baseline
- CLI adapter migration
- command-by-command migration
- Nile real-signing test harness
- release and rollback tasks
