import { buildCliEnv } from './run-cli'

describe('buildCliEnv', () => {
  const secretAliases = ['TRON_PRIVATE_KEY', 'TRON_MNEMONIC', 'TRON_ACCOUNT_INDEX'] as const
  const originalValues = new Map<string, string | undefined>()

  beforeEach(() => {
    for (const key of secretAliases) {
      originalValues.set(key, process.env[key])
      process.env[key] = `parent-${key}`
    }
  })

  afterEach(() => {
    for (const key of secretAliases) {
      const value = originalValues.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    originalValues.clear()
  })

  it('removes inherited wallet aliases and forces an isolated wallet directory', () => {
    const env = buildCliEnv({}, '/tmp/sun-cli-isolated-wallet')

    for (const key of secretAliases) expect(env[key]).toBeUndefined()
    expect(env.AGENT_WALLET_DIR).toBe('/tmp/sun-cli-isolated-wallet')
  })

  it('preserves wallet values explicitly supplied by the test', () => {
    const env = buildCliEnv(
      {
        env: {
          TRON_PRIVATE_KEY: 'explicit-test-key',
          AGENT_WALLET_DIR: '/tmp/explicit-test-wallet',
        },
      },
      '/tmp/sun-cli-isolated-wallet',
    )

    expect(env.TRON_PRIVATE_KEY).toBe('explicit-test-key')
    expect(env.AGENT_WALLET_DIR).toBe('/tmp/explicit-test-wallet')
  })
})
