import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { writeAction, readAction } from '../lib/command'
import { withSpinner } from '../lib/output'
import { resolveTokenAddress, getSymbolOrAddress } from '../lib/tokens'
import { getContractAddress } from '@sun-sdk/chains'
import type { Network } from '@sun-sdk/core'
import { TRX_ADDRESS, WTRX_MAINNET, WTRX_NILE } from '../lib/sdk/constants'
import { createReadonlyTronWeb } from '../lib/sdk/factory'
import { toCliTxResult } from '../lib/sdk/compat'

const SUNSWAP_V2_FACTORY_MIN_ABI = [
  {
    constant: true,
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
    ],
    name: 'getPair',
    outputs: [{ name: 'pair', type: 'address' }],
    type: 'function',
  },
]

const SUNSWAP_V2_PAIR_MIN_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'getReserves',
    outputs: [
      { name: '_reserve0', type: 'uint112' },
      { name: '_reserve1', type: 'uint112' },
      { name: '_blockTimestampLast', type: 'uint32' },
    ],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'token0',
    outputs: [{ name: '', type: 'address' }],
    type: 'function',
  },
]

function assertSdkNetwork(network: string): Network {
  if (network === 'mainnet' || network === 'nile') return network
  throw new Error(`Unsupported SDK network: ${network}`)
}

function getV2Router(network: string, override?: string): string {
  if (override) return override
  return getContractAddress(assertSdkNetwork(network), 'sunswapV2Router')
}

function getV3PositionManager(network: string, override?: string): string {
  if (override) return override
  return getContractAddress(assertSdkNetwork(network), 'sunswapV3PositionManager')
}

function getV2Factory(network: string): string {
  return getContractAddress(assertSdkNetwork(network), 'sunswapV2Factory')
}

function percentFromDecimal(value: string | undefined): `${number}%` | undefined {
  return value === undefined ? undefined : (`${parseFloat(value) * 100}%` as `${number}%`)
}

function withContracts(
  overrides: Record<string, string | undefined>,
): Record<string, string> | undefined {
  const entries = Object.entries(overrides).filter((entry): entry is [string, string] => !!entry[1])
  return entries.length ? Object.fromEntries(entries) : undefined
}

function mapTx(result: unknown): unknown {
  return toCliTxResult(result)
}

function toWTRXIfNative(tokenAddress: string, network: string): string {
  if (tokenAddress === TRX_ADDRESS) {
    return network === 'nile' ? WTRX_NILE : WTRX_MAINNET
  }
  return tokenAddress
}

function getWTRX(network: string): string {
  return network === 'nile' ? WTRX_NILE : WTRX_MAINNET
}

function getLookupToken(token: string, network: string): string {
  return token === TRX_ADDRESS ? getWTRX(network) : token
}

interface PairReserves {
  reserveA: string
  reserveB: string
  pairExists: boolean
}

async function getV2PairReserves(
  network: string,
  tokenA: string,
  tokenB: string,
): Promise<PairReserves> {
  const tronWeb = createReadonlyTronWeb({ network })
  const factoryAddress = getV2Factory(network)

  const lookupA = getLookupToken(tokenA, network)
  const lookupB = getLookupToken(tokenB, network)

  const factory = await tronWeb.contract(SUNSWAP_V2_FACTORY_MIN_ABI as any, factoryAddress)
  const pairHex = await factory.getPair(lookupA, lookupB).call()
  const pairBase58 = tronWeb.address.fromHex(pairHex)
  const zeroBase58 = tronWeb.address.fromHex('410000000000000000000000000000000000000000')

  if (!pairBase58 || pairBase58 === zeroBase58) {
    return { reserveA: '0', reserveB: '0', pairExists: false }
  }

  const pair = await tronWeb.contract(SUNSWAP_V2_PAIR_MIN_ABI as any, pairBase58)
  const reserves = await pair.getReserves().call()
  const token0Hex = await pair.token0().call()

  const token0 = tronWeb.address.fromHex(token0Hex)
  const reserve0 = (reserves._reserve0 ?? reserves[0]).toString()
  const reserve1 = (reserves._reserve1 ?? reserves[1]).toString()

  const reserveA = token0 === lookupA ? reserve0 : reserve1
  const reserveB = token0 === lookupB ? reserve0 : reserve1

  return { reserveA, reserveB, pairExists: true }
}

