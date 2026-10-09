import { Command } from 'commander'

describe('liquidity SDK integration', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  async function captureWriteAction(args: string[]) {
    jest.resetModules()
    const writeAction = jest.fn().mockResolvedValue(undefined)
    jest.doMock('../../src/lib/command', () => ({
      writeAction,
      readAction: jest.fn().mockResolvedValue(undefined),
    }))
    jest.doMock('../../src/lib/context', () => ({ getNetwork: () => 'nile' }))

    const { registerLiquidityCommands } = require('../../src/commands/liquidity')
    const program = new Command()
    program.exitOverride()
    registerLiquidityCommands(program)
    await program.parseAsync(['node', 'sun', 'liquidity', ...args], { from: 'node' })

    return writeAction.mock.calls[0][0]
  }

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

    await expect(
      action.execute({ liquidity: { v4: { add: { execute } } } }),
    ).resolves.toMatchObject({ txid: 'mint-tx' })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        fee: 3000,
        tickSpacing: 60,
        tickLower: -120,
        tickUpper: 120,
        amount0: '100',
        owner: 'TOwner',
      }),
    )
    expect(execute.mock.calls[0][0]).not.toHaveProperty('recipient')
  })

  it('lets the SDK derive V4 pool context from tokenId for increase', async () => {
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
      amount0: undefined,
      amount1: '200',
      slippage: '1%',
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
    expect(remove).toHaveBeenCalledWith({
      tokenId: '7',
      liquidity: '10',
      amount0Min: '1',
      amount1Min: undefined,
      slippage: undefined,
      deadline: undefined,
    })

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
    expect(collect).toHaveBeenCalledWith({ tokenId: '7', deadline: undefined })
  })
})
