# Sun CLI sun-sdk Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `sun-cli` from `@sun-protocol/sun-kit` to `@sun-sdk/*@0.1.2` while preserving the existing CLI API and output contract.

**Architecture:** Add a focused local SDK adapter under `src/lib/sdk/`, keep command parsing and output code stable, and normalize SDK inputs/results before they reach existing `output()` and `writeAction()` helpers. Capture old behavior with contract tests before changing dependencies, then migrate command groups incrementally.

**Tech Stack:** TypeScript, CommonJS, Jest, Commander, TronWeb 6, `@bankofai/agent-wallet`, `@sun-sdk/api`, `@sun-sdk/chains`, `@sun-sdk/core`, `@sun-sdk/runtime`, `@sun-sdk/protocols`.

## Global Constraints

- Work in `/Users/caleb/Documents/code/tron/github/sun-cli`.
- SDK prerequisite: `@sun-sdk/*@0.1.2` must be published and installable.
- Remove `@sun-protocol/sun-kit`.
- Existing command names, options, defaults, JSON fields, table/TSV fields, error payloads, exit codes, dry-run behavior, and confirmation behavior remain compatible.
- `--dry-run` must short-circuit before wallet or SDK initialization.
- Do not expose SDK transaction plans or approval tx lists in this compatibility migration.
- SunPump supports Nile and mainnet; remove the blanket mainnet-only guard.
- Real private-key write tests run only on Nile with a dedicated test wallet.
- Never log private keys, mnemonics, raw signed transactions, or secret-bearing transaction bodies.

---

## File Structure

CLI files to modify or create:

- Dependencies: `package.json`, `package-lock.json`
- Adapter: `src/lib/sdk/factory.ts`, `src/lib/sdk/wallet.ts`, `src/lib/sdk/compat.ts`, `src/lib/sdk/errors.ts`, `src/lib/sdk/types.ts`, `src/lib/sdk/index.ts`
- Context and helpers: `src/lib/context.ts`, `src/lib/wallet.ts`, `src/lib/command.ts`, `src/lib/tokens.ts`
- Commands: `src/commands/token.ts`, `src/commands/pool.ts`, `src/commands/protocol.ts`, `src/commands/tx.ts`, `src/commands/position.ts`, `src/commands/pair.ts`, `src/commands/farm.ts`, `src/commands/price.ts`, `src/commands/wallet.ts`, `src/commands/contract.ts`, `src/commands/swap.ts`, `src/commands/liquidity.ts`, `src/commands/sunpump.ts`
- Remove after migration: `src/lib/sunpump.ts`
- Contract tests: `test/contract/command-manifest.test.ts`, `test/contract/golden-output.test.ts`, `test/contract/fixtures.ts`, `test/helpers/run-cli.ts`
- Adapter tests: `test/lib/sdk/factory.test.ts`, `test/lib/sdk/wallet.test.ts`, `test/lib/sdk/compat.test.ts`, `test/lib/sdk/errors.test.ts`
- Nile E2E harness: `test/e2e/nile-real-signing.test.ts`, `test/e2e/nile-fixtures.ts`, `test/e2e/redact.ts`

## Task 1: Baseline Contract Capture

**Files:**
- Create: `test/helpers/run-cli.ts`
- Create: `test/contract/fixtures.ts`
- Create: `test/contract/command-manifest.test.ts`
- Create: `test/contract/golden-output.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `runCli(args: readonly string[], env?: NodeJS.ProcessEnv): Promise<CliRunResult>`
  - command manifest snapshot
  - golden output tests for JSON/table/TSV/error/dry-run behavior

- [ ] **Step 1: Add CLI runner helper**

Create `test/helpers/run-cli.ts`:

```ts
import { spawn } from 'node:child_process'
import { join } from 'node:path'

export interface CliRunResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

export function runCli(args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<CliRunResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'dist/bin.js'), ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}
```

- [ ] **Step 2: Add baseline fixture list**

Create `test/contract/fixtures.ts`:

```ts
export const manifestCommands = [
  ['token', 'list'],
  ['pool', 'list'],
  ['protocol', 'info'],
  ['wallet', 'address'],
  ['contract', 'read'],
  ['swap:quote'],
  ['liquidity', 'v2:add'],
  ['liquidity', 'v3:mint'],
  ['liquidity', 'v4:mint'],
  ['sunpump', 'search-v2'],
] as const

