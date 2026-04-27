import { Command } from 'commander'
import { readApiAction } from '../lib/command'
import { formatUsd } from '../lib/output'

export function registerPositionCommands(program: Command) {
  const position = program.command('position').description('Liquidity position queries')

  position
    .command('list')
    .description('Get user liquidity positions')
    .option('--owner <address>', 'Owner wallet address')
    .option('--pool <poolAddress>', 'Pool address filter')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching positions...',
        errorLabel: 'Failed to fetch positions',
        execute: (api) =>
          api.getUserPositions({
            userAddress: opts.owner,
            poolAddress: opts.pool,
            protocol: opts.protocol,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
          }),
        tableConfig: {
          headers: [
            'Pool',
            'Protocol',
            'Token0',
            'Token1',
            'Liquidity',
            'Range',
            'Token0 Amt',
            'Token1 Amt',
            'Value',
          ],
          toRow: (item: any) => [
            item.poolAddress || '-',
            item.protocol || '-',
            item.token0Symbol || '-',
            item.token1Symbol || '-',
            String(item.liquidity ?? '-'),
            item.tickLower !== undefined && item.tickUpper !== undefined
              ? `[${item.tickLower}, ${item.tickUpper}]`
              : '-',
            String(item.amount0 ?? item.token0Amount ?? '-'),
            String(item.amount1 ?? item.token1Amount ?? '-'),
            formatUsd(item.valueUsd ?? item.totalValueUsd),
          ],
        },
      })
    })

  position
    .command('tick <poolAddress>')
    .description('Get pool user position tick details')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .action(async (poolAddress: string, opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching position ticks...',
        errorLabel: 'Failed to fetch position ticks',
        execute: (api) =>
          api.getPoolUserPositionTick({
            poolAddress,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
          }),
        tableConfig: {
          headers: ['Owner', 'Token ID', 'Tick Lower', 'Tick Upper', 'Liquidity'],
          toRow: (item: any) => [
            item.owner || item.userAddress || '-',
            String(item.tokenId ?? '-'),
            String(item.tickLower ?? '-'),
            String(item.tickUpper ?? '-'),
            String(item.liquidity ?? '-'),
          ],
        },
      })
    })
}
