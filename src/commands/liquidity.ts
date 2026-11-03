import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { writeAction, readAction } from '../lib/command'
import { outputError, withSpinner } from '../lib/output'
import { resolveTokenAddress, getSymbolOrAddress } from '../lib/tokens'
import { getContractAddress } from '@sun-protocol/sun-sdk-chains'
import type { Network } from '@sun-protocol/sun-sdk-core'
import type { V4PositionSnapshot } from '@sun-protocol/sun-sdk-protocols'
import type { V4PoolKey } from '@sun-protocol/sun-sdk-sunswap-v4'
import { TronWeb } from 'tronweb'
import {
  DEFAULT_V3_FEE,
  DEFAULT_V4_FEE,
  TRX_ADDRESS,
  WTRX_MAINNET,
  WTRX_NILE,
} from '../lib/sdk/constants'
import { createReadonlyTronWeb, withLiquidityAbi } from '../lib/sdk/factory'
import { toCliTxResult } from '../lib/sdk/compat'
import { resolveLegacyV3Pool } from '../lib/sdk/liquidity-v3'
import { resolveV4MintTicks, v4TickSpacingForFee } from '../lib/sdk/liquidity-v4'
import type { CliSunSDK } from '../lib/sdk/types'
import { parseDecimalSlippage, type ParsedDecimalSlippage } from '../lib/slippage'

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

function parseOptionalSlippage(value: string | undefined): ParsedDecimalSlippage | undefined {
  return value === undefined ? undefined : parseDecimalSlippage(value)
}

function invalidParamsError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'INVALID_PARAMS' })
}

function assertLiquidityAmounts(amount0: string | undefined, amount1: string | undefined): void {
  if (amount0 === undefined && amount1 === undefined) {
    throw invalidParamsError('At least one of --amount0 or --amount1 is required')
  }

  for (const [name, value] of [
    ['--amount0', amount0],
    ['--amount1', amount1],
  ] as const) {
    if (value !== undefined && !/^\d+$/.test(value)) {
      throw invalidParamsError(`${name} must be a non-negative integer in base units`)
    }
  }

  if (BigInt(amount0 ?? '0') === 0n && BigInt(amount1 ?? '0') === 0n) {
    throw invalidParamsError('At least one of --amount0 or --amount1 must be greater than zero')
  }
}

interface OptionalV4Pair {
  token0?: string
  token1?: string
}

interface PreparedV4Position {
  poolKey: V4PoolKey
  reversed: boolean
}

function resolveOptionalV4Pair(
  token0Input: string | undefined,
  token1Input: string | undefined,
  network: string,
): OptionalV4Pair {
  if ((token0Input === undefined) !== (token1Input === undefined)) {
    throw invalidParamsError('--token0 and --token1 must be provided together or both omitted')
  }
  if (token0Input === undefined || token1Input === undefined) return {}
  return {
    token0: resolveTokenAddress(token0Input, network),
    token1: resolveTokenAddress(token1Input, network),
  }
}

function parseOptionalV4Fee(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value)) throw invalidParamsError('--fee must be a non-negative integer')
  const fee = Number(value)
  if (!Number.isSafeInteger(fee) || fee > 0xffffff) {
    throw invalidParamsError('--fee must fit in an unsigned 24-bit integer')
  }
  return fee
}

function prepareV4Position(
  snapshot: V4PositionSnapshot,
  expectedPair: OptionalV4Pair,
  expectedFee: number | undefined,
): PreparedV4Position {
  const poolKey = snapshot.poolKey
  if (!poolKey) {
    throw Object.assign(new Error('V4 position does not include its pool information'), {
      code: 'SDK_CONTRACT_ERROR',
    })
  }

  if (expectedFee !== undefined && poolKey.fee !== expectedFee) {
    throw invalidParamsError(`--fee ${expectedFee} does not match position pool fee ${poolKey.fee}`)
  }

  if (expectedPair.token0 === undefined || expectedPair.token1 === undefined) {
    return { poolKey, reversed: false }
  }
  if (expectedPair.token0 === expectedPair.token1) {
    throw invalidParamsError('--token0 and --token1 must be different currencies')
  }
  if (expectedPair.token0 === poolKey.currency0 && expectedPair.token1 === poolKey.currency1) {
    return { poolKey, reversed: false }
  }
  if (expectedPair.token0 === poolKey.currency1 && expectedPair.token1 === poolKey.currency0) {
    return { poolKey, reversed: true }
  }
  throw invalidParamsError('Provided --token0/--token1 do not match the tokenId position')
}

