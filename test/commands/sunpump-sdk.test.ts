import { Command } from 'commander'

describe('sunpump SDK integration', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it.each(['buy', 'sell'])(
    'forwards %s minimum and preserves launchpad-only trading',
    async (direction) => {
      const writeAction = jest.fn().mockResolvedValue(undefined)
      const quote = jest
        .fn()
        .mockResolvedValue({ tokenAmount: '1000', trxAmount: '1000', fee: '0' })
      jest.doMock('../../src/lib/command', () => ({ writeAction, isDryRun: () => true }))
      jest.doMock('../../src/lib/context', () => ({
        getNetwork: () => 'mainnet',
        getKit: async () => ({ pump: { [direction]: { quote } } }),
      }))
      jest.doMock('../../src/lib/output', () => ({
        isJsonMode: () => true,
        withSpinner: async (_label: string, run: () => Promise<unknown>) => run(),
      }))
      const { registerSunpumpCommands } = require('../../src/commands/sunpump')
      const program = new Command()
      program.exitOverride()
      registerSunpumpCommands(program)
      await program.parseAsync([
        'node',
        'sun',
        'sunpump',
        direction,
        'TToken',
        direction === 'buy' ? '--trx' : '--amount',
        '1',
        '--min-out',
        '990',
      ])
      const execute = jest.fn().mockResolvedValue({ txids: ['pump-tx'] })
      await writeAction.mock.calls[0][0].execute({ pump: { [direction]: { execute } } })
      expect(quote).toHaveBeenCalledWith(expect.objectContaining({ launchpadOnly: true }))
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'TToken',
          launchpadOnly: true,
          [direction === 'buy' ? 'minTokenOut' : 'minTrxOut']: '990',
        }),
      )
    },
  )

  it('passes the existing custom API endpoint through to the public SDK client', async () => {
    const previous = process.env.SUNPUMP_API_BASE_URL
    process.env.SUNPUMP_API_BASE_URL = 'https://example.invalid/custom-pump'
    try {
      const SunPumpApiClient = jest
        .fn()
        .mockImplementation(() => ({ searchTokensV2: async () => ({ code: 0, data: [] }) }))
      jest.doMock('@sun-protocol/sun-sdk-api', () => ({ SunPumpApiClient }))
      jest.doMock('../../src/lib/context', () => ({ getNetwork: () => 'mainnet' }))
      jest.doMock('../../src/lib/command', () => ({
        parseApiResponse: (raw: any) => ({ data: raw.data }),
      }))
      jest.doMock('../../src/lib/output', () => ({
        output: jest.fn(),
        outputError: jest.fn(),
        isJsonMode: () => true,
        withSpinner: async (_label: string, execute: () => Promise<unknown>) => execute(),
      }))
      const { registerSunpumpCommands } = require('../../src/commands/sunpump')
      const program = new Command()
      program.exitOverride()
      registerSunpumpCommands(program)
      await program.parseAsync(['node', 'sun', 'sunpump', 'token', 'search-v2', 'SUN'])
      expect(SunPumpApiClient).toHaveBeenCalledWith({
        network: 'mainnet',
        baseUrl: 'https://example.invalid/custom-pump',
      })
    } finally {
      if (previous === undefined) delete process.env.SUNPUMP_API_BASE_URL
      else process.env.SUNPUMP_API_BASE_URL = previous
    }
  })

  it('rejects every SunPump subcommand on Nile before initializing an SDK client', async () => {
    const searchTokensV2 = jest.fn().mockResolvedValue({ code: 0, data: { list: [] } })
    const SunPumpApiClient = jest.fn().mockImplementation(() => ({
      searchTokensV2,
    }))
    const output = jest.fn()
    const printPaginationFooter = jest.fn()

    jest.doMock('@sun-protocol/sun-sdk-api', () => ({ SunPumpApiClient }))
    const getKit = jest.fn()
    jest.doMock('../../src/lib/context', () => ({
      getNetwork: () => 'nile',
      getKit,
    }))
    jest.doMock('../../src/lib/output', () => ({
      output,
      outputError: jest.fn(),
      withSpinner: jest.fn().mockImplementation(async (_label, fn) => fn()),
      printPaginationFooter,
      printKeyValue: jest.fn(),
      isJsonMode: jest.fn().mockReturnValue(true),
      info: jest.fn(),
      formatUsd: (v: unknown) => String(v ?? '-'),
      formatTime: (v: unknown) => String(v ?? '-'),
      formatAmount: (v: unknown) => String(v ?? '-'),
      formatPct: (v: unknown) => String(v ?? '-'),
    }))

    const { registerSunpumpCommands } = require('../../src/commands/sunpump')
    const commands = [
      ['sunpump', 'token', 'search-v2', 'SUN', '--page', '1', '--size', '36'],
      ['sunpump', 'quote-buy', 'TTestToken', '--trx', '1'],
      ['sunpump', 'buy', 'TTestToken', '--trx', '1'],
    ]

    for (const args of commands) {
      const program = new Command()
      program.exitOverride()
      registerSunpumpCommands(program)

      await expect(
        program.parseAsync(['node', 'sun', ...args], { from: 'node' }),
      ).rejects.toMatchObject({
        code: 'SDK_UNSUPPORTED_NETWORK',
        message: expect.stringContaining('SunPump is only available on mainnet'),
      })
    }

    expect(SunPumpApiClient).not.toHaveBeenCalled()
    expect(searchTokensV2).not.toHaveBeenCalled()
    expect(getKit).not.toHaveBeenCalled()
    expect(output).not.toHaveBeenCalled()
  })
})
