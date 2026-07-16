import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { readApiAction } from '../lib/command'
import { formatUsd, formatPct, formatTime } from '../lib/output'
import { tryResolveTokenAddress } from '../lib/tokens'
import { TRX_ADDRESS, WTRX_MAINNET, WTRX_NILE } from '../lib/sdk/constants'

function resolveTokenForPoolQuery(input: string | undefined, network: string): string | undefined {
  if (!input) return undefined

  const resolved = tryResolveTokenAddress(input, network)
  if (!resolved) return input

  if (resolved === TRX_ADDRESS) {
    return network === 'nile' ? WTRX_NILE : WTRX_MAINNET
  }
  return resolved
}

export function registerPoolCommands(program: Command) {
  const pool = program.command('pool').description('Pool operations and analytics')

  pool
    .command('list')
    .description('Fetch pools')
    .option('--address <poolAddress>', 'Pool contract address')
    .option('--token <tokenOrAddress>', 'Filter by token (symbol like TRX/USDT or address)')
    .option('--protocol <protocol>', 'Protocol filter (V2, V3)')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .option('--sort <field>', 'Sort field')
    .option('--no-blacklist', 'Include blacklisted')
    .action(async (opts) => {
      const network = getNetwork()
      const tokenAddress = resolveTokenForPoolQuery(opts.token, network)

      await readApiAction({
        spinnerLabel: 'Fetching pools...',
        errorLabel: 'Failed to fetch pools',
        execute: (api) =>
          api.getPools({
            poolAddress: opts.address,
            tokenAddress,
            protocol: opts.protocol,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
            sort: opts.sort,
            filterBlackList: opts.blacklist !== false ? undefined : false,
          }),
        tableConfig: {
          headers: ['Pool', 'Token0', 'Token1', 'Protocol', 'TVL', 'APR', 'Vol 24h'],
          toRow: (item: any) => [
            item.poolAddress || item.address || '-',
            item.tokenSymbolList?.[0] || item.token0Symbol || '-',
            item.tokenSymbolList?.[1] || item.token1Symbol || '-',
            item.protocol || '-',
            formatUsd(item.reserveUsd ?? item.tvl),
            formatPct(item.totalApr ?? item.apr ?? item.apy),
            formatUsd(item.volume24h ?? item.vol24h ?? item.volumeUsd1d),
          ],
        },
      })
    })

  pool
    .command('search <keyword>')
    .description('Search for pools')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .action(async (keyword: string, opts) => {
      await readApiAction({
        spinnerLabel: `Searching pools for "${keyword}"...`,
        errorLabel: 'Failed to search pools',
        execute: (api) =>
          api.searchPools({
            query: keyword,
            protocol: opts.protocol,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
          }),
        tableConfig: {
          headers: ['Pool', 'Token0', 'Token1', 'Protocol', 'TVL', 'APR'],
          toRow: (item: any) => [
            item.poolAddress || '-',
            item.tokenSymbolList?.[0] || item.token0Symbol || '-',
            item.tokenSymbolList?.[1] || item.token1Symbol || '-',
            item.protocol || '-',
            formatUsd(item.reserveUsd ?? item.tvl),
            formatPct(item.totalApr ?? item.apr ?? item.apy),
          ],
        },
      })
    })

  pool
    .command('top-apy')
    .description('List pools with the highest APY')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching top APY pools...',
        errorLabel: 'Failed to fetch top APY pools',
        execute: (api) =>
          api.getTopApyPoolList({
            protocol: opts.protocol,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
          }),
        tableConfig: {
          headers: ['Pool', 'Token0', 'Token1', 'APR', 'TVL'],
          toRow: (item: any) => [
            item.poolAddress || '-',
            item.tokenSymbolList?.[0] || item.token0Symbol || '-',
            item.tokenSymbolList?.[1] || item.token1Symbol || '-',
            formatPct(item.totalApr ?? item.apr ?? item.apy),
            formatUsd(item.reserveUsd ?? item.tvl),
          ],
        },
      })
    })

  pool
    .command('hooks')
    .description('Get pool hooks')
    .action(async () => {
      await readApiAction({
        spinnerLabel: 'Fetching pool hooks...',
        errorLabel: 'Failed to fetch pool hooks',
        execute: (api) => api.getPoolHooks(),
        tableConfig: {
          headers: ['Address', 'Name', 'Docs'],
          toRow: (item: any) => [
            item.address || item.hookAddress || item.hooksAddress || '-',
            item.name || item.hooksName || '-',
            item.description || item.desc || item.hooksDocUrlEn || '-',
          ],
        },
      })
    })

  pool
    .command('vol-history <poolAddress>')
    .description('Get pool volume history')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (poolAddress: string, opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching pool volume history...',
        errorLabel: 'Failed to fetch pool volume history',
        execute: (api) =>
          api.getPoolVolHistory({
            poolAddress,
            startDate: opts.start,
            endDate: opts.end,
          }),
        tableConfig: {
          headers: ['Date', 'Volume USD', 'Fees USD', 'Tx Count'],
          toRow: (item: any) => [
            item.date || formatTime(item.timestamp ?? item.time),
            formatUsd(item.volumeUsd ?? item.volUsd ?? item.totalVolumeUsd),
            formatUsd(item.feeUsd ?? item.totalFeeUsd),
            String(item.transactions ?? item.totalTransactions ?? '-'),
          ],
        },
      })
    })

  pool
    .command('liq-history <poolAddress>')
    .description('Get pool liquidity history')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (poolAddress: string, opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching pool liquidity history...',
        errorLabel: 'Failed to fetch pool liquidity history',
        execute: (api) =>
          api.getPoolLiqHistory({
            poolAddress,
            startDate: opts.start,
            endDate: opts.end,
          }),
        tableConfig: {
          headers: ['Date', 'Liquidity USD'],
          toRow: (item: any) => [
            item.date || formatTime(item.timestamp ?? item.time),
            formatUsd(item.liquidityUsd ?? item.liqUsd ?? item.reserveUsd ?? item.value),
          ],
        },
      })
    })
}
