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
    jest.doMock('@sun-protocol/sun-sdk-runtime', () => ({ readBalances }))

    const { registerWalletCommands } = require('../../src/commands/wallet')
    const program = makeProgram()
    registerWalletCommands(program)

    await program.parseAsync(
      ['node', 'sun', 'wallet', 'balances', '--owner', 'TOwner', '--tokens', 'TRX,TToken'],
      { from: 'node' },
    )

    const opts = readAction.mock.calls[0][0]
    const tronClient = { kind: 'tron-client' }
    const runtime = { tronClient }
    await expect(opts.execute({ runtime })).resolves.toEqual([
      { address: 'TOwner', type: 'TRX', tokenAddress: undefined, balance: '100' },
    ])
    expect(readBalances).toHaveBeenCalledWith(tronClient, {
      owner: 'TOwner',
      tokens: ['TRX', 'TToken'],
    })
  })

  it('contract send calls SDK runtime contract client and maps tx result', async () => {
    const writeAction = jest.fn().mockResolvedValue(undefined)
    jest.doMock('../../src/lib/command', () => ({ writeAction }))
    jest.doMock('../../src/lib/context', () => ({ getNetwork: () => 'nile' }))
    const write = jest.fn().mockResolvedValue({ txid: 'tx1', raw: { result: true } })

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
    const sdk = { runtime: { contract: { write } } }
    await expect(opts.execute(sdk)).resolves.toEqual({ txid: 'tx1', raw: { result: true } })
    expect(write).toHaveBeenCalledWith({
      address: 'TContract',
      functionName: 'transfer',
      args: ['TA', '1'],
      abi: [{ type: 'function', name: 'transfer', inputs: [] }],
      callValue: 10n,
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
        router: {
          quote: jest.fn().mockResolvedValue(quote),
          execute: jest.fn().mockResolvedValue({
            txids: ['swap-tx'],
            finalResult: { type: 'transaction', txid: 'swap-tx', raw: { result: true } },
          }),
        },
      },
    }

    await expect(opts.execute(sdk)).resolves.toEqual({ txid: 'swap-tx', raw: { result: true } })
    expect(sdk.swap.router.quote).toHaveBeenCalledWith({
      tokenIn: 'TWrZRHY9aKQZcyjpovdH6qeCEyYZrRQDZt',
      tokenOut: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
      amountIn: '1',
    })
    expect(sdk.swap.router.execute).toHaveBeenCalledWith({
      quote,
      route: quote.bestRoute,
      slippage: '0.5%',
    })
  })
})