function calculateOptimalAmount(
  providedAmount: string,
  providedReserve: string,
  otherReserve: string,
): string {
  const amount = BigInt(providedAmount)
  const rProvided = BigInt(providedReserve)
  const rOther = BigInt(otherReserve)

  if (rProvided === BigInt(0) || rOther === BigInt(0)) {
    throw new Error('Pool has no liquidity. Please provide both amounts for initial liquidity.')
  }

  return ((amount * rOther) / rProvided).toString()
}

export function registerLiquidityCommands(program: Command) {
  const liq = program.command('liquidity').description('V2, V3, and V4 liquidity management')

  // ---------------------------------------------------------------------------
  // V2
  // ---------------------------------------------------------------------------

  liq
    .command('v2:add')
    .description('Add liquidity to a SUNSWAP V2 pool')
    .option('--router <address>', 'V2 router contract address (auto-detected by network)')
    .requiredOption('--token-a <tokenOrAddress>', 'Token A (symbol like TRX/USDT or address)')
    .requiredOption('--token-b <tokenOrAddress>', 'Token B (symbol like TRX/USDT or address)')
    .option('--amount-a <raw>', 'Desired amount of token A (raw units)')
    .option('--amount-b <raw>', 'Desired amount of token B (raw units)')
    .option('--min-a <raw>', 'Minimum amount of token A')
    .option('--min-b <raw>', 'Minimum amount of token B')
    .option('--to <address>', 'Recipient for LP tokens (default: active wallet)')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .option('--abi <json>', 'Optional router ABI as JSON array')
    .action(async (opts) => {
      const network = getNetwork()
      const router = getV2Router(network, opts.router)

      let tokenA: string, tokenB: string
      try {
        tokenA = resolveTokenAddress(opts.tokenA, network)
        tokenB = resolveTokenAddress(opts.tokenB, network)
      } catch (err: any) {
        console.error(err.message)
        process.exitCode = 1
        return
      }

      if (!opts.amountA && !opts.amountB) {
        console.error('Error: At least one of --amount-a or --amount-b is required')
        process.exitCode = 1
        return
      }

      let amountA = opts.amountA
      let amountB = opts.amountB

      if (!amountA || !amountB) {
        try {
          const reserves = await withSpinner('Fetching pool reserves...', () =>
            getV2PairReserves(network, tokenA, tokenB),
          )

          if (!reserves.pairExists) {
            console.error(
              'Error: Pool does not exist. Please provide both --amount-a and --amount-b for initial liquidity.',
            )
            process.exitCode = 1
            return
          }

          if (!amountA) {
            amountA = calculateOptimalAmount(amountB, reserves.reserveB, reserves.reserveA)
          } else {
            amountB = calculateOptimalAmount(amountA, reserves.reserveA, reserves.reserveB)
          }
        } catch (err: any) {
          console.error(`Error calculating optimal amount: ${err.message}`)
          process.exitCode = 1
          return
        }
      }

      const tokenADisplay = getSymbolOrAddress(tokenA, network)
      const tokenBDisplay = getSymbolOrAddress(tokenB, network)

      await writeAction({
        title: 'V2 Add Liquidity',
        summary: {
          Router: router,
          'Token A': `${tokenADisplay} (${tokenA})`,
          'Token B': `${tokenBDisplay} (${tokenB})`,
          'Amount A': amountA,
          'Amount B': amountB,
          Network: network,
        },
        confirmMsg: 'Add V2 liquidity?',
        spinnerLabel: 'Adding V2 liquidity...',
        errorLabel: 'V2 add liquidity failed',
        execute: (sdk) =>
          sdk.liquidity.v2.add
            .execute({
              contracts: withContracts({ sunswapV2Router: router }),
              tokenA,
              tokenB,
              amountADesired: amountA,
              amountBDesired: amountB,
              amountAMin: opts.minA,
              amountBMin: opts.minB,
              recipient: opts.to,
              deadline: opts.deadline,
            })
            .then(mapTx),
      })
    })

  liq
    .command('v2:remove')
    .description('Remove liquidity from a SUNSWAP V2 pool')
    .option('--router <address>', 'V2 router contract address (auto-detected by network)')
    .requiredOption('--token-a <tokenOrAddress>', 'Token A (symbol like TRX/USDT or address)')
    .requiredOption('--token-b <tokenOrAddress>', 'Token B (symbol like TRX/USDT or address)')
    .requiredOption('--liquidity <raw>', 'LP tokens to burn')
    .option('--min-a <raw>', 'Minimum amount of token A to receive')
    .option('--min-b <raw>', 'Minimum amount of token B to receive')
    .option('--to <address>', 'Recipient of underlying tokens')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .option('--abi <json>', 'Optional router ABI as JSON array')
    .action(async (opts) => {
      const network = getNetwork()
      const router = getV2Router(network, opts.router)

      let tokenA: string, tokenB: string
      try {
        tokenA = resolveTokenAddress(opts.tokenA, network)
        tokenB = resolveTokenAddress(opts.tokenB, network)
      } catch (err: any) {
        console.error(err.message)
        process.exitCode = 1
        return
      }

      const tokenADisplay = getSymbolOrAddress(tokenA, network)
      const tokenBDisplay = getSymbolOrAddress(tokenB, network)

      await writeAction({
        title: 'V2 Remove Liquidity',
        summary: {
          Router: router,
          'Token A': `${tokenADisplay} (${tokenA})`,
          'Token B': `${tokenBDisplay} (${tokenB})`,
          'LP Tokens': opts.liquidity,
          Network: network,
        },
        confirmMsg: 'Remove V2 liquidity?',
        spinnerLabel: 'Removing V2 liquidity...',
        errorLabel: 'V2 remove liquidity failed',
        execute: (sdk) =>
          sdk.liquidity.v2.remove
            .execute({
              contracts: withContracts({ sunswapV2Router: router }),
              tokenA,
              tokenB,
              liquidity: opts.liquidity,
              amountAMin: opts.minA,
              amountBMin: opts.minB,
              recipient: opts.to,
              deadline: opts.deadline,
            } as any)
            .then(mapTx),
      })
    })

  // ---------------------------------------------------------------------------
  // V3
  // ---------------------------------------------------------------------------

  liq
    .command('v3:mint')
    .description('Mint a new SUNSWAP V3 concentrated liquidity position')
    .option('--pm <address>', 'V3 NonfungiblePositionManager address (auto-detected by network)')
    .requiredOption('--token0 <tokenOrAddress>', 'Token0 (symbol like TRX/USDT or address)')
    .requiredOption('--token1 <tokenOrAddress>', 'Token1 (symbol like TRX/USDT or address)')
    .option('--fee <n>', 'Pool fee tier (default: 3000)')
    .option('--tick-lower <n>', 'Lower tick (auto-computed if omitted)')
    .option('--tick-upper <n>', 'Upper tick (auto-computed if omitted)')
    .option('--amount0 <raw>', 'Desired amount of token0')
    .option('--amount1 <raw>', 'Desired amount of token1')
    .option('--min0 <raw>', 'Minimum amount of token0')
    .option('--min1 <raw>', 'Minimum amount of token1')
    .option('--recipient <address>', 'NFT recipient')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .option('--abi <json>', 'Optional PM ABI as JSON array')
    .action(async (opts) => {
      const network = getNetwork()
      const pm = getV3PositionManager(network, opts.pm)

      let token0Input: string, token1Input: string
      try {
        token0Input = resolveTokenAddress(opts.token0, network)
        token1Input = resolveTokenAddress(opts.token1, network)
      } catch (err: any) {
        console.error(err.message)
        process.exitCode = 1
        return
      }

      const token0 = toWTRXIfNative(token0Input, network)
      const token1 = toWTRXIfNative(token1Input, network)

      if (!opts.amount0 && !opts.amount1) {
        console.error('Error: At least one of --amount0 or --amount1 is required')
        process.exitCode = 1
        return
      }

      const token0Display = getSymbolOrAddress(token0Input, network)
      const token1Display = getSymbolOrAddress(token1Input, network)
      const token0Note = token0 !== token0Input ? ` → WTRX` : ''
      const token1Note = token1 !== token1Input ? ` → WTRX` : ''

      const tickRange =
        opts.tickLower && opts.tickUpper ? `[${opts.tickLower}, ${opts.tickUpper}]` : '(auto)'

      await writeAction({
        title: 'V3 Mint Position',
        summary: {
          'Position Manager': pm,
          Token0: `${token0Display}${token0Note} (${token0})`,
          Token1: `${token1Display}${token1Note} (${token1})`,
          Fee: opts.fee || '3000 (default)',
          'Tick Range': tickRange,
          Amount0: opts.amount0 || '(auto)',
          Amount1: opts.amount1 || '(auto)',
          Network: network,
        },
        confirmMsg: 'Mint V3 position?',
        spinnerLabel: 'Minting V3 position...',
        errorLabel: 'V3 mint failed',
        execute: (sdk) =>
          sdk.liquidity.v3.add
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenA: token0,
              tokenB: token1,
              fee: opts.fee ? parseInt(opts.fee) : 3000,
              tickLower: opts.tickLower ? parseInt(opts.tickLower) : undefined,
              tickUpper: opts.tickUpper ? parseInt(opts.tickUpper) : undefined,
              amount0: opts.amount0,
              amount1: opts.amount1,
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              recipient: opts.recipient,
              deadline: opts.deadline,
            })
            .then(mapTx),
        summarizeResult: (result: any) => {
          const out: Record<string, unknown> = {}
          if (result?.computedTicks) {
            out['Tick Lower'] = result.computedTicks.tickLower
            out['Tick Upper'] = result.computedTicks.tickUpper
          }
          if (result?.computedAmounts) {
            out['Amount0 Desired'] = result.computedAmounts.amount0Desired
            out['Amount1 Desired'] = result.computedAmounts.amount1Desired
          }
          if (result?.tronscanUrl) out['Tronscan'] = result.tronscanUrl
          return out
        },
      })
    })

  liq
    .command('v3:increase')
    .description('Increase liquidity of an existing V3 position')
    .option('--pm <address>', 'V3 NonfungiblePositionManager address (auto-detected by network)')
    .requiredOption('--token-id <id>', 'Position NFT token ID')
    .option('--amount0 <raw>', 'Additional amount of token0')
    .option('--amount1 <raw>', 'Additional amount of token1')
    .option('--min0 <raw>', 'Minimum amount of token0')
    .option('--min1 <raw>', 'Minimum amount of token1')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .option('--abi <json>', 'Optional PM ABI as JSON array')
    .action(async (opts) => {
      const network = getNetwork()
      const pm = getV3PositionManager(network, opts.pm)

      if (!opts.amount0 && !opts.amount1) {
        console.error('Error: At least one of --amount0 or --amount1 is required')
        process.exitCode = 1
        return
      }

      await writeAction({
        title: 'V3 Increase Liquidity',
        summary: {
          'Position Manager': pm,
          'Token ID': opts.tokenId,
          Amount0: opts.amount0 || '(auto)',
          Amount1: opts.amount1 || '(auto)',
          Network: network,
        },
        confirmMsg: 'Increase V3 liquidity?',
        spinnerLabel: 'Increasing V3 liquidity...',
        errorLabel: 'V3 increase liquidity failed',
        execute: (sdk) =>
          sdk.liquidity.v3.increase
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenId: opts.tokenId,
              amount0: opts.amount0,
              amount1: opts.amount1,
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              deadline: opts.deadline,
            } as any)
            .then(mapTx),
        summarizeResult: (result: any) => {
          const out: Record<string, unknown> = {}
          if (result?.computedAmounts) {
            out['Amount0 Desired'] = result.computedAmounts.amount0Desired
            out['Amount1 Desired'] = result.computedAmounts.amount1Desired
          }
          if (result?.tronscanUrl) out['Tronscan'] = result.tronscanUrl
          return out
        },
      })
    })

  liq
    .command('v3:decrease')
    .description('Decrease liquidity of an existing V3 position')
    .option('--pm <address>', 'V3 NonfungiblePositionManager address (auto-detected by network)')
    .requiredOption('--token-id <id>', 'Position NFT token ID')
    .requiredOption('--liquidity <raw>', 'Amount of liquidity to remove')
    .option('--min0 <raw>', 'Minimum amount of token0 to receive')
    .option('--min1 <raw>', 'Minimum amount of token1 to receive')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .option('--abi <json>', 'Optional PM ABI as JSON array')
    .action(async (opts) => {
      const network = getNetwork()
      const pm = getV3PositionManager(network, opts.pm)

      await writeAction({
        title: 'V3 Decrease Liquidity',
        summary: {
          'Position Manager': pm,
          'Token ID': opts.tokenId,
          Liquidity: opts.liquidity,
          Network: network,
        },
        confirmMsg: 'Decrease V3 liquidity?',
        spinnerLabel: 'Decreasing V3 liquidity...',
        errorLabel: 'V3 decrease liquidity failed',
        execute: (sdk) =>
          sdk.positions.v3.remove
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenId: opts.tokenId,
              liquidity: opts.liquidity,
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              deadline: opts.deadline,
            } as any)
            .then(mapTx),
      })
    })

  liq
    .command('v3:collect')
    .description('Collect accrued fees from an existing V3 position')
    .option('--pm <address>', 'V3 NonfungiblePositionManager address (auto-detected by network)')
    .requiredOption('--token-id <id>', 'Position NFT token ID')
    .option('--recipient <address>', 'Fee recipient (default: active wallet)')
    .option('--abi <json>', 'Optional PM ABI as JSON array')
    .action(async (opts) => {
      const network = getNetwork()
      const pm = getV3PositionManager(network, opts.pm)

      await writeAction({
        title: 'V3 Collect Fees',
        summary: {
          'Position Manager': pm,
          'Token ID': opts.tokenId,
          Recipient: opts.recipient || '(active wallet)',
          Network: network,
        },
        confirmMsg: 'Collect V3 fees?',
        spinnerLabel: 'Collecting V3 fees...',
        errorLabel: 'V3 collect failed',
        execute: (sdk) =>
          sdk.positions.v3.collect
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenId: opts.tokenId,
              recipient: opts.recipient,
            })
            .then(mapTx),
        summarizeResult: (result: any) => {
          const out: Record<string, unknown> = {}
          if (result?.estimatedFees) {
            out['Estimated Fee 0'] = result.estimatedFees.amount0
            out['Estimated Fee 1'] = result.estimatedFees.amount1
          }
          if (result?.tronscanUrl) out['Tronscan'] = result.tronscanUrl
          return out
        },
      })
    })

  // ---------------------------------------------------------------------------
  // V4
  // ---------------------------------------------------------------------------

  liq
    .command('v4:mint')
    .description('Mint a new SUNSWAP V4 concentrated liquidity position')
    .requiredOption('--token0 <tokenOrAddress>', 'Token0 (symbol like TRX/USDT or address)')
    .requiredOption('--token1 <tokenOrAddress>', 'Token1 (symbol like TRX/USDT or address)')
    .option('--fee <n>', 'Pool fee tier (e.g. 500)')
    .option('--tick-lower <n>', 'Lower tick (auto-computed if omitted)')
    .option('--tick-upper <n>', 'Upper tick (auto-computed if omitted)')
    .option('--amount0 <raw>', 'Desired amount of token0')
    .option('--amount1 <raw>', 'Desired amount of token1')
    .option('--slippage <n>', 'Slippage tolerance as decimal (e.g. 0.01 for 1%)')
    .option('--recipient <address>', 'NFT recipient')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .option('--sqrt-price <value>', 'Initial sqrtPriceX96 (for pool creation)')
    .option('--create-pool', 'Create pool if it does not exist')
    .action(async (opts) => {
      const network = getNetwork()

      let token0Input: string, token1Input: string
      try {
        token0Input = resolveTokenAddress(opts.token0, network)
        token1Input = resolveTokenAddress(opts.token1, network)
      } catch (err: any) {
        console.error(err.message)
        process.exitCode = 1
        return
      }

      const token0 = toWTRXIfNative(token0Input, network)
      const token1 = toWTRXIfNative(token1Input, network)

      const token0Display = getSymbolOrAddress(token0Input, network)
      const token1Display = getSymbolOrAddress(token1Input, network)
      const token0Note = token0 !== token0Input ? ` → WTRX` : ''
      const token1Note = token1 !== token1Input ? ` → WTRX` : ''

      await writeAction({
        title: 'V4 Mint Position',
        summary: {
          Token0: `${token0Display}${token0Note} (${token0})`,
          Token1: `${token1Display}${token1Note} (${token1})`,
          Fee: opts.fee || '(auto)',
          'Tick Range':
            opts.tickLower && opts.tickUpper ? `[${opts.tickLower}, ${opts.tickUpper}]` : '(auto)',
          Amount0: opts.amount0 || '(auto)',
          Amount1: opts.amount1 || '(auto)',
          Slippage: opts.slippage
            ? `${(parseFloat(opts.slippage) * 100).toFixed(2)}%`
            : '(default)',
          'Create Pool': opts.createPool ? 'Yes' : 'No',
          Network: network,
        },
        confirmMsg: 'Mint V4 position?',
        spinnerLabel: 'Minting V4 position...',
        errorLabel: 'V4 mint failed',
        execute: (sdk) =>
          sdk.liquidity.v4.add
            .execute({
              token0,
              token1,
              fee: opts.fee ? parseInt(opts.fee) : undefined,
              tickSpacing: opts.fee ? undefined : 60,
              tickLower: opts.tickLower ? parseInt(opts.tickLower) : undefined,
              tickUpper: opts.tickUpper ? parseInt(opts.tickUpper) : undefined,
              amount0: opts.amount0,
              amount1: opts.amount1,
              slippage: percentFromDecimal(opts.slippage),
              recipient: opts.recipient,
              deadline: opts.deadline,
              sqrtPriceX96: opts.sqrtPrice,
              createPool: opts.createPool,
            } as any)
            .then(mapTx),
        summarizeResult: (result: any) => {
          const out: Record<string, unknown> = {}
          if (result?.poolCreated !== undefined) out['Pool Created'] = result.poolCreated
          if (result?.computedTicks) {
            out['Tick Lower'] = result.computedTicks.tickLower
            out['Tick Upper'] = result.computedTicks.tickUpper
          }
          if (result?.computedAmounts) {
            out['Amount0 Desired'] = result.computedAmounts.amount0Desired
            out['Amount1 Desired'] = result.computedAmounts.amount1Desired
          }
          if (result?.tronscanUrl) out['Tronscan'] = result.tronscanUrl
          return out
        },
      })
    })

  liq
    .command('v4:increase')
    .description('Increase liquidity of an existing V4 position')
    .requiredOption('--token-id <id>', 'Position NFT token ID')
    .requiredOption('--token0 <tokenOrAddress>', 'Token0 (symbol like TRX/USDT or address)')
    .requiredOption('--token1 <tokenOrAddress>', 'Token1 (symbol like TRX/USDT or address)')
    .option('--fee <n>', 'Pool fee tier')
    .option('--amount0 <raw>', 'Additional amount of token0')
    .option('--amount1 <raw>', 'Additional amount of token1')
    .option('--slippage <n>', 'Slippage tolerance as decimal')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .action(async (opts) => {
      const network = getNetwork()

      let token0Input: string, token1Input: string
      try {
        token0Input = resolveTokenAddress(opts.token0, network)
        token1Input = resolveTokenAddress(opts.token1, network)
      } catch (err: any) {
        console.error(err.message)
        process.exitCode = 1
        return
      }

      const token0 = toWTRXIfNative(token0Input, network)
      const token1 = toWTRXIfNative(token1Input, network)

      const token0Display = getSymbolOrAddress(token0Input, network)
      const token1Display = getSymbolOrAddress(token1Input, network)

      await writeAction({
        title: 'V4 Increase Liquidity',
        summary: {
          'Token ID': opts.tokenId,
          Token0: `${token0Display} (${token0})`,
          Token1: `${token1Display} (${token1})`,
          Amount0: opts.amount0 || '(auto)',
          Amount1: opts.amount1 || '(auto)',
          Network: network,
        },
        confirmMsg: 'Increase V4 liquidity?',
        spinnerLabel: 'Increasing V4 liquidity...',
        errorLabel: 'V4 increase liquidity failed',
        execute: (sdk) =>
          sdk.liquidity.v4.increase
            .execute({
              tokenId: opts.tokenId,
              token0,
              token1,
              fee: opts.fee ? parseInt(opts.fee) : undefined,
              tickSpacing: opts.fee ? undefined : 60,
              amount0: opts.amount0,
              amount1: opts.amount1,
              slippage: percentFromDecimal(opts.slippage),
              deadline: opts.deadline,
            } as any)
            .then(mapTx),
        summarizeResult: (result: any) => {
          const out: Record<string, unknown> = {}
          if (result?.computedAmounts) {
            out['Amount0 Desired'] = result.computedAmounts.amount0Desired
            out['Amount1 Desired'] = result.computedAmounts.amount1Desired
          }
          if (result?.tronscanUrl) out['Tronscan'] = result.tronscanUrl
          return out
        },
      })
    })

  liq
    .command('v4:decrease')
    .description('Decrease liquidity of an existing V4 position')
    .requiredOption('--token-id <id>', 'Position NFT token ID')
    .requiredOption('--liquidity <raw>', 'Amount of liquidity to remove')
    .requiredOption('--token0 <tokenOrAddress>', 'Token0 (symbol like TRX/USDT or address)')
    .requiredOption('--token1 <tokenOrAddress>', 'Token1 (symbol like TRX/USDT or address)')
    .option('--fee <n>', 'Pool fee tier')
    .option('--min0 <raw>', 'Minimum amount of token0 to receive')
    .option('--min1 <raw>', 'Minimum amount of token1 to receive')
    .option('--slippage <n>', 'Slippage tolerance as decimal')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .action(async (opts) => {
      const network = getNetwork()

      let token0Input: string, token1Input: string
      try {
        token0Input = resolveTokenAddress(opts.token0, network)
        token1Input = resolveTokenAddress(opts.token1, network)
      } catch (err: any) {
        console.error(err.message)
        process.exitCode = 1
        return
      }

      const token0 = toWTRXIfNative(token0Input, network)
      const token1 = toWTRXIfNative(token1Input, network)

      const token0Display = getSymbolOrAddress(token0Input, network)
      const token1Display = getSymbolOrAddress(token1Input, network)

      await writeAction({
        title: 'V4 Decrease Liquidity',
        summary: {
          'Token ID': opts.tokenId,
          Liquidity: opts.liquidity,
          Token0: `${token0Display} (${token0})`,
          Token1: `${token1Display} (${token1})`,
          Network: network,
        },
        confirmMsg: 'Decrease V4 liquidity?',
        spinnerLabel: 'Decreasing V4 liquidity...',
        errorLabel: 'V4 decrease liquidity failed',
        execute: (sdk) =>
          sdk.positions.v4.remove
            .execute({
              tokenId: opts.tokenId,
              liquidity: opts.liquidity,
              poolKey: opts.fee
                ? {
                    currency0: token0,
                    currency1: token1,
                    fee: parseInt(opts.fee),
                    tickSpacing: 60,
                    hooks: TRX_ADDRESS,
                  }
                : undefined,
              fee: opts.fee ? parseInt(opts.fee) : undefined,
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              slippage: percentFromDecimal(opts.slippage),
              deadline: opts.deadline,
            } as any)
            .then(mapTx),
        summarizeResult: (result: any) => {
          const out: Record<string, unknown> = {}
          if (result?.computedAmountMin) {
            out['Amount0 Min'] = result.computedAmountMin.amount0Min
            out['Amount1 Min'] = result.computedAmountMin.amount1Min
          }
          if (result?.tronscanUrl) out['Tronscan'] = result.tronscanUrl
          return out
        },
      })
    })

  liq
    .command('v4:collect')
    .description('Collect accrued fees from an existing V4 position')
    .requiredOption('--token-id <id>', 'Position NFT token ID')
    .option('--token0 <tokenOrAddress>', 'Token0 (symbol like TRX/USDT or address)')
    .option('--token1 <tokenOrAddress>', 'Token1 (symbol like TRX/USDT or address)')
    .option('--fee <n>', 'Pool fee tier')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .action(async (opts) => {
      const network = getNetwork()

      let token0: string | undefined, token1: string | undefined
      if (opts.token0) {
        try {
          const resolved = resolveTokenAddress(opts.token0, network)
          token0 = toWTRXIfNative(resolved, network)
        } catch (err: any) {
          console.error(err.message)
          process.exitCode = 1
          return
        }
      }
      if (opts.token1) {
        try {
          const resolved = resolveTokenAddress(opts.token1, network)
          token1 = toWTRXIfNative(resolved, network)
        } catch (err: any) {
          console.error(err.message)
          process.exitCode = 1
          return
        }
      }

      await writeAction({
        title: 'V4 Collect Fees',
        summary: {
          'Token ID': opts.tokenId,
          Token0: token0 || '(auto)',
          Token1: token1 || '(auto)',
          Network: network,
        },
        confirmMsg: 'Collect V4 fees?',
        spinnerLabel: 'Collecting V4 fees...',
        errorLabel: 'V4 collect failed',
        execute: (sdk) =>
          sdk.positions.v4.collect
            .execute({
              tokenId: opts.tokenId,
              poolKey:
                token0 && token1 && opts.fee
                  ? {
                      currency0: token0,
                      currency1: token1,
                      fee: parseInt(opts.fee),
                      tickSpacing: 60,
                      hooks: TRX_ADDRESS,
                    }
                  : undefined,
              deadline: opts.deadline,
            } as any)
            .then(mapTx),
      })
    })

  liq
    .command('v4:info')
    .description('Get details of an existing V4 position (read-only)')
    .requiredOption('--pm <address>', 'V4 CLPositionManager address')
    .requiredOption('--token-id <id>', 'Position NFT token ID')
    .action(async (opts) => {
      await readAction({
        spinnerLabel: 'Fetching V4 position info...',
        errorLabel: 'V4 position info failed',
        execute: (sdk) =>
          sdk.positions.v4.read({
            tokenId: opts.tokenId,
            contracts: withContracts({ sunswapV4PositionManager: opts.pm }),
          }),
        transform: (result: any) => {
          if (!result) return { error: 'Position not found' }
          return {
            currency0: result.poolKey?.currency0,
            currency1: result.poolKey?.currency1,
            fee: result.poolKey?.fee,
            tickSpacing: result.poolKey?.tickSpacing,
            tickLower: result.tickLower,
            tickUpper: result.tickUpper,
            liquidity: result.liquidity,
          }
        },
      })
    })
}
