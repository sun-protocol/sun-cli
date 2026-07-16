import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { writeAction, readAction } from '../lib/command'
import { withSpinner } from '../lib/output'
import { resolveTokenAddress, getSymbolOrAddress } from '../lib/tokens'
import { getContractAddress } from '@sun-sdk/chains'
import { createApproveAction, type Network } from '@sun-sdk/core'
import {
  buildV2AddLiquidityAction,
  buildV2AddLiquidityEthAction,
  buildV2RemoveLiquidityAction,
  buildV2RemoveLiquidityEthAction,
} from '@sun-sdk/sunswap-v2'
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

const SUNSWAP_V3_FACTORY_MIN_ABI = [
  {
    constant: true,
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    type: 'function',
  },
]

const SUNSWAP_V3_POOL_MIN_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'liquidity',
    outputs: [{ name: '', type: 'uint128' }],
    type: 'function',
  },
]

const V3_TICK_SPACING_BY_FEE: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
}

const NILE_UNISWAP_V2_ROUTER_02 = 'TYMjxCXfqLpMWW1QToP6hbcjpion7EE25p'
const V4_EMPTY_PARAMETERS = `0x${'0'.repeat(64)}`
const CONSTANT_CALL_OWNER = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

function assertSdkNetwork(network: string): Network {
  if (network === 'mainnet' || network === 'nile') return network
  throw new Error(`Unsupported SDK network: ${network}`)
}

function getV2Router(network: string, override?: string): string {
  if (override) return override
  if (network === 'nile') return NILE_UNISWAP_V2_ROUTER_02
  return getContractAddress(assertSdkNetwork(network), 'sunswapV2Router')
}

function getV3PositionManager(network: string, override?: string): string {
  if (override) return override
  return getContractAddress(assertSdkNetwork(network), 'sunswapV3PositionManager')
}

function getV2Factory(network: string): string {
  return getContractAddress(assertSdkNetwork(network), 'sunswapV2Factory')
}