export const goldenCommands = [
  { name: 'dry run swap', args: ['--json', '--dry-run', 'swap', 'TRX', 'USDT', '1', '--network', 'nile'] },
  { name: 'wallet missing error', args: ['--json', 'wallet', 'address'], expectCode: 1 },
  { name: 'help output', args: ['--help'], expectCode: 0 },
] as const
```

- [ ] **Step 3: Write command manifest test**

Create `test/contract/command-manifest.test.ts`:

```ts
import { runCli } from '../helpers/run-cli'
import { manifestCommands } from './fixtures'

describe('CLI command manifest compatibility', () => {
  beforeAll(async () => {
    await runCli(['--version'])
  })

  it.each(manifestCommands)('keeps %s help contract', async (...command) => {
    const result = await runCli([...command, '--help'])
    expect(result.code).toBe(0)
    expect(result.stdout).toMatchSnapshot()
    expect(result.stderr).toBe('')
  })
})
```

- [ ] **Step 4: Write golden output test**

Create `test/contract/golden-output.test.ts`:

```ts
import { runCli } from '../helpers/run-cli'
import { goldenCommands } from './fixtures'

describe('CLI output compatibility', () => {
  it.each(goldenCommands)('$name', async (fixture) => {
    const result = await runCli(fixture.args, {
      AGENT_WALLET_PRIVATE_KEY: '',
      TRON_NETWORK: 'nile',
    })
    expect(result.code).toBe(fixture.expectCode ?? 0)
    expect(result.stdout).toMatchSnapshot()
    expect(result.stderr).toMatchSnapshot()
  })
})
```

- [ ] **Step 5: Run baseline tests against current sun-kit CLI**

Run:

```bash
npm run build
npm test -- --runTestsByPath test/contract/command-manifest.test.ts test/contract/golden-output.test.ts -u
```

Expected: PASS and snapshots are written for the old CLI.

- [ ] **Step 6: Commit baseline**

```bash
git add package.json test/helpers/run-cli.ts test/contract
git commit -m "test: capture cli compatibility baseline"
```

## Task 2: Install SDK Dependencies and Add Adapter Skeleton

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/sdk/types.ts`
- Create: `src/lib/sdk/errors.ts`
- Create: `src/lib/sdk/compat.ts`
- Create: `src/lib/sdk/index.ts`
- Test: `test/lib/sdk/errors.test.ts`
- Test: `test/lib/sdk/compat.test.ts`

**Interfaces:**
- Produces:
  - `CliSdkErrorCode`
  - `mapSdkError(error: unknown, fallbackCode?: string): Error & { code?: string }`
  - `toCliTxResult(result: unknown): unknown`
  - SDK adapter exports from `src/lib/sdk/index.ts`.

- [ ] **Step 1: Install SDK dependencies**

Run:

```bash
npm install @sun-sdk/api@0.1.2 @sun-sdk/chains@0.1.2 @sun-sdk/core@0.1.2 @sun-sdk/runtime@0.1.2 @sun-sdk/protocols@0.1.2
npm uninstall @sun-protocol/sun-kit
```

Expected: `package.json` no longer contains `@sun-protocol/sun-kit`.

- [ ] **Step 2: Write failing adapter tests**

Create `test/lib/sdk/errors.test.ts`:

```ts
import { mapSdkError } from '../../../src/lib/sdk/errors'

it('preserves existing wallet error code', () => {
  const err = mapSdkError(new Error('Wallet required. Set agent-wallet credentials before running this command.'))
  expect((err as any).code).toBe('NO_WALLET')
})
```

Create `test/lib/sdk/compat.test.ts`:

```ts
import { toCliTxResult } from '../../../src/lib/sdk/compat'

it('keeps nested txResult txid shape for explorer enrichment', () => {
  expect(toCliTxResult({ txResult: { txid: 'abc' }, raw: { result: true } })).toEqual({
    txResult: { txid: 'abc' },
    raw: { result: true },
  })
})
```

- [ ] **Step 3: Run failing tests**

Run: `npm test -- --runTestsByPath test/lib/sdk/errors.test.ts test/lib/sdk/compat.test.ts`

