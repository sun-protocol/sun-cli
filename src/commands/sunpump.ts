import { Command } from 'commander'
import { parseApiResponse, writeAction } from '../lib/command'
import { getNetwork, getKit } from '../lib/context'
import {
  output,
  outputError,
  withSpinner,
  printPaginationFooter,
  printKeyValue,
  isJsonMode,
  formatUsd,
  formatTime,
  formatAmount,
  formatPct,
} from '../lib/output'
import { getSunPump, SunPump, SunPumpNetwork } from '../lib/sunpump'

// ---------------------------------------------------------------------------
// pumpAction — local mirror of readApiAction but for the SunPump client.
// SunPump responses follow the same {code,msg,data} envelope so we reuse
// parseApiResponse from lib/command.ts.
// ---------------------------------------------------------------------------

interface PumpActionOpts<T> {
  spinnerLabel: string
  errorLabel: string
  execute: (client: SunPump) => Promise<T>
  tableConfig?: { headers: string[]; toRow: (item: any) => string[] }
  transform?: (data: any) => unknown
  parseEnvelope?: boolean
  detailFor?: (data: any) => Record<string, unknown> | null
}

let currentNetwork: SunPumpNetwork = 'mainnet'

async function pumpAction<T>(opts: PumpActionOpts<T>): Promise<void> {
  try {
    const client = getSunPump(currentNetwork)
    const raw = await withSpinner(opts.spinnerLabel, () => opts.execute(client))

    let data: unknown = raw
    let pagination
    if (opts.parseEnvelope !== false) {
      const parsed = parseApiResponse(raw)
      data = parsed.data
      pagination = parsed.pagination
    }
    const final = opts.transform ? opts.transform(data) : data
    if (opts.detailFor && !isJsonMode()) {
      const pairs = opts.detailFor(final)
      if (pairs) {
        printKeyValue(pairs)
        if (pagination) printPaginationFooter(pagination)
        return
      }
    }
    output(final, opts.tableConfig)
    if (pagination) printPaginationFooter(pagination)
  } catch (err: any) {
    outputError(opts.errorLabel, err)
  }
}

function toIntOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

// ---------------------------------------------------------------------------
// Shared table configs
// ---------------------------------------------------------------------------

function tokenPriceUsd(t: any): unknown {
  const usd = t.priceInUsd ?? t.tokenPriceUsd ?? t.price
  if (usd !== undefined && usd !== null && usd !== '') return usd
  const trxPrice = Number(t.priceInTrx)
  const trxUsdRaw = t.trxPriceInUsd
  if (
    Number.isFinite(trxPrice) &&
    trxUsdRaw !== null &&
    trxUsdRaw !== undefined &&
    trxUsdRaw !== ''
  ) {
    const trxUsd = Number(trxUsdRaw)
    if (Number.isFinite(trxUsd) && trxUsd > 0) return trxPrice * trxUsd
  }
  const mcap = Number(t.marketCap ?? t.marketCapUsd)
  const supply = Number(t.totalSupply)
  if (Number.isFinite(mcap) && mcap > 0 && Number.isFinite(supply) && supply > 0) {
    return mcap / supply
  }
  return undefined
}

const tokenTable = {
  headers: ['Symbol', 'Name', 'Address', 'Price', 'MCap', 'Volume24h'],
  toRow: (t: any) => [
    t.symbol ?? '-',
    t.name ?? '-',
    t.contractAddress ?? t.tokenAddress ?? '-',
    formatUsd(tokenPriceUsd(t)),
    formatUsd(t.marketCap ?? t.mcap ?? t.marketCapUsd),
    formatUsd(t.volume24Hr ?? t.volume24h ?? t.volumeUsd1d),
  ],
}

const holderTable = {
  headers: ['Holder', 'Type', 'Balance', 'Percent'],
  toRow: (h: any) => {
    const pctRaw = h.percent ?? h.percentage
    let pct: string = '-'
    if (pctRaw !== undefined && pctRaw !== null && pctRaw !== '') {
      const n = Number(pctRaw)
      if (Number.isFinite(n)) {
        // API returns percentage values both as fractions (token list endpoint, e.g. 1.95e-6 = 0.000195%)
        // and as percent units (holders endpoint, e.g. 38.51 = 38.51%). Use magnitude heuristic.
        const asPct = Math.abs(n) <= 1 ? n * 100 : n
        pct = `${asPct.toFixed(4)}%`
      }
    }
    return [
      h.holderAddress ?? h.address ?? h.userAddress ?? '-',
      h.holderType ?? '-',
      h.decimals ? formatAmount(h.amount ?? h.balance, h.decimals) : fmtNum(h.balance ?? h.amount, 2),
      pct,
    ]
  },
}

