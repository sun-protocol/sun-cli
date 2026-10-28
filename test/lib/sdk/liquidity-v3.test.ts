import { resolveLegacyV3Pool } from '../../../src/lib/sdk/liquidity-v3'

describe('legacy CLI V3 deployment', () => {
  it('uses the supplied PM ABI for the legacy single-side positions read', async () => {
    const abi = [{ type: 'function', name: 'positions', inputs: [{ type: 'uint256' }] }]
    const pm = 'TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R'
    const token0 = 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a'
    const token1 = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'
    const read = jest
      .fn()
      .mockResolvedValueOnce({ token0, token1, fee: '500' })
      .mockResolvedValueOnce('TE6MBGu85TcLvDpxMM9PjVobWi1kxDkjcW')
    const multicall = jest.fn().mockResolvedValue([
      { success: true, value: ['123', 25700] },
      { success: true, value: '456' },
      { success: true, value: '10' },
    ])
    await resolveLegacyV3Pool(
      { network: 'nile', runtime: { contract: { read }, multicall } } as never,
      {
        tokenId: '706',
        positionManager: pm,
        positionAbi: JSON.stringify(abi),
      },
    )
    expect(read).toHaveBeenNthCalledWith(1, {
      address: pm,
      abi,
      functionName: 'positions',
      args: ['706'],
    })
  })

  it('rejects a missing legacy pool without substituting an SDK deployment', async () => {
    const read = jest.fn().mockResolvedValue('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')
    await expect(
      resolveLegacyV3Pool({ network: 'nile', runtime: { contract: { read } } } as never, {
        token0: 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a',
        token1: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
        fee: 500,
      }),
    ).rejects.toThrow('V3 pool not found')
  })

  it('uses the legacy factory getPool result instead of deriving a different pool from SDK defaults', async () => {
    const token0 = 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a'
    const token1 = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'
    const pool = 'TE6MBGu85TcLvDpxMM9PjVobWi1kxDkjcW'
    const read = jest.fn().mockResolvedValue(pool)
    const multicall = jest.fn().mockResolvedValue([
      { success: true, value: { sqrtPriceX96: '123', tick: 25700 } },
      { success: true, value: '456' },
      { success: true, value: '10' },
    ])
    const sdk = { network: 'nile', runtime: { contract: { read }, multicall } }
    await expect(resolveLegacyV3Pool(sdk as never, { token0, token1, fee: 500 })).resolves.toEqual({
      sqrtRatioX96: '123',
      tickCurrent: 25700,
      liquidity: '456',
      tickSpacing: 10,
    })
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'TLJWAScHZ4Qmk1axyKMzrnoYuu2pSLer1F',
        functionSelector: 'getPool(address,address,uint24)',
      }),
    )
    expect(
      multicall.mock.calls[0][0].every((call: { target: string }) => call.target === pool),
    ).toBe(true)
  })
})