Expected: FAIL because adapter files do not exist.

- [ ] **Step 4: Implement adapter skeleton**

Create `src/lib/sdk/errors.ts`:

```ts
export function mapSdkError(error: unknown): Error & { code?: string; detail?: unknown } {
  if (error instanceof Error && /wallet required|agent-wallet/i.test(error.message)) {
    return Object.assign(error, { code: 'NO_WALLET' })
  }
  if (error instanceof Error) return error
  return Object.assign(new Error(String(error)), { code: 'UNKNOWN' })
}
```

Create `src/lib/sdk/compat.ts`:

```ts
export function toCliTxResult<T>(result: T): T {
  return result
}
```

Create `src/lib/sdk/types.ts`:

```ts
export type CliNetwork = 'mainnet' | 'nile' | 'shasta'
```

Create `src/lib/sdk/index.ts`:

```ts
export * from './types'
export * from './errors'
export * from './compat'
```

- [ ] **Step 5: Verify**

Run: `npm test -- --runTestsByPath test/lib/sdk/errors.test.ts test/lib/sdk/compat.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/sdk test/lib/sdk
git commit -m "chore: add sun sdk adapter skeleton"
```

## Task 3: Wallet, Runtime, and Context Adapter

**Files:**
- Create: `src/lib/sdk/wallet.ts`
- Create: `src/lib/sdk/factory.ts`
- Modify: `src/lib/sdk/index.ts`
- Modify: `src/lib/context.ts`
- Modify: `src/lib/wallet.ts`
- Test: `test/lib/sdk/wallet.test.ts`
- Test: `test/lib/sdk/factory.test.ts`
- Test: `test/lib/context.test.ts`
- Test: `test/lib/command.test.ts`

**Interfaces:**
- Produces:
  - `AgentWalletSdkAdapter` implements SDK `WalletAdapter`.
  - `createSdkRuntime(options): Runtime`
  - `getApi(): SunApiClient`
  - `getSdk(): Promise<SunSDK>`
  - `getKit()` remains as a compatibility alias during command migration.

- [ ] **Step 1: Write failing wallet adapter test**

Create `test/lib/sdk/wallet.test.ts`:

```ts
import { AgentWalletSdkAdapter } from '../../../src/lib/sdk/wallet'

it('adapts agent-wallet signing to sdk WalletAdapter', async () => {
  const agentWallet = {
    getAddress: jest.fn().mockResolvedValue('TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX'),
    signTransaction: jest.fn().mockResolvedValue(JSON.stringify({ txID: 'abc', signature: ['sig'] })),
    signMessage: jest.fn().mockResolvedValue('signed'),
  }
  const wallet = new AgentWalletSdkAdapter(agentWallet as any)
  expect(wallet.kind).toBe('custom')
  expect(await wallet.getAddress()).toBe('TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX')
  expect(await wallet.signTransaction!({ txID: 'abc' })).toEqual({ txID: 'abc', signature: ['sig'] })
})
```

- [ ] **Step 2: Write failing factory test**

Create `test/lib/sdk/factory.test.ts`:

```ts
import { getNetworkFromEnv } from '../../../src/lib/sdk/factory'

it('defaults to mainnet and accepts nile', () => {
  expect(getNetworkFromEnv({})).toBe('mainnet')
  expect(getNetworkFromEnv({ TRON_NETWORK: 'nile' })).toBe('nile')
})
```

- [ ] **Step 3: Run failing tests**

Run: `npm test -- --runTestsByPath test/lib/sdk/wallet.test.ts test/lib/sdk/factory.test.ts`

Expected: FAIL because files do not exist.

- [ ] **Step 4: Implement wallet and factory**

`src/lib/sdk/wallet.ts`:

