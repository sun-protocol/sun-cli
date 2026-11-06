describe('wallet', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.AGENT_WALLET_PASSWORD
    delete process.env.AGENT_WALLET_DIR
    delete process.env.AGENT_WALLET_PRIVATE_KEY
    delete process.env.AGENT_WALLET_MNEMONIC
    delete process.env.AGENT_WALLET_MNEMONIC_ACCOUNT_INDEX
    delete process.env.AGENT_WALLET_PASSWORD
    delete process.env.AGENT_WALLET_DIR
  })

  afterAll(() => {
    process.env = originalEnv
  })

  function loadWalletModule(options?: {
    activeWallet?: Record<string, any>
    getActiveWalletError?: Error
    getActiveWalletValue?: Record<string, any> | null
  }) {
    const activeWallet = options?.activeWallet ?? {
      getAddress: jest.fn().mockResolvedValue('TWalletAddress'),
      signTransaction: jest.fn().mockResolvedValue('{"txID":"signed"}'),
      signMessage: jest.fn().mockResolvedValue('signed-message'),
      signTypedData: jest.fn().mockResolvedValue('0xsignedtypeddata'),
    }

    const provider = {
      getActiveWallet: options?.getActiveWalletError
        ? jest.fn().mockRejectedValue(options.getActiveWalletError)
        : jest
            .fn()
            .mockResolvedValue(
              options?.getActiveWalletValue === undefined
                ? activeWallet
                : options.getActiveWalletValue,
            ),
    }

    const resolveWalletProvider = jest.fn().mockReturnValue(provider)

    jest.doMock('@bankofai/agent-wallet', () => ({
      resolveWalletProvider,
    }))

    const walletModule = require('../../src/lib/wallet')
    return {
      walletModule,
      activeWallet,
      provider,
      resolveWalletProvider,
    }
  }

  it('leaves wallet unconfigured when the wallet provider cannot resolve an active wallet', async () => {
    const { walletModule, resolveWalletProvider, provider } = loadWalletModule({
      getActiveWalletError: new Error('No active wallet'),
    })

    await walletModule.initWallet()

    expect(walletModule.isWalletConfigured()).toBe(false)
    expect(resolveWalletProvider).toHaveBeenCalledWith({ network: 'tron' })
    expect(provider.getActiveWallet).toHaveBeenCalledTimes(1)
    expect(() => walletModule.getWallet()).toThrow('No wallet configured')
  })

  it('leaves wallet unconfigured when the wallet provider returns null', async () => {
    const { walletModule, resolveWalletProvider, provider } = loadWalletModule({
      getActiveWalletValue: null,
    })

    await walletModule.initWallet()

    expect(walletModule.isWalletConfigured()).toBe(false)
    expect(resolveWalletProvider).toHaveBeenCalledWith({ network: 'tron' })
    expect(provider.getActiveWallet).toHaveBeenCalledTimes(1)
    expect(() => walletModule.getWallet()).toThrow('No wallet configured')
  })

  it('initializes agent-wallet and exposes address', async () => {
    process.env.AGENT_WALLET_PRIVATE_KEY = 'private-key'
    process.env.AGENT_WALLET_DIR = '/tmp/agent-wallet'

    const { walletModule, resolveWalletProvider, provider } = loadWalletModule()

    await walletModule.initWallet()

    expect(resolveWalletProvider).toHaveBeenCalledWith({ network: 'tron' })
    expect(provider.getActiveWallet).toHaveBeenCalledTimes(1)
    expect(process.env.AGENT_WALLET_PRIVATE_KEY).toBe('private-key')
    expect(process.env.AGENT_WALLET_DIR).toBe('/tmp/agent-wallet')
    await expect(walletModule.getWalletAddress()).resolves.toBe('TWalletAddress')
  })

  it('returns an SDK wallet adapter that signs and normalizes typed-data signatures', async () => {
    process.env.AGENT_WALLET_PASSWORD = 'secret'

    const { walletModule, activeWallet } = loadWalletModule({
      activeWallet: {
        getAddress: jest.fn().mockResolvedValue('TWalletAddress'),
        signTransaction: jest.fn().mockResolvedValue('{"txID":"signed","raw_data":{"x":1}}'),
        signMessage: jest.fn().mockResolvedValue('signed-message'),
        signTypedData: jest.fn().mockResolvedValue('0xdeadbeef'),
      },
    })

    await walletModule.initWallet()
    const wallet = walletModule.getWallet() as any

    expect(wallet.kind).toBe('custom')
    await expect(wallet.signTransaction({ raw_data: { contract: [] } })).resolves.toEqual({
      txID: 'signed',
      raw_data: { x: 1 },
    })
    expect(activeWallet.signTransaction).toHaveBeenCalledWith({ raw_data: { contract: [] } })

    const payload = {
      domain: { name: 'Sun', chainId: 1, verifyingContract: 'TContract' },
      types: { Permit: [{ name: 'owner', type: 'address' }] },
      message: { owner: 'TWalletAddress' },
    }
    await expect(wallet.signTypedData(payload)).resolves.toBe('deadbeef')
    expect(activeWallet.signTypedData).toHaveBeenCalledWith({
      ...payload,
    })
  })
})