function v4PositionTokenSummary(poolKey: V4PoolKey, network: string) {
  return {
    Token0: `${getSymbolOrAddress(poolKey.currency0, network)} (${poolKey.currency0})`,
    Token1: `${getSymbolOrAddress(poolKey.currency1, network)} (${poolKey.currency1})`,
    Fee: poolKey.fee,
  }
}

function orderV4PositionValues<T>(reversed: boolean, value0: T, value1: T): [T, T] {
  return reversed ? [value1, value0] : [value0, value1]
}

function createV4PositionLoader(
  tokenId: string,
  expectedPair: OptionalV4Pair,
  expectedFee: number | undefined,
): (sdk: CliSunSDK) => Promise<PreparedV4Position> {
  let pending: Promise<PreparedV4Position> | undefined
  return (sdk) => {
    pending ??= sdk.positions.v4
      .read({ tokenId })
      .then((snapshot) => prepareV4Position(snapshot, expectedPair, expectedFee))
    return pending
  }
}

function toV3PoolOrder<T>(token0: string, token1: string, value0: T, value1: T): [T, T] {
  const token0Hex = TronWeb.address.toHex(token0).toLowerCase()
  const token1Hex = TronWeb.address.toHex(token1).toLowerCase()
  return token0Hex < token1Hex ? [value0, value1] : [value1, value0]
}

function withContracts(
  overrides: Record<string, string | undefined>,
): Record<string, string> | undefined {
  const entries = Object.entries(overrides).filter((entry): entry is [string, string] => !!entry[1])
  return entries.length ? Object.fromEntries(entries) : undefined
}

