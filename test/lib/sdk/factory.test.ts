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

  it('rejects SDK-unsupported networks before runtime creation', async () => {
    const { createSdkRuntime } = require('../../../src/lib/sdk/factory')

    await expect(createSdkRuntime({ network: 'shasta' })).rejects.toThrow(
      'Unsupported SDK network: shasta',
    )
  })
})