```ts
import type { WalletAdapter, UnsignedTronTransaction, SignedTronTransaction, TypedDataPayload } from '@sun-sdk/runtime'

export class AgentWalletSdkAdapter implements WalletAdapter {
  readonly kind = 'custom' as const
  readonly capabilities = {
    signTransaction: true,
    signAndSendTransaction: false,
    signTypedData: true,
    userInteractive: false,
  }

  constructor(private readonly agentWallet: any) {}

  async getAddress(): Promise<string> {
    return this.agentWallet.getAddress()
  }

  async signTransaction(tx: UnsignedTronTransaction): Promise<SignedTronTransaction> {
    return JSON.parse(await this.agentWallet.signTransaction(tx))
  }

  async signMessage(message: string): Promise<string> {
    return this.agentWallet.signMessage(Buffer.from(message, 'utf-8'))
  }

  async signTypedData(payload: TypedDataPayload): Promise<string> {
    const sig = await this.agentWallet.signTypedData(payload)
    return sig.startsWith('0x') ? sig.slice(2) : sig
  }
}
```

`src/lib/sdk/factory.ts` must create `SunApiClient`, SDK runtime, and `SunSDK` using `@sun-sdk/*@0.1.2`.

- [ ] **Step 5: Preserve dry-run behavior**

Run: `npm test -- --runTestsByPath test/lib/command.test.ts`

Expected: existing dry-run test still passes: no wallet and no SDK initialization for `--dry-run`.

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- --runTestsByPath test/lib/sdk/wallet.test.ts test/lib/sdk/factory.test.ts test/lib/context.test.ts test/lib/command.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/context.ts src/lib/wallet.ts src/lib/sdk test/lib/sdk test/lib/context.test.ts test/lib/command.test.ts
git commit -m "feat: create sun sdk runtime adapter"
```

## Task 4: Migrate Read-Only API Commands

**Files:**
- Modify: `src/lib/command.ts`
- Modify: `src/commands/token.ts`
- Modify: `src/commands/pool.ts`
- Modify: `src/commands/protocol.ts`
- Modify: `src/commands/tx.ts`
- Modify: `src/commands/position.ts`
- Modify: `src/commands/pair.ts`
- Modify: `src/commands/farm.ts`
- Modify: `src/commands/price.ts`
- Test: `test/contract/golden-output.test.ts`
- Test: `test/commands/registration.test.ts`

**Interfaces:**
- Consumes: `getApi(): SunApiClient`.
- Produces: read commands use `@sun-sdk/api`, outputs remain baseline-compatible.

- [ ] **Step 1: Add SDK API mocks to golden tests**

In `test/contract/golden-output.test.ts`, mock `@sun-sdk/api` methods with fixed envelopes for commands covered by the snapshots.

```ts
jest.mock('@sun-sdk/api', () => ({
  SunApiClient: jest.fn().mockImplementation(() => ({
    getTokens: jest.fn().mockResolvedValue({ code: 0, data: [] }),
    getPools: jest.fn().mockResolvedValue({ code: 0, data: [] }),
  })),
}))
```

- [ ] **Step 2: Run tests before migration**

Run: `npm test -- --runTestsByPath test/contract/golden-output.test.ts test/commands/registration.test.ts`

Expected: PASS against current baseline.

- [ ] **Step 3: Replace read command API calls**

For each read command, replace sun-kit `SunAPI` imports/usages with `SunApiClient` methods returned by `getApi()`. Keep `parseApiResponse()`, table configs, and transforms in `src/lib/command.ts` unchanged unless a compatibility test proves a mismatch.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath test/contract/golden-output.test.ts test/commands/registration.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/command.ts src/commands/token.ts src/commands/pool.ts src/commands/protocol.ts src/commands/tx.ts src/commands/position.ts src/commands/pair.ts src/commands/farm.ts src/commands/price.ts test/contract test/commands/registration.test.ts
git commit -m "feat: migrate read api commands to sun sdk"
```

## Task 5: Migrate Wallet, Contract, and Swap Commands

**Files:**
- Modify: `src/commands/wallet.ts`
- Modify: `src/commands/contract.ts`
- Modify: `src/commands/swap.ts`
- Modify: `src/lib/sdk/compat.ts`
- Modify: `src/lib/sdk/errors.ts`
- Test: `test/lib/sdk/compat.test.ts`
- Test: `test/contract/golden-output.test.ts`

**Interfaces:**
- Consumes:
  - `readBalances`
  - `readContractByAbi`
  - `sendContractByAbi`
  - `sdk.swap.quote`
  - `sdk.swap.execute`
- Produces: existing wallet/contract/swap CLI shapes.

- [ ] **Step 1: Add compatibility tests for tx result shape**

