describe('SDK factory', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('defaults to mainnet and accepts nile', () => {
    const { getNetworkFromEnv } = require('../../../src/lib/sdk/factory')

    expect(getNetworkFromEnv({})).toBe('mainnet')
    expect(getNetworkFromEnv({ TRON_NETWORK: 'nile' })).toBe('nile')
  })

  it('sets a non-signing caller address for TronGrid constant calls', () => {
    const { createReadonlyTronWeb } = require('../../../src/lib/sdk/factory')
    const tronWeb = createReadonlyTronWeb({ network: 'nile' })

    expect(tronWeb.defaultAddress).toEqual({
      base58: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
      hex: '410000000000000000000000000000000000000000',
    })
    expect(tronWeb.defaultPrivateKey).toBe(false)
  })

  it('rejects SDK-unsupported networks before runtime creation', async () => {
    const { createSdkRuntime } = require('../../../src/lib/sdk/factory')

    await expect(createSdkRuntime({ network: 'shasta' })).rejects.toThrow(
      'Unsupported SDK network: shasta',
    )
  })

  it('uses the legacy Shasta RPC for generic calls without configuring SUN protocol contracts', async () => {
    const { createGenericRuntime, createReadonlyTronWeb } = require('../../../src/lib/sdk/factory')
    const tronWeb = createReadonlyTronWeb({ network: 'shasta' })
    expect(tronWeb.fullNode.host).toBe('https://api.shasta.trongrid.io')
    const runtime = await createGenericRuntime({ network: 'shasta' })
    expect(runtime.network).toBe('shasta')
    expect(runtime.chain).toBeUndefined()
  })
})
