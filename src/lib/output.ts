/**
 * Multi-mode output formatter.
 *
 * - table (default): Rich terminal tables with color.
 * - json: Strict compact JSON to stdout (for AI agents).
 * - tsv: Tab-separated values to stdout (for shell pipelines).
 * - --fields: Filter output to only requested fields.
 */

import chalk from 'chalk'
import Table from 'cli-table3'

// ---------------------------------------------------------------------------
// Global state set by the root command
// ---------------------------------------------------------------------------

export type OutputFormat = 'table' | 'json' | 'tsv'

let _outputFormat: OutputFormat = 'table'
let _fields: string[] | null = null

export function setOutputFormat(fmt: OutputFormat) {
  _outputFormat = fmt
}
export function getOutputFormat(): OutputFormat {
  return _outputFormat
}
/** Convenience: --json flag sets format to 'json' */
export function setJsonMode(on: boolean) {
  if (on) _outputFormat = 'json'
}
/** Returns true for json and tsv (both are machine-readable, suppress spinners/diagnostics) */
export function isJsonMode(): boolean {
  return _outputFormat !== 'table'
}
export function setFields(f: string[] | null) {
  _fields = f
}
export function getFields(): string[] | null {
  return _fields
}

// ---------------------------------------------------------------------------
// Field filtering
// ---------------------------------------------------------------------------

export function filterFields(obj: any): any {
  if (!_fields || !_fields.length) return obj

  if (Array.isArray(obj)) {
    return obj.map((item) => filterFields(item))
  }

  if (obj && typeof obj === 'object') {
    const filtered: Record<string, unknown> = {}
    for (const f of _fields) {
      if (f in obj) filtered[f] = obj[f]
    }
    return filtered
  }

  return obj
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

export function outputJson(data: unknown) {
  const filtered = filterFields(data)
  process.stdout.write(
    JSON.stringify(filtered, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) + '\n',
  )
}

function classifyError(message: string, error?: unknown): string {
  // Prefer error object's own code (e.g. SunKitError.code)
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as any).code === 'string'
  ) {
    return (error as any).code
  }
  const msg = (message + ' ' + (error instanceof Error ? error.message : '')).toLowerCase()
  if (msg.includes('wallet') || msg.includes('private key') || msg.includes('mnemonic'))
    return 'WALLET_NOT_CONFIGURED'
  if (msg.includes('invalid') || msg.includes('must be') || msg.includes('required'))
    return 'INVALID_PARAMS'
  if (msg.includes('broadcast') || msg.includes('transaction failed')) return 'TX_FAILED'
  if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('fetch failed'))
    return 'NETWORK_ERROR'
  if (msg.includes('not found') || msg.includes('not exist') || msg.includes('no route'))
    return 'NOT_FOUND'
  return 'UNKNOWN_ERROR'
}

export function outputError(message: string, error?: unknown) {
  if (isJsonMode()) {
    const payload: Record<string, unknown> = { error: message, code: classifyError(message, error) }
    if (error instanceof Error && error.message !== message) {
      payload.detail = error.message
    }
    process.stdout.write(JSON.stringify(payload) + '\n')
  } else {
    process.stderr.write(chalk.red(`Error: ${message}`) + '\n')
    if (error instanceof Error && error.message !== message) {
      process.stderr.write(chalk.gray(error.message) + '\n')
    }
  }
  process.exitCode = 1
}

// ---------------------------------------------------------------------------
// Diagnostic messages (stderr only, never in JSON output)
// ---------------------------------------------------------------------------

export function info(msg: string) {
  if (!isJsonMode()) {
    process.stderr.write(chalk.cyan(msg) + '\n')
  }
}

export function success(msg: string) {
  if (!isJsonMode()) {
    process.stderr.write(chalk.green('✓ ' + msg) + '\n')
  }
}

export function warn(msg: string) {
  process.stderr.write(chalk.yellow('⚠ ' + msg) + '\n')
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

export function outputTsv(headers: string[], rows: string[][]) {
  process.stdout.write(headers.join('\t') + '\n')
  for (const row of rows) {
    process.stdout.write(row.join('\t') + '\n')
  }
}

export function printTable(headers: string[], rows: string[][]) {
  if (isJsonMode()) return

  const table = new Table({
    head: headers.map((h) => chalk.bold.white(h)),
    style: { head: [], border: ['gray'] },
    wordWrap: true,
  })

  for (const row of rows) {
    table.push(row)
  }

  console.log(table.toString())
}

// ---------------------------------------------------------------------------
// Universal output: picks JSON or table based on mode
// ---------------------------------------------------------------------------

/**
 * Extracts the displayable list from API responses.
 * Handles common wrapper patterns: { list: [...] }, { rows: [...] }, { data: [...] }
 */
export function extractList(data: any): any[] | null {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    if (Array.isArray(data.list)) return data.list
    if (Array.isArray(data.rows)) return data.rows
    if (Array.isArray(data.data)) return data.data
    if (Array.isArray(data.tokens)) return data.tokens
    if (Array.isArray(data.pools)) return data.pools
    if (Array.isArray(data.swaps)) return data.swaps
    if (Array.isArray(data.holders)) return data.holders
    if (Array.isArray(data.klines)) return data.klines
    if (Array.isArray(data.items)) return data.items
    if (Array.isArray(data.campaigns)) return data.campaigns
    if (Array.isArray(data.banners)) return data.banners
  }
  return null
}

