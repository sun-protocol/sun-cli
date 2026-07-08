describe('context', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.TRON_NETWORK
    delete process.env.TRONGRID_API_KEY
    delete process.env.TRON_GRID_API_KEY
    delete process.env.TRON_RPC_URL
  })

  function loadContextModule(options?: {
    walletConfigured?: boolean
    wallet?: Record<string, unknown>
  }) {
    const wallet = options?.wallet ?? { type: 'agent-wallet' }
    const initWallet = jest.fn().mockResolvedValue(undefined)
    const getWallet = jest.fn().mockReturnValue(wallet)
    const isWalletConfigured = jest.fn().mockReturnValue(options?.walletConfigured ?? true)

    const SunAPI = jest.fn().mockImplementation(() => ({ kind: 'api-instance' }))
    const SunKit = jest.fn().mockImplementation((config) => ({ kind: 'kit-instance', config }))

    jest.doMock('../../src/lib/wallet', () => ({
      initWallet,
      getWallet,
      isWalletConfigured,
    }))

    jest.doMock('@sun-protocol/sun-kit', () => ({
      SunAPI,
      SunKit,
    }))

    const contextModule = require('../../src/lib/context')
    return {
      contextModule,
      initWallet,
      getWallet,
      isWalletConfigured,
      SunAPI,
      SunKit,
      wallet,
    }
  }

  it('lazily initializes SunKit once and reuses the same instance', async () => {
    process.env.TRON_NETWORK = 'nile'
    process.env.TRONGRID_API_KEY = 'grid-key'
    process.env.TRON_RPC_URL = 'https://rpc.local'

    const { contextModule, initWallet, getWallet, SunKit, wallet } = loadContextModule()

    const first = await contextModule.getKit()
    const second = await contextModule.getKit()

    expect(initWallet).toHaveBeenCalledTimes(1)
    expect(getWallet).toHaveBeenCalledTimes(1)
    expect(SunKit).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(first).toEqual({
      kind: 'kit-instance',
      config: {
        wallet,
        network: 'nile',
        tronGridApiKey: 'grid-key',
        rpcUrl: 'https://rpc.local',
      },
    })
  })

  it('creates SunKit without a wallet when none is configured', async () => {
    process.env.TRON_GRID_API_KEY = 'fallback-key'

    const { contextModule, getWallet, SunKit } = loadContextModule({
      walletConfigured: false,
    })

    const kit = await contextModule.getKit()

    expect(getWallet).not.toHaveBeenCalled()
    expect(SunKit).toHaveBeenCalledWith({
      wallet: undefined,
      network: 'mainnet',
      tronGridApiKey: 'fallback-key',
      rpcUrl: undefined,
    })
    expect(kit.config.wallet).toBeUndefined()
  })

  it('throws from ensureWallet when initialization completes without a wallet', async () => {
    const { contextModule, initWallet, isWalletConfigured } = loadContextModule({
      walletConfigured: false,
    })

    await expect(contextModule.ensureWallet()).rejects.toThrow(
      'Wallet required. Set agent-wallet credentials before running this command.',
    )
    expect(initWallet).toHaveBeenCalledTimes(1)
    expect(isWalletConfigured).toHaveBeenCalledTimes(1)
  })

  it('caches SunAPI instances', () => {
    const { contextModule, SunAPI } = loadContextModule()

    const first = contextModule.getApi()
    const second = contextModule.getApi()

    expect(SunAPI).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })
})
