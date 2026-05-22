/**
 * SunPump API client — read-only GET endpoints.
 *
 * - Mainnet: https://api-v2.sunpump.meme/pump-api
 * - Nile testnet: https://tn-api.sunpump.meme/pump-api
 *
 * Standalone from sun-kit's SunAPI: SunPump is a separate service with its own
 * base URL and schema. Uses Node's global fetch (>=18).
 *
 * Methods mirror the OpenAPI operationIds documented in docs/sunpump-api.md.
 */

export const SUNPUMP_MAINNET_BASE_URL = 'https://api-v2.sunpump.meme/pump-api'
export const SUNPUMP_NILE_BASE_URL = 'https://tn-api.sunpump.meme/pump-api'
export const SUNPUMP_DEFAULT_BASE_URL = SUNPUMP_MAINNET_BASE_URL

export type SunPumpNetwork = 'mainnet' | 'nile'

export function sunPumpBaseUrlFor(network: SunPumpNetwork): string {
  return network === 'nile' ? SUNPUMP_NILE_BASE_URL : SUNPUMP_MAINNET_BASE_URL
}

export interface SunPumpClientOptions {
  baseUrl?: string
  network?: SunPumpNetwork
  fetchImpl?: typeof fetch
}

type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue>

export class SunPumpHttpError extends Error {
  readonly code = 'SUNPUMP_HTTP_ERROR'
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message)
    this.name = 'SunPumpHttpError'
  }
}

function buildQueryString(query?: Query): string {
  if (!query) return ''
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    usp.append(key, String(value))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export class SunPump {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: SunPumpClientOptions = {}) {
    const base =
      opts.baseUrl ??
      (opts.network ? sunPumpBaseUrlFor(opts.network) : undefined) ??
      process.env.SUNPUMP_API_BASE_URL ??
      SUNPUMP_DEFAULT_BASE_URL
    this.baseUrl = base.replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async request<T = unknown>(path: string, query?: Query): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQueryString(query)}`
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) {
      const excerpt = text.length > 500 ? text.slice(0, 500) + '…' : text
      let apiMsg: string | undefined
      try {
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed === 'object' && typeof parsed.msg === 'string') {
          apiMsg = parsed.msg
        }
      } catch {
        // body not JSON; fall through
      }
      const suffix = apiMsg ? ` — ${apiMsg}` : ''
      throw new SunPumpHttpError(
        `SunPump request failed: ${res.status} ${res.statusText} (${path})${suffix}`,
        res.status,
        excerpt,
      )
    }
    if (!text) return undefined as unknown as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new SunPumpHttpError(`SunPump returned non-JSON body (${path})`, res.status, text)
    }
  }

  // ---------------------------------------------------------------------------
  // Token Info
  // ---------------------------------------------------------------------------

  listTokens(
    query: {
      contractAddress?: string
      ownerAddress?: string
      symbol?: string
      name?: string
      description?: string
      page?: number
      size?: number
      sort?: string
    } = {},
  ) {
    return this.request('/token', query)
  }

  getToken(contractAddress: string) {
    return this.request(`/token/${encodeURIComponent(contractAddress)}`)
  }

  searchTokens(query: {
    query?: string
    onSunSwap?: boolean
    page?: number
    size?: number
    sort?: string
  }) {
    return this.request('/token/search', query)
  }

  searchTokensV2(query: {
    query?: string
    onSunSwap?: boolean
    filterDliveShowing?: boolean
    filterAiHelper?: boolean
    filterTwitterLaunch?: boolean
    filterSunAgentLaunch?: boolean
    page?: number
    size?: number
    sort?: string
  }) {
    return this.request('/token/searchV2', query)
  }

  tokensByOwner(query: { address: string; page?: number; size?: number; sort?: string }) {
    return this.request('/token/search/by_owner', query)
  }

  tokenHolders(query: {
    address: string
    includeZeroBalance?: boolean
    page?: number
    size?: number
    sort?: string
  }) {
    return this.request('/token/holders', query)
  }

  tokenHoldersV2(query: {
    address: string
    includeZeroBalance?: boolean
    page?: number
    size?: number
    sort?: string
  }) {
    return this.request('/token/holdersV2', query)
  }

  userFavors(query: {
    signature: string
    signedMessage: string
    userAddress: string
    tokenAddress?: string
    page?: number
    size?: number
  }) {
    return this.request('/token/getUserFavors', query)
  }

  ranking(query: { rankingType: string; size?: number }) {
    return this.request('/token/getRanking', query)
  }

  kingOfHill() {
    return this.request('/token/getKingOfHill')
  }

  pumpTokenList() {
    return this.request('/token/SunPumpTokenList.json')
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  tokenTransactions(
    contractAddress: string,
    query: {
      swapTranType?: string
      swapPoolAddress?: string
      txHash?: string
      blockNum?: number
      startTime?: number
      endTime?: number
      page?: number
      size?: number
      sort?: string
    } = {},
  ) {
    return this.request(`/transactions/token/${encodeURIComponent(contractAddress)}`, query)
  }

  userTransactions(
    ownerAddress: string,
    query: {
      swapTranType?: string
      swapPoolAddress?: string
      txHash?: string
      blockNum?: number
      startTime?: number
      endTime?: number
      page?: number
      size?: number
      sort?: string
    } = {},
  ) {
    return this.request(`/transactions/holder/${encodeURIComponent(ownerAddress)}`, query)
  }

  // ---------------------------------------------------------------------------
  // Holder portfolio
  // ---------------------------------------------------------------------------

  portfolio(
    address: string,
    query: {
      includeZeroBalance?: boolean
      trxAmountMin?: number
      page?: number
      size?: number
      sort?: string
    } = {},
  ) {
    return this.request(`/holders/${encodeURIComponent(address)}/tokens`, query)
  }

  // ---------------------------------------------------------------------------
  // Referral
  // ---------------------------------------------------------------------------

  referralRewards(query: {
    signature: string
    signedMessage: string
    userAddress: string
    pageNo?: number
    pageSize?: number
  }) {
    return this.request('/referral/getRewardsPaid', query)
  }

  referralInvites(query: {
    signature: string
    signedMessage: string
    userAddress: string
    startDate?: string
    endDate?: string
    pageNo?: number
    pageSize?: number
  }) {
    return this.request('/referral/getInviteDetails', query)
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  adminSummary(query: { password: string; startTimeStr: string; endTimeStr?: string }) {
    return this.request('/data/summaryLaunchedTokenInfo', query)
  }

  // ---------------------------------------------------------------------------
  // Third-platform open API
  // ---------------------------------------------------------------------------

  thirdPlatQuota(query: { thirdPlatUserAddress: string; message: string; signature: string }) {
    return this.request('/open-api/internal/token/queryConfig', query)
  }
}

const _clients = new Map<SunPumpNetwork, SunPump>()

export function getSunPump(network: SunPumpNetwork = 'mainnet'): SunPump {
  let c = _clients.get(network)
  if (!c) {
    c = new SunPump({ network })
    _clients.set(network, c)
  }
  return c
}
