import { Command } from 'commander'
import { readApiAction } from '../lib/command'
import { formatUsd, formatPct, formatTime } from '../lib/output'

export function registerFarmCommands(program: Command) {
  const farm = program.command('farm').description('Farming pools and positions')

  farm
    .command('list')
    .description('List farming pools')
    .option('--farm <farmAddress>', 'Farm address filter')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching farms...',
        errorLabel: 'Failed to fetch farms',
        execute: (api) =>
          api.getFarms({
            farmAddress: opts.farm,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
          }),
        tableConfig: {
          headers: ['Farm', 'Name', 'Type', 'Stake Token', 'Reward Token', 'APY', 'TVL'],
          toRow: (item: any) => [
            item.farmAddress || item.address || '-',
            item.farmName || '-',
            item.farmType || '-',
            item.stakeTokenSymbol || item.token0Symbol || '-',
            item.rewardTokenSymbol || item.rewardSymbol || '-',
            formatPct(item.apy ?? item.apr),
            formatUsd(item.totalLockedUsd ?? item.tvl ?? item.tvlUsd),
          ],
        },
      })
    })

  farm
    .command('tx')
    .description('Farm transaction history')
    .option('--owner <address>', 'Owner address')
    .option('--farm <farmAddress>', 'Farm address')
    .option('--type <farmTxType>', 'Transaction type')
    .option('--start <time>', 'Start time')
    .option('--end <time>', 'End time')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching farm transactions...',
        errorLabel: 'Failed to fetch farm transactions',
        execute: (api) =>
          api.getFarmTransactions({
            userAddress: opts.owner,
            farmAddress: opts.farm,
            farmTxType: opts.type,
            startTime: opts.start,
            endTime: opts.end,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
          }),
        tableConfig: {
          headers: ['Time', 'Type', 'Farm', 'Owner', 'Amount', 'TxID'],
          toRow: (item: any) => [
            formatTime(item.timestamp ?? item.time ?? item.swapTime),
            item.type || item.farmTxType || '-',
            item.farmAddress || '-',
            item.userAddress || item.owner || '-',
            String(item.amount ?? item.tokenAmount ?? '-'),
            (item.txId || item.transactionId || '-').toString().slice(0, 16) + '...',
          ],
        },
      })
    })

  farm
    .command('positions')
    .description('User farming positions')
    .option('--owner <address>', 'Owner address')
    .option('--farm <farmAddress>', 'Farm address')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching farm positions...',
        errorLabel: 'Failed to fetch farm positions',
        execute: (api) =>
          api.getFarmPositions({
            userAddress: opts.owner,
            farmAddress: opts.farm,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
          }),
        tableConfig: {
          headers: [
            'Farm',
            'Owner',
            'Staked',
            'Pending Reward',
            'Reward Symbol',
            'Subpool Pending Reward',
            'Value',
          ],
          toRow: (item: any) => {
            const pending =
              item.pendingReward ??
              item.rewardAmount ??
              item.pendingRewardAmount ??
              item.rewardBalance
            const rewardSymbol = item.rewardTokenSymbol || item.rewardSymbol || ''
            const subpoolAmount = item.subpoolRewardBalance ?? item.subpoolPendingReward
            const subpoolSymbol = item.subpoolRewardTokenSymbol || ''
            return [
              item.farmAddress || '-',
              item.userAddress || item.owner || '-',
              String(
                item.stakedAmount ?? item.staked ?? item.stakeAmount ?? item.positionBalance ?? '-',
              ),
              pending !== undefined ? `${pending}${rewardSymbol ? ` ${rewardSymbol}` : ''}` : '-',
              rewardSymbol || '-',
              subpoolAmount !== undefined
                ? `${subpoolAmount}${subpoolSymbol ? ` ${subpoolSymbol}` : ''}`
                : '-',
              formatUsd(item.valueUsd ?? item.totalValueUsd ?? item.positionUsd),
            ]
          },
        },
      })
    })
}
