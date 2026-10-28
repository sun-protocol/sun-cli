import { Fraction, type Network } from '@sun-protocol/sun-sdk-core'
import { nearestUsableTick, TickMath } from '@sun-protocol/sun-sdk-sunswap-v3'
import {
  computeV4PoolId,
  createV4PoolKey,
  encodeV4PoolParameters,
} from '@sun-protocol/sun-sdk-sunswap-v4'
import type { CliSunSDK } from './types'

const DEFAULT_TICK_RANGE_FACTOR = 100

const TICK_SPACING_BY_FEE: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
}

export function v4TickSpacingForFee(fee: number): number {
  return TICK_SPACING_BY_FEE[fee] ?? 10
}

export function v4PoolKeyFromCli(network: Network, token0: string, token1: string, fee: number) {
  return createV4PoolKey({
    network,
    currencyA: token0,
    currencyB: token1,
    fee,
    parameters: encodeV4PoolParameters({ tickSpacing: v4TickSpacingForFee(fee) }),
  })
}

interface V4MintTickInput {
  token0: string
  token1: string
  fee: number
  tickLower?: number
  tickUpper?: number
  sqrtPriceX96?: string
  createPool?: boolean
}

/** Resolve omitted V4 mint ticks from the pool state, as SunKit did. */
export async function resolveV4MintTicks(sdk: CliSunSDK, input: V4MintTickInput) {
  const tickSpacing = v4TickSpacingForFee(input.fee)
  if (input.tickLower !== undefined && input.tickUpper !== undefined) {
    return {
      tickSpacing,
      tickLower: input.tickLower,
      tickUpper: input.tickUpper,
      createPool: input.createPool,
    }
  }

  const poolKey = createV4PoolKey({
    network: sdk.network,
    currencyA: input.token0,
    currencyB: input.token1,
    fee: input.fee,
    parameters: encodeV4PoolParameters({ tickSpacing }),
  })

  let currentTick: number
  let createPool = input.createPool
  try {
    const pool = await sdk.liquidity.v4.read({ poolId: computeV4PoolId(poolKey) })
    if (BigInt(pool.sqrtPriceX96) === 0n) throw new Error('V4 pool is not initialized')
    currentTick = pool.tick
  } catch (cause) {
    if (input.sqrtPriceX96 === undefined) {
      throw Object.assign(
        new Error(
          `V4 pool not found for ${input.token0}/${input.token1} fee=${input.fee}. Provide sqrtPriceX96 to create a new pool.`,
        ),
        { code: 'POOL_NOT_FOUND', cause },
      )
    }
    currentTick = TickMath.getTickAtSqrtRatio(new Fraction(input.sqrtPriceX96).quotient)
    createPool = true
  }

  return {
    tickSpacing,
    tickLower:
      input.tickLower ??
      nearestUsableTick(currentTick - DEFAULT_TICK_RANGE_FACTOR * tickSpacing, tickSpacing),
    tickUpper:
      input.tickUpper ??
      nearestUsableTick(currentTick + DEFAULT_TICK_RANGE_FACTOR * tickSpacing, tickSpacing),
    createPool,
  }
}
