import { spawn } from 'child_process'
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
  'TRON_NETWORK',
  'TRON_RPC_URL',
  'TRONGRID_API_KEY',
  'TRON_GRID_API_KEY',
]

export function runCli(args: readonly string[], options: RunCliOptions = {}): Promise<CliResult> {
  const rootDir = path.resolve(__dirname, '..', '..')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    DOTENV_CONFIG_PATH: path.join(rootDir, '.codex-test-empty.env'),
    ...options.env,
  }

  for (const key of secretEnvKeys) {
    if (!options.env || !(key in options.env)) {
      delete env[key]
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', path.join(rootDir, 'src/bin.ts'), ...args],
      {
        cwd: rootDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
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
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      resolve({ code, signal, stdout, stderr })
    })
  })
}
