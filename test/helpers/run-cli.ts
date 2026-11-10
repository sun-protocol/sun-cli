import { spawn } from 'child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'path'

export interface CliResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

export interface RunCliOptions {
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

const secretEnvKeys = [
  'AGENT_WALLET_PRIVATE_KEY',
  'AGENT_WALLET_MNEMONIC',
  'AGENT_WALLET_PASSWORD',
  'AGENT_WALLET_DIR',
  'AGENT_WALLET_MNEMONIC_ACCOUNT_INDEX',
  'TRON_PRIVATE_KEY',
  'TRON_MNEMONIC',
  'TRON_ACCOUNT_INDEX',
  'TRON_NETWORK',
  'TRON_RPC_URL',
  'TRONGRID_API_KEY',
  'TRON_GRID_API_KEY',
]

export function buildCliEnv(options: RunCliOptions, isolatedWalletDir: string): NodeJS.ProcessEnv {
  const rootDir = path.resolve(__dirname, '..', '..')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    DOTENV_CONFIG_PATH: path.join(rootDir, '.codex-test-empty.env'),
    ...options.env,
  }

  for (const key of secretEnvKeys) {
    if (!options.env || !(key in options.env)) delete env[key]
  }
  if (!options.env || !('AGENT_WALLET_DIR' in options.env)) {
    env.AGENT_WALLET_DIR = isolatedWalletDir
  }
  return env
}

export function runCli(args: readonly string[], options: RunCliOptions = {}): Promise<CliResult> {
  const rootDir = path.resolve(__dirname, '..', '..')
  const isolatedWalletDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sun-cli-test-wallet-'))
  const env = buildCliEnv(options, isolatedWalletDir)

  return new Promise((resolve, reject) => {
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      fs.rmSync(isolatedWalletDir, { recursive: true, force: true })
    }
    let child
    try {
      child = spawn(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', path.join(rootDir, 'src/bin.ts'), ...args],
        {
          cwd: rootDir,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
    } catch (error) {
      cleanup()
      reject(error)
      return
    }

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      cleanup()
      reject(new Error(`CLI timed out after ${options.timeoutMs ?? 10000}ms: ${args.join(' ')}`))
    }, options.timeoutMs ?? 10000)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      cleanup()
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      cleanup()
      resolve({ code, signal, stdout, stderr })
    })
  })
}
