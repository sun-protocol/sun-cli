import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { readAction } from '../lib/command'
import { getWalletAddress, initWallet } from '../lib/wallet'
import { output, outputError } from '../lib/output'
import { resolveTokenAddress } from '../lib/tokens'

export interface BalanceTokenInput {
  address: string
  type: 'TRX' | 'TRC20'
  tokenAddress?: string
}

export function buildBalanceTokenList(tokens: string, owner: string | undefined, network: string): BalanceTokenInput[] {
  return tokens.split(',').map((t: string) => {
    const trimmed = t.trim()
    if (trimmed.toUpperCase() === 'TRX') {
      return { address: owner || '', type: 'TRX' as const }
    }
    return {
      address: owner || '',
      type: 'TRC20' as const,
      tokenAddress: resolveTokenAddress(trimmed, network),
    }
  })
}

export function registerWalletCommands(program: Command) {
  const wallet = program.command('wallet').description('Wallet management')

  wallet
    .command('address')
    .description('Show the active TRON wallet address')
    .action(async () => {
      try {
        await initWallet()
        const address = await getWalletAddress()
        const network = getNetwork()
        output({ address, network })
      } catch (err: any) {
        outputError('Failed to get wallet address', err)
      }
    })

  wallet
    .command('balances')
    .description('Get TRX and TRC20 balances')
    .option('--owner <address>', 'Wallet address (default: active wallet)')
    .option('--tokens <tokens>', 'Comma-separated: TRX,<TRC20_ADDRESS>,...', 'TRX')
    .action(async (opts) => {
      const network = getNetwork()
      const tokenList = buildBalanceTokenList(opts.tokens, opts.owner, network)

      await readAction({
        spinnerLabel: 'Fetching balances...',
        errorLabel: 'Failed to get balances',
        execute: (kit) =>
          kit.getBalances({
            network,
            ownerAddress: opts.owner,
            tokens: tokenList,
          }),
        tableConfig: {
          headers: ['Type', 'Token Address', 'Balance'],
          toRow: (item: any) => [item.type, item.tokenAddress || 'TRX (native)', item.balance],
        },
      })
    })
}
