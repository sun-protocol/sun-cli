import { Command } from 'commander'
import { registerWalletCommands } from '../../src/commands/wallet'
import { registerPriceCommand } from '../../src/commands/price'
import { registerSwapCommands } from '../../src/commands/swap'
import { registerTokenCommands } from '../../src/commands/token'
import { registerPoolCommands } from '../../src/commands/pool'
import { registerProtocolCommands } from '../../src/commands/protocol'
import { registerTxCommands } from '../../src/commands/tx'
import { registerPositionCommands } from '../../src/commands/position'
import { registerPairCommands } from '../../src/commands/pair'
import { registerFarmCommands } from '../../src/commands/farm'
import { registerLiquidityCommands } from '../../src/commands/liquidity'
import { registerContractCommands } from '../../src/commands/contract'
import { registerSunpumpCommands } from '../../src/commands/sunpump'
import { registerE2ECommands } from '../../src/commands/e2e'

function getCommandNames(program: Command): string[] {
  return program.commands.map((cmd) => cmd.name())
}

function getSubcommandNames(program: Command, parentName: string): string[] {
  const parent = program.commands.find((c) => c.name() === parentName)
  if (!parent) return []
  return parent.commands.map((cmd) => cmd.name())
}

describe('command registration', () => {
  let program: Command

  beforeEach(() => {
    program = new Command()
    program.exitOverride() // prevent process.exit
  })

  it('registers all top-level command groups', () => {
    registerWalletCommands(program)
    registerPriceCommand(program)
    registerSwapCommands(program)
    registerTokenCommands(program)
    registerPoolCommands(program)
    registerProtocolCommands(program)
    registerTxCommands(program)
    registerPositionCommands(program)
    registerPairCommands(program)
    registerFarmCommands(program)
    registerLiquidityCommands(program)
    registerContractCommands(program)
    registerSunpumpCommands(program)
    registerE2ECommands(program)

    const names = getCommandNames(program)
    expect(names).toContain('wallet')
    expect(names).toContain('price')
    expect(names).toContain('swap')
    expect(names).toContain('token')
    expect(names).toContain('pool')
    expect(names).toContain('protocol')
    expect(names).toContain('tx')
    expect(names).toContain('position')
    expect(names).toContain('pair')
    expect(names).toContain('farm')
    expect(names).toContain('liquidity')
    expect(names).toContain('contract')
    expect(names).toContain('sunpump')
    expect(names).toContain('e2e')
  })

  it('registers token subcommands including allowance', () => {
    registerTokenCommands(program)
    const subs = getSubcommandNames(program, 'token')
    expect(subs).toContain('list')
    expect(subs).toContain('search')
    expect(subs).toContain('approve')
  })

  it('registers wallet subcommands', () => {
    registerWalletCommands(program)
    const subs = getSubcommandNames(program, 'wallet')
    expect(subs).toContain('address')
    expect(subs).toContain('balances')
  })

  it('registers liquidity subcommands including V3 collect and V4', () => {
    registerLiquidityCommands(program)
    const subs = getSubcommandNames(program, 'liquidity')
    // V2
    expect(subs).toContain('v2:add')
    expect(subs).toContain('v2:remove')
    // V3
    expect(subs).toContain('v3:mint')
    expect(subs).toContain('v3:increase')
    expect(subs).toContain('v3:decrease')
    expect(subs).toContain('v3:collect')
    // V4
    expect(subs).toContain('v4:mint')
    expect(subs).toContain('v4:increase')
    expect(subs).toContain('v4:decrease')
    expect(subs).toContain('v4:collect')
    expect(subs).toContain('v4:info')
  })

  it('registers pool subcommands', () => {
    registerPoolCommands(program)
    const subs = getSubcommandNames(program, 'pool')
    expect(subs).toContain('list')
    expect(subs).toContain('search')
    expect(subs).toContain('top-apy')
    expect(subs).toContain('hooks')
    expect(subs).toContain('vol-history')
    expect(subs).toContain('liq-history')
  })

  it('registers contract subcommands', () => {
    registerContractCommands(program)
    const subs = getSubcommandNames(program, 'contract')
    expect(subs).toContain('read')
    expect(subs).toContain('send')
  })

  it('registers e2e subcommands', () => {
    registerE2ECommands(program)
    const subs = getSubcommandNames(program, 'e2e')
    expect(subs).toContain('nile')
  })
})
