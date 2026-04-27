import { Command } from 'commander'
import { readApiAction } from '../lib/command'
import { formatUsd, formatTime } from '../lib/output'

export function registerProtocolCommands(program: Command) {
  const proto = program.command('protocol').description('Protocol metrics and history')

  proto
    .command('info')
    .description('Get protocol snapshot')
    .option('--protocol <protocol>', 'Protocol filter')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching protocol info...',
        errorLabel: 'Failed to fetch protocol info',
        execute: (api) => api.getProtocol({ protocol: opts.protocol }),
        tableConfig: {
          headers: ['Protocol', 'TVL', 'Volume 24h', 'Users', 'Pools', 'Transactions'],
          toRow: (item: any) => [
            item.protocol || item.name || '-',
            formatUsd(item.tvl ?? item.liquidityUsd ?? item.reserveUsd),
            formatUsd(item.volume24h ?? item.vol24h ?? item.volumeUsd),
            String(item.usersCount ?? item.users ?? '-'),
            String(item.poolsCount ?? item.pools ?? '-'),
            String(item.transactionsCount ?? item.txCount ?? '-'),
          ],
        },
      })
    })

  proto
    .command('vol-history')
    .description('Protocol volume history')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching volume history...',
        errorLabel: 'Failed to fetch volume history',
        execute: (api) =>
          api.getVolHistory({
            protocol: opts.protocol,
            startDate: opts.start,
            endDate: opts.end,
          }),
        tableConfig: {
          headers: ['Date', 'Volume', 'Volume USD'],
          toRow: (item: any) => [
            item.date || formatTime(item.timestamp),
            item.volume || item.vol || '-',
            formatUsd(item.volumeUsd ?? item.volUsd),
          ],
        },
      })
    })

  proto
    .command('users-history')
    .description('Protocol users count history')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching users history...',
        errorLabel: 'Failed to fetch users history',
        execute: (api) =>
          api.getUsersCountHistory({
            protocol: opts.protocol,
            startDate: opts.start,
            endDate: opts.end,
          }),
        tableConfig: {
          headers: ['Date', 'Users', 'New Users'],
          toRow: (item: any) => [
            item.date || formatTime(item.timestamp),
            String(item.usersCount ?? item.users ?? '-'),
            String(item.newUsers ?? '-'),
          ],
        },
      })
    })

  proto
    .command('tx-history')
    .description('Protocol transaction count history')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching transaction history...',
        errorLabel: 'Failed to fetch transaction history',
        execute: (api) =>
          api.getTransactionsHistory({
            protocol: opts.protocol,
            startDate: opts.start,
            endDate: opts.end,
          }),
        tableConfig: {
          headers: ['Date', 'Transactions', 'Swap', 'Add', 'Withdraw'],
          toRow: (item: any) => [
            item.date || formatTime(item.timestamp),
            String(item.transactionsCount ?? item.txCount ?? '-'),
            String(item.swapCount ?? '-'),
            String(item.addCount ?? '-'),
            String(item.withdrawCount ?? '-'),
          ],
        },
      })
    })

  proto
    .command('pools-history')
    .description('Protocol pools count history')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching pools history...',
        errorLabel: 'Failed to fetch pools history',
        execute: (api) =>
          api.getPoolsCountHistory({
            protocol: opts.protocol,
            startDate: opts.start,
            endDate: opts.end,
          }),
        tableConfig: {
          headers: ['Date', 'Pools', 'New Pools'],
          toRow: (item: any) => [
            item.date || formatTime(item.timestamp),
            String(item.poolsCount ?? item.pools ?? '-'),
            String(item.newPools ?? '-'),
          ],
        },
      })
    })

  proto
    .command('liq-history')
    .description('Protocol liquidity history')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching liquidity history...',
        errorLabel: 'Failed to fetch liquidity history',
        execute: (api) =>
          api.getLiqHistory({
            protocol: opts.protocol,
            startDate: opts.start,
            endDate: opts.end,
          }),
        tableConfig: {
          headers: ['Date', 'Liquidity', 'Liquidity USD'],
          toRow: (item: any) => [
            item.date || formatTime(item.timestamp),
            item.liquidity || item.liq || '-',
            formatUsd(item.liquidityUsd ?? item.liqUsd ?? item.reserveUsd),
          ],
        },
      })
    })
}
