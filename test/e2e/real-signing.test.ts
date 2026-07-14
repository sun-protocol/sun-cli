import { runCli } from '../helpers/run-cli'

const WTRX_NILE = 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a'
const WTRX_DEPOSIT_ABI = JSON.stringify([
  {
    inputs: [],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
])

const runRealSigningTests = process.env.RUN_REAL_SIGNING_TESTS === '1'
const describeRealSigning = runRealSigningTests ? describe : describe.skip

function optionalEnv(keys: string[]): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const key of keys) {
    const value = process.env[key]
    if (value) result[key] = value
  }
  return result
}

describeRealSigning('real Nile wallet signing', () => {
  jest.setTimeout(120_000)

  it('signs and broadcasts a minimal WTRX deposit through the SDK path', async () => {
    const privateKey = process.env.SUN_CLI_E2E_PRIVATE_KEY
    if (!privateKey) {
      throw new Error('SUN_CLI_E2E_PRIVATE_KEY is required when RUN_REAL_SIGNING_TESTS=1')
    }

    const contractAddress = process.env.SUN_CLI_E2E_WTRX_ADDRESS || WTRX_NILE
    const value = process.env.SUN_CLI_E2E_WRAP_SUN || '1'
    const result = await runCli(
      [
        '--json',
        '--network',
        'nile',
        '--yes',
        'contract',
        'send',
        contractAddress,
        'deposit',
        '--abi',
        WTRX_DEPOSIT_ABI,
        '--value',
        value,
      ],
      {
        env: {
          ...optionalEnv(['TRON_RPC_URL', 'TRONGRID_API_KEY', 'TRON_GRID_API_KEY']),
          AGENT_WALLET_PRIVATE_KEY: privateKey,
        },
        timeoutMs: 120_000,
      },
    )

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')

    const payload = JSON.parse(result.stdout.trim())
    expect(payload.txid).toMatch(/^[0-9a-fA-F]{64}$/)
  })
})