const txTable = {
  headers: ['Time', 'Type', 'From → To', 'Volume', 'TxHash'],
  toRow: (tx: any) => {
    const fromSym = tx.fromTokenSymbol ?? tx.fromSymbol ?? tx.fromTokenAddress ?? '?'
    const toSym = tx.toTokenSymbol ?? tx.toSymbol ?? tx.toTokenAddress ?? '?'
    return [
      formatTime(tx.txDateTime ?? tx.swapTime ?? tx.timestamp ?? tx.createdAt),
      tx.swapTranType ?? tx.txnOrderType ?? tx.type ?? '-',
      `${fromSym} → ${toSym}`,
      formatUsd(tx.volumeInUsd ?? tx.amountUsd),
      tx.txHash ?? tx.transactionHash ?? tx.txnHash ?? '-',
    ]
  },
}

function tokenDetail(t: any): Record<string, unknown> | null {
  if (!t || typeof t !== 'object') return null
  const pairs: Record<string, unknown> = {}
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') pairs[k] = v
  }
  set('Symbol', t.symbol)
  set('Name', t.name)
  set('Description', t.description)
  const statusBits: string[] = []
  if (t.status) statusBits.push(String(t.status))
  if (t.active === true) statusBits.push('active')
  if (t.pumpPercentage !== undefined && t.pumpPercentage !== null) {
    statusBits.push(`pump ${Number(t.pumpPercentage).toFixed(2)}%`)
  }
  if (statusBits.length) set('Status', statusBits.join(' · '))
  set('Contract', t.contractAddress)
  set('Owner', t.ownerAddress)
  set('Swap Pool', t.swapPoolAddress)
  set('Price (USD)', formatUsd(tokenPriceUsd(t)))
  set('Price (TRX)', fmtNum(t.priceInTrx, 8))
  if (t.priceChange24Hr !== undefined && t.priceChange24Hr !== null) {
    const n = Number(t.priceChange24Hr)
    const sign = n > 0 ? '+' : ''
    set('24h Change', `${sign}${formatPct(n)}`)
  }
  set('Market Cap', formatUsd(t.marketCap ?? t.marketCapUsd))
  set('24h Volume', formatUsd(t.volume24Hr ?? t.volume24h ?? t.volumeUsd1d))
  if (t.holders !== undefined && t.holders !== null) set('Holders', t.holders)
  if (t.totalSupply !== undefined && t.totalSupply !== null) {
    set('Total Supply', Number(t.totalSupply).toLocaleString('en-US'))
  }
  if (t.trxPriceInUsd !== undefined && t.trxPriceInUsd !== null) {
    set('TRX/USD', formatUsd(t.trxPriceInUsd))
  }
  set('Created', formatTime(t.tokenCreatedInstant))
  set('Launched', formatTime(t.tokenLaunchedInstant))
  set('Website', t.websiteUrl)
  set('Twitter', t.twitterUrl)
  set('Telegram', t.telegramUrl)
  if (t.listOn && typeof t.listOn === 'object') {
    const cex = Object.entries(t.listOn)
      .filter(([, url]) => typeof url === 'string' && url !== '')
      .map(([name]) => name)
    if (cex.length) set('Listed On', cex.join(', '))
  }
  return pairs
}

