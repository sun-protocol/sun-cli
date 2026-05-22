/**
 * Command helpers — eliminate boilerplate in write/read command handlers.
 */

import type { SunKit, SunAPI } from '@bankofai/sun-kit'
import { getKit, getApi, ensureWallet } from './context'
import {
  output,
  outputError,
  withSpinner,
  isJsonMode,
  printPaginationFooter,
  printKeyValue,
} from './output'
import { confirm, printSummary } from './confirm'

// ---------------------------------------------------------------------------
// Dry-run state
// ---------------------------------------------------------------------------

let _dryRun = false

export function setDryRun(on: boolean) {
  _dryRun = on
}
export function isDryRun(): boolean {
  return _dryRun
}

function getTronscanBaseUrl(network?: string): string | null {
  switch (network) {
    case 'mainnet':
      return 'https://tronscan.org/#/transaction'
    case 'nile':
      return 'https://nile.tronscan.org/#/transaction'
    case 'shasta':
      return 'https://shasta.tronscan.org/#/transaction'
    default:
      return null
  }
}

function findTxid(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  if (typeof obj.txid === 'string') return obj.txid
  if (typeof obj.txID === 'string') return obj.txID
  for (const key of ['txResult', 'result']) {
    if (obj[key]) {
      const nested = findTxid(obj[key])
      if (nested) return nested
    }
  }
  return null
}

function attachExplorerLink<T>(
  result: T,
  fallbackNetwork?: string,
): T | (T & { tronscanUrl: string }) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result
  }

  const txid = findTxid(result)
  const network =
    typeof (result as Record<string, unknown>).network === 'string'
      ? (result as Record<string, string>).network
      : fallbackNetwork

  const baseUrl = txid ? getTronscanBaseUrl(network) : null
  if (!txid || !baseUrl) {
    return result
  }

  return {
    ...(result as Record<string, unknown>),
    tronscanUrl: `${baseUrl}/${txid}`,
  } as T & { tronscanUrl: string }
}

// ---------------------------------------------------------------------------
// SUN.IO OpenAPI envelope parsing
// ---------------------------------------------------------------------------

export interface ApiPagination {
  total?: number
  pageNo?: number
  pageSize?: number
  offset?: string
}

