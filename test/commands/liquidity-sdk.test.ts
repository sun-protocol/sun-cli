import { Command } from 'commander'

describe('liquidity SDK integration', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('unwraps TronWeb single-output address arrays', () => {
    const { unwrapContractAddressResult } = require('../../src/commands/liquidity')
    expect(unwrapContractAddressResult(['41abc'], 'getPair')).toBe('41abc')
    expect(unwrapContractAddressResult({ pair: '41def' }, 'getPair')).toBe('41def')
    expect(() => unwrapContractAddressResult([], 'getPair')).toThrow(
      'getPair did not return an address',
    )
  })

  async function captureWriteAction(args: string[]) {
    jest.resetModules()
    const writeAction = jest.fn().mockResolvedValue(undefined)
    jest.doMock('../../src/lib/command', () => ({
      writeAction,
      readAction: jest.fn().mockResolvedValue(undefined),
    }))
    jest.doMock('../../src/lib/context', () => ({ getNetwork: () => 'nile' }))
    jest.doMock('../../src/lib/sdk/liquidity-v3', () => ({
      resolveLegacyV3Pool: async () => ({
        sqrtRatioX96: '79228162514264337593543950336',
        liquidity: '1000000',
        tickCurrent: 0,
        tickSpacing: 60,
      }),
    }))

    const { registerLiquidityCommands } = require('../../src/commands/liquidity')
    const program = new Command()
    program.exitOverride()
    registerLiquidityCommands(program)
    await program.parseAsync(['node', 'sun', 'liquidity', ...args], { from: 'node' })

    return writeAction.mock.calls[0][0]
  }

  it('retains partial V3 tick ranges and zero default minima from the legacy CLI', async () => {
    const action = await captureWriteAction([
      'v3:mint',
      '--token0',
      'SUN',
      '--token1',
      'USDT',
      '--tick-lower',
      '-600',
      '--amount0',
      '1000',
    ])
    const execute = jest.fn().mockResolvedValue({ txids: ['mint-tx'] })
    await action.execute({ liquidity: { v3: { add: { execute } } } })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tickLower: -600,
        tickUpper: undefined,
        tickRangeMode: 'legacy',
        tickRangeWidth: 100,
        amountInputMode: 'legacy-cli',
        ttlSeconds: 1800,
        amount0Min: '0',
        amount1Min: '0',
      }),
    )
  })

  it('passes V2 remove minimum amounts to the SDK', async () => {
    const action = await captureWriteAction([
      'v2:remove',
      '--token-a',
      'SUN',
      '--token-b',
      'USDT',
      '--liquidity',
      '100',
      '--min-a',
      '11',
      '--min-b',
      '22',
    ])
    const execute = jest.fn().mockResolvedValue({ txids: ['v2-remove-tx'] })

    await action.execute({ liquidity: { v2: { remove: { execute } } } })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        liquidity: '100',
        amountAMin: '11',
        amountBMin: '22',
      }),
    )
  })

  it('passes V3 increase minimum amounts to the SDK', async () => {
    const action = await captureWriteAction([
      'v3:increase',
      '--token-id',
      '7',
      '--amount0',
      '100',
      '--min0',
      '11',
      '--min1',
      '22',
    ])
    const execute = jest.fn().mockResolvedValue({ txids: ['v3-increase-tx'] })

    await action.execute({ liquidity: { v3: { increase: { execute } } } })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: '7',
        amount0: '100',
        amount0Min: '11',
        amount1Min: '22',
      }),
    )
  })

  it('preserves automatic V3 mint ticks through the SDK tick range width', async () => {
    const action = await captureWriteAction([
      'v3:mint',
      '--token0',
      'TRX',
      '--token1',
      'USDT',
      '--amount0',
      '100',
      '--amount1',
      '200',
      '--min0',
      '11',
      '--min1',
      '22',
    ])
    const execute = jest.fn().mockResolvedValue({ txids: ['v3-mint-tx'] })

    await action.execute({ liquidity: { v3: { add: { execute } } } })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tickLower: undefined,
        tickUpper: undefined,
        tickRangeWidth: 100,
        tokenA: 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a',
        tokenB: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
        amount0: '200',
        amount1: '100',
        amount0Min: '22',
        amount1Min: '11',
      }),
    )
  })

  it('passes V3 decrease minimum amounts to the SDK', async () => {
    const action = await captureWriteAction([
      'v3:decrease',
      '--token-id',
      '7',
      '--liquidity',
      '100',
      '--min0',
      '11',
      '--min1',
      '22',
    ])
    const execute = jest.fn().mockResolvedValue({ txids: ['v3-decrease-tx'] })

    await action.execute({ positions: { v3: { remove: { execute } } } })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: '7',
        liquidity: '100',
        amount0Min: '11',
        amount1Min: '22',
        collectFees: false,
      }),
    )
  })

  it('maps V4 mint defaults and recipient to the public SDK input', async () => {
    const action = await captureWriteAction([
      'v4:mint',
      '--token0',
      'SUN',
      '--token1',
      'USDT',
      '--amount0',
      '100',
      '--recipient',
      'TOwner',
    ])
    const execute = jest.fn().mockResolvedValue({
      finalResult: { type: 'transaction', txid: 'mint-tx', raw: { result: true } },
    })
    const read = jest
      .fn()
      .mockResolvedValue({ sqrtPriceX96: '79228162514264337593543950336', tick: 12347 })

    await expect(
      action.execute({ network: 'nile', liquidity: { v4: { read, add: { execute } } } }),
    ).resolves.toMatchObject({ txid: 'mint-tx' })
    expect(action.summary.Fee).toBe('500 (default)')
    expect(action.summary['Tick Range']).toBe('(auto)')
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        fee: 500,
        tickSpacing: 10,
        tickLower: 11350,
        tickUpper: 13350,
        amount0: '100',
        recipient: 'TOwner',
        sweepRecipient: 'TOwner',
      }),
    )
    expect(execute.mock.calls[0][0]).not.toHaveProperty('owner')
  })

  it('preserves explicit V4 fees and tick zero without an automatic pool read', async () => {
    const action = await captureWriteAction([
      'v4:mint',
      '--token0',
      'SUN',
      '--token1',
      'USDT',
      '--amount0',
      '100',
      '--amount1',
      '200',
      '--fee',
      '3000',
      '--tick-lower',
      '0',
      '--tick-upper',
      '120',
    ])
    const execute = jest.fn().mockResolvedValue({ txids: ['mint-explicit-tx'] })
    const read = jest.fn()

    await action.execute({ network: 'nile', liquidity: { v4: { read, add: { execute } } } })

    expect(read).not.toHaveBeenCalled()
    expect(action.summary.Fee).toBe('3000')
    expect(action.summary['Tick Range']).toBe('[0, 120]')
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        fee: 3000,
        tickSpacing: 60,
        tickLower: 0,
        tickUpper: 120,
      }),
    )
  })

  it('does not submit V4 mint when automatic ticks cannot be resolved', async () => {
    const action = await captureWriteAction([
      'v4:mint',
      '--token0',
      'SUN',
      '--token1',
      'USDT',
      '--amount0',
      '100',
    ])
    const execute = jest.fn()
    const read = jest.fn().mockRejectedValue(new Error('Pool unavailable'))

    await expect(
      action.execute({
        network: 'nile',
        liquidity: { v4: { read, add: { execute } } },
      }),
    ).rejects.toMatchObject({ code: 'POOL_NOT_FOUND' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('preserves the V4 info output shape while using corrected SDK values', async () => {
    const readAction = jest.fn().mockResolvedValue(undefined)
    jest.doMock('../../src/lib/command', () => ({
      writeAction: jest.fn().mockResolvedValue(undefined),
      readAction,
    }))
    jest.doMock('../../src/lib/context', () => ({ getNetwork: () => 'nile' }))

    const { registerLiquidityCommands } = require('../../src/commands/liquidity')
    const program = new Command()
    program.exitOverride()
    registerLiquidityCommands(program)
    await program.parseAsync(
      ['node', 'sun', 'liquidity', 'v4:info', '--pm', 'TPositionManager', '--token-id', '7'],
      { from: 'node' },
    )

    const action = readAction.mock.calls[0][0]
    expect(
      action.transform({
        poolKey: { currency0: 'TToken0', currency1: 'TToken1', fee: 500 },
        tickLower: -120,
        tickUpper: 120,
        liquidity: '199999',
      }),
    ).toEqual({
      currency0: 'TToken0',
      currency1: 'TToken1',
      fee: '500',
      tickSpacing: 10,
      tickLower: -120,
      tickUpper: 120,
      liquidity: '199999',
    })
  })

  it('retains V4 input pair, fee, legacy slippage units and amount completion for increase', async () => {
    const action = await captureWriteAction([
      'v4:increase',
      '--token-id',
      '7',
      '--token0',
      'SUN',
      '--token1',
      'USDT',
      '--amount1',
      '200',
      '--slippage',
      '0.01',
    ])
    const execute = jest.fn().mockResolvedValue({ txids: ['increase-tx'] })

    await action.execute({ liquidity: { v4: { increase: { execute } } } })
    expect(execute).toHaveBeenCalledWith({
      tokenId: '7',
      token0: 'TWrZRHY9aKQZcyjpovdH6qeCEyYZrRQDZt',
      token1: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
      fee: 500,
      tickSpacing: 10,
      amount0: undefined,
      amount1: '200',
      slippage: '0.01%',
      amountInputMode: 'legacy-cli',
      includeComputedMetadata: true,
      roundingMode: 'floor',
      transactionMode: 'multicall',
      ttlSeconds: 1800,
      deadline: undefined,
    })
  })

  it('lets the SDK derive a valid V4 pool key for remove and collect', async () => {
    const removeAction = await captureWriteAction([
      'v4:decrease',
      '--token-id',
      '7',
      '--liquidity',
      '10',
      '--token0',
      'SUN',
      '--token1',
      'USDT',
      '--fee',
      '500',
      '--min0',
      '1',
    ])
    const remove = jest.fn().mockResolvedValue({ txids: ['remove-tx'] })
    await removeAction.execute({ positions: { v4: { remove: { execute: remove } } } })
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: '7',
        liquidity: '10',
        amount0Min: '1',
        amount1Min: '0',
        poolKey: expect.objectContaining({ fee: 500 }),
        transactionMode: 'multicall',
        settlementMode: 'close-currency',
        deadline: undefined,
      }),
    )

    const collectAction = await captureWriteAction([
      'v4:collect',
      '--token-id',
      '7',
      '--token0',
      'SUN',
      '--token1',
      'USDT',
      '--fee',
      '500',
    ])
    const collect = jest.fn().mockResolvedValue({ txids: ['collect-tx'] })
    await collectAction.execute({ positions: { v4: { collect: { execute: collect } } } })
    expect(collect).toHaveBeenCalledWith({
      tokenId: '7',
      deadline: undefined,
      poolKey: expect.objectContaining({ fee: 500 }),
      transactionMode: 'multicall',
      settlementMode: 'close-currency',
      ttlSeconds: 1800,
    })
  })
})
