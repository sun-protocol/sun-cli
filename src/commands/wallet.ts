import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { readRuntimeAction as readAction } from '../lib/command'
import { getWalletAddress, initWallet } from '../lib/wallet'
import { output, outputError } from '../lib/output'
import { readBalances } from '@sun-protocol/sun-sdk-runtime'
import { assertTronAddress } from '@sun-protocol/sun-sdk-core'
import { TRX_ADDRESS } from '../lib/sdk/constants'

async function readBalancesWithLegacyNativeRule(
  tronClient: Parameters<typeof readBalances>[0],
  owner: string,
  tokens: readonly string[],
) {
  // The pre-migration CLI treated only the literal "TRX" token as native.
  // A zero-address token argument followed the TRC20 balanceOf path.
  const standardBalances = await readBalances(tronClient, {
    owner,
    tokens: tokens.filter((token) => token !== TRX_ADDRESS),
  })
  let standardIndex = 0
  return Promise.all(
    tokens.map(async (token) => {
      if (token !== TRX_ADDRESS) return standardBalances[standardIndex++]!
      return {
        token,
        balance: String(
          await tronClient.readContract({
            target: assertTronAddress(token),
            functionSelector: 'balanceOf(address)',
            parameters: [{ type: 'address', value: owner }],
            outputs: [{ type: 'uint256' }],
          }),
        ),
      }
    }),
  )
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
          const balances = await readBalancesWithLegacyNativeRule(
            sdk.runtime.tronClient,
            owner,
            tokenList,
          )
          return balances.map((item) => ({
            address: owner,
            type: String(item.token).toUpperCase() === 'TRX' ? 'TRX' : 'TRC20',
            tokenAddress: String(item.token).toUpperCase() === 'TRX' ? undefined : item.token,
            balance: item.balance,
          }))
        },
        tableConfig: {
          headers: ['Type', 'Token Address', 'Balance'],
          toRow: (item: any) => [item.type, item.tokenAddress || 'TRX (native)', item.balance],
        },
      })
    })
}
