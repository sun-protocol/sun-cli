import { TickMath } from '@sun-protocol/sun-sdk-sunswap-v3'
import {
  computeV4PoolId,
  createV4PoolKey,
  encodeV4PoolParameters,
} from '@sun-protocol/sun-sdk-sunswap-v4'
import {
  resolveV4MintTicks,
  v4PoolKeyFromCli,
  v4TickSpacingForFee,
} from '../../../src/lib/sdk/liquidity-v4'
import type { CliSunSDK } from '../../../src/lib/sdk/types'

const token0 = 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a'
const token1 = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'
const input = { token0, token1, fee: 500 }

function mockSdk(read: jest.Mock): CliSunSDK {
  return { network: 'nile', liquidity: { v4: { read } } } as unknown as CliSunSDK
}

describe('V4 mint automatic ticks', () => {
  it.each([
    [500, 10, 12347, 11350, 13350],
    [500, 10, -12347, -13350, -11350],
    [3000, 60, 12000, 6000, 18000],
    [100, 1, 0, -100, 100],
    [10000, 200, 4000, -16000, 24000],
    [2500, 10, 12347, 11350, 13350],
  ])(
    'derives the legacy 100-spacing range for fee %i at tick %i',
    async (fee, tickSpacing, tick, tickLower, tickUpper) => {
      const read = jest.fn().mockResolvedValue({ sqrtPriceX96: '1', tick })
      const result = await resolveV4MintTicks(mockSdk(read), { ...input, fee })

      expect(result).toEqual({ tickSpacing, tickLower, tickUpper, createPool: undefined })
      expect(read).toHaveBeenCalledWith({
        poolId: computeV4PoolId(
          createV4PoolKey({
            network: 'nile',
            currencyA: token0,
            currencyB: token1,
            fee,
            parameters: encodeV4PoolParameters({ tickSpacing }),
          }),
        ),
      })
    },
  )

  it('derives only the omitted bound and preserves an explicit zero', async () => {
    const read = jest.fn().mockResolvedValue({ sqrtPriceX96: '1', tick: 1500 })
    expect(await resolveV4MintTicks(mockSdk(read), { ...input, tickLower: 0 })).toMatchObject({
      tickLower: 0,
      tickUpper: 2500,
    })
    expect(await resolveV4MintTicks(mockSdk(read), { ...input, tickUpper: 3000 })).toMatchObject({
      tickLower: 500,
      tickUpper: 3000,
    })
  })

  it('uses the existing pool tick even when an initial price is also supplied', async () => {
    const read = jest.fn().mockResolvedValue({ sqrtPriceX96: '1', tick: 1500 })
    expect(
      await resolveV4MintTicks(mockSdk(read), {
        ...input,
        sqrtPriceX96: TickMath.getSqrtRatioAtTick(0).toString(),
        createPool: true,
      }),
    ).toMatchObject({ tickLower: 500, tickUpper: 2500, createPool: true })
  })

  it.each(['missing', 'uninitialized'])('uses the initial price for a %s pool', async (state) => {
    const read =
      state === 'missing'
        ? jest.fn().mockRejectedValue(new Error('Pool unavailable'))
        : jest.fn().mockResolvedValue({ sqrtPriceX96: '0', tick: 0 })
    const result = await resolveV4MintTicks(mockSdk(read), {
      ...input,
      sqrtPriceX96: TickMath.getSqrtRatioAtTick(1200).toString(),
    })
    expect(result).toEqual({ tickSpacing: 10, tickLower: 200, tickUpper: 2200, createPool: true })
  })

  it('fails if the pool is uninitialized and no initial price is available', async () => {
    const read = jest.fn().mockResolvedValue({ sqrtPriceX96: '0', tick: 0 })
    await expect(resolveV4MintTicks(mockSdk(read), input)).rejects.toMatchObject({
      code: 'POOL_NOT_FOUND',
    })
  })

  it('does not turn a pool read failure into a static tick range', async () => {
    const cause = new Error('RPC unavailable')
    const read = jest.fn().mockRejectedValue(cause)
    await expect(resolveV4MintTicks(mockSdk(read), input)).rejects.toMatchObject({
      code: 'POOL_NOT_FOUND',
      cause,
    })
  })

  it('rejects an invalid initial sqrt price', async () => {
    const read = jest.fn().mockRejectedValue(new Error('Pool unavailable'))
    await expect(
      resolveV4MintTicks(mockSdk(read), { ...input, sqrtPriceX96: '0' }),
    ).rejects.toThrow()
  })

  it('keeps the legacy V4 tick-spacing fallback', () => {
    expect(v4TickSpacingForFee(2500)).toBe(10)
  })

  it('derives the native TRX pool instead of the WTRX pool', () => {
    const nativeTrx = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
    const usdt = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    const wtrx = 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR'
    const nativePoolKey = v4PoolKeyFromCli('mainnet', nativeTrx, usdt, 500)
    const wrappedPoolKey = v4PoolKeyFromCli('mainnet', wtrx, usdt, 500)

    expect(nativePoolKey.currency0).toBe(nativeTrx)
    expect(computeV4PoolId(nativePoolKey)).toBe(
      '0xdda1d5819853f19f3e952da5d93aa2d572d95c72a8e6e4c2acab65384fd2557e',
    )
    expect(computeV4PoolId(wrappedPoolKey)).toBe(
      '0xc6e07bc4418402f27a3af8bcd349dacb1515ba038ad7189cf0e1bbf689fc082e',
    )
  })
})
