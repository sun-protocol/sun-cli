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
    const wallet = options?.wallet ?? { kind: 'custom' }
    const initWallet = jest.fn().mockResolvedValue(undefined)
    const getWallet = jest.fn().mockReturnValue(wallet)
    const isWalletConfigured = jest.fn().mockReturnValue(options?.walletConfigured ?? true)

    const createSunApiClient = jest.fn().mockReturnValue({ kind: 'api-instance' })
    const createSunSDK = jest.fn().mockResolvedValue({ kind: 'sdk-instance' })

    jest.doMock('../../src/lib/wallet', () => ({
      initWallet,
      getWallet,
      isWalletConfigured,
    }))

    jest.doMock('../../src/lib/sdk/factory', () => ({
      createSunApiClient,
      createSunSDK,
    }))

    const contextModule = require('../../src/lib/context')
    return {
      contextModule,
      initWallet,
      getWallet,
      isWalletConfigured,
      createSunApiClient,
      createSunSDK,
      wallet,
    }
  }

  it('lazily initializes SunSDK once and reuses the same instance', async () => {
    process.env.TRON_NETWORK = 'nile'
    process.env.TRONGRID_API_KEY = 'grid-key'
    process.env.TRON_RPC_URL = 'https://rpc.local'

    const { contextModule, initWallet, getWallet, createSunSDK, wallet } = loadContextModule()

    const first = await contextModule.getSdk()
    const second = await contextModule.getKit()

    expect(initWallet).toHaveBeenCalledTimes(1)
    expect(getWallet).toHaveBeenCalledTimes(1)
    expect(createSunSDK).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(createSunSDK).toHaveBeenCalledWith({
      wallet,
      network: 'nile',
      tronGridApiKey: 'grid-key',
      rpcUrl: 'https://rpc.local',
    })
  })

  it('creates SunSDK without a wallet when none is configured', async () => {
    process.env.TRON_GRID_API_KEY = 'fallback-key'

    const { contextModule, getWallet, createSunSDK } = loadContextModule({
      walletConfigured: false,
    })

    await contextModule.getSdk()

    expect(getWallet).not.toHaveBeenCalled()
    expect(createSunSDK).toHaveBeenCalledWith({
      wallet: undefined,
      network: 'mainnet',
      tronGridApiKey: 'fallback-key',
      rpcUrl: undefined,
    })
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

  it('caches SUN API client instances', () => {
    const { contextModule, createSunApiClient } = loadContextModule()

    const first = contextModule.getApi()
    const second = contextModule.getApi()

    expect(createSunApiClient).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })
})