Extend `test/lib/sdk/compat.test.ts`:

```ts
it('maps SDK TxResult to old CLI txid shape', () => {
  expect(toCliTxResult({ txid: 'abc', raw: { result: true } })).toEqual({
    txid: 'abc',
    raw: { result: true },
  })
})
```

- [ ] **Step 2: Run failing compatibility tests**

Run: `npm test -- --runTestsByPath test/lib/sdk/compat.test.ts`

Expected: FAIL if mapping is incomplete.

- [ ] **Step 3: Implement command migrations**

Update command handlers:

- `wallet balances` calls SDK `readBalances`.
- `contract read` calls SDK `readContractByAbi`.
- `contract send` calls SDK `sendContractByAbi` through `writeAction`.
- `swap:quote` calls `sdk.swap.quote` and maps route output.
- `swap` calls `sdk.swap.execute` and maps result with `toCliTxResult`.
- `swap:quote-raw` and `swap:exact-input` use ABI helpers while preserving `--router`, `--abi`, `--args`, `--value`, and `--fee-limit`.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath test/lib/sdk/compat.test.ts test/contract/golden-output.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/wallet.ts src/commands/contract.ts src/commands/swap.ts src/lib/sdk test/lib/sdk test/contract
git commit -m "feat: migrate wallet contract and swap commands"
```

## Task 6: Migrate Liquidity and Position Commands

**Files:**
- Modify: `src/commands/liquidity.ts`
- Modify: `src/lib/sdk/compat.ts`
- Test: `test/contract/golden-output.test.ts`
- Test: `test/commands/registration.test.ts`

**Interfaces:**
- Consumes SDK V2/V3/V4 compatibility APIs from `@sun-sdk/protocols@0.1.2`.
- Produces: existing liquidity command inputs remain valid, including `--router`, `--pm`, `--abi`, explicit mins, tokenId-only flows, and create-pool behavior.

- [ ] **Step 1: Add command registration assertions**

Extend `test/commands/registration.test.ts` to assert the existing liquidity subcommands and options remain registered:

```ts
expect(help).toContain('v2:add')
expect(help).toContain('v3:mint')
expect(help).toContain('v4:info')
expect(help).toContain('--pm')
expect(help).toContain('--min0')
expect(help).toContain('--min1')
```

- [ ] **Step 2: Run tests before edits**

Run: `npm test -- --runTestsByPath test/commands/registration.test.ts test/contract/golden-output.test.ts`

Expected: PASS.

- [ ] **Step 3: Replace sun-kit liquidity calls**

Map commands:

- V2 add/remove -> `sdk.liquidity.v2.add/remove.execute`
- V3 mint/increase -> `sdk.liquidity.v3.add/increase.execute`
- V3 decrease/collect -> `sdk.positions.v3.remove/collect.execute`
- V4 mint with `--create-pool` -> `sdk.liquidity.v4.mint.execute`, with SDK internally adding initialize action when needed
- V4 mint/increase -> `sdk.liquidity.v4.mint/increase.execute`
- V4 decrease/collect/info -> `sdk.positions.v4.remove/collect/read`

All command outputs must pass through `toCliTxResult()` or a focused read-result mapper in `src/lib/sdk/compat.ts`.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath test/commands/registration.test.ts test/contract/golden-output.test.ts test/lib/command.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/liquidity.ts src/lib/sdk/compat.ts test/commands/registration.test.ts test/contract
git commit -m "feat: migrate liquidity commands to sun sdk"
```

## Task 7: Migrate SunPump and Enable Nile

**Files:**
- Modify: `src/commands/sunpump.ts`
- Delete: `src/lib/sunpump.ts`
- Test: `test/contract/golden-output.test.ts`
- Test: `test/commands/registration.test.ts`

**Interfaces:**
- Consumes: `sdk.pump` and SDK SunPump API client.
- Produces: all existing SunPump commands work on mainnet and Nile without blanket `assertMainnet()`.

- [ ] **Step 1: Add Nile regression test**

Add a golden fixture:

```ts
{ name: 'sunpump nile search-v2', args: ['--json', '--network', 'nile', 'sunpump', 'token', 'search-v2', 'SUN', '--page', '1', '--size', '36'], expectCode: 0 }
```

