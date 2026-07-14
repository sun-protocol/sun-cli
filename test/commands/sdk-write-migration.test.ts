import { Command } from 'commander'

describe('SDK command migrations', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  function makeProgram() {
    const program = new Command()
    program.exitOverride()
    return program
  }

  it('wallet balances calls SDK readBalances with string tokens', async () => {
    const readAction = jest.fn().mockResolvedValue(undefined)
    jest.doMock('../../src/lib/command', () => ({ readAction }))
    jest.doMock('../../src/lib/context', () => ({ getNetwork: () => 'nile' }))
    const readBalances = jest
      .fn()
      .mockResolvedValue([{ token: 'TRX', balance: '100', decimals: 6 }])
    jest.doMock('@sun-sdk/runtime', () => ({ readBalances }))

    const { registerWalletCommands } = require('../../src/commands/wallet')
    const program = makeProgram()
    registerWalletCommands(program)

    await program.parseAsync(
      ['node', 'sun', 'wallet', 'balances', '--owner', 'TOwner', '--tokens', 'TRX,TToken'],
      { from: 'node' },
    )

    const opts = readAction.mock.calls[0][0]
    const runtime = { kind: 'runtime' }
    await expect(opts.execute({ runtime })).resolves.toEqual([
      { type: 'TRX', tokenAddress: undefined, balance: '100', decimals: 6 },
    ])
    expect(readBalances).toHaveBeenCalledWith(runtime, {
      owner: 'TOwner',
      tokens: ['TRX', 'TToken'],
    })
  })

  it('contract send calls SDK sendContractByAbi and maps tx result', async () => {
    const writeAction = jest.fn().mockResolvedValue(undefined)
    jest.doMock('../../src/lib/command', () => ({ writeAction }))
    jest.doMock('../../src/lib/context', () => ({ getNetwork: () => 'nile' }))
    const sendContractByAbi = jest.fn().mockResolvedValue({ txid: 'tx1', raw: { result: true } })
    jest.doMock('@sun-sdk/runtime', () => ({ sendContractByAbi }))

    const { registerContractCommands } = require('../../src/commands/contract')
    const program = makeProgram()
    registerContractCommands(program)

    await program.parseAsync(
      [
        'node',
        'sun',
        'contract',
        'send',
        'TContract',
        'transfer',
        '--args',
        '["TA","1"]',
        '--abi',
        '[{"type":"function","name":"transfer","inputs":[]}]',
        '--value',
        '10',
      ],
      { from: 'node' },
    )

    const opts = writeAction.mock.calls[0][0]
    const sdk = { runtime: { kind: 'runtime' } }
    await expect(opts.execute(sdk)).resolves.toEqual({ txid: 'tx1', raw: { result: true } })
    expect(sendContractByAbi).toHaveBeenCalledWith(sdk.runtime, {
      address: 'TContract',
      functionName: 'transfer',
      args: ['TA', '1'],
      abi: [{ type: 'function', name: 'transfer', inputs: [] }],
      value: 10n,
    })
  })

  it('swap execute quotes, executes, and maps SDK plan result', async () => {
    const writeAction = jest.fn().mockResolvedValue(undefined)
    jest.doMock('../../src/lib/command', () => ({ writeAction }))
    jest.doMock('../../src/lib/context', () => ({ getNetwork: () => 'nile' }))

    const { registerSwapCommands } = require('../../src/commands/swap')
    const program = makeProgram()
    registerSwapCommands(program)

    await program.parseAsync(['node', 'sun', 'swap', 'SUN', 'USDT', '1', '--slippage', '0.005'], {
      from: 'node',
    })

    const opts = writeAction.mock.calls[0][0]
    const quote = {
      kind: 'router',
      bestRoute: { amountIn: '1', amountOut: '2', symbols: ['SUN', 'USDT'] },
    }
    const sdk = {
      swap: {
        quote: jest.fn().mockResolvedValue(quote),
        execute: jest.fn().mockResolvedValue({
          txids: ['swap-tx'],
          finalResult: { type: 'transaction', txid: 'swap-tx', raw: { result: true } },
        }),
      },
    }

    await expect(opts.execute(sdk)).resolves.toEqual({ txid: 'swap-tx', raw: { result: true } })
    expect(sdk.swap.quote).toHaveBeenCalledWith({
      tokenIn: 'TWrZRHY9aKQZcyjpovdH6qeCEyYZrRQDZt',
      tokenOut: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
      amountIn: '1',
    })
    expect(sdk.swap.execute).toHaveBeenCalledWith({
      quote,
      route: quote.bestRoute,
      slippage: '0.5%',
    })
  })
})
