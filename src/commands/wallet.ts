import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { readAction } from '../lib/command'
import { getWalletAddress, initWallet } from '../lib/wallet'
import { output, outputError } from '../lib/output'
import { readBalances } from '@sun-sdk/runtime'

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
      const tokenList = opts.tokens.split(',').map((t: string) => t.trim())

      await readAction({
        spinnerLabel: 'Fetching balances...',
        errorLabel: 'Failed to get balances',
        execute: async (sdk) => {
          const owner = opts.owner || (await sdk.runtime.getAddress())
          if (!owner)
            throw new Error(
              'Wallet required. Set agent-wallet credentials before running this command.',
            )
          const balances = await readBalances(sdk.runtime, {
            owner,
            tokens: tokenList,
          })
          return balances.map((item) => ({
            type: String(item.token).toUpperCase() === 'TRX' ? 'TRX' : 'TRC20',
            tokenAddress: String(item.token).toUpperCase() === 'TRX' ? undefined : item.token,
            balance: item.balance,
            decimals: item.decimals,
          }))
        },
        tableConfig: {
          headers: ['Type', 'Token Address', 'Balance'],
          toRow: (item: any) => [item.type, item.tokenAddress || 'TRX (native)', item.balance],
        },
      })
    })
}
