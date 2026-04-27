import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { readApiAction } from '../lib/command'
import { formatUsd } from '../lib/output'
import { resolveTokenAddress, getSymbolOrAddress, listKnownSymbols } from '../lib/tokens'

function extractPriceUsd(val: any): unknown {
  if (typeof val === 'number' || typeof val === 'string') return val
  if (val && typeof val === 'object') {
    return val.quote?.USD?.price ?? val.priceInUsd ?? val.price ?? null
  }
  return null
}

export function registerPriceCommand(program: Command) {
  program
    .command('price [token]')
    .description('Get token prices from SUN.IO')
    .option('--address <addresses>', 'Comma-separated token contract addresses')
    .action(async (token: string | undefined, opts) => {
      const network = getNetwork()
      let tokenAddress = opts.address

      if (token && !tokenAddress) {
        try {
          tokenAddress = resolveTokenAddress(token, network)
        } catch (err: any) {
          console.error(err.message)
          process.exitCode = 1
          return
        }
      }

      if (!tokenAddress) {
        console.error('Please specify a token symbol or --address')
        console.error('Known symbols: ' + listKnownSymbols(network).join(', '))
        process.exitCode = 1
        return
      }

      await readApiAction({
        spinnerLabel: 'Fetching prices...',
        errorLabel: 'Failed to get token price',
        execute: (api) => api.getPrice({ tokenAddress }),
        transform: (data: any) => {
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            return Object.entries(data)
          }
          return data
        },
        tableConfig: {
          headers: ['Token', 'Address', 'Price (USD)'],
          toRow: ([address, val]: [string, any]) => {
            const symbol = getSymbolOrAddress(address, network)
            return [symbol, address, formatUsd(extractPriceUsd(val))]
          },
        },
      })
    })
}