// Decimal string (e.g. "10.5") → integer string in base units, scaled by 10^decimals.
function decimalToBaseUnits(value: string, decimals: number): string {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: "${value}"`)
  }
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [whole, frac = ''] = unsigned.split('.')
  if (frac.length > decimals) {
    throw new Error(
      `Amount "${value}" has more than ${decimals} decimal places (token precision limit).`,
    )
  }
  const paddedFrac = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const scaled = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(paddedFrac || '0')
  return (negative ? -scaled : scaled).toString()
}

const trxToSun = (trx: string) => decimalToBaseUnits(trx, 6)

// Inverse: base-unit string → human-readable decimal.
function baseUnitsToDecimal(raw: string | bigint, decimals: number): string {
  const n = typeof raw === 'bigint' ? raw : BigInt(raw)
  const negative = n < 0n
  const abs = negative ? -n : n
  const base = 10n ** BigInt(decimals)
  const whole = (abs / base).toString()
  const fracDigits = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  const out = fracDigits ? `${whole}.${fracDigits}` : whole
  return negative ? `-${out}` : out
}

// SunKit's enum lists 0/1/2 but the contract uses extra states (e.g. 3 = launched-on-DEX).
// Map what we know; surface raw values verbatim otherwise.
const SUNPUMP_STATE_NAME: Record<number, string> = {
  0: 'NOT_EXIST',
  1: 'TRADING',
  2: 'READY_TO_LAUNCH',
  3: 'LAUNCHED',
}

function sunpumpStateLabel(state: number | undefined | null): string {
  if (state === undefined || state === null) return '-'
  const name = SUNPUMP_STATE_NAME[state]
  return name ? `${name} (${state})` : `UNKNOWN (${state})`
}

function fmtNum(v: unknown, digits = 6): string {
  if (v === undefined || v === null || v === '') return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  if (n === 0) return '0'
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: digits })
  return n.toPrecision(4)
}

const portfolioTable = {
  headers: ['Symbol', 'Address', 'Balance', 'Price (TRX)', 'Value (TRX)', 'Percent'],
  toRow: (t: any) => [
    t.symbol ?? '-',
    t.address ?? t.contractAddress ?? '-',
    fmtNum(t.balance, 4),
    fmtNum(t.priceInTrx, 8),
    fmtNum(t.valueInTrx, 6),
    t.percentage !== undefined && t.percentage !== null
      ? `${(Number(t.percentage) * 100).toPrecision(4)}%`
      : '-',
  ],
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerSunpumpCommands(program: Command) {
  const sp = program
    .command('sunpump')
    .description(
      'SunPump read-only endpoints (mainnet: api-v2.sunpump.meme, nile: tn-api.sunpump.meme). Use global --network nile for testnet.',
    )
    .hook('preAction', () => {
      const n = program.opts().network ?? process.env.TRON_NETWORK
      currentNetwork = n === 'nile' ? 'nile' : 'mainnet'
    })

  // -------------------------- token group ----------------------------------
  const token = sp.command('token').description('Token info, search, holders, ranking')

  token
    .command('list')
    .description('List tokens with optional filters and pagination')
    .option('--contract <address>', 'Filter by contract address')
    .option('--owner <address>', 'Filter by owner address')
    .option('--symbol <symbol>', 'Filter by symbol')
    .option('--name <name>', 'Filter by name')
    .option('--description <text>', 'Filter by description')
    .option('--page <n>', 'Page number')
    .option('--size <n>', 'Page size')
    .option('--sort <field>', 'Sort field')
    .action(async (opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching tokens...',
        errorLabel: 'Failed to fetch tokens',
        execute: (c) =>
          c.listTokens({
            contractAddress: opts.contract,
            ownerAddress: opts.owner,
            symbol: opts.symbol,
            name: opts.name,
            description: opts.description,
            page: toIntOrUndef(opts.page),
            size: toIntOrUndef(opts.size),
            sort: opts.sort,
          }),
        tableConfig: tokenTable,
      })
    })

  token
    .command('get <contractAddress>')
    .description('Get token detail by contract address')
    .action(async (contractAddress: string) => {
      await pumpAction({
        spinnerLabel: 'Fetching token...',
        errorLabel: 'Failed to fetch token',
        execute: (c) => c.getToken(contractAddress),
        detailFor: tokenDetail,
      })
    })

  token
    .command('search <query>')
    .description('Fuzzy search tokens')
    .option('--on-sunswap', 'Only tokens listed on SunSwap', false)
    .option('--page <n>', 'Page number')
    .option('--size <n>', 'Page size')
    .option('--sort <field>', 'Sort field')
    .action(async (query: string, opts) => {
      await pumpAction({
        spinnerLabel: `Searching tokens for "${query}"...`,
        errorLabel: 'Failed to search tokens',
        execute: (c) =>
          c.searchTokens({
            query,
            onSunSwap: opts.onSunswap || undefined,
            page: toIntOrUndef(opts.page),
            size: toIntOrUndef(opts.size),
            sort: opts.sort,
          }),
        tableConfig: tokenTable,
      })
    })

  token
    .command('search-v2 <query>')
    .description('Fuzzy search tokens (v2 with extra filters)')
    .option('--on-sunswap', 'Only tokens listed on SunSwap')
    .option('--dlive', 'Filter: DLive showing')
    .option('--ai-helper', 'Filter: AI helper')
    .option('--twitter-launch', 'Filter: Twitter launch')
    .option('--sun-agent-launch', 'Filter: Sun agent launch')
    .option('--page <n>', 'Page number')
    .option('--size <n>', 'Page size')
    .option('--sort <field>', 'Sort field')
    .action(async (query: string, opts) => {
      await pumpAction({
        spinnerLabel: `Searching tokens (v2) for "${query}"...`,
        errorLabel: 'Failed to search tokens',
        execute: (c) =>
          c.searchTokensV2({
            query,
            onSunSwap: opts.onSunswap || undefined,
            filterDliveShowing: opts.dlive || undefined,
            filterAiHelper: opts.aiHelper || undefined,
            filterTwitterLaunch: opts.twitterLaunch || undefined,
            filterSunAgentLaunch: opts.sunAgentLaunch || undefined,
            page: toIntOrUndef(opts.page),
            size: toIntOrUndef(opts.size),
            sort: opts.sort,
          }),
        tableConfig: tokenTable,
      })
    })

  token
    .command('by-owner <ownerAddress>')
    .description('List tokens created by a wallet')
    .option('--page <n>', 'Page number')
    .option('--size <n>', 'Page size')
    .option('--sort <field>', 'Sort field')
    .action(async (ownerAddress: string, opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching tokens by owner...',
        errorLabel: 'Failed to fetch tokens',
        execute: (c) =>
          c.tokensByOwner({
            address: ownerAddress,
            page: toIntOrUndef(opts.page),
            size: toIntOrUndef(opts.size),
            sort: opts.sort,
          }),
        tableConfig: tokenTable,
      })
    })

  token
    .command('holders <tokenAddress>')
    .description('List holders of a token')
    .option('--include-zero', 'Include zero-balance holders')
    .option('--page <n>', 'Page number')
    .option('--size <n>', 'Page size')
    .option('--sort <field>', 'Sort field')
    .action(async (tokenAddress: string, opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching token holders...',
        errorLabel: 'Failed to fetch holders',
        execute: (c) =>
          c.tokenHolders({
            address: tokenAddress,
            includeZeroBalance: opts.includeZero || undefined,
            page: toIntOrUndef(opts.page),
            size: toIntOrUndef(opts.size),
            sort: opts.sort,
          }),
        tableConfig: holderTable,
      })
    })

  token
    .command('holders-v2 <tokenAddress>')
    .description('List holders of a token (v2)')
    .option('--include-zero', 'Include zero-balance holders')
    .option('--page <n>', 'Page number')
    .option('--size <n>', 'Page size')
    .option('--sort <field>', 'Sort field')
    .action(async (tokenAddress: string, opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching token holders (v2)...',
        errorLabel: 'Failed to fetch holders',
        execute: (c) =>
          c.tokenHoldersV2({
            address: tokenAddress,
            includeZeroBalance: opts.includeZero || undefined,
            page: toIntOrUndef(opts.page),
            size: toIntOrUndef(opts.size),
            sort: opts.sort,
          }),
        tableConfig: holderTable,
      })
    })

  token
    .command('favors')
    .description("List a user's favorite tokens (requires signed message)")
    .requiredOption('--user-address <address>', 'User wallet address')
    .requiredOption('--signature <sig>', 'Signature of signed-message')
    .requiredOption('--signed-message <msg>', 'Signed message')
    .option('--token-address <address>', 'Filter by token address')
    .option('--page <n>', 'Page number')
    .option('--size <n>', 'Page size')
    .action(async (opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching user favors...',
        errorLabel: 'Failed to fetch favors',
        execute: (c) =>
          c.userFavors({
            userAddress: opts.userAddress,
            signature: opts.signature,
            signedMessage: opts.signedMessage,
            tokenAddress: opts.tokenAddress,
            page: toIntOrUndef(opts.page),
            size: toIntOrUndef(opts.size),
          }),
        tableConfig: tokenTable,
      })
    })

  token
    .command('ranking')
    .description('Token ranking by type')
    .requiredOption(
      '--type <rankingType>',
      'Ranking type: MARKET_CAP | VOLUME_24H | PRICE_CHANGE_24H',
    )
    .option('--size <n>', 'Number of entries')
    .action(async (opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching ranking...',
        errorLabel: 'Failed to fetch ranking',
        execute: (c) => c.ranking({ rankingType: opts.type, size: toIntOrUndef(opts.size) }),
        tableConfig: tokenTable,
      })
    })

  token
    .command('king-of-hill')
    .description('Get the current king-of-the-hill token')
    .action(async () => {
      await pumpAction({
        spinnerLabel: 'Fetching king of hill...',
        errorLabel: 'Failed to fetch king of hill',
        execute: (c) => c.kingOfHill(),
        tableConfig: tokenTable,
      })
    })

  token
    .command('pump-list')
    .description('Get the SunPump token list (raw, no envelope)')
    .action(async () => {
      await pumpAction({
        spinnerLabel: 'Fetching pump token list...',
        errorLabel: 'Failed to fetch pump list',
        execute: (c) => c.pumpTokenList(),
        parseEnvelope: false,
      })
    })

  // -------------------------- tx group -------------------------------------
  const tx = sp.command('tx').description('Swap transactions')

  const addTxFilterOptions = (cmd: Command) =>
    cmd
      .option('--swap-type <type>', 'Swap type filter (BUY/SELL)')
      .option('--pool <address>', 'Swap pool address')
      .option('--tx-hash <hash>', 'Specific tx hash')
      .option('--block <n>', 'Block number')
      .option('--start-time <epoch>', 'Start time (epoch seconds)')
      .option('--end-time <epoch>', 'End time (epoch seconds)')
      .option('--page <n>', 'Page number')
      .option('--size <n>', 'Page size')
      .option('--sort <field>', 'Sort field')

  addTxFilterOptions(
    tx.command('token <contractAddress>').description('Transactions for a token'),
  ).action(async (contractAddress: string, opts) => {
    await pumpAction({
      spinnerLabel: 'Fetching token transactions...',
      errorLabel: 'Failed to fetch transactions',
      execute: (c) =>
        c.tokenTransactions(contractAddress, {
          swapTranType: opts.swapType,
          swapPoolAddress: opts.pool,
          txHash: opts.txHash,
          blockNum: toIntOrUndef(opts.block),
          startTime: toIntOrUndef(opts.startTime),
          endTime: toIntOrUndef(opts.endTime),
          page: toIntOrUndef(opts.page),
          size: toIntOrUndef(opts.size),
          sort: opts.sort,
        }),
      tableConfig: txTable,
    })
  })

  addTxFilterOptions(
    tx.command('user <ownerAddress>').description('Transactions for a wallet'),
  ).action(async (ownerAddress: string, opts) => {
    await pumpAction({
      spinnerLabel: 'Fetching user transactions...',
      errorLabel: 'Failed to fetch transactions',
      execute: (c) =>
        c.userTransactions(ownerAddress, {
          swapTranType: opts.swapType,
          swapPoolAddress: opts.pool,
          txHash: opts.txHash,
          blockNum: toIntOrUndef(opts.block),
          startTime: toIntOrUndef(opts.startTime),
          endTime: toIntOrUndef(opts.endTime),
          page: toIntOrUndef(opts.page),
          size: toIntOrUndef(opts.size),
          sort: opts.sort,
        }),
      tableConfig: txTable,
    })
  })

  // -------------------------- portfolio ------------------------------------
  sp.command('portfolio <walletAddress>')
    .description('Get tokens held by a wallet (with TRX value filter)')
    .option('--include-zero', 'Include zero-balance tokens')
    .option('--min-trx <amount>', 'Minimum TRX value')
    .option('--page <n>', 'Page number')
    .option('--size <n>', 'Page size')
    .option('--sort <field>', 'Sort field')
    .action(async (walletAddress: string, opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching portfolio...',
        errorLabel: 'Failed to fetch portfolio',
        execute: (c) =>
          c.portfolio(walletAddress, {
            includeZeroBalance: opts.includeZero || undefined,
            trxAmountMin: toIntOrUndef(opts.minTrx),
            page: toIntOrUndef(opts.page),
            size: toIntOrUndef(opts.size),
            sort: opts.sort,
          }),
        tableConfig: portfolioTable,
      })
    })

  // -------------------------- referral -------------------------------------
  const ref = sp.command('referral').description('Referral rewards and invite details')

  ref
    .command('rewards')
    .description('Referral rewards paid (signed)')
    .requiredOption('--user-address <address>', 'User wallet address')
    .requiredOption('--signature <sig>', 'Signature')
    .requiredOption('--signed-message <msg>', 'Signed message')
    .option('--page <n>', 'Page number')
    .option('--page-size <n>', 'Page size')
    .action(async (opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching referral rewards...',
        errorLabel: 'Failed to fetch rewards',
        execute: (c) =>
          c.referralRewards({
            userAddress: opts.userAddress,
            signature: opts.signature,
            signedMessage: opts.signedMessage,
            pageNo: toIntOrUndef(opts.page),
            pageSize: toIntOrUndef(opts.pageSize),
          }),
      })
    })

  ref
    .command('invites')
    .description('Referral invite details (signed)')
    .requiredOption('--user-address <address>', 'User wallet address')
    .requiredOption('--signature <sig>', 'Signature')
    .requiredOption('--signed-message <msg>', 'Signed message')
    .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
    .option('--end-date <date>', 'End date (YYYY-MM-DD)')
    .option('--page <n>', 'Page number')
    .option('--page-size <n>', 'Page size')
    .action(async (opts) => {
      await pumpAction({
        spinnerLabel: 'Fetching invite details...',
        errorLabel: 'Failed to fetch invites',
        execute: (c) =>
          c.referralInvites({
            userAddress: opts.userAddress,
            signature: opts.signature,
            signedMessage: opts.signedMessage,
            startDate: opts.startDate,
            endDate: opts.endDate,
            pageNo: toIntOrUndef(opts.page),
            pageSize: toIntOrUndef(opts.pageSize),
          }),
      })
    })

  // -------------------------- trade (buy/sell/quote/state) -----------------
  sp.command('state <tokenAddress>')
    .description(
      'Show SunPump token state (0 NOT_EXIST, 1 TRADING, 2 READY_TO_LAUNCH, 3 LAUNCHED)',
    )
    .action(async (tokenAddress: string) => {
      try {
        const network = getNetwork()
        const result = await withSpinner('Fetching token state...', async () => {
          const kit = await getKit()
          const state = await kit.getSunPumpTokenState(tokenAddress, network)
          const info = await kit.getSunPumpTokenInfo(tokenAddress, network).catch(() => null)
          return { state, info }
        })
        if (isJsonMode()) {
          output({ ...result, stateName: sunpumpStateLabel(result.state) })
          return
        }
        const pairs: Record<string, unknown> = {
          Token: result.info?.tokenAddress ?? tokenAddress,
          State: sunpumpStateLabel(result.state),
          Launched: result.info?.launched === true ? 'yes' : 'no',
        }
        if (result.info?.price !== undefined) pairs['Price (raw)'] = String(result.info.price)
        if (result.info?.trxReserve !== undefined) {
          pairs['TRX Reserve'] = `${baseUnitsToDecimal(result.info.trxReserve, 6)} TRX`
        }
        if (result.info?.tokenReserve !== undefined) {
          pairs['Token Reserve'] = baseUnitsToDecimal(result.info.tokenReserve, 18)
        }
        printKeyValue(pairs)
      } catch (err: any) {
        outputError('Failed to fetch state', err)
      }
    })

  sp.command('quote-buy <tokenAddress>')
    .description('Preview a SunPump buy without sending a transaction')
    .requiredOption('--trx <amount>', 'TRX to spend (decimal, e.g. 10 or 1.5)')
    .action(async (tokenAddress: string, opts) => {
      let trxSun: string
      try {
        trxSun = trxToSun(opts.trx)
      } catch (err: any) {
        outputError('Invalid --trx', err)
        return
      }
      try {
        const network = getNetwork()
        const quote: any = await withSpinner('Fetching buy quote...', async () => {
          const kit = await getKit()
          return kit.sunpumpQuoteBuy(tokenAddress, trxSun, network)
        })
        if (isJsonMode()) {
          output({ ...quote, tokenAddress, trxSun, trxIn: opts.trx })
          return
        }
        printKeyValue({
          Token: tokenAddress,
          'TRX In': `${opts.trx} TRX`,
          'Tokens Out (expected)': baseUnitsToDecimal(quote.tokenAmount, 18),
          Fee: `${baseUnitsToDecimal(quote.fee, 6)} TRX`,
        })
      } catch (err: any) {
        outputError('Failed to fetch quote', err)
      }
    })

  sp.command('quote-sell <tokenAddress>')
    .description('Preview a SunPump sell without sending a transaction')
    .requiredOption('--amount <amount>', 'Token amount to sell (decimal)')
    .option('--decimals <n>', 'Token decimals (default 18)', '18')
    .action(async (tokenAddress: string, opts) => {
      const decimals = Number(opts.decimals) || 18
      let tokenRaw: string
      try {
        tokenRaw = decimalToBaseUnits(opts.amount, decimals)
      } catch (err: any) {
        outputError('Invalid --amount', err)
        return
      }
      try {
        const network = getNetwork()
        const quote: any = await withSpinner('Fetching sell quote...', async () => {
          const kit = await getKit()
          return kit.sunpumpQuoteSell(tokenAddress, tokenRaw, network)
        })
        if (isJsonMode()) {
          output({ ...quote, tokenAddress, tokenRaw, amountIn: opts.amount })
          return
        }
        printKeyValue({
          Token: tokenAddress,
          'Tokens In': `${opts.amount}`,
          'TRX Out (expected)': `${baseUnitsToDecimal(quote.trxAmount, 6)} TRX`,
          Fee: `${baseUnitsToDecimal(quote.fee, 6)} TRX`,
        })
      } catch (err: any) {
        outputError('Failed to fetch quote', err)
      }
    })

  sp.command('buy <tokenAddress>')
    .description('Buy a SunPump token with TRX (bonding-curve, pre-launch only)')
    .requiredOption('--trx <amount>', 'TRX to spend (decimal, e.g. 10 or 1.5)')
    .option('--slippage <n>', 'Slippage tolerance (decimal, e.g. 0.05 = 5%)', '0.05')
    .option('--min-out <raw>', 'Minimum tokens out in raw base units (overrides slippage)')
    .action(async (tokenAddress: string, opts) => {
      let trxSun: string
      try {
        trxSun = trxToSun(opts.trx)
      } catch (err: any) {
        outputError('Invalid --trx', err)
        return
      }
      const slippage = parseFloat(opts.slippage)
      const network = getNetwork()

      const summary: Record<string, unknown> = {
        Token: tokenAddress,
        'TRX In': `${opts.trx} TRX (${trxSun} Sun)`,
        Slippage: `${(slippage * 100).toFixed(2)}%`,
        Network: network,
      }
      try {
        const quote = await withSpinner('Fetching buy quote...', async () => {
          const kit = await getKit()
          return kit.sunpumpQuoteBuy(tokenAddress, trxSun, network)
        })
        summary['Tokens Out (expected)'] = baseUnitsToDecimal((quote as any).tokenAmount, 18)
        summary['Fee'] = `${baseUnitsToDecimal((quote as any).fee, 6)} TRX`
      } catch {
        // Quote is best-effort; the real call below will surface the error.
      }
      if (opts.minOut) summary['Min Tokens Out (raw)'] = opts.minOut

      await writeAction({
        title: 'SunPump Buy Preview',
        summary,
        confirmMsg: 'Execute this buy?',
        spinnerLabel: 'Submitting buy...',
        errorLabel: 'Buy failed',
        execute: (kit) =>
          kit.sunpumpBuy({
            tokenAddress,
            trxAmount: trxSun,
            minTokenOut: opts.minOut,
            slippage,
            network,
          }),
        onSuccess: async (result: any) => {
          if (isJsonMode()) return
          const chalk = (await import('chalk')).default
          console.log()
          console.log(chalk.green('Buy executed'))
          if (result.expectedTokens) {
            console.log(`  Expected: ${baseUnitsToDecimal(result.expectedTokens, 18)} tokens`)
          }
          if (result.minTokenOut) {
            console.log(`  Min Out:  ${baseUnitsToDecimal(result.minTokenOut, 18)} tokens`)
          }
          if (result.txResult?.txid) {
            console.log(`  TxID:     ${chalk.bold(result.txResult.txid)}`)
          }
          if (result.tronscanUrl) {
            console.log(`  Tronscan: ${chalk.underline(result.tronscanUrl)}`)
          }
        },
      })
    })

  sp.command('sell <tokenAddress>')
    .description('Sell a SunPump token for TRX (bonding-curve, pre-launch only)')
    .requiredOption('--amount <amount>', 'Token amount to sell (decimal)')
    .option('--decimals <n>', 'Token decimals (default 18)', '18')
    .option('--slippage <n>', 'Slippage tolerance (decimal, e.g. 0.05 = 5%)', '0.05')
    .option('--min-out <raw>', 'Minimum TRX out in Sun (overrides slippage)')
    .action(async (tokenAddress: string, opts) => {
      const decimals = Number(opts.decimals) || 18
      let tokenRaw: string
      try {
        tokenRaw = decimalToBaseUnits(opts.amount, decimals)
      } catch (err: any) {
        outputError('Invalid --amount', err)
        return
      }
      const slippage = parseFloat(opts.slippage)
      const network = getNetwork()

      const summary: Record<string, unknown> = {
        Token: tokenAddress,
        'Tokens In': `${opts.amount} (${tokenRaw} raw)`,
        Slippage: `${(slippage * 100).toFixed(2)}%`,
        Network: network,
      }
      try {
        const quote = await withSpinner('Fetching sell quote...', async () => {
          const kit = await getKit()
          return kit.sunpumpQuoteSell(tokenAddress, tokenRaw, network)
        })
        summary['TRX Out (expected)'] = `${baseUnitsToDecimal((quote as any).trxAmount, 6)} TRX`
        summary['Fee'] = `${baseUnitsToDecimal((quote as any).fee, 6)} TRX`
      } catch {
        // Best-effort.
      }
      if (opts.minOut) summary['Min TRX Out (Sun)'] = opts.minOut

      await writeAction({
        title: 'SunPump Sell Preview',
        summary,
        confirmMsg: 'Execute this sell?',
        spinnerLabel: 'Submitting sell...',
        errorLabel: 'Sell failed',
        execute: (kit) =>
          kit.sunpumpSell({
            tokenAddress,
            tokenAmount: tokenRaw,
            minTrxOut: opts.minOut,
            slippage,
            network,
          }),
        onSuccess: async (result: any) => {
          if (isJsonMode()) return
          const chalk = (await import('chalk')).default
          console.log()
          console.log(chalk.green('Sell executed'))
          if (result.expectedTrx) {
            console.log(`  Expected: ${baseUnitsToDecimal(result.expectedTrx, 6)} TRX`)
          }
          if (result.minTrxOut) {
            console.log(`  Min Out:  ${baseUnitsToDecimal(result.minTrxOut, 6)} TRX`)
          }
          if (result.txResult?.txid) {
            console.log(`  TxID:     ${chalk.bold(result.txResult.txid)}`)
          }
          if (result.tronscanUrl) {
            console.log(`  Tronscan: ${chalk.underline(result.tronscanUrl)}`)
          }
        },
      })
    })

  // -------------------------- third-platform quota -------------------------
  sp.command('quota')
    .description('Query third-platform token quota (signed)')
    .requiredOption('--user-address <address>', 'Third-platform user address')
    .requiredOption('--message <msg>', 'Message that was signed')
    .requiredOption('--signature <sig>', 'Signature')
    .action(async (opts) => {
      await pumpAction({
        spinnerLabel: 'Querying quota...',
        errorLabel: 'Failed to query quota',
        execute: (c) =>
          c.thirdPlatQuota({
            thirdPlatUserAddress: opts.userAddress,
            message: opts.message,
            signature: opts.signature,
          }),
      })
    })
}
