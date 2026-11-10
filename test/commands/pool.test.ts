import { Command } from 'commander'
import { registerPoolCommands } from '../../src/commands/pool'
import { getOutputFormat, setOutputFormat } from '../../src/lib/output'

const mockGetPools = jest.fn()
let mockNetwork = 'mainnet'

jest.mock('../../src/lib/context', () => ({
  getNetwork: () => mockNetwork,
  getApi: () => ({ getPools: mockGetPools }),
}))

describe('pool list token resolution', () => {
  const originalExitCode = process.exitCode
  const originalOutputFormat = getOutputFormat()
  let stdout: string
  let program: Command

  beforeEach(() => {
    mockGetPools.mockReset().mockResolvedValue({ code: 0, data: [] })
    mockNetwork = 'mainnet'
    process.exitCode = undefined
    setOutputFormat('json')
    stdout = ''
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk)
      return true
    })
    program = new Command().exitOverride()
    registerPoolCommands(program)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.exitCode = originalExitCode
    setOutputFormat(originalOutputFormat)
  })

  describe.each(['mainnet', 'nile'])('%s', (network) => {
    it.each(['USDC', 'UNKNOWN_TOKEN', ''])(
      'rejects unsupported token %j before querying',
      async (token) => {
        mockNetwork = network
        await program.parseAsync(['pool', 'list', '--token', token], { from: 'user' })

        expect(mockGetPools).not.toHaveBeenCalled()
        expect(process.exitCode).toBe(1)
        expect(JSON.parse(stdout)).toMatchObject({
          error: 'Invalid token',
          detail: expect.stringContaining(`Unknown token symbol: ${token}.`),
        })
      },
    )
  })

  it.each([
    ['mainnet', 'USDD', 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz'],
    ['mainnet', 'usddold', 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn'],
    ['mainnet', 'USDCOLD', 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'],
    ['nile', 'USDD', 'TZ78R2E6ejfFhxq8hxrmuqT6hGBxjHQbo4'],
    ['nile', 'USDDOLD', 'TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK'],
    ['nile', 'usdcold', 'TWMCMCoJPqCGw5RR7eChF2HoY3a9B8eYA3'],
    ['mainnet', 'TRX', 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR'],
    ['nile', 'TRX', 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a'],
    ['mainnet', 'TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK', 'TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK'],
  ])('queries %s pools for %s using its address', async (network, token, address) => {
    mockNetwork = network
    await program.parseAsync(['pool', 'list', '--token', token], { from: 'user' })

    expect(mockGetPools).toHaveBeenCalledTimes(1)
    expect(mockGetPools).toHaveBeenCalledWith(expect.objectContaining({ tokenAddress: address }))
    expect(process.exitCode).toBeUndefined()
  })

  it('allows listing pools without a token filter', async () => {
    await program.parseAsync(['pool', 'list'], { from: 'user' })

    expect(mockGetPools).toHaveBeenCalledTimes(1)
    expect(mockGetPools).toHaveBeenCalledWith(expect.objectContaining({ tokenAddress: undefined }))
    expect(process.exitCode).toBeUndefined()
  })
})