function getV3Factory(network: string): string {
  return getContractAddress(assertSdkNetwork(network), 'sunswapV3Factory')
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

function defaultDeadline(): string {
  return Math.floor(Date.now() / 1000 + 20 * 60).toString()
}

function tokenRef(address: string) {
  return { address } as never
}

function createV4PoolKey(input: {
  network: string
  token0: string
  token1: string
  fee?: string
  hooks?: string
  parameters?: string
}) {
  return {
    network: assertSdkNetwork(input.network),
    currency0: input.token0,
    currency1: input.token1,
    hooks: input.hooks || TRX_ADDRESS,
    fee: input.fee ? parseInt(input.fee) : 3000,
    parameters: input.parameters || V4_EMPTY_PARAMETERS,
  } as never
}

interface PairReserves {
  reserveA: string
  reserveB: string
  pairExists: boolean
  pairAddress?: string
}

interface V3PoolState {
  sqrtRatioX96: string
  liquidity: string
  tickCurrent: number
  tickSpacing: number
  poolAddress: string
}

function wordToAddress(tronWeb: ReturnType<typeof createReadonlyTronWeb>, word: string): string {
  return tronWeb.address.fromHex(`41${word.slice(-40)}`)
}

async function triggerConstant(
  tronWeb: ReturnType<typeof createReadonlyTronWeb>,
  target: string,
  functionSelector: string,
  parameters: { type: string; value: unknown }[] = [],
): Promise<string> {
  const result = await tronWeb.transactionBuilder.triggerConstantContract(
    target,
    functionSelector,
    {},
    parameters as never,
    CONSTANT_CALL_OWNER,
  )
  const raw = (result as { constant_result?: string[] }).constant_result?.[0]
  if (!raw) throw new Error(`Empty constant result for ${functionSelector}`)
  return raw
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

  const pairHex = await triggerConstant(tronWeb, factoryAddress, 'getPair(address,address)', [
    { type: 'address', value: lookupA },
    { type: 'address', value: lookupB },
  ])
  const pairBase58 = wordToAddress(tronWeb, pairHex)
  const zeroBase58 = tronWeb.address.fromHex('410000000000000000000000000000000000000000')

  if (!pairBase58 || pairBase58 === zeroBase58) {
    return { reserveA: '0', reserveB: '0', pairExists: false }
  }

  const reservesHex = await triggerConstant(tronWeb, pairBase58, 'getReserves()')
  const token0Hex = await triggerConstant(tronWeb, pairBase58, 'token0()')

  const token0 = wordToAddress(tronWeb, token0Hex)
  const reserve0 = BigInt(`0x${reservesHex.slice(0, 64)}`).toString()
  const reserve1 = BigInt(`0x${reservesHex.slice(64, 128)}`).toString()

  const reserveA = token0 === lookupA ? reserve0 : reserve1
  const reserveB = token0 === lookupB ? reserve0 : reserve1

  return { reserveA, reserveB, pairExists: true, pairAddress: pairBase58 }
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

function readContractString(result: any, key: string, index: number): string {
  const value = result?.[key] ?? result?.[index]
  if (value === undefined || value === null) {
    throw new Error(`Malformed contract result: missing ${key}`)
  }
  return value.toString()
}

async function getV3PoolState(
  network: string,
  tokenA: string,
  tokenB: string,
  fee: number,
): Promise<V3PoolState> {
  const tronWeb = createReadonlyTronWeb({ network })
  const factoryAddress = getV3Factory(network)
  const lookupA = getLookupToken(tokenA, network)
  const lookupB = getLookupToken(tokenB, network)

  const poolHex = await triggerConstant(
    tronWeb,
    factoryAddress,
    'getPool(address,address,uint24)',
    [
      { type: 'address', value: lookupA },
      { type: 'address', value: lookupB },
      { type: 'uint24', value: fee },
    ],
  )
  const poolAddress = wordToAddress(tronWeb, poolHex)
  const zeroBase58 = tronWeb.address.fromHex('410000000000000000000000000000000000000000')

  if (!poolAddress || poolAddress === zeroBase58) {
    throw new Error(`V3 pool does not exist for ${lookupA}/${lookupB} fee ${fee}`)
  }

  const slot0Hex = await triggerConstant(tronWeb, poolAddress, 'slot0()')
  const liquidityHex = await triggerConstant(tronWeb, poolAddress, 'liquidity()')
  const tickSpacing = V3_TICK_SPACING_BY_FEE[fee]

  if (!tickSpacing) {
    throw new Error(`Unsupported V3 fee tier: ${fee}`)
  }

  return {
    sqrtRatioX96: BigInt(`0x${slot0Hex.slice(0, 64)}`).toString(),
    tickCurrent: Number(BigInt.asIntN(24, BigInt(`0x${slot0Hex.slice(64, 128)}`))),
    liquidity: BigInt(`0x${liquidityHex}`).toString(),
    tickSpacing,
    poolAddress,
  }
}

function defaultV3TickRange(
  tickCurrent: number,
  tickSpacing: number,
  amount0?: string,
  amount1?: string,
): {
  tickLower: number
  tickUpper: number
} {
  const base = Math.floor(tickCurrent / tickSpacing) * tickSpacing
  const hasAmount0 = amount0 !== undefined && BigInt(amount0) > 0n
  const hasAmount1 = amount1 !== undefined && BigInt(amount1) > 0n

  if (hasAmount0 && !hasAmount1) {
    return {
      tickLower: base + tickSpacing,
      tickUpper: base + tickSpacing * 101,
    }
  }

  if (!hasAmount0 && hasAmount1) {
    return {
      tickLower: base - tickSpacing * 101,
      tickUpper: base - tickSpacing,
    }
  }

  return {
    tickLower: base - tickSpacing * 10,
    tickUpper: base + tickSpacing * 10,
  }
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
        execute: async (sdk) => {
          const recipient = opts.to || (await sdk.runtime.getAddress())
          if (!recipient) {
            throw new Error(
              'Wallet required. Set agent-wallet credentials before running this command.',
            )
          }
          const deadline = opts.deadline || defaultDeadline()
          const txids: string[] = []

          if (tokenA === TRX_ADDRESS || tokenB === TRX_ADDRESS) {
            const token = tokenA === TRX_ADDRESS ? tokenB : tokenA
            const amountTokenDesired = tokenA === TRX_ADDRESS ? amountB : amountA
            const amountEthDesired = tokenA === TRX_ADDRESS ? amountA : amountB
            const amountTokenMin = tokenA === TRX_ADDRESS ? opts.minB || '0' : opts.minA || '0'
            const amountEthMin = tokenA === TRX_ADDRESS ? opts.minA || '0' : opts.minB || '0'

            const approval = await sdk.runtime.sendAction(
              createApproveAction({
                id: `v2-add-approve-${Date.now()}`,
                target: token as never,
                spender: router,
                amount: amountTokenDesired,
              }),
            )
            txids.push(approval.txid)

            const result = await sdk.runtime.sendAction(
              buildV2AddLiquidityEthAction({
                network: assertSdkNetwork(network),
                router: router as never,
                token: tokenRef(token),
                amountTokenDesired,
                amountEthDesired,
                amountTokenMin,
                amountEthMin,
                recipient,
                deadline,
              }),
            )
            txids.push(result.txid)
            return { txid: result.txid, txids, raw: result }
          }

          const [approvalA, approvalB] = await Promise.all([
            sdk.runtime.sendAction(
              createApproveAction({
                id: `v2-add-approve-a-${Date.now()}`,
                target: tokenA as never,
                spender: router,
                amount: amountA,
              }),
            ),
            sdk.runtime.sendAction(
              createApproveAction({
                id: `v2-add-approve-b-${Date.now()}`,
                target: tokenB as never,
                spender: router,
                amount: amountB,
              }),
            ),
          ])
          txids.push(approvalA.txid, approvalB.txid)

          const result = await sdk.runtime.sendAction(
            buildV2AddLiquidityAction({
              network: assertSdkNetwork(network),
              router: router as never,
              tokenA: tokenRef(tokenA),
              tokenB: tokenRef(tokenB),
              amountADesired: amountA,
              amountBDesired: amountB,
              amountAMin: opts.minA || '0',
              amountBMin: opts.minB || '0',
              recipient,
              deadline,
            }),
          )
          txids.push(result.txid)
          return { txid: result.txid, txids, raw: result }
        },
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
        execute: async (sdk) => {
          const recipient = opts.to || (await sdk.runtime.getAddress())
          if (!recipient) {
            throw new Error(
              'Wallet required. Set agent-wallet credentials before running this command.',
            )
          }
          const pair = await getV2PairReserves(network, tokenA, tokenB)
          if (!pair.pairAddress) throw new Error('V2 pair does not exist')
          const deadline = opts.deadline || defaultDeadline()
          const txids: string[] = []

          const approval = await sdk.runtime.sendAction(
            createApproveAction({
              id: `v2-remove-approve-${Date.now()}`,
              target: pair.pairAddress as never,
              spender: router,
              amount: opts.liquidity,
            }),
          )
          txids.push(approval.txid)

          if (tokenA === TRX_ADDRESS || tokenB === TRX_ADDRESS) {
            const token = tokenA === TRX_ADDRESS ? tokenB : tokenA
            const amountTokenMin = tokenA === TRX_ADDRESS ? opts.minB || '0' : opts.minA || '0'
            const amountEthMin = tokenA === TRX_ADDRESS ? opts.minA || '0' : opts.minB || '0'
            const result = await sdk.runtime.sendAction(
              buildV2RemoveLiquidityEthAction({
                network: assertSdkNetwork(network),
                router: router as never,
                token: tokenRef(token),
                liquidity: opts.liquidity,
                amountTokenMin,
                amountEthMin,
                recipient,
                deadline,
              }),
            )
            txids.push(result.txid)
            return { txid: result.txid, txids, raw: result }
          }

          const result = await sdk.runtime.sendAction(
            buildV2RemoveLiquidityAction({
              network: assertSdkNetwork(network),
              router: router as never,
              tokenA: tokenRef(tokenA),
              tokenB: tokenRef(tokenB),
              liquidity: opts.liquidity,
              amountAMin: opts.minA || '0',
              amountBMin: opts.minB || '0',
              recipient,
              deadline,
            }),
          )
          txids.push(result.txid)
          return { txid: result.txid, txids, raw: result }
        },
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
    .option('--slippage <n>', 'Slippage tolerance as decimal (e.g. 0.01 for 1%)')
    .option('--recipient <address>', 'NFT recipient')
    .option('--deadline <timestamp>', 'Unix timestamp deadline')
    .option('--sqrt-ratio-x96 <raw>', 'Pool sqrtRatioX96 override')
    .option('--pool-liquidity <raw>', 'Pool liquidity override')
    .option('--tick-current <n>', 'Pool current tick override')
    .option('--tick-spacing <n>', 'Pool tick spacing override')
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

      const token0 = token0Input
      const token1 = token1Input
      const poolToken0 = getLookupToken(token0Input, network)
      const poolToken1 = getLookupToken(token1Input, network)

      if (!opts.amount0 && !opts.amount1) {
        console.error('Error: At least one of --amount0 or --amount1 is required')
        process.exitCode = 1
        return
      }

      const token0Display = getSymbolOrAddress(token0Input, network)
      const token1Display = getSymbolOrAddress(token1Input, network)
      const token0Note = poolToken0 !== token0Input ? ` → pool WTRX` : ''
      const token1Note = poolToken1 !== token1Input ? ` → pool WTRX` : ''

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
          Slippage: opts.slippage
            ? `${(parseFloat(opts.slippage) * 100).toFixed(2)}%`
            : '(default)',
          Network: network,
        },
        confirmMsg: 'Mint V3 position?',
        spinnerLabel: 'Minting V3 position...',
        errorLabel: 'V3 mint failed',
        execute: async (sdk) => {
          const fee = opts.fee ? parseInt(opts.fee) : 3000
          const poolState =
            opts.sqrtRatioX96 && opts.poolLiquidity && opts.tickCurrent
              ? {
                  sqrtRatioX96: opts.sqrtRatioX96,
                  liquidity: opts.poolLiquidity,
                  tickCurrent: parseInt(opts.tickCurrent),
                  tickSpacing: opts.tickSpacing
                    ? parseInt(opts.tickSpacing)
                    : V3_TICK_SPACING_BY_FEE[fee],
                  poolAddress: '(manual)',
                }
              : await getV3PoolState(network, token0, token1, fee)

          const ticks =
            opts.tickLower && opts.tickUpper
              ? { tickLower: parseInt(opts.tickLower), tickUpper: parseInt(opts.tickUpper) }
              : defaultV3TickRange(
                  poolState.tickCurrent,
                  poolState.tickSpacing,
                  opts.amount0,
                  opts.amount1,
                )

          return sdk.liquidity.v3.add
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenA: token0,
              tokenB: token1,
              fee,
              pool: {
                sqrtRatioX96: poolState.sqrtRatioX96,
                liquidity: poolState.liquidity,
                tickCurrent: poolState.tickCurrent,
                tickSpacing: poolState.tickSpacing,
              },
              tickLower: ticks.tickLower,
              tickUpper: ticks.tickUpper,
              amount0: opts.amount0 || '0',
              amount1: opts.amount1 || '0',
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              slippage: percentFromDecimal(opts.slippage),
              recipient: opts.recipient,
              deadline: opts.deadline,
            })
            .then(mapTx)
        },
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
    .option('--slippage <n>', 'Slippage tolerance as decimal (e.g. 0.01 for 1%)')
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
          Slippage: opts.slippage
            ? `${(parseFloat(opts.slippage) * 100).toFixed(2)}%`
            : '(default)',
          Network: network,
        },
        confirmMsg: 'Increase V3 liquidity?',
        spinnerLabel: 'Increasing V3 liquidity...',
        errorLabel: 'V3 increase liquidity failed',
        execute: async (sdk) => {
          const snapshot = await sdk.positions.v3.read({ tokenId: opts.tokenId })
          const poolState = await getV3PoolState(
            network,
            snapshot.token0,
            snapshot.token1,
            snapshot.fee,
          )
          return sdk.liquidity.v3.increase
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenId: opts.tokenId,
              tokenA: snapshot.token0,
              tokenB: snapshot.token1,
              fee: snapshot.fee,
              pool: {
                sqrtRatioX96: poolState.sqrtRatioX96,
                liquidity: poolState.liquidity,
                tickCurrent: poolState.tickCurrent,
                tickSpacing: poolState.tickSpacing,
              },
              tickLower: snapshot.tickLower,
              tickUpper: snapshot.tickUpper,
              amount0: opts.amount0 || '0',
              amount1: opts.amount1 || '0',
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              slippage: percentFromDecimal(opts.slippage),
              deadline: opts.deadline,
            } as any)
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
    .command('v3:decrease')
    .description('Decrease liquidity of an existing V3 position')
    .option('--pm <address>', 'V3 NonfungiblePositionManager address (auto-detected by network)')
    .requiredOption('--token-id <id>', 'Position NFT token ID')
    .requiredOption('--liquidity <raw>', 'Amount of liquidity to remove')
    .option('--min0 <raw>', 'Minimum amount of token0 to receive')
    .option('--min1 <raw>', 'Minimum amount of token1 to receive')
    .option('--slippage <n>', 'Slippage tolerance as decimal (e.g. 0.01 for 1%)')
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
          Slippage: opts.slippage
            ? `${(parseFloat(opts.slippage) * 100).toFixed(2)}%`
            : '(default)',
          Network: network,
        },
        confirmMsg: 'Decrease V3 liquidity?',
        spinnerLabel: 'Decreasing V3 liquidity...',
        errorLabel: 'V3 decrease liquidity failed',
        execute: async (sdk) => {
          const snapshot = await sdk.positions.v3.read({ tokenId: opts.tokenId })
          const poolState = await getV3PoolState(
            network,
            snapshot.token0,
            snapshot.token1,
            snapshot.fee,
          )
          return sdk.positions.v3.remove
            .execute({
              contracts: withContracts({ sunswapV3PositionManager: pm }),
              tokenId: opts.tokenId,
              liquidity: opts.liquidity,
              pool: {
                sqrtRatioX96: poolState.sqrtRatioX96,
                liquidity: poolState.liquidity,
                tickCurrent: poolState.tickCurrent,
                tickSpacing: poolState.tickSpacing,
              },
              amount0Min: opts.min0,
              amount1Min: opts.min1,
              slippage: percentFromDecimal(opts.slippage),
              deadline: opts.deadline,
            } as any)
            .then(mapTx)
        },
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
    .option('--hooks <address>', 'V4 hooks address')
    .option('--parameters <hex>', 'V4 pool parameters bytes32')
    .option('--tick-lower <n>', 'Lower tick (auto-computed if omitted)')
    .option('--tick-upper <n>', 'Upper tick (auto-computed if omitted)')
    .option('--liquidity <raw>', 'Liquidity amount to mint')
    .option('--amount0 <raw>', 'Desired amount of token0')
    .option('--amount1 <raw>', 'Desired amount of token1')
    .option('--amount0-max <raw>', 'Maximum amount of token0')
    .option('--amount1-max <raw>', 'Maximum amount of token1')
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
          Fee: opts.fee || '3000 (default)',
          Hooks: opts.hooks || TRX_ADDRESS,
          'Tick Range':
            opts.tickLower && opts.tickUpper
              ? `[${opts.tickLower}, ${opts.tickUpper}]`
              : '[-120, 120]',
          Liquidity: opts.liquidity || '(required for write)',
          'Amount0 Max': opts.amount0Max || opts.amount0 || '0',
          'Amount1 Max': opts.amount1Max || opts.amount1 || '0',
          Slippage: opts.slippage
            ? `${(parseFloat(opts.slippage) * 100).toFixed(2)}%`
            : '(default)',
          'Create Pool': opts.createPool ? 'Yes' : 'No',
          Network: network,
        },
        confirmMsg: 'Mint V4 position?',
        spinnerLabel: 'Minting V4 position...',
        errorLabel: 'V4 mint failed',
        execute: (sdk) => {
          if (!opts.liquidity) {
            throw new Error('V4 mint requires --liquidity for write execution')
          }
          return sdk.liquidity.v4.add
            .execute({
              poolKey: createV4PoolKey({
                network,
                token0,
                token1,
                fee: opts.fee,
                hooks: opts.hooks,
                parameters: opts.parameters,
              }),
              tickLower: opts.tickLower ? parseInt(opts.tickLower) : -120,
              tickUpper: opts.tickUpper ? parseInt(opts.tickUpper) : 120,
              liquidity: opts.liquidity,
              amount0Max: opts.amount0Max || opts.amount0 || '0',
              amount1Max: opts.amount1Max || opts.amount1 || '0',
              recipient: opts.recipient,
              deadline: opts.deadline,
            })
            .then(mapTx)
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
    .requiredOption('--token0 <tokenOrAddress>', 'Token0 (symbol like TRX/USDT or address)')
    .requiredOption('--token1 <tokenOrAddress>', 'Token1 (symbol like TRX/USDT or address)')
    .option('--fee <n>', 'Pool fee tier')
    .option('--hooks <address>', 'V4 hooks address')
    .option('--parameters <hex>', 'V4 pool parameters bytes32')
    .option('--liquidity <raw>', 'Liquidity amount to add')
    .option('--amount0 <raw>', 'Additional amount of token0')
    .option('--amount1 <raw>', 'Additional amount of token1')
    .option('--amount0-max <raw>', 'Maximum amount of token0')
    .option('--amount1-max <raw>', 'Maximum amount of token1')
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
          Fee: opts.fee || '3000 (default)',
          Liquidity: opts.liquidity || '(required for write)',
          'Amount0 Max': opts.amount0Max || opts.amount0 || '0',
          'Amount1 Max': opts.amount1Max || opts.amount1 || '0',
          Network: network,
        },
        confirmMsg: 'Increase V4 liquidity?',
        spinnerLabel: 'Increasing V4 liquidity...',
        errorLabel: 'V4 increase liquidity failed',
        execute: (sdk) => {
          if (!opts.liquidity) {
            throw new Error('V4 increase requires --liquidity for write execution')
          }
          return sdk.liquidity.v4.increase
            .execute({
              poolKey: createV4PoolKey({
                network,
                token0,
                token1,
                fee: opts.fee,
                hooks: opts.hooks,
                parameters: opts.parameters,
              }),
              tokenId: opts.tokenId,
              liquidity: opts.liquidity,
              amount0Max: opts.amount0Max || opts.amount0 || '0',
              amount1Max: opts.amount1Max || opts.amount1 || '0',
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
    .requiredOption('--token0 <tokenOrAddress>', 'Token0 (symbol like TRX/USDT or address)')
    .requiredOption('--token1 <tokenOrAddress>', 'Token1 (symbol like TRX/USDT or address)')
    .option('--fee <n>', 'Pool fee tier')
    .option('--hooks <address>', 'V4 hooks address')
    .option('--parameters <hex>', 'V4 pool parameters bytes32')
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
          Fee: opts.fee || '3000 (default)',
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
              poolKey: createV4PoolKey({
                network,
                token0,
                token1,
                fee: opts.fee,
                hooks: opts.hooks,
                parameters: opts.parameters,
              }),
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
    .option('--hooks <address>', 'V4 hooks address')
    .option('--parameters <hex>', 'V4 pool parameters bytes32')
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
                  ? createV4PoolKey({
                      network,
                      token0,
                      token1,
                      fee: opts.fee,
                      hooks: opts.hooks,
                      parameters: opts.parameters,
                    })
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
