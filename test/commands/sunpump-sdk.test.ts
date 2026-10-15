import { Command } from 'commander'

describe('sunpump SDK integration', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
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