Mock SDK pump API to return an empty token list.

- [ ] **Step 2: Run failing test**

Run: `npm test -- --runTestsByPath test/contract/golden-output.test.ts`

Expected: FAIL while the blanket mainnet guard is still active.

- [ ] **Step 3: Replace `src/lib/sunpump.ts` usage**

Use SDK pump clients for:

- token list/search/search-v2/by-owner/holders/holders-v2/favors/ranking/king-of-hill/pump-list
- tx token/user
- portfolio
- launch
- state/info
- quote-buy/quote-sell
- buy/sell

Remove `assertMainnet()` from read and write paths.

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- --runTestsByPath test/contract/golden-output.test.ts test/commands/registration.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/sunpump.ts test/contract test/commands/registration.test.ts
git rm src/lib/sunpump.ts
git commit -m "feat: migrate sunpump commands to sun sdk"
```

## Task 8: Remove sun-kit and Run Compatibility Gate

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Inspect: all `src/**`, `test/**`

**Interfaces:**
- Produces: no runtime or test dependency on sun-kit.

- [ ] **Step 1: Search for sun-kit**

Run:

```bash
rg 'sun-kit|@sun-protocol/sun-kit|@bankofai/sun-kit' src test package.json package-lock.json README.md
```

Expected: matches only in migration docs or no matches in runtime/test/package files.

- [ ] **Step 2: Fix remaining imports**

If the search reports runtime/test/package matches, replace them with SDK adapter imports. Do not keep a compatibility fallback to sun-kit.

- [ ] **Step 3: Run full CLI checks**

Run:

```bash
npm run build
npm test
npm run lint
npm run format:check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit cleanup**

```bash
git add README.md package.json package-lock.json src test
git commit -m "chore: remove sun-kit dependency"
```

## Task 9: Nile Real Private-Key Signing Harness

**Files:**
- Create: `test/e2e/nile-fixtures.ts`
- Create: `test/e2e/redact.ts`
- Create: `test/e2e/nile-real-signing.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `npm run test:e2e:nile`
  - full Nile write matrix using a dedicated real wallet
  - sanitized ledger without secrets.

- [ ] **Step 1: Add redaction helper**

Create `test/e2e/redact.ts`:

```ts
const secretKeys = ['AGENT_WALLET_PRIVATE_KEY', 'AGENT_WALLET_MNEMONIC', 'AGENT_WALLET_PASSWORD']

export function assertNoSecrets(text: string, env: NodeJS.ProcessEnv): void {
  for (const key of secretKeys) {
    const value = env[key]
    if (value && text.includes(value)) {
      throw new Error(`secret leaked in output: ${key}`)
    }
  }
}
```

- [ ] **Step 2: Add fixture config**

Create `test/e2e/nile-fixtures.ts`:

```ts
const requiredEnv = [
  'AGENT_WALLET_PRIVATE_KEY',
  'TRONGRID_API_KEY',
  'NILE_CONTRACT_ADDRESS',
  'NILE_CONTRACT_WRITE_FN',
  'NILE_CONTRACT_WRITE_ARGS_JSON',
  'NILE_CONTRACT_ABI_JSON',
  'NILE_SWAP_TOKEN_IN',
  'NILE_SWAP_TOKEN_OUT',
  'NILE_SWAP_AMOUNT_IN',
  'NILE_V2_TOKEN_A',
  'NILE_V2_TOKEN_B',
  'NILE_V2_AMOUNT_A',
  'NILE_V2_AMOUNT_B',
  'NILE_V2_LIQUIDITY',
  'NILE_V3_TOKEN0',
  'NILE_V3_TOKEN1',
  'NILE_V3_TOKEN_ID',
  'NILE_V4_TOKEN0',
  'NILE_V4_TOKEN1',
  'NILE_V4_TOKEN_ID',
  'NILE_V4_INIT_TOKEN0',
  'NILE_V4_INIT_TOKEN1',
  'NILE_SUNPUMP_TOKEN',
  'NILE_SUNPUMP_BUY_TRX',
  'NILE_SUNPUMP_SELL_AMOUNT',
] as const

function requireEnv(env: NodeJS.ProcessEnv, name: typeof requiredEnv[number]): string {
  const value = env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function buildNileWriteCommands(env: NodeJS.ProcessEnv): readonly (readonly string[])[] {
  return [
    ['contract', 'send', requireEnv(env, 'NILE_CONTRACT_ADDRESS'), requireEnv(env, 'NILE_CONTRACT_WRITE_FN'), '--args', requireEnv(env, 'NILE_CONTRACT_WRITE_ARGS_JSON'), '--abi', requireEnv(env, 'NILE_CONTRACT_ABI_JSON')],
    ['swap', requireEnv(env, 'NILE_SWAP_TOKEN_IN'), requireEnv(env, 'NILE_SWAP_TOKEN_OUT'), requireEnv(env, 'NILE_SWAP_AMOUNT_IN'), '--slippage', '0.005'],
    ['liquidity', 'v2:add', '--token-a', requireEnv(env, 'NILE_V2_TOKEN_A'), '--token-b', requireEnv(env, 'NILE_V2_TOKEN_B'), '--amount-a', requireEnv(env, 'NILE_V2_AMOUNT_A'), '--amount-b', requireEnv(env, 'NILE_V2_AMOUNT_B'), '--min-a', '1', '--min-b', '1'],
    ['liquidity', 'v2:remove', '--token-a', requireEnv(env, 'NILE_V2_TOKEN_A'), '--token-b', requireEnv(env, 'NILE_V2_TOKEN_B'), '--liquidity', requireEnv(env, 'NILE_V2_LIQUIDITY'), '--min-a', '1', '--min-b', '1'],
    ['liquidity', 'v3:mint', '--token0', requireEnv(env, 'NILE_V3_TOKEN0'), '--token1', requireEnv(env, 'NILE_V3_TOKEN1'), '--amount0', '1000', '--amount1', '1000', '--min0', '1', '--min1', '1'],
    ['liquidity', 'v3:increase', '--token-id', requireEnv(env, 'NILE_V3_TOKEN_ID'), '--amount0', '1000', '--min0', '1'],
    ['liquidity', 'v3:decrease', '--token-id', requireEnv(env, 'NILE_V3_TOKEN_ID'), '--liquidity', '1', '--min0', '0', '--min1', '0'],
    ['liquidity', 'v3:collect', '--token-id', requireEnv(env, 'NILE_V3_TOKEN_ID')],
    ['liquidity', 'v4:mint', '--token0', requireEnv(env, 'NILE_V4_INIT_TOKEN0'), '--token1', requireEnv(env, 'NILE_V4_INIT_TOKEN1'), '--amount0', '1000', '--amount1', '1000', '--create-pool', '--sqrt-price', '79228162514264337593543950336'],
    ['liquidity', 'v4:mint', '--token0', requireEnv(env, 'NILE_V4_TOKEN0'), '--token1', requireEnv(env, 'NILE_V4_TOKEN1'), '--amount0', '1000', '--amount1', '1000'],
    ['liquidity', 'v4:increase', '--token-id', requireEnv(env, 'NILE_V4_TOKEN_ID'), '--token0', requireEnv(env, 'NILE_V4_TOKEN0'), '--token1', requireEnv(env, 'NILE_V4_TOKEN1'), '--amount0', '1000'],
    ['liquidity', 'v4:decrease', '--token-id', requireEnv(env, 'NILE_V4_TOKEN_ID'), '--liquidity', '1', '--token0', requireEnv(env, 'NILE_V4_TOKEN0'), '--token1', requireEnv(env, 'NILE_V4_TOKEN1'), '--min0', '0', '--min1', '0'],
    ['liquidity', 'v4:collect', '--token-id', requireEnv(env, 'NILE_V4_TOKEN_ID'), '--token0', requireEnv(env, 'NILE_V4_TOKEN0'), '--token1', requireEnv(env, 'NILE_V4_TOKEN1')],
    ['sunpump', 'buy', requireEnv(env, 'NILE_SUNPUMP_TOKEN'), '--trx', requireEnv(env, 'NILE_SUNPUMP_BUY_TRX')],
    ['sunpump', 'sell', requireEnv(env, 'NILE_SUNPUMP_TOKEN'), '--amount', requireEnv(env, 'NILE_SUNPUMP_SELL_AMOUNT')],
  ]
}

export const nileFixtures = {
  network: 'nile',
  maxFeeSun: 200_000_000,
  requiredEnv,
} as const
```

- [ ] **Step 3: Add gated test script**

Modify `package.json`:

```json
"test:e2e:nile": "RUN_NILE_E2E=1 jest --runTestsByPath test/e2e/nile-real-signing.test.ts --runInBand"
```

- [ ] **Step 4: Write gated E2E test**

Create `test/e2e/nile-real-signing.test.ts`:

```ts
import { runCli } from '../helpers/run-cli'
import { assertNoSecrets } from './redact'
import { buildNileWriteCommands, nileFixtures } from './nile-fixtures'
import { TronWeb } from 'tronweb'

const run = process.env.RUN_NILE_E2E === '1' ? describe : describe.skip

async function waitForReceipt(txid: string): Promise<unknown> {
  const tronWeb = new TronWeb({ fullHost: process.env.TRON_RPC_URL || 'https://nile.trongrid.io', headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY || '' } })
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const receipt = await tronWeb.trx.getTransactionInfo(txid)
    if (receipt && Object.keys(receipt).length > 0) return receipt
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  throw new Error(`receipt not found for ${txid}`)
}

run('Nile real private-key signing', () => {
  beforeAll(() => {
    for (const name of nileFixtures.requiredEnv) {
      if (!process.env[name]) throw new Error(`${name} is required`)
    }
    if (process.env.TRON_NETWORK && process.env.TRON_NETWORK !== 'nile') {
      throw new Error('Nile E2E refuses non-nile TRON_NETWORK')
    }
  })

  it.each(buildNileWriteCommands(process.env))('broadcasts %s %s and hides secrets', async (...command) => {
    const result = await runCli(['--json', '--network', 'nile', ...command, '--yes'])
    assertNoSecrets(result.stdout + result.stderr, process.env)
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout)
    const txid = payload.txid ?? payload.txResult?.txid
    expect(typeof txid).toBe('string')
    const receipt = await waitForReceipt(txid)
    expect(JSON.stringify(receipt)).toMatch(/SUCCESS|result/i)
  })
})
```

The V4 initialize requirement is covered by the `liquidity v4:mint --create-pool --sqrt-price ...` command because that is the existing CLI API for pool creation.

- [ ] **Step 5: Run gated E2E**

Run:

```bash
RUN_NILE_E2E=1 AGENT_WALLET_PRIVATE_KEY="$AGENT_WALLET_PRIVATE_KEY" TRONGRID_API_KEY="$TRONGRID_API_KEY" npm run test:e2e:nile
```

Expected: every write command broadcasts on Nile, returns a txid, and no secret appears in stdout/stderr.

- [ ] **Step 6: Commit E2E harness**

```bash
git add package.json test/e2e
git commit -m "test: add nile real signing harness"
```

## Task 10: Release Verification

**Files:**
- Inspect: `package.json`, `package-lock.json`, `README.md`

**Interfaces:**
- Produces: migrated CLI release candidate.

- [ ] **Step 1: Verify published SDK resolution**

Run:

```bash
npm ls @sun-sdk/protocols @sun-sdk/runtime @sun-sdk/api
npm view @sun-sdk/protocols@0.1.2 version
```

Expected: installed and published versions are `0.1.2`.

- [ ] **Step 2: Run complete local checks**

Run:

```bash
npm run build
npm test
npm run lint
npm run format:check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run Nile E2E gate**

Run:

```bash
RUN_NILE_E2E=1 AGENT_WALLET_PRIVATE_KEY="$AGENT_WALLET_PRIVATE_KEY" TRONGRID_API_KEY="$TRONGRID_API_KEY" npm run test:e2e:nile
```

Expected: all Nile real-signing tests pass, report txids, fetch receipts, and reject secret leakage.

- [ ] **Step 4: Final sun-kit search**

Run:

```bash
rg 'sun-kit|@sun-protocol/sun-kit|@bankofai/sun-kit' src test package.json package-lock.json README.md
```

Expected: no matches in runtime/test/package files.

- [ ] **Step 5: Commit final verification notes if README changed**

```bash
git add README.md package.json package-lock.json
git commit -m "docs: update sun sdk migration notes"
```

Run this commit only if files changed.
