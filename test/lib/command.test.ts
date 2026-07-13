describe('command helpers', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  function loadCommandModule() {
    const ensureWallet = jest.fn().mockResolvedValue(undefined)
    const getKit = jest.fn().mockResolvedValue({ kind: 'kit' })
    const getApi = jest.fn()
    const output = jest.fn()
    const outputError = jest.fn()
    const withSpinner = jest.fn().mockImplementation(async (_label, fn) => await fn())
    const isJsonMode = jest.fn().mockReturnValue(false)
    const confirm = jest.fn().mockResolvedValue(true)
    const printSummary = jest.fn()

    jest.doMock('../../src/lib/context', () => ({
      ensureWallet,
      getKit,
      getApi,
    }))

    const printPaginationFooter = jest.fn()
    const printKeyValue = jest.fn()

    jest.doMock('../../src/lib/output', () => ({
      output,
      outputError,
      withSpinner,
      isJsonMode,
      printPaginationFooter,
      printKeyValue,
    }))

    jest.doMock('../../src/lib/confirm', () => ({
      confirm,
      printSummary,
    }))

    const commandModule = require('../../src/lib/command')
    return {
      commandModule,
      ensureWallet,
      getKit,
      getApi,
      output,
      outputError,
      withSpinner,
      confirm,
      printSummary,
      printPaginationFooter,
      printKeyValue,
    }
  }

  it('adds a nile tronscan URL when a write action returns txid', async () => {
    const { commandModule, output } = loadCommandModule()

    await commandModule.writeAction({
      title: 'Swap Preview',
      summary: { Network: 'nile' },
      confirmMsg: 'Execute?',
      spinnerLabel: 'Executing...',
      errorLabel: 'Swap failed',
      execute: async () => ({
        txid: 'abc123',
        route: { amountOut: '1.23' },
      }),
    })

    expect(output).toHaveBeenCalledWith({
      txid: 'abc123',
      route: { amountOut: '1.23' },
      tronscanUrl: 'https://nile.tronscan.org/#/transaction/abc123',
    })
  })

  it('does not require a wallet for dry-run write actions', async () => {
    const { commandModule, ensureWallet, getKit, output } = loadCommandModule()
    commandModule.setDryRun(true)

    await commandModule.writeAction({
      title: 'Contract Transaction',
      summary: { Network: 'nile', Contract: 'TContract' },
      confirmMsg: 'Execute?',
      spinnerLabel: 'Executing...',
      errorLabel: 'Send failed',
      execute: async () => ({ txid: 'should-not-run' }),
    })

    expect(ensureWallet).not.toHaveBeenCalled()
    expect(getKit).not.toHaveBeenCalled()
    expect(output).toHaveBeenCalledWith({
      dryRun: true,
      action: 'Contract Transaction',
      params: { Network: 'nile', Contract: 'TContract' },
    })
    commandModule.setDryRun(false)
  })

  it('uses the result network when present for explorer links', async () => {
    const { commandModule, output } = loadCommandModule()

    await commandModule.writeAction({
      title: 'Contract Transaction',
      summary: { Network: 'mainnet' },
      confirmMsg: 'Execute?',
      spinnerLabel: 'Executing...',
      errorLabel: 'Send failed',
      execute: async () => ({
        txid: 'mainnet-tx',
        network: 'shasta',
      }),
    })

    expect(output).toHaveBeenCalledWith({
      txid: 'mainnet-tx',
      network: 'shasta',
      tronscanUrl: 'https://shasta.tronscan.org/#/transaction/mainnet-tx',
    })
  })

  it('extracts txid nested under txResult for explorer link', async () => {
    const { commandModule, output } = loadCommandModule()

    await commandModule.writeAction({
      title: 'V3 Mint',
      summary: { Network: 'mainnet' },
      confirmMsg: 'Execute?',
      spinnerLabel: 'Executing...',
      errorLabel: 'Mint failed',
      execute: async () => ({
        txResult: { result: true, txid: 'nested-tx' },
        computedAmounts: { amount0Desired: '100', amount1Desired: '200' },
      }),
    })

    const arg = output.mock.calls[0][0]
    expect(arg.tronscanUrl).toBe('https://tronscan.org/#/transaction/nested-tx')
  })

  it('summarizeResult callback receives the enriched result', async () => {
    const { commandModule, printKeyValue } = loadCommandModule()

    await commandModule.writeAction({
      title: 'V3 Mint',
      summary: { Network: 'nile' },
      confirmMsg: 'Execute?',
      spinnerLabel: 'Executing...',
      errorLabel: 'Mint failed',
      execute: async () => ({
        txResult: { txid: 'tx1' },
        computedTicks: { tickLower: -100, tickUpper: 100 },
      }),
      summarizeResult: (r: any) => ({
        'Tick Lower': r.computedTicks.tickLower,
        Tronscan: r.tronscanUrl,
      }),
    })

    expect(printKeyValue).toHaveBeenCalledWith({
      'Tick Lower': -100,
      Tronscan: 'https://nile.tronscan.org/#/transaction/tx1',
    })
  })

  it('does not require a wallet for dry-run write actions', async () => {
    const { commandModule, ensureWallet, getKit, output, confirm, withSpinner } =
      loadCommandModule()
    const execute = jest.fn()

    commandModule.setDryRun(true)

    await commandModule.writeAction({
      title: 'Swap Preview',
      summary: { Network: 'mainnet', Amount: '1000000' },
      confirmMsg: 'Execute?',
      spinnerLabel: 'Executing...',
      errorLabel: 'Swap failed',
      execute,
    })

    expect(output).toHaveBeenCalledWith({
      dryRun: true,
      action: 'Swap Preview',
      params: { Network: 'mainnet', Amount: '1000000' },
    })
    expect(ensureWallet).not.toHaveBeenCalled()
    expect(getKit).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(withSpinner).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('parseApiResponse', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  function loadModule() {
    jest.doMock('../../src/lib/context', () => ({
      ensureWallet: jest.fn(),
      getKit: jest.fn(),
      getApi: jest.fn(),
    }))
    jest.doMock('../../src/lib/output', () => ({
      output: jest.fn(),
      outputError: jest.fn(),
      withSpinner: jest
        .fn()
        .mockImplementation(async (_l: string, fn: () => Promise<unknown>) => fn()),
      isJsonMode: jest.fn().mockReturnValue(false),
      printPaginationFooter: jest.fn(),
      printKeyValue: jest.fn(),
    }))
    jest.doMock('../../src/lib/confirm', () => ({ confirm: jest.fn(), printSummary: jest.fn() }))
    return require('../../src/lib/command')
  }

  it('returns data and pagination from a list-shaped envelope', () => {
    const { parseApiResponse } = loadModule()
    const out = parseApiResponse({
      code: 0,
      message: 'ok',
      data: { list: [{ a: 1 }], total: 99, pageNo: 2, pageSize: 20 },
    })
    expect(out.data).toEqual({ list: [{ a: 1 }], total: 99, pageNo: 2, pageSize: 20 })
    expect(out.pagination).toEqual({
      total: 99,
      pageNo: 2,
      pageSize: 20,
      offset: undefined,
    })
  })

  it('throws SunApiError when code is non-zero', () => {
    const { parseApiResponse } = loadModule()
    expect(() => parseApiResponse({ code: 1001, message: 'bad' })).toThrow('bad')
  })

  it('accepts code === 200 as success', () => {
    const { parseApiResponse } = loadModule()
    const out = parseApiResponse({ code: 200, data: [1, 2, 3] })
    expect(out.data).toEqual([1, 2, 3])
  })

  it('returns raw value when there is no envelope', () => {
    const { parseApiResponse } = loadModule()
    const out = parseApiResponse({ foo: 'bar' })
    expect(out.data).toEqual({ foo: 'bar' })
    expect(out.pagination).toBeUndefined()
  })
})

describe('readApiAction parsing', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  function loadModule() {
    const output = jest.fn()
    const outputError = jest.fn()
    const printPaginationFooter = jest.fn()
    const getApi = jest.fn()
    jest.doMock('../../src/lib/context', () => ({
      ensureWallet: jest.fn(),
      getKit: jest.fn(),
      getApi,
    }))
    jest.doMock('../../src/lib/output', () => ({
      output,
      outputError,
      withSpinner: jest
        .fn()
        .mockImplementation(async (_l: string, fn: () => Promise<unknown>) => fn()),
      isJsonMode: jest.fn().mockReturnValue(false),
      printPaginationFooter,
      printKeyValue: jest.fn(),
    }))
    jest.doMock('../../src/lib/confirm', () => ({ confirm: jest.fn(), printSummary: jest.fn() }))
    return { mod: require('../../src/lib/command'), output, outputError, printPaginationFooter }
  }

  it('unwraps data and forwards pagination footer', async () => {
    const { mod, output, printPaginationFooter } = loadModule()

    await mod.readApiAction({
      spinnerLabel: 'Loading...',
      errorLabel: 'Failed',
      execute: async () => ({
        code: 0,
        data: { list: [{ id: 1 }], total: 5, pageNo: 1, pageSize: 10 },
      }),
    })

    expect(output).toHaveBeenCalledWith(
      { list: [{ id: 1 }], total: 5, pageNo: 1, pageSize: 10 },
      undefined,
    )
    expect(printPaginationFooter).toHaveBeenCalledWith({
      total: 5,
      pageNo: 1,
      pageSize: 10,
      offset: undefined,
    })
  })

  it('reports api errors via outputError', async () => {
    const { mod, output, outputError } = loadModule()

    await mod.readApiAction({
      spinnerLabel: 'Loading...',
      errorLabel: 'Failed',
      execute: async () => ({ code: 500, message: 'server error' }),
    })

    expect(output).not.toHaveBeenCalled()
    expect(outputError).toHaveBeenCalled()
    const [label, err] = outputError.mock.calls[0]
    expect(label).toBe('Failed')
    expect(err.message).toBe('server error')
    expect(err.code).toBe('API_ERROR')
  })
})
