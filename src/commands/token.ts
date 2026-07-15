import { Command } from 'commander'
import { createApproveAction } from '@sun-sdk/core'
import { readApiAction, writeAction } from '../lib/command'
import { getNetwork } from '../lib/context'
import { formatUsd } from '../lib/output'
import { getSymbolOrAddress, resolveTokenAddress } from '../lib/tokens'
import { toCliTxResult } from '../lib/sdk/compat'

export function registerTokenCommands(program: Command) {
  const token = program.command('token').description('Token lookup and search')

  token
    .command('list')
    .description('Fetch tokens by address or protocol')
    .option('--address <tokenAddress>', 'Token contract address')
    .option('--protocol <protocol>', 'Protocol filter (e.g. V2, V3)')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .option('--sort <field>', 'Sort field')
    .option('--no-blacklist', 'Include blacklisted tokens')
    .action(async (opts) => {
      await readApiAction({
        spinnerLabel: 'Fetching tokens...',
        errorLabel: 'Failed to fetch tokens',
        execute: (api) =>
          api.getTokens({
            tokenAddress: opts.address,
            protocol: opts.protocol,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
            sort: opts.sort,
            filterBlackList: opts.blacklist !== false ? undefined : false,
          }),
        tableConfig: {
          headers: ['Symbol', 'Protocol', 'Address', 'Decimals', 'Volume 24h', 'Price', 'TVL'],
          toRow: (item: any) => [
            item.symbol || item.tokenSymbol || '-',
            item.protocol || '-',
            item.tokenAddress || item.address || '-',
            String(item.decimals ?? item.tokenDecimal ?? '-'),
            formatUsd(item.volume24h ?? item.vol24h ?? item.volumeUsd1d),
            formatUsd(item.priceInUsd ?? item.price ?? item.tokenPriceUsd),
            formatUsd(item.tvl ?? item.tvlUsd ?? item.liquidityUsd ?? item.reserveUsd),
          ],
        },
      })
    })

  token
    .command('search <keyword>')
    .description('Fuzzy search for tokens')
    .option('--protocol <protocol>', 'Protocol filter')
    .option('--page <n>', 'Page number', '1')
    .option('--page-size <n>', 'Page size', '20')
    .action(async (keyword: string, opts) => {
      await readApiAction({
        spinnerLabel: `Searching tokens for "${keyword}"...`,
        errorLabel: 'Failed to search tokens',
        execute: (api) =>
          api.searchTokens({
            query: keyword,
            protocol: opts.protocol,
            pageNo: parseInt(opts.page),
            pageSize: parseInt(opts.pageSize),
          }),
        tableConfig: {
          headers: ['Symbol', 'Protocol', 'Address', 'Decimals', 'Volume 24h', 'Price'],
          toRow: (item: any) => [
            item.symbol || item.tokenSymbol || '-',
            item.protocol || '-',
            item.tokenAddress || item.address || '-',
            String(item.decimals ?? item.tokenDecimal ?? '-'),
            formatUsd(item.volume24h ?? item.vol24h ?? item.volumeUsd1d),
            formatUsd(item.priceInUsd ?? item.price ?? item.tokenPriceUsd),
          ],
        },
      })
    })

  token
    .command('approve')
    .description('Approve a spender for a TRC20 token')
    .requiredOption('--token <token>', 'Token symbol or contract address')
    .requiredOption('--spender <address>', 'Spender address')
    .requiredOption('--amount <baseUnits>', 'Allowance amount in token base units')
    .option('--fee-limit <sun>', 'Fee limit in Sun')
    .action(async (opts) => {
      const network = getNetwork()
      const tokenAddress = resolveTokenAddress(opts.token, network)
      const tokenDisplay = getSymbolOrAddress(tokenAddress, network)
      await writeAction({
        title: 'Approve Token',
        summary: {
          Token: `${tokenDisplay} (${tokenAddress})`,
          Spender: opts.spender,
          Amount: opts.amount,
          Network: network,
        },
        confirmMsg: 'Approve this allowance?',
        spinnerLabel: 'Approving token...',
        errorLabel: 'Approve failed',
        execute: (sdk) =>
          sdk.runtime
            .sendAction(
              createApproveAction({
                id: `approve-${Date.now()}`,
                target: tokenAddress as never,
                spender: opts.spender,
                amount: opts.amount,
                ...(opts.feeLimit !== undefined ? { feeLimit: parseInt(opts.feeLimit) } : {}),
              }),
            )
            .then(toCliTxResult),
      })
    })
}
