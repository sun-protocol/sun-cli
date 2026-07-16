import { spawn } from 'child_process'
import { Command } from 'commander'
import { output } from '../lib/output'
import { createReadonlyTronWeb } from '../lib/sdk/factory'

const SUNSWAP_V2_NILE_ROUTER = 'TYMjxCXfqLpMWW1QToP6hbcjpion7EE25p'
const NILE_USDT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'
const NILE_LEON_TEST_TOKEN = 'TDqjTkZ63yHB19w2n7vPm2qAkLHwn9fKKk'
const NILE_CONCENTRATED_LIQUIDITY_TOKEN = 'TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK'
const NILE_V3_POSITION_MANAGER = 'TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R'
const NILE_V4_POSITION_MANAGER = 'TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP'
const TRANSFER_EVENT_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const V4_TICK_SPACING_10_PARAMETERS = `0x${'0'.repeat(58)}0a0000`
const TRC20_DECIMALS_ABI =
  '[{"type":"function","name":"decimals","inputs":[],"outputs":[{"type":"uint8"}]}]'
const TRC20_APPROVE_ABI =
  '[{"type":"function","name":"approve","inputs":[{"type":"address"},{"type":"uint256"}],"outputs":[{"type":"bool"}]}]'

interface E2EStep {
  name: string
  args: string[]
  requiresWallet?: boolean
  write?: boolean
  positionManager?: string
  captureTokenIdAs?: 'v3' | 'v4'
}

interface E2EResult {
  name: string
  command: string
  ok: boolean
  skipped: boolean
  exitCode: number | null
  durationMs: number
  stdout: string
  stderr: string
  txids?: string[]
  tokenId?: string
}

function hasWalletEnv(): boolean {
  return Boolean(
    process.env.AGENT_WALLET_PRIVATE_KEY ||
    process.env.AGENT_WALLET_MNEMONIC ||
    process.env.AGENT_WALLET_PASSWORD,
  )
}

function truncate(s: string, max = 4000): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n... truncated ${s.length - max} chars`
}

function rootArgs(network: string, json: boolean): string[] {
  const args = ['--network', network]
  if (json) args.push('--json')
  return args
}

function selfCommand(args: string[]): string {
  return ['sun', ...args].join(' ')
}

function runSelf(
  args: string[],
  timeoutMs: number,
  validate: (value: unknown) => void,
): Promise<E2EResult> {
  const started = Date.now()
  const nodeArgs = ['-r', 'ts-node/register', 'src/bin.ts', ...args]

  return new Promise((resolve) => {
    const child = spawn(process.execPath, nodeArgs, {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const normalizedStdout = stdout.trim()
      let parsed: unknown
      try {
        parsed = JSON.parse(normalizedStdout)
      } catch {
        parsed = undefined
      }
      const txids = extractTxids(parsed)
      const outputError = parsed && typeof parsed === 'object' && 'error' in parsed
      let validationError = ''
      if (parsed !== undefined && !outputError) {
        try {
          validate(parsed)
        } catch (error) {
          validationError = error instanceof Error ? error.message : String(error)
        }
      }
      resolve({
        name: '',
        command: selfCommand(args),
        ok: code === 0 && !outputError && parsed !== undefined && !validationError,
        skipped: false,
        exitCode: code,
        durationMs: Date.now() - started,
        stdout: truncate(normalizedStdout),
        stderr: truncate([stderr.trim(), validationError].filter(Boolean).join('\n')),
        ...(txids.length ? { txids } : {}),
      })
    })
  })
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} output must be an object`)
  }
  return value as Record<string, unknown>
}

