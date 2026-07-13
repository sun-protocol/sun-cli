import { spawn } from 'child_process'
import { Command } from 'commander'
import { output } from '../lib/output'

interface E2EStep {
  name: string
  args: string[]
  requiresWallet?: boolean
  write?: boolean
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

function runSelf(args: string[], timeoutMs: number): Promise<E2EResult> {
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
      resolve({
        name: '',
        command: selfCommand(args),
        ok: code === 0,
        skipped: false,
        exitCode: code,
        durationMs: Date.now() - started,
        stdout: truncate(stdout.trim()),
        stderr: truncate(stderr.trim()),
      })
    })
  })
}

function isDryRunStep(step: E2EStep): boolean {
  return step.args.includes('--dry-run')
}

function nileSteps(write: boolean): E2EStep[] {
  const nileUsdt = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'
  const owner = process.env.SUN_E2E_OWNER || ''
  const tokenId = process.env.SUN_E2E_TOKEN_ID || '1'
  const liquidity = process.env.SUN_E2E_LIQUIDITY || '1'
  const router = process.env.SUN_E2E_ROUTER || 'TVFu77XsSvHu4voLPg3U4UYZbStX5GFJcD'
  const pm = process.env.SUN_E2E_V3_PM || 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8'
  const spender = process.env.SUN_E2E_SPENDER || router
  const swapIn = process.env.SUN_E2E_SWAP_IN || 'TRX'
  const swapOut = process.env.SUN_E2E_SWAP_OUT || 'SUN'
  const v2TokenA = process.env.SUN_E2E_V2_TOKEN_A || 'TRX'
  const v2TokenB = process.env.SUN_E2E_V2_TOKEN_B || 'SUN'
  const clToken0 = process.env.SUN_E2E_CL_TOKEN0 || 'USDD'
  const clToken1 = process.env.SUN_E2E_CL_TOKEN1 || 'USDT'

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
      args: ['contract', 'read', nileUsdt, 'decimals', '--args', '[]'],
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
      args: [
        '--dry-run',
        'liquidity',
        'v2:add',
        '--token-a',
        v2TokenA,
        '--token-b',
        v2TokenB,
        '--amount-a',
        '1',
        '--amount-b',
        '1',
      ],
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
      args: ['liquidity', 'v4:info', '--pm', pm, '--token-id', tokenId],
    },
    {
      name: 'contract send dry-run',
      args: ['--dry-run', 'contract', 'send', nileUsdt, 'approve', '--args', `["${spender}","1"]`],
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
      args: [
        '--yes',
        'liquidity',
        'v2:add',
        '--token-a',
        v2TokenA,
        '--token-b',
        v2TokenB,
        '--amount-a',
        process.env.SUN_E2E_V2_AMOUNT_A || '1',
        '--amount-b',
        process.env.SUN_E2E_V2_AMOUNT_B || '1',
      ],
      requiresWallet: true,
      write: true,
    },
  ]
}

export function registerE2ECommands(program: Command) {
  const e2e = program.command('e2e').description('End-to-end self-tests for sun-cli + sun-kit')

  e2e
    .command('nile')
    .description('Run Nile E2E checks across core SunKit-backed CLI features')
    .option('--write', 'Run real write transactions in addition to read and dry-run checks', false)
    .option('--timeout <ms>', 'Per-step timeout in milliseconds', '30000')
    .option('--no-json-children', 'Do not force child commands to use JSON output')
    .action(async (opts) => {
      const walletReady = hasWalletEnv()
      const timeoutMs = Number(opts.timeout)
      const results: E2EResult[] = []

      for (const step of nileSteps(Boolean(opts.write))) {
        const args = [...rootArgs('nile', opts.jsonChildren !== false), ...step.args]
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
        const result = await runSelf(args, Number.isFinite(timeoutMs) ? timeoutMs : 30000)
        results.push({ ...result, name: step.name })
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
