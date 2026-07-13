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
    tronWeb?: Record<string, any>
    getActiveWalletError?: Error
    getActiveWalletValue?: Record<string, any> | null
  }) {
    const activeWallet = options?.activeWallet ?? {
      getAddress: jest.fn().mockResolvedValue('TWalletAddress'),
      signTransaction: jest.fn().mockResolvedValue('{"txID":"signed"}'),
      signMessage: jest.fn().mockResolvedValue('signed-message'),
      signTypedData: jest.fn().mockResolvedValue('0xsignedtypeddata'),
    }

    const tronWeb = options?.tronWeb ?? {
      address: {
        toHex: jest.fn().mockReturnValue('41abc'),
        fromHex: jest.fn().mockReturnValue('TWalletAddress'),
      },
      trx: {
        sendRawTransaction: jest.fn().mockResolvedValue({ result: true, txid: 'tx-123' }),
      },
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
    const createReadonlyTronWeb = jest.fn().mockResolvedValue(tronWeb)

    jest.doMock('@bankofai/agent-wallet', () => ({
      resolveWalletProvider,
    }))

    jest.doMock('@sun-protocol/sun-kit', () => ({
      createReadonlyTronWeb,
    }))

    const walletModule = require('../../src/lib/wallet')
    return {
      walletModule,
      activeWallet,
      tronWeb,
      provider,
      resolveWalletProvider,
      createReadonlyTronWeb,
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

  it('builds tronWeb with the active wallet as default address', async () => {
    process.env.AGENT_WALLET_PASSWORD = 'secret'

    const { walletModule, tronWeb, createReadonlyTronWeb } = loadWalletModule()

    await walletModule.initWallet()
    const wallet = walletModule.getWallet() as any
    const resolvedTronWeb = await wallet.getTronWeb('nile')

    expect(createReadonlyTronWeb).toHaveBeenCalledWith('nile')
    expect(resolvedTronWeb).toBe(tronWeb)
    expect(tronWeb.address.toHex).toHaveBeenCalledWith('TWalletAddress')
    expect(tronWeb.address.fromHex).toHaveBeenCalledWith('41abc')
    expect((tronWeb as any).defaultAddress).toEqual({
      hex: '41abc',
      base58: 'TWalletAddress',
    })
  })

  it('signs, broadcasts, and normalizes typed-data signatures', async () => {
    process.env.AGENT_WALLET_PASSWORD = 'secret'

    const { walletModule, activeWallet, tronWeb } = loadWalletModule({
      activeWallet: {
        getAddress: jest.fn().mockResolvedValue('TWalletAddress'),
        signTransaction: jest.fn().mockResolvedValue('{"txID":"signed","raw_data":{"x":1}}'),
        signMessage: jest.fn().mockResolvedValue('signed-message'),
        signTypedData: jest.fn().mockResolvedValue('0xdeadbeef'),
      },
      tronWeb: {
        address: {
          toHex: jest.fn().mockReturnValue('41abc'),
          fromHex: jest.fn().mockReturnValue('TWalletAddress'),
        },
        trx: {
          sendRawTransaction: jest.fn().mockResolvedValue({ result: true, txid: 'tx-999' }),
        },
      },
    })

    await walletModule.initWallet()
    const wallet = walletModule.getWallet() as any

    await expect(
      wallet.signAndBroadcast({ transaction: { raw_data: { contract: [] } } }, 'mainnet'),
    ).resolves.toEqual({ result: true, txid: 'tx-999' })
    expect(activeWallet.signTransaction).toHaveBeenCalledWith({ raw_data: { contract: [] } })
    expect(tronWeb.trx.sendRawTransaction).toHaveBeenCalledWith({
      txID: 'signed',
      raw_data: { x: 1 },
    })

    await expect(
      wallet.signTypedData(
        'Permit',
        { name: 'Sun', chainId: 1, verifyingContract: 'TContract' },
        { Permit: [{ name: 'owner', type: 'address' }] },
        { owner: 'TWalletAddress' },
      ),
    ).resolves.toBe('deadbeef')
    expect(activeWallet.signTypedData).toHaveBeenCalledWith({
      domain: { name: 'Sun', chainId: 1, verifyingContract: 'TContract' },
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Permit: [{ name: 'owner', type: 'address' }],
      },
      primaryType: 'Permit',
      message: { owner: 'TWalletAddress' },
    })
  })
})