function validateOutput(step: E2EStep, value: unknown): void {
  if (isDryRunStep(step)) {
    const result = assertRecord(value, step.name)
    if (result.dryRun !== true || typeof result.action !== 'string' || !result.params) {
      throw new Error(`${step.name} output is incompatible with the dry-run API shape`)
    }
    return
  }
  if (step.write) {
    const result = assertRecord(value, step.name)
    if (typeof result.txid !== 'string' || !/^[0-9a-f]{64}$/i.test(result.txid)) {
      throw new Error(`${step.name} output is missing a valid txid`)
    }
    return
  }

  if (step.name === 'wallet address') {
    const result = assertRecord(value, step.name)
    if (typeof result.address !== 'string' || result.network !== 'nile') {
      throw new Error('wallet address output is incompatible')
    }
    return
  }
  if (step.name === 'wallet balances') {
    if (!Array.isArray(value) || value.some((row) => !assertRecord(row, step.name).balance)) {
      throw new Error('wallet balances output is incompatible')
    }
    return
  }
  if (step.name.startsWith('swap quote')) {
    const result = assertRecord(value, step.name)
    for (const key of ['amountIn', 'amountOut', 'impact', 'tokens', 'poolVersions']) {
      if (!(key in result)) throw new Error(`${step.name} output is missing ${key}`)
    }
    return
  }
  if (step.name === 'contract read') {
    if (!('result' in assertRecord(value, step.name))) {
      throw new Error('contract read output is missing result')
    }
    return
  }
  if (step.name === 'v4 info') {
    const result = assertRecord(value, step.name)
    for (const key of ['currency0', 'currency1', 'fee', 'tickLower', 'tickUpper', 'liquidity']) {
      if (!(key in result)) throw new Error(`v4 info output is missing ${key}`)
    }
    return
  }

  const arrayOutputs = new Set(['price', 'pool hooks', 'protocol info'])
  if (arrayOutputs.has(step.name)) {
    if (!Array.isArray(value)) throw new Error(`${step.name} output must be an array`)
    return
  }
  const result = assertRecord(value, step.name)
  if (!Array.isArray(result.list) || !result.meta || typeof result.meta !== 'object') {
    throw new Error(`${step.name} output is incompatible with the list/meta API shape`)
  }
}

export function extractTxids(value: unknown): string[] {
  const found = new Set<string>()
  const visit = (current: unknown, key?: string) => {
    if (typeof current === 'string') {
      if (
        (key === 'txid' || key === 'txID' || key === 'txids') &&
        /^[0-9a-f]{64}$/i.test(current)
      ) {
        found.add(current)
      }
      return
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item, key)
      return
    }
    if (!current || typeof current !== 'object') return
    for (const [childKey, childValue] of Object.entries(current)) visit(childValue, childKey)
  }
  visit(value)
  return [...found]
}

function receiptSucceeded(info: any): boolean {
  return info?.receipt?.result === 'SUCCESS' || info?.result === 'SUCCESS'
}