export function output(
  data: unknown,
  tableConfig?: {
    headers: string[]
    toRow: (item: any) => string[]
  },
) {
  if (_outputFormat === 'json') {
    outputJson(data)
    return
  }

  if (_outputFormat === 'tsv') {
    if (tableConfig) {
      const items = extractList(data) || (Array.isArray(data) ? data : [data])
      outputTsv(tableConfig.headers, items.map(tableConfig.toRow))
    } else if (typeof data === 'object' && data !== null) {
      // For objects without tableConfig, output as key\tvalue rows
      const obj = filterFields(data) as Record<string, unknown>
      for (const [key, value] of Object.entries(obj)) {
        process.stdout.write(`${key}\t${value}\n`)
      }
    } else {
      process.stdout.write(String(data) + '\n')
    }
    return
  }

  // table mode
  if (!tableConfig) {
    if (typeof data === 'object' && data !== null) {
      outputJson(data)
    } else {
      console.log(data)
    }
    return
  }

  const items = extractList(data) || (Array.isArray(data) ? data : [data])
  if (items.length === 0) {
    console.log(chalk.gray('No results.'))
    return
  }

  printTable(tableConfig.headers, items.map(tableConfig.toRow))
}

// ---------------------------------------------------------------------------
// Pagination footer (printed below tables in human mode)
// ---------------------------------------------------------------------------

export function printPaginationFooter(p: {
  total?: number
  pageNo?: number
  pageSize?: number
  offset?: string
}) {
  if (isJsonMode()) return
  const parts: string[] = []
  if (p.pageNo !== undefined) parts.push(`Page ${p.pageNo}`)
  if (p.pageSize !== undefined) parts.push(`Size ${p.pageSize}`)
  if (p.total !== undefined) parts.push(`Total ${p.total}`)
  if (p.offset) parts.push(`Next: ${p.offset}`)
  if (parts.length) {
    process.stderr.write(chalk.gray(`(${parts.join('  ')})`) + '\n')
  }
}

// ---------------------------------------------------------------------------
// Value formatters used by toRow / printKeyValue
// ---------------------------------------------------------------------------

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatUsd(value: unknown, fallback = '-'): string {
  const n = toFiniteNumber(value)
  if (n === null) return fallback
  if (Math.abs(n) >= 1) {
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function formatPct(value: unknown, fallback = '-'): string {
  const n = toFiniteNumber(value)
  if (n === null) return fallback
  // Heuristic: APR returned as decimal fraction (<= 1) is multiplied by 100,
  // values already in percent units pass through.
  const pct = Math.abs(n) <= 1 ? n * 100 : n
  return pct.toFixed(2) + '%'
}

export function formatAmount(value: unknown, decimals = 0, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback
  let raw: bigint
  try {
    raw = typeof value === 'bigint' ? value : BigInt(String(value).split('.')[0])
  } catch {
    return String(value)
  }
  if (decimals <= 0) return raw.toString()
  const negative = raw < 0n
  const abs = negative ? -raw : raw
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = abs % base
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  const wholeStr = whole.toLocaleString('en-US')
  const out = fracStr ? `${wholeStr}.${fracStr}` : wholeStr
  return negative ? `-${out}` : out
}

export function formatTime(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value
  const n = toFiniteNumber(value)
  if (n === null) {
    return typeof value === 'string' ? value : fallback
  }
  // Distinguish second vs millisecond timestamps: anything before year 2286 in
  // seconds is < 1e10, anything after that we treat as already in ms.
  const ms = n < 1e12 ? n * 1000 : n
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

// ---------------------------------------------------------------------------
// Spinner for long operations
// ---------------------------------------------------------------------------

export async function withSpinner<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (isJsonMode()) return fn()

  const ora = (await import('ora')).default
  const spinner = ora(label).start()
  try {
    const result = await fn()
    spinner.succeed()
    return result
  } catch (err) {
    spinner.fail()
    throw err
  }
}

// ---------------------------------------------------------------------------
// Key-value display (for single-item details)
// ---------------------------------------------------------------------------

export function printKeyValue(pairs: Record<string, unknown>) {
  if (_outputFormat === 'json') {
    outputJson(pairs)
    return
  }

  if (_outputFormat === 'tsv') {
    const filtered = filterFields(pairs) as Record<string, unknown>
    for (const [key, value] of Object.entries(filtered)) {
      process.stdout.write(`${key}\t${value}\n`)
    }
    return
  }

  const maxKey = Math.max(...Object.keys(pairs).map((k) => k.length))
  for (const [key, value] of Object.entries(pairs)) {
    const label = chalk.bold(key.padEnd(maxKey))
    console.log(`  ${label}  ${value}`)
  }
}
