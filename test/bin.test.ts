import { Command } from 'commander'

describe('bin root wallet flags', () => {
  const originalArgv = process.argv
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    process.argv = [...originalArgv]
    process.env = { ...originalEnv }
    delete process.env.AGENT_WALLET_PRIVATE_KEY
    delete process.env.AGENT_WALLET_MNEMONIC
    delete process.env.AGENT_WALLET_MNEMONIC_ACCOUNT_INDEX
    delete process.env.AGENT_WALLET_PASSWORD
    delete process.env.AGENT_WALLET_DIR
  })

  afterAll(() => {
    process.argv = originalArgv
    process.env = originalEnv
  })

  function mockBinWithWalletCommand(onRun: () => void | Promise<void>): Promise<void> {
    const completed = new Promise<void>((resolve, reject) => {
      const registerWalletCommands = (program: Command) => {
        program
          .command('wallet')
          .command('address')
          .action(async () => {
            try {
              await onRun()
              resolve()
            } catch (err) {
              reject(err)
            }
          })
      }

      jest.doMock('../src/commands/wallet', () => ({
        registerWalletCommands,
      }))

      const noop = () => undefined
      jest.doMock('../src/commands/price', () => ({ registerPriceCommand: noop }))
      jest.doMock('../src/commands/swap', () => ({ registerSwapCommands: noop }))
      jest.doMock('../src/commands/token', () => ({ registerTokenCommands: noop }))
      jest.doMock('../src/commands/pool', () => ({ registerPoolCommands: noop }))
      jest.doMock('../src/commands/protocol', () => ({ registerProtocolCommands: noop }))
      jest.doMock('../src/commands/tx', () => ({ registerTxCommands: noop }))
      jest.doMock('../src/commands/position', () => ({ registerPositionCommands: noop }))
      jest.doMock('../src/commands/pair', () => ({ registerPairCommands: noop }))
      jest.doMock('../src/commands/farm', () => ({ registerFarmCommands: noop }))
      jest.doMock('../src/commands/liquidity', () => ({ registerLiquidityCommands: noop }))
      jest.doMock('../src/commands/contract', () => ({ registerContractCommands: noop }))
      jest.doMock('../src/commands/sunpump', () => ({ registerSunpumpCommands: noop }))
      jest.doMock('../src/commands/e2e', () => ({ registerE2ECommands: noop }))

      require('../src/bin')
    })

    return completed
  }

  it('maps root wallet flags into env for the current invocation', async () => {
    process.argv = [
      'node',
      'src/bin.ts',
      '-k',
      'flag-private-key',
      '-i',
      '7',
      '-p',
      'flag-password',
      '-d',
      '/tmp/flag-wallet',
      'wallet',
      'address',
    ]

    await mockBinWithWalletCommand(() => {
      expect(process.env.AGENT_WALLET_PRIVATE_KEY).toBe('flag-private-key')
      expect(process.env.AGENT_WALLET_MNEMONIC_ACCOUNT_INDEX).toBe('7')
      expect(process.env.AGENT_WALLET_PASSWORD).toBe('flag-password')
      expect(process.env.AGENT_WALLET_DIR).toBe('/tmp/flag-wallet')
    })
  })

  it('lets root wallet flags override existing env values', async () => {
    process.env.AGENT_WALLET_PRIVATE_KEY = 'env-private-key'
    process.env.AGENT_WALLET_MNEMONIC = 'env mnemonic'
    process.env.AGENT_WALLET_MNEMONIC_ACCOUNT_INDEX = '1'
    process.env.AGENT_WALLET_PASSWORD = 'env-password'
    process.env.AGENT_WALLET_DIR = '/tmp/env-wallet'

    process.argv = [
      'node',
      'src/bin.ts',
      '-m',
      'flag mnemonic',
      '-i',
      '3',
      '-p',
      'flag-password',
      '-d',
      '/tmp/flag-wallet',
      'wallet',
      'address',
    ]

    await mockBinWithWalletCommand(() => {
      expect(process.env.AGENT_WALLET_PRIVATE_KEY).toBe('env-private-key')
      expect(process.env.AGENT_WALLET_MNEMONIC).toBe('flag mnemonic')
      expect(process.env.AGENT_WALLET_MNEMONIC_ACCOUNT_INDEX).toBe('3')
      expect(process.env.AGENT_WALLET_PASSWORD).toBe('flag-password')
      expect(process.env.AGENT_WALLET_DIR).toBe('/tmp/flag-wallet')
    })
  })
})
