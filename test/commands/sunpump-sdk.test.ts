import { Command } from 'commander'

describe('sunpump SDK integration', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('allows Nile search-v2 and initializes the SDK API client for nile', async () => {
    const searchTokensV2 = jest.fn().mockResolvedValue({ code: 0, data: { list: [] } })
    const SunPumpApiClient = jest.fn().mockImplementation(() => ({
      searchTokensV2,
    }))
    const output = jest.fn()
    const printPaginationFooter = jest.fn()

    jest.doMock('@sun-sdk/api', () => ({ SunPumpApiClient }))
    jest.doMock('../../src/lib/context', () => ({
      getNetwork: () => 'nile',
      getKit: jest.fn(),
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
    const program = new Command()
    program.exitOverride()
    registerSunpumpCommands(program)

    await program.parseAsync(
      ['node', 'sun', 'sunpump', 'token', 'search-v2', 'SUN', '--page', '1', '--size', '36'],
      { from: 'node' },
    )

    expect(SunPumpApiClient).toHaveBeenCalledWith({ network: 'nile' })
    expect(searchTokensV2).toHaveBeenCalledWith({
      query: 'SUN',
      onSunSwap: undefined,
      filterDliveShowing: undefined,
      filterAiHelper: undefined,
      filterTwitterLaunch: undefined,
      filterSunAgentLaunch: undefined,
      page: 1,
      size: 36,
      sort: undefined,
    })
    expect(output).toHaveBeenCalledWith({ list: [] }, expect.any(Object))
  })
})
