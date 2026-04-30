import { Command } from 'commander'
import { readApiAction } from '../lib/command'
import { formatUsd } from '../lib/output'

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
}