async function waitForConfirmedReceipt(txid: string, timeoutMs: number): Promise<any> {
  const tronWeb = createReadonlyTronWeb({ network: 'nile' })
  const deadline = Date.now() + timeoutMs
  let lastInfo: any
  while (Date.now() < deadline) {
    try {
      lastInfo = await tronWeb.trx.getTransactionInfo(txid)
      if (lastInfo?.id || lastInfo?.receipt) return lastInfo
    } catch {
      // Nile nodes may briefly return an empty response while indexing a new transaction.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(
    `Transaction ${txid} was not confirmed within ${timeoutMs}ms: ${JSON.stringify(lastInfo)}`,
  )
}

async function confirmWriteResult(result: E2EResult, timeoutMs: number): Promise<any[]> {
  if (!result.txids?.length) throw new Error('Write command returned no txid')
  const receipts: any[] = []
  for (const txid of result.txids) {
    const receipt = await waitForConfirmedReceipt(txid, timeoutMs)
    if (!receiptSucceeded(receipt)) {
      throw new Error(
        `Transaction ${txid} did not succeed: ${JSON.stringify(receipt?.receipt ?? receipt)}`,
      )
    }
    receipts.push(receipt)
  }
  return receipts
}

function mintedTokenId(receipts: any[], positionManager: string): string {
  const tronWeb = createReadonlyTronWeb({ network: 'nile' })
  const managerHex = tronWeb.address.toHex(positionManager).slice(-40).toLowerCase()
  for (const receipt of receipts) {
    for (const log of receipt?.log ?? []) {
      const topics = log?.topics
      if (
        typeof log?.address === 'string' &&
        log.address.toLowerCase().slice(-40) === managerHex &&
        Array.isArray(topics) &&
        topics[0]?.toLowerCase() === TRANSFER_EVENT_TOPIC &&
        /^0+$/.test(topics[1] ?? '') &&
        typeof topics[3] === 'string'
      ) {
        return BigInt(`0x${topics[3]}`).toString()
      }
    }
  }
  throw new Error(`Mint receipt did not contain a Transfer event from ${positionManager}`)
}

function isDryRunStep(step: E2EStep): boolean {
  return step.args.includes('--dry-run')
}

function v2AddArgs(v2TokenA: string, v2TokenB: string): string[] {
  const args = [
    'liquidity',
    'v2:add',
    '--token-a',
    v2TokenA,
    '--token-b',
    v2TokenB,
    '--amount-a',
    process.env.SUN_E2E_V2_AMOUNT_A || '100000',
  ]
  if (process.env.SUN_E2E_V2_AMOUNT_B) {
    args.push('--amount-b', process.env.SUN_E2E_V2_AMOUNT_B)
  }
  return args
}

function nileSteps(write: boolean): E2EStep[] {
  const nileUsdt = NILE_USDT
  const tokenId = process.env.SUN_E2E_TOKEN_ID || '1'
  const liquidity = process.env.SUN_E2E_LIQUIDITY || '1'
  const router = process.env.SUN_E2E_ROUTER || SUNSWAP_V2_NILE_ROUTER
  const v4Pm = process.env.SUN_E2E_V4_PM || 'TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP'
  const spender = process.env.SUN_E2E_SPENDER || router
  const swapIn = process.env.SUN_E2E_SWAP_IN || 'TRX'
  const swapOut = process.env.SUN_E2E_SWAP_OUT || 'SUN'
  const v2TokenA = process.env.SUN_E2E_V2_TOKEN_A || NILE_USDT
  const v2TokenB = process.env.SUN_E2E_V2_TOKEN_B || NILE_LEON_TEST_TOKEN
  const clToken0 = process.env.SUN_E2E_CL_TOKEN0 || NILE_USDT
  const clToken1 = process.env.SUN_E2E_CL_TOKEN1 || NILE_CONCENTRATED_LIQUIDITY_TOKEN

  const readAndDryRun: E2EStep[] = [
    { name: 'wallet address', args: ['wallet', 'address'], requiresWallet: true },
    {
      name: 'wallet balances',
      args: ['wallet', 'balances', '--tokens', `TRX,${nileUsdt}`],
      requiresWallet: true,
    },
    { name: 'price', args: ['price', 'TRX'] },
    { name: 'token list', args: ['token', 'list', '--address', nileUsdt, '--page-size', '1'] },
    { name: 'token search', args: ['token', 'search', 'USDT', '--page-size', '1'] },
    { name: 'pool list', args: ['pool', 'list', '--token', 'USDT', '--page-size', '1'] },
    { name: 'pool search', args: ['pool', 'search', 'TRX USDT', '--page-size', '1'] },
    { name: 'pool search usdd usdt', args: ['pool', 'search', 'USDD USDT', '--page-size', '5'] },
    { name: 'pool top apy', args: ['pool', 'top-apy', '--page-size', '1'] },
    { name: 'pool hooks', args: ['pool', 'hooks'] },
    { name: 'pair info', args: ['pair', 'info', '--token', nileUsdt, '--page-size', '1'] },
    { name: 'farm list', args: ['farm', 'list', '--page-size', '1'] },
    { name: 'tx scan', args: ['tx', 'scan', '--token', nileUsdt, '--page-size', '1'] },
    { name: 'protocol info', args: ['protocol', 'info'] },
    { name: 'position list', args: ['position', 'list', '--page-size', '1'] },
    { name: 'swap quote', args: ['swap:quote', 'TRX', 'USDT', '1000000'] },
    { name: 'swap quote sun trx', args: ['swap:quote', 'TRX', 'SUN', '1000000'] },
    {
      name: 'contract read',
      args: ['contract', 'read', nileUsdt, 'decimals', '--args', '[]', '--abi', TRC20_DECIMALS_ABI],
    },
    {
      name: 'approve dry-run',
      args: [
        '--dry-run',
        'token',
        'approve',
        '--token',
        nileUsdt,
        '--spender',
        spender,
        '--amount',
        '1',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'swap dry-run',
      args: ['--dry-run', 'swap', swapIn, swapOut, '1000000'],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v2 add dry-run',
      args: ['--dry-run', ...v2AddArgs(v2TokenA, v2TokenB)],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v2 remove dry-run',
      args: [
        '--dry-run',
        'liquidity',
        'v2:remove',
        '--token-a',
        v2TokenA,
        '--token-b',
        v2TokenB,
        '--liquidity',
        liquidity,
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v3 mint dry-run',
      args: [
        '--dry-run',
        'liquidity',
        'v3:mint',
        '--token0',
        clToken0,
        '--token1',
        clToken1,
        '--amount0',
        '1',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v3 increase dry-run',
      args: ['--dry-run', 'liquidity', 'v3:increase', '--token-id', tokenId, '--amount0', '1'],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v3 decrease dry-run',
      args: [
        '--dry-run',
        'liquidity',
        'v3:decrease',
        '--token-id',
        tokenId,
        '--liquidity',
        liquidity,
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v3 collect dry-run',
      args: ['--dry-run', 'liquidity', 'v3:collect', '--token-id', tokenId],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v4 mint dry-run',
      args: [
        '--dry-run',
        'liquidity',
        'v4:mint',
        '--token0',
        clToken0,
        '--token1',
        clToken1,
        '--amount0',
        '1',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v4 increase dry-run',
      args: [
        '--dry-run',
        'liquidity',
        'v4:increase',
        '--token-id',
        tokenId,
        '--token0',
        clToken0,
        '--token1',
        clToken1,
        '--amount0',
        '1',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v4 decrease dry-run',
      args: [
        '--dry-run',
        'liquidity',
        'v4:decrease',
        '--token-id',
        tokenId,
        '--liquidity',
        liquidity,
        '--token0',
        clToken0,
        '--token1',
        clToken1,
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v4 collect dry-run',
      args: ['--dry-run', 'liquidity', 'v4:collect', '--token-id', tokenId],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v4 info',
      args: ['liquidity', 'v4:info', '--pm', v4Pm, '--token-id', tokenId],
    },
    {
      name: 'contract send dry-run',
      args: [
        '--dry-run',
        'contract',
        'send',
        nileUsdt,
        'approve',
        '--args',
        `["${spender}","1"]`,
        '--abi',
        TRC20_APPROVE_ABI,
      ],
      requiresWallet: true,
      write: true,
    },
  ]

  if (!write) return readAndDryRun

  return [
    ...readAndDryRun,
    {
      name: 'approve write',
      args: [
        '--yes',
        'token',
        'approve',
        '--token',
        nileUsdt,
        '--spender',
        spender,
        '--amount',
        '1',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'swap write',
      args: ['--yes', 'swap', swapIn, swapOut, process.env.SUN_E2E_SWAP_AMOUNT || '1000000'],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v2 add write',
      args: ['--yes', ...v2AddArgs(v2TokenA, v2TokenB)],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v2 remove write',
      args: [
        '--yes',
        'liquidity',
        'v2:remove',
        '--token-a',
        v2TokenA,
        '--token-b',
        v2TokenB,
        '--liquidity',
        process.env.SUN_E2E_V2_REMOVE_LIQUIDITY || '1000000000000',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v3 mint write',
      args: [
        '--yes',
        'liquidity',
        'v3:mint',
        '--token0',
        clToken0,
        '--token1',
        clToken1,
        '--fee',
        process.env.SUN_E2E_V3_FEE || '3000',
        '--amount0',
        process.env.SUN_E2E_V3_AMOUNT0 || '100000',
        '--amount1',
        process.env.SUN_E2E_V3_AMOUNT1 || '100000000000000000',
        '--slippage',
        process.env.SUN_E2E_CL_SLIPPAGE || '0.01',
      ],
      requiresWallet: true,
      write: true,
      positionManager: process.env.SUN_E2E_V3_PM || NILE_V3_POSITION_MANAGER,
      captureTokenIdAs: 'v3',
    },
    {
      name: 'v3 increase write',
      args: [
        '--yes',
        'liquidity',
        'v3:increase',
        '--token-id',
        '{{v3TokenId}}',
        '--amount0',
        process.env.SUN_E2E_V3_INCREASE_AMOUNT0 || '100000000000000000',
        '--amount1',
        process.env.SUN_E2E_V3_INCREASE_AMOUNT1 || '10000',
        '--slippage',
        process.env.SUN_E2E_CL_SLIPPAGE || '0.01',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v3 decrease write',
      args: [
        '--yes',
        'liquidity',
        'v3:decrease',
        '--token-id',
        '{{v3TokenId}}',
        '--liquidity',
        process.env.SUN_E2E_V3_DECREASE_LIQUIDITY || '1',
        '--slippage',
        process.env.SUN_E2E_CL_SLIPPAGE || '0.01',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v3 collect write',
      args: ['--yes', 'liquidity', 'v3:collect', '--token-id', '{{v3TokenId}}'],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v4 mint write',
      args: [
        '--yes',
        'liquidity',
        'v4:mint',
        '--token0',
        clToken0,
        '--token1',
        clToken1,
        '--fee',
        process.env.SUN_E2E_V4_FEE || '500',
        '--parameters',
        process.env.SUN_E2E_V4_PARAMETERS || V4_TICK_SPACING_10_PARAMETERS,
        '--tick-lower',
        process.env.SUN_E2E_V4_TICK_LOWER || '-120',
        '--tick-upper',
        process.env.SUN_E2E_V4_TICK_UPPER || '120',
        '--liquidity',
        process.env.SUN_E2E_V4_LIQUIDITY || '100000',
        '--amount0-max',
        process.env.SUN_E2E_V4_AMOUNT0_MAX || '100000',
        '--amount1-max',
        process.env.SUN_E2E_V4_AMOUNT1_MAX || '100000000000000000',
      ],
      requiresWallet: true,
      write: true,
      positionManager: process.env.SUN_E2E_V4_PM || NILE_V4_POSITION_MANAGER,
      captureTokenIdAs: 'v4',
    },
    {
      name: 'v4 increase write',
      args: [
        '--yes',
        'liquidity',
        'v4:increase',
        '--token-id',
        '{{v4TokenId}}',
        '--token0',
        clToken0,
        '--token1',
        clToken1,
        '--fee',
        process.env.SUN_E2E_V4_FEE || '500',
        '--parameters',
        process.env.SUN_E2E_V4_PARAMETERS || V4_TICK_SPACING_10_PARAMETERS,
        '--liquidity',
        process.env.SUN_E2E_V4_INCREASE_LIQUIDITY || '100000',
        '--amount0-max',
        process.env.SUN_E2E_V4_AMOUNT0_MAX || '100000',
        '--amount1-max',
        process.env.SUN_E2E_V4_AMOUNT1_MAX || '100000000000000000',
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v4 decrease write',
      args: [
        '--yes',
        'liquidity',
        'v4:decrease',
        '--token-id',
        '{{v4TokenId}}',
        '--liquidity',
        process.env.SUN_E2E_V4_DECREASE_LIQUIDITY || '1',
        '--token0',
        clToken0,
        '--token1',
        clToken1,
        '--fee',
        process.env.SUN_E2E_V4_FEE || '500',
        '--parameters',
        process.env.SUN_E2E_V4_PARAMETERS || V4_TICK_SPACING_10_PARAMETERS,
      ],
      requiresWallet: true,
      write: true,
    },
    {
      name: 'v4 collect write',
      args: ['--yes', 'liquidity', 'v4:collect', '--token-id', '{{v4TokenId}}'],
      requiresWallet: true,
      write: true,
    },
  ]
}

function resolveDynamicArgs(
  args: string[],
  tokenIds: Partial<Record<'v3' | 'v4', string>>,
): string[] {
  return args.map((arg) => {
    if (arg === '{{v3TokenId}}') {
      if (!tokenIds.v3) throw new Error('V3 mint did not produce a tokenId')
      return tokenIds.v3
    }
    if (arg === '{{v4TokenId}}') {
      if (!tokenIds.v4) throw new Error('V4 mint did not produce a tokenId')
      return tokenIds.v4
    }
    return arg
  })
}

export function registerE2ECommands(program: Command) {
  const e2e = program.command('e2e').description('End-to-end self-tests for sun-cli + sun-sdk')

  e2e
    .command('nile')
    .description('Run Nile E2E checks across core sun-sdk-backed CLI features')
    .option('--write', 'Run real write transactions in addition to read and dry-run checks', false)
    .option('--timeout <ms>', 'Per-step timeout in milliseconds', '600000')
    .option('--no-json-children', 'Do not force child commands to use JSON output')
    .action(async (opts) => {
      const walletReady = hasWalletEnv()
      const timeoutMs = Number(opts.timeout)
      const results: E2EResult[] = []
      const tokenIds: Partial<Record<'v3' | 'v4', string>> = {}

      for (const step of nileSteps(Boolean(opts.write))) {
        let args: string[]
        try {
          args = [
            ...rootArgs('nile', opts.jsonChildren !== false),
            ...resolveDynamicArgs(step.args, tokenIds),
          ]
        } catch (error) {
          results.push({
            name: step.name,
            command: selfCommand(step.args),
            ok: false,
            skipped: false,
            exitCode: null,
            durationMs: 0,
            stdout: '',
            stderr: error instanceof Error ? error.message : String(error),
          })
          continue
        }
        if (step.requiresWallet && !walletReady && !isDryRunStep(step)) {
          results.push({
            name: step.name,
            command: selfCommand(args),
            ok: true,
            skipped: true,
            exitCode: null,
            durationMs: 0,
            stdout: '',
            stderr: 'Skipped because no wallet env is configured.',
          })
          continue
        }
        const effectiveTimeout = Number.isFinite(timeoutMs) ? timeoutMs : 600000
        const result = await runSelf(args, effectiveTimeout, (value) => validateOutput(step, value))
        const completed = { ...result, name: step.name }
        if (completed.ok && step.write && !isDryRunStep(step)) {
          try {
            const receipts = await confirmWriteResult(completed, effectiveTimeout)
            if (step.captureTokenIdAs && step.positionManager) {
              const tokenId = mintedTokenId(receipts, step.positionManager)
              tokenIds[step.captureTokenIdAs] = tokenId
              completed.tokenId = tokenId
            }
          } catch (error) {
            completed.ok = false
            completed.stderr = [
              completed.stderr,
              error instanceof Error ? error.message : String(error),
            ]
              .filter(Boolean)
              .join('\n')
          }
        }
        results.push(completed)
      }

      const failed = results.filter((r) => !r.ok)
      const skipped = results.filter((r) => r.skipped)
      output({
        network: 'nile',
        write: Boolean(opts.write),
        ok: failed.length === 0,
        total: results.length,
        passed: results.length - failed.length - skipped.length,
        failed: failed.length,
        skipped: skipped.length,
        results,
      })
      if (failed.length) process.exitCode = 1
    })
}
