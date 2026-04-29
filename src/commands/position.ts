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
          toRow: (item: any) => {
            const tickLower = item.tickLower ?? item.extraInfo?.tick_lower
            const tickUpper = item.tickUpper ?? item.extraInfo?.tick_upper
            return [
              item.poolAddress || '-',
              item.protocol || '-',
              item.token0Symbol || item.tokenSymbolList?.[0] || '-',
              item.token1Symbol || item.tokenSymbolList?.[1] || '-',
              String(
                item.liquidity ?? item.extraInfo?.position_liquidity ?? item.lpBalanceAmount ?? '-',
              ),
              tickLower !== undefined && tickUpper !== undefined
                ? `[${tickLower}, ${tickUpper}]`
                : '-',
              String(item.amount0 ?? item.token0Amount ?? item.userTokenAmountList?.[0] ?? '-'),
              String(item.amount1 ?? item.token1Amount ?? item.userTokenAmountList?.[1] ?? '-'),
              formatUsd(item.valueUsd ?? item.totalValueUsd ?? item.lpBalanceUsd),
            ]
          },
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
          headers: ['Pool', 'Tick', 'Liquidity Net', 'Price 0→1', 'Price 1→0'],
          toRow: (item: any) => [
            item.poolAddress || '-',
            String(item.tick ?? item.tickLower ?? '-'),
            String(item.liquidityNet ?? item.liquidity ?? '-'),
            item.price0 ?? '-',
            item.price1 ?? '-',
          ],
        },
      })
    })
}