function mapTx(result: unknown, reverseAmounts = false): unknown {
  const mapped = toCliTxResult(result) as Record<string, unknown>
  const amounts = mapped?.computedAmounts as
    | { amount0Desired: string; amount1Desired: string }
    | undefined
  if (!reverseAmounts || !amounts) return mapped
  return {
    ...mapped,
    computedAmounts: {
      amount0Desired: amounts.amount1Desired,
      amount1Desired: amounts.amount0Desired,
    },
  }
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

export function unwrapContractAddressResult(result: unknown, label: string): string {
  const value = Array.isArray(result)
    ? result[0]
    : result && typeof result === 'object'
      ? Object.values(result as Record<string, unknown>)[0]
      : result
  if (typeof value !== 'string') throw new Error(`${label} did not return an address`)
  return value
}

function toBase58ContractAddress(
  tronWeb: ReturnType<typeof createReadonlyTronWeb>,
  result: unknown,
  label: string,
): string {
  const value = unwrapContractAddressResult(result, label)
  if (value.startsWith('T')) return value
  return tronWeb.address.fromHex(value.startsWith('0x') ? `41${value.slice(2)}` : value)
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
  const pairResult = await factory.getPair(lookupA, lookupB).call()
  const pairBase58 = toBase58ContractAddress(tronWeb, pairResult, 'V2 factory getPair')
  const zeroBase58 = tronWeb.address.fromHex('410000000000000000000000000000000000000000')

  if (!pairBase58 || pairBase58 === zeroBase58) {
    return { reserveA: '0', reserveB: '0', pairExists: false }
  }

  const pair = await tronWeb.contract(SUNSWAP_V2_PAIR_MIN_ABI as any, pairBase58)
  const reserves = await pair.getReserves().call()
  const token0Result = await pair.token0().call()

  const token0 = toBase58ContractAddress(tronWeb, token0Result, 'V2 pair token0')
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
        execute: async (client) =>
          (await withLiquidityAbi(client, router, opts.abi)).liquidity.v2.add
            .execute({
              contracts: withContracts({ sunswapV2Router: router }),
              tokenA,
              tokenB,
              amountADesired: amountA,
              amountBDesired: amountB,
              amountAMin: opts.minA,
              amountBMin: opts.minB,
              recipient: opts.to,
              ttlSeconds: 1800,
              deadline: opts.deadline,
            })
            .then((result) => mapTx(result)),
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
        execute: async (sdk) =>
          (await withLiquidityAbi(sdk, router, opts.abi)).liquidity.v2.remove
            .execute({
              contracts: withContracts({ sunswapV2Router: router }),
              tokenA,
              tokenB,
              liquidity: opts.liquidity,
              amountAMin: opts.minA,
              amountBMin: opts.minB,
              recipient: opts.to,
              ttlSeconds: 1800,
              deadline: opts.deadline,
            })
            .then((result) => mapTx(result)),
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
    .option('--fee <n>', `Pool fee tier (default: ${DEFAULT_V3_FEE})`)
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

      try {
        assertLiquidityAmounts(opts.amount0, opts.amount1)
      } catch (err) {
        outputError('Invalid liquidity amounts', err)
        return
      }

      const token0Display = getSymbolOrAddress(token0Input, network)
      const token1Display = getSymbolOrAddress(token1Input, network)
      const token0Note = token0 !== token0Input ? ` → WTRX` : ''
      const token1Note = token1 !== token1Input ? ` → WTRX` : ''

      const tickRange =
        opts.tickLower && opts.tickUpper ? `[${opts.tickLower}, ${opts.tickUpper}]` : '(auto)'
      const [amount0, amount1] = toV3PoolOrder(token0, token1, opts.amount0, opts.amount1)
      const [amount0Min, amount1Min] = toV3PoolOrder(token0, token1, opts.min0, opts.min1)

      await writeAction({
        title: 'V3 Mint Position',
        summary: {
          'Position Manager': pm,
          Token0: `${token0Display}${token0Note} (${token0})`,
          Token1: `${token1Display}${token1Note} (${token1})`,
          Fee: opts.fee || `${DEFAULT_V3_FEE} (default)`,
          'Tick Range': tickRange,
          Amount0: opts.amount0 ?? '(not provided)',
          Amount1: opts.amount1 ?? '(not provided)',
          Network: network,
        },
        confirmMsg: 'Mint V3 position?',
        spinnerLabel: 'Minting V3 position...',
        errorLabel: 'V3 mint failed',
        execute: async (sdk) =>
          (await withLiquidityAbi(sdk, pm, opts.abi)).liquidity.v3.add
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenA: token0,
              tokenB: token1,
              fee: opts.fee ? parseInt(opts.fee) : DEFAULT_V3_FEE,
              pool: await resolveLegacyV3Pool(sdk, {
                token0,
                token1,
                fee: opts.fee ? parseInt(opts.fee) : DEFAULT_V3_FEE,
              }),
              tickLower: opts.tickLower ? parseInt(opts.tickLower) : undefined,
              tickUpper: opts.tickUpper ? parseInt(opts.tickUpper) : undefined,
              tickRangeMode: 'legacy',
              includeComputedMetadata: true,
              tickRangeWidth:
                opts.tickLower === undefined || opts.tickUpper === undefined ? 100 : undefined,
              amount0,
              amount1,
              amount0Min,
              amount1Min,
              recipient: opts.recipient,
              ttlSeconds: 1800,
              deadline: opts.deadline,
            })
            .then((result) => mapTx(result, toV3PoolOrder(token0, token1, false, true)[0])),
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

      try {
        assertLiquidityAmounts(opts.amount0, opts.amount1)
      } catch (err) {
        outputError('Invalid liquidity amounts', err)
        return
      }

      await writeAction({
        title: 'V3 Increase Liquidity',
        summary: {
          'Position Manager': pm,
          'Token ID': opts.tokenId,
          Amount0: opts.amount0 ?? '(not provided)',
          Amount1: opts.amount1 ?? '(not provided)',
          Network: network,
        },
        confirmMsg: 'Increase V3 liquidity?',
        spinnerLabel: 'Increasing V3 liquidity...',
        errorLabel: 'V3 increase liquidity failed',
        execute: async (sdk) =>
          (
            await withLiquidityAbi(
              sdk,
              pm,
              opts.abi,
              BigInt(opts.amount0 ?? '0') === 0n || BigInt(opts.amount1 ?? '0') === 0n
                ? ['positions(uint256)']
                : [],
            )
          ).liquidity.v3.increase
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenId: opts.tokenId,
              amount0: opts.amount0,
              amount1: opts.amount1,
              includeComputedMetadata: true,
              pool:
                BigInt(opts.amount0 ?? '0') === 0n || BigInt(opts.amount1 ?? '0') === 0n
                  ? await resolveLegacyV3Pool(sdk, {
                      tokenId: opts.tokenId,
                      positionManager: pm,
                      positionAbi: opts.abi,
                    })
                  : undefined,
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              ttlSeconds: 1800,
              deadline: opts.deadline,
            })
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
        execute: async (sdk) =>
          (await withLiquidityAbi(sdk, pm, opts.abi)).positions.v3.remove
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenId: opts.tokenId,
              liquidity: opts.liquidity,
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              collectFees: false,
              ttlSeconds: 1800,
              deadline: opts.deadline,
            })
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
        execute: async (sdk) =>
          (await withLiquidityAbi(sdk, pm, opts.abi)).positions.v3.collect
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenId: opts.tokenId,
              recipient: opts.recipient,
              estimateFees: true,
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
    .option('--fee <n>', `Pool fee tier (default: ${DEFAULT_V4_FEE})`)
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

      // V4 identifies native TRX with the zero address. WTRX is a different pool currency.
      const token0 = token0Input
      const token1 = token1Input

      const token0Display = getSymbolOrAddress(token0Input, network)
      const token1Display = getSymbolOrAddress(token1Input, network)
      const fee = opts.fee ? parseInt(opts.fee) : DEFAULT_V4_FEE
      const tickLower = opts.tickLower !== undefined ? parseInt(opts.tickLower) : undefined
      const tickUpper = opts.tickUpper !== undefined ? parseInt(opts.tickUpper) : undefined

      let slippage: ParsedDecimalSlippage | undefined
      try {
        slippage = parseOptionalSlippage(opts.slippage)
      } catch (err) {
        outputError('Invalid --slippage', err)
        return
      }

      try {
        assertLiquidityAmounts(opts.amount0, opts.amount1)
      } catch (err) {
        outputError('Invalid liquidity amounts', err)
        return
      }

      await writeAction({
        title: 'V4 Mint Position',
        summary: {
          Token0: `${token0Display} (${token0})`,
          Token1: `${token1Display} (${token1})`,
          Fee: opts.fee || `${DEFAULT_V4_FEE} (default)`,
          'Tick Range':
            tickLower !== undefined && tickUpper !== undefined
              ? `[${tickLower}, ${tickUpper}]`
              : '(auto)',
          Amount0: opts.amount0 ?? '(not provided)',
          Amount1: opts.amount1 ?? '(not provided)',
          Slippage: slippage?.display ?? '(default)',
          Recipient: opts.recipient ?? '(active wallet)',
          'Create Pool': opts.createPool ? 'Yes' : 'No',
          Network: network,
        },
        confirmMsg: 'Mint V4 position?',
        spinnerLabel: 'Minting V4 position...',
        errorLabel: 'V4 mint failed',
        execute: async (sdk) => {
          const ticks = await resolveV4MintTicks(sdk, {
            token0,
            token1,
            fee,
            tickLower,
            tickUpper,
            sqrtPriceX96: opts.sqrtPrice,
            createPool: opts.createPool,
          })
          return sdk.liquidity.v4.add
            .execute({
              token0,
              token1,
              fee,
              ...ticks,
              amount0: opts.amount0,
              amount1: opts.amount1,
              slippage: slippage?.sdk,
              includeComputedMetadata: true,
              transactionMode: 'multicall',
              recipient: opts.recipient,
              sweepRecipient: opts.recipient,
              ttlSeconds: 1800,
              deadline: opts.deadline,
              sqrtPriceX96: opts.sqrtPrice,
            })
            .then((result) => {
              const mapped = mapTx(result) as Record<string, unknown>
              return tickLower === undefined || tickUpper === undefined
                ? { ...mapped, computedTicks: ticks }
                : mapped
            })
        },
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
    .option('--token0 <tokenOrAddress>', 'Expected token0; provide together with --token1')
    .option('--token1 <tokenOrAddress>', 'Expected token1; provide together with --token0')
    .option('--fee <n>', 'Expected pool fee tier (validated against the position)')
    .option('--amount0 <raw>', 'Additional amount of token0')
    .option('--amount1 <raw>', 'Additional amount of token1')
    .option('--slippage <n>', 'Slippage tolerance as decimal')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .action(async (opts) => {
      const network = getNetwork()

      let expectedPair: OptionalV4Pair, expectedFee: number | undefined
      try {
        expectedPair = resolveOptionalV4Pair(opts.token0, opts.token1, network)
        expectedFee = parseOptionalV4Fee(opts.fee)
      } catch (err) {
        outputError('Invalid V4 position assertions', err)
        return
      }

      let slippage: ParsedDecimalSlippage | undefined
      try {
        slippage = parseOptionalSlippage(opts.slippage)
      } catch (err) {
        outputError('Invalid --slippage', err)
        return
      }

      try {
        assertLiquidityAmounts(opts.amount0, opts.amount1)
      } catch (err) {
        outputError('Invalid liquidity amounts', err)
        return
      }

      const summary: Record<string, unknown> = {
        'Token ID': opts.tokenId,
        Token0: expectedPair.token0 ?? '(from tokenId)',
        Token1: expectedPair.token1 ?? '(from tokenId)',
        Fee: expectedFee ?? '(from tokenId)',
        Amount0: opts.amount0 ?? '(not provided)',
        Amount1: opts.amount1 ?? '(not provided)',
        Slippage: slippage?.display ?? '(default)',
        Network: network,
      }
      const loadPosition = createV4PositionLoader(opts.tokenId, expectedPair, expectedFee)

      await writeAction({
        title: 'V4 Increase Liquidity',
        summary,
        prepareLabel: 'Loading V4 position...',
        prepare: async (sdk) => {
          const prepared = await loadPosition(sdk)
          const [amount0, amount1] = orderV4PositionValues(
            prepared.reversed,
            opts.amount0,
            opts.amount1,
          )
          Object.assign(summary, v4PositionTokenSummary(prepared.poolKey, network), {
            Amount0: amount0 ?? '(not provided)',
            Amount1: amount1 ?? '(not provided)',
          })
        },
        confirmMsg: 'Increase V4 liquidity?',
        spinnerLabel: 'Increasing V4 liquidity...',
        errorLabel: 'V4 increase liquidity failed',
        execute: async (sdk) => {
          const prepared = await loadPosition(sdk)
          const [amount0, amount1] = orderV4PositionValues(
            prepared.reversed,
            opts.amount0,
            opts.amount1,
          )
          return sdk.liquidity.v4.increase
            .execute({
              tokenId: opts.tokenId,
              amount0,
              amount1,
              slippage: slippage?.sdk,
              includeComputedMetadata: true,
              transactionMode: 'multicall',
              ttlSeconds: 1800,
              deadline: opts.deadline,
            })
            .then(mapTx)
        },
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
    .option('--token0 <tokenOrAddress>', 'Expected token0; provide together with --token1')
    .option('--token1 <tokenOrAddress>', 'Expected token1; provide together with --token0')
    .option('--fee <n>', 'Expected pool fee tier (validated against the position)')
    .option('--min0 <raw>', 'Minimum amount of token0 to receive')
    .option('--min1 <raw>', 'Minimum amount of token1 to receive')
    .option('--slippage <n>', 'Slippage tolerance as decimal')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .action(async (opts) => {
      const network = getNetwork()

      let expectedPair: OptionalV4Pair, expectedFee: number | undefined
      try {
        expectedPair = resolveOptionalV4Pair(opts.token0, opts.token1, network)
        expectedFee = parseOptionalV4Fee(opts.fee)
      } catch (err) {
        outputError('Invalid V4 position assertions', err)
        return
      }

      let slippage: ParsedDecimalSlippage | undefined
      try {
        slippage = parseOptionalSlippage(opts.slippage)
      } catch (err) {
        outputError('Invalid --slippage', err)
        return
      }

      const summary: Record<string, unknown> = {
        'Token ID': opts.tokenId,
        Liquidity: opts.liquidity,
        Token0: expectedPair.token0 ?? '(from tokenId)',
        Token1: expectedPair.token1 ?? '(from tokenId)',
        Fee: expectedFee ?? '(from tokenId)',
        Min0: opts.min0 ?? '(SDK derived)',
        Min1: opts.min1 ?? '(SDK derived)',
        Slippage: slippage?.display ?? '(default)',
        Network: network,
      }
      const loadPosition = createV4PositionLoader(opts.tokenId, expectedPair, expectedFee)

      await writeAction({
        title: 'V4 Decrease Liquidity',
        summary,
        prepareLabel: 'Loading V4 position...',
        prepare: async (sdk) => {
          const prepared = await loadPosition(sdk)
          const [min0, min1] = orderV4PositionValues(prepared.reversed, opts.min0, opts.min1)
          Object.assign(summary, v4PositionTokenSummary(prepared.poolKey, network), {
            Min0: min0 ?? '(SDK derived)',
            Min1: min1 ?? '(SDK derived)',
          })
        },
        confirmMsg: 'Decrease V4 liquidity?',
        spinnerLabel: 'Decreasing V4 liquidity...',
        errorLabel: 'V4 decrease liquidity failed',
        execute: async (sdk) => {
          const prepared = await loadPosition(sdk)
          const [amount0Min, amount1Min] = orderV4PositionValues(
            prepared.reversed,
            opts.min0,
            opts.min1,
          )
          return sdk.positions.v4.remove
            .execute({
              tokenId: opts.tokenId,
              liquidity: opts.liquidity,
              amount0Min,
              amount1Min,
              slippage: slippage?.sdk,
              includeComputedMetadata: true,
              transactionMode: 'multicall',
              settlementMode: 'close-currency',
              ttlSeconds: 1800,
              deadline: opts.deadline,
            })
            .then(mapTx)
        },
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
    .option('--token0 <tokenOrAddress>', 'Expected token0; provide together with --token1')
    .option('--token1 <tokenOrAddress>', 'Expected token1; provide together with --token0')
    .option('--fee <n>', 'Expected pool fee tier (validated against the position)')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .action(async (opts) => {
      const network = getNetwork()

      let expectedPair: OptionalV4Pair, expectedFee: number | undefined
      try {
        expectedPair = resolveOptionalV4Pair(opts.token0, opts.token1, network)
        expectedFee = parseOptionalV4Fee(opts.fee)
      } catch (err) {
        outputError('Invalid V4 position assertions', err)
        return
      }

      const summary: Record<string, unknown> = {
        'Token ID': opts.tokenId,
        Token0: expectedPair.token0 ?? '(from tokenId)',
        Token1: expectedPair.token1 ?? '(from tokenId)',
        Fee: expectedFee ?? '(from tokenId)',
        Network: network,
      }
      const loadPosition = createV4PositionLoader(opts.tokenId, expectedPair, expectedFee)

      await writeAction({
        title: 'V4 Collect Fees',
        summary,
        prepareLabel: 'Loading V4 position...',
        prepare: async (sdk) => {
          const prepared = await loadPosition(sdk)
          Object.assign(summary, v4PositionTokenSummary(prepared.poolKey, network))
        },
        confirmMsg: 'Collect V4 fees?',
        spinnerLabel: 'Collecting V4 fees...',
        errorLabel: 'V4 collect failed',
        execute: async (sdk) => {
          await loadPosition(sdk)
          return sdk.positions.v4.collect
            .execute({
              tokenId: opts.tokenId,
              transactionMode: 'multicall',
              settlementMode: 'close-currency',
              ttlSeconds: 1800,
              deadline: opts.deadline,
            })
            .then(mapTx)
        },
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
          const fee = result.poolKey?.fee
          return {
            currency0: result.poolKey?.currency0,
            currency1: result.poolKey?.currency1,
            fee: fee === undefined ? undefined : String(fee),
            tickSpacing:
              result.poolKey?.tickSpacing ??
              (Number.isFinite(Number(fee)) ? v4TickSpacingForFee(Number(fee)) : undefined),
            tickLower: result.tickLower,
            tickUpper: result.tickUpper,
            liquidity: result.liquidity,
          }
        },
      })
    })
}
