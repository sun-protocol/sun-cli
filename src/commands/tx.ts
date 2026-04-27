import { Command } from 'commander'
import { readApiAction } from '../lib/command'
import { formatTime } from '../lib/output'

export function registerTxCommands(program: Command) {
  const tx = program.command('tx').description('Transaction history')

  tx.command('scan')
    .description('Scan DEX transactions (swap/add/withdraw)')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--token <tokenAddress>', 'Token address filter')
    .option('--pool <poolAddress>', 'Pool address filter')
    .option('--type <type>', 'Transaction type: swap, add, withdraw')
    .option('--start <time>', 'Start time (ISO or unix ms)')
    .option('--end <time>', 'End time (ISO or unix ms)')
    .option('--page-size <n>', 'Page size', '20')
    .option('--offset <offset>', 'Pagination offset')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Scanning transactions...',
        errorLabel: 'Failed to scan transactions',
        execute: (api) =>
          api.scanTransactions({
            protocol: opts.protocol,
            tokenAddress: opts.token,
            poolAddress: opts.pool,
            type: opts.type as any,
            startTime: opts.start,
            endTime: opts.end,
            pageSize: opts.pageSize ? parseInt(opts.pageSize) : undefined,
            offset: opts.offset,
          }),
        tableConfig: {
          headers: ['Time', 'Type', 'Token0', 'Token1', 'Amount0', 'Amount1', 'TxID'],
          toRow: (item: any) => [
            formatTime(item.timestamp ?? item.time),
            item.type || '-',
            item.token0Symbol || '-',
            item.token1Symbol || '-',
            String(item.amount0 ?? '-'),
            String(item.amount1 ?? '-'),
            (item.txId || item.transactionId || '-').toString().slice(0, 16) + '...',
          ],
        },
      })
    })
}