export class SunApiError extends Error {
  readonly code: string
  readonly apiCode: number
  constructor(message: string, apiCode: number) {
    super(message)
    this.name = 'SunApiError'
    this.code = 'API_ERROR'
    this.apiCode = apiCode
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function assertApiOk(raw: unknown): void {
  if (!isPlainObject(raw) || !('code' in raw)) return
  const code = raw.code
  if (code === undefined || code === null) return
  if (code === 0 || code === 200) return
  const message = typeof raw.message === 'string' ? raw.message : `API error: code=${code}`
  throw new SunApiError(message, Number(code))
}

function unwrapApiData(raw: unknown): unknown {
  if (isPlainObject(raw) && 'data' in raw) return raw.data
  return raw
}

function readPagination(src: unknown): ApiPagination | undefined {
  if (!isPlainObject(src)) return undefined
  const direct = readPaginationFlat(src)
  if (direct) return direct
  // Some SunPump endpoints nest pagination under `pageData` or `metadata`.
  if (isPlainObject(src.pageData)) {
    const nested = readPaginationFlat(src.pageData)
    if (nested) return nested
  }
  if (isPlainObject(src.metadata)) {
    const nested = readPaginationFlat(src.metadata)
    if (nested) return nested
  }
  return undefined
}

function readPaginationFlat(src: Record<string, unknown>): ApiPagination | undefined {
  const total = (src.total ?? src.totalCount) as number | undefined
  const pageNo = (src.pageNo ?? src.page) as number | undefined
  const pageSize = (src.pageSize ?? src.size) as number | undefined
  const offset = (src.offset ?? src.next) as string | undefined
  if (
    total === undefined &&
    pageNo === undefined &&
    pageSize === undefined &&
    offset === undefined
  ) {
    return undefined
  }
  return { total, pageNo, pageSize, offset }
}

export function parseApiResponse<T = unknown>(
  raw: unknown,
): {
  data: T
  pagination?: ApiPagination
} {
  assertApiOk(raw)
  const data = unwrapApiData(raw)
  const pagination = readPagination(data) ?? readPagination(raw)
  return { data: data as T, pagination }
}

// ---------------------------------------------------------------------------
// writeAction — for state-changing commands (swap, liquidity, contract:send)
// ---------------------------------------------------------------------------

export interface WriteActionOpts<T> {
  /** Title shown in the pre-execution summary */
  title: string
  /** Key-value pairs displayed in summary */
  summary: Record<string, unknown>
  /** Confirmation prompt text */
  confirmMsg: string
  /** Spinner label during execution */
  spinnerLabel: string
  /** The async operation that calls kit methods */
  execute: (kit: SunKit) => Promise<T>
  /** Error label prefix for outputError */
  errorLabel: string
  /** Optional post-success callback (e.g. extra human-friendly output) */
  onSuccess?: (result: T | (T & { tronscanUrl: string })) => void | Promise<void>
  /** Optional key/value pairs printed below the result in human mode */
  summarizeResult?: (result: T | (T & { tronscanUrl: string })) => Record<string, unknown> | null
}

export async function writeAction<T>(opts: WriteActionOpts<T>): Promise<void> {
  try {
    await ensureWallet()
    const kit = await getKit()
    const network =
      typeof opts.summary.Network === 'string' ? String(opts.summary.Network) : undefined

    if (_dryRun) {
      output({ dryRun: true, action: opts.title, params: opts.summary })
      return
    }

    printSummary(opts.title, opts.summary)

    const confirmed = await confirm(opts.confirmMsg)
    if (!confirmed) {
      if (!isJsonMode()) console.log('Cancelled.')
      return
    }

    const result = await withSpinner(opts.spinnerLabel, () => opts.execute(kit))
    const enrichedResult = attachExplorerLink(result, network)
    output(enrichedResult)

    if (opts.summarizeResult && !isJsonMode()) {
      const summary = opts.summarizeResult(enrichedResult)
      if (summary && Object.keys(summary).length > 0) {
        console.log()
        printKeyValue(summary)
      }
    }

    if (opts.onSuccess) {
      await opts.onSuccess(enrichedResult)
    }
  } catch (err: any) {
    outputError(opts.errorLabel, err)
  }
}

// ---------------------------------------------------------------------------
// readAction — for read commands that need SunKit (balances, contract:read)
// ---------------------------------------------------------------------------

export interface ReadActionOpts<T> {
  /** Spinner label */
  spinnerLabel: string
  /** The async operation */
  execute: (kit: SunKit) => Promise<T>
  /** Table config for human-readable output */
  tableConfig?: { headers: string[]; toRow: (item: any) => string[] }
  /** Error label prefix */
  errorLabel: string
  /** Optional transform before output */
  transform?: (result: T) => unknown
}

export async function readAction<T>(opts: ReadActionOpts<T>): Promise<void> {
  try {
    const kit = await getKit()

    const result = await withSpinner(opts.spinnerLabel, () => opts.execute(kit))
    const data = opts.transform ? opts.transform(result) : result
    output(data, opts.tableConfig)
  } catch (err: any) {
    outputError(opts.errorLabel, err)
  }
}

// ---------------------------------------------------------------------------
// readApiAction — for read commands using SunAPI only (no wallet init)
// ---------------------------------------------------------------------------

export interface ReadApiActionOpts<T> {
  /** Spinner label */
  spinnerLabel: string
  /** The async operation */
  execute: (api: SunAPI) => Promise<T>
  /** Table config for human-readable output */
  tableConfig?: { headers: string[]; toRow: (item: any) => string[] }
  /** Error label prefix */
  errorLabel: string
  /** Transform applied to the unwrapped data (post code/data parse) */
  transform?: (data: any) => unknown
  /** Set false to skip SUN.IO envelope parsing (e.g. non-OpenAPI responses) */
  parseApi?: boolean
}

export async function readApiAction<T>(opts: ReadApiActionOpts<T>): Promise<void> {
  try {
    const api = getApi()

    const raw = await withSpinner(opts.spinnerLabel, () => opts.execute(api))

    let data: unknown = raw
    let pagination: ApiPagination | undefined
    if (opts.parseApi !== false) {
      const parsed = parseApiResponse(raw)
      data = parsed.data
      pagination = parsed.pagination
    }

    const final = opts.transform ? opts.transform(data) : data
    output(final, opts.tableConfig)

    if (pagination) printPaginationFooter(pagination)
  } catch (err: any) {
    outputError(opts.errorLabel, err)
  }
}
