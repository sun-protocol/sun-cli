#!/usr/bin/env node

import 'dotenv/config'
import { Command } from 'commander'
import { setJsonMode, setFields, setOutputFormat, OutputFormat } from './lib/output'
import { setAutoConfirm } from './lib/confirm'
import { setDryRun } from './lib/command'
import { registerWalletCommands } from './commands/wallet'
import { registerPriceCommand } from './commands/price'
import { registerSwapCommands } from './commands/swap'
import { registerTokenCommands } from './commands/token'
import { registerPoolCommands } from './commands/pool'
import { registerProtocolCommands } from './commands/protocol'
import { registerTxCommands } from './commands/tx'
import { registerPositionCommands } from './commands/position'
import { registerPairCommands } from './commands/pair'
import { registerFarmCommands } from './commands/farm'
import { registerLiquidityCommands } from './commands/liquidity'
import { registerContractCommands } from './commands/contract'
import { registerSunpumpCommands } from './commands/sunpump'
import { registerE2ECommands } from './commands/e2e'

const { version } = require('../package.json') as { version: string }

const program = new Command()

program
  .name('sun')
  .description('CLI for SUN.IO / SUNSWAP on TRON — for humans and AI agents')
  .version(version)
  .option('--output <format>', 'Output format: table, json, tsv', 'table')
  .option('--json', 'Shorthand for --output json', false)
  .option('--fields <fields>', 'Comma-separated fields to include in output')
  .option(
    '--network <network>',
    'TRON network: mainnet, nile, shasta',
    process.env.TRON_NETWORK || 'mainnet',
  )
  .option('-k, --private-key <key>', 'Wallet private key for this invocation only')
  .option('-m, --mnemonic <phrase>', 'Wallet mnemonic for this invocation only')
  .option(
    '-i, --mnemonic-account-index <index>',
    'Wallet mnemonic account index for this invocation only',
  )
  .option(
    '-p, --agent-wallet-password <password>',
    'Agent wallet password for this invocation only',
  )
  .option('-d, --agent-wallet-dir <dir>', 'Agent wallet directory for this invocation only')
  .option('-y, --yes', 'Skip confirmation prompts', false)
  .option('--dry-run', 'Show what would be executed without actually running it', false)
  .hook('preAction', (_thisCmd, _actionCmd) => {
    const rootOpts = program.opts()
    if (rootOpts.output && rootOpts.output !== 'table')
      setOutputFormat(rootOpts.output as OutputFormat)
    if (rootOpts.json) setJsonMode(true)
    if (rootOpts.fields) setFields(rootOpts.fields.split(',').map((f: string) => f.trim()))
    if (rootOpts.yes) setAutoConfirm(true)
    if (rootOpts.dryRun) setDryRun(true)
    if (rootOpts.network) process.env.TRON_NETWORK = rootOpts.network
    if (rootOpts.privateKey) process.env.AGENT_WALLET_PRIVATE_KEY = rootOpts.privateKey
    if (rootOpts.mnemonic) process.env.AGENT_WALLET_MNEMONIC = rootOpts.mnemonic
    if (rootOpts.mnemonicAccountIndex) {
      process.env.AGENT_WALLET_MNEMONIC_ACCOUNT_INDEX = rootOpts.mnemonicAccountIndex
    }
    if (rootOpts.agentWalletPassword) {
      process.env.AGENT_WALLET_PASSWORD = rootOpts.agentWalletPassword
    }
    if (rootOpts.agentWalletDir) process.env.AGENT_WALLET_DIR = rootOpts.agentWalletDir
  })

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

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err.message}\n`)
  process.exit(1)
})
