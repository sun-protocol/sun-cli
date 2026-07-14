interface HelpFixture {
  name: string
  args: readonly string[]
  includes: readonly string[]
}

interface GoldenOutputFixture {
  name: string
  args: readonly string[]
  expectCode: number
  expectJson?: Record<string, unknown>
  stdoutIncludes?: readonly string[]
  stderrIncludes?: readonly string[]
}

export const rootHelpFixture: HelpFixture = {
  name: 'root',
  args: ['--help'],
  includes: [
    'Usage: sun [options] [command]',
    '--network <network>',
    '--dry-run',
    'wallet',
    'token',
    'pool',
    'protocol',
    'liquidity',
    'sunpump',
  ],
}

export const commandHelpFixtures: readonly HelpFixture[] = [
  {
    name: 'token list',
    args: ['token', 'list', '--help'],
    includes: ['Usage: sun token list [options]', '--address <tokenAddress>', '--protocol <protocol>'],
  },
  {
    name: 'pool list',
    args: ['pool', 'list', '--help'],
    includes: ['Usage: sun pool list [options]', '--token <tokenOrAddress>', '--no-blacklist'],
  },
  {
    name: 'protocol info',
    args: ['protocol', 'info', '--help'],
    includes: ['Usage: sun protocol info [options]', '--protocol <protocol>'],
  },
  {
    name: 'wallet address',
    args: ['wallet', 'address', '--help'],
    includes: ['Usage: sun wallet address [options]', 'Show the active TRON wallet address'],
  },
  {
    name: 'contract read',
    args: ['contract', 'read', '--help'],
    includes: ['Usage: sun contract read [options]', '--abi <json>', '--args <json>'],
  },
  {
    name: 'swap quote',
    args: ['swap:quote', '--help'],
    includes: ['Usage: sun swap:quote [options]', '--all'],
  },
  {
    name: 'liquidity',
    args: ['liquidity', '--help'],
    includes: ['v2:add', 'v3:mint', 'v4:mint', 'v4:info'],
  },
  {
    name: 'sunpump search v2',
    args: ['sunpump', 'token', 'search-v2', '--help'],
    includes: ['Usage: sun sunpump token search-v2 [options]', '--page <n>', '--size <n>'],
  },
]

export const goldenOutputFixtures: readonly GoldenOutputFixture[] = [
  {
    name: 'dry-run swap output',
    args: ['--json', '--network', 'nile', '--dry-run', 'swap', 'SUN', 'USDT', '1'],
    expectCode: 0,
    expectJson: {
      dryRun: true,
      action: 'Swap Preview',
      params: {
        'Amount In': '1',
        Network: 'nile',
      },
    },
  },
  {
    name: 'missing wallet error output',
    args: ['--json', '--network', 'nile', 'wallet', 'address'],
    expectCode: 1,
    expectJson: {
      error: 'Failed to get wallet address',
      code: 'WALLET_NOT_CONFIGURED',
    },
    stdoutIncludes: ['No wallet configured'],
  },
]
