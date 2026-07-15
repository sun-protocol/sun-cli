import { Command } from 'commander'
import { getNetwork } from '../lib/context'
import { writeAction, readAction } from '../lib/command'
import { isJsonMode, output, outputError, withSpinner } from '../lib/output'
import { resolveTokenAddress, getSymbolOrAddress } from '../lib/tokens'
import { readContractByAbi, sendContractByAbi } from '../lib/sdk/runtime-compat'
import { toCliTxResult } from '../lib/sdk/compat'

const ROUTER_API: Record<string, string> = {
  mainnet: 'https://rot.endjgfsv.link',
  nile: 'https://tnrouter.endjgfsv.link',
}

interface RouteData {
  amountIn: string
  amountOut: string
  symbols: string[]
  poolVersions: string[]
  impact: string
}

function selectSwapRoute(quote: any): any {
  return quote.bestRoute ?? quote.route ?? quote.routes?.[0]
}

function cliSlippageToSdk(value: number): `${number}%` {
  return `${value * 100}%` as `${number}%`
}

function parseAbi(value: string | undefined): any[] {
  if (!value) throw new Error('--abi is required for SDK contract calls')
  return JSON.parse(value)
}

async function fetchSwapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  network: string,
): Promise<RouteData[]> {
  const baseUrl = ROUTER_API[network]
  if (!baseUrl) {
    throw new Error(`Unsupported network: ${network}. Supported: mainnet, nile`)
  }

  const url = new URL('/swap/routerUniversal', baseUrl)
  url.searchParams.append('fromToken', tokenIn)
  url.searchParams.append('toToken', tokenOut)
  url.searchParams.append('amountIn', amountIn)
  url.searchParams.append('typeList', '')
  url.searchParams.append('maxCost', '3')
  url.searchParams.append('includeUnverifiedV4Hook', 'true')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Router API HTTP error: ${response.status}`)
  }

  const data = (await response.json()) as { code: number; message?: string; data?: RouteData[] }
  if (data.code !== 0) {
    throw new Error(`Router API error: ${data.message || 'Unknown error'}`)
  }

  return data.data || []
}

export function registerSwapCommands(program: Command) {
  program
    .command('swap <tokenIn> <tokenOut> <amountIn>')
    .description('Swap tokens via Universal Router (high-level, finds best route)')
    .option('--slippage <n>', 'Slippage tolerance as decimal (e.g. 0.005 for 0.5%)', '0.005')
    .action(async (tokenInArg: string, tokenOutArg: string, amountIn: string, opts) => {
      const network = getNetwork()
      const slippage = parseFloat(opts.slippage)

      let tokenIn: string, tokenOut: string
      try {
        tokenIn = resolveTokenAddress(tokenInArg, network)
        tokenOut = resolveTokenAddress(tokenOutArg, network)
      } catch (err: any) {
        console.error(err.message)
        process.exitCode = 1
        return
      }

      const tokenInDisplay = getSymbolOrAddress(tokenIn, network)
      const tokenOutDisplay = getSymbolOrAddress(tokenOut, network)

      await writeAction({
        title: 'Swap Preview',
        summary: {
          'Token In': `${tokenInDisplay} (${tokenIn})`,
          'Token Out': `${tokenOutDisplay} (${tokenOut})`,
          'Amount In': amountIn,
          Slippage: `${(slippage * 100).toFixed(2)}%`,
          Network: network,
        },
        confirmMsg: 'Execute this swap?',
        spinnerLabel: 'Executing swap...',
        errorLabel: 'Swap failed',
        execute: async (sdk) => {
          const quote = await sdk.swap.quote({ tokenIn, tokenOut, amountIn })
          const route = selectSwapRoute(quote)
          if (!route) throw new Error('No route available for this token pair')
          const result = await sdk.swap.execute({
            quote,
            route,
            slippage: cliSlippageToSdk(slippage),
          })
          return toCliTxResult(result)
        },
        onSuccess: async (result: any) => {
          if (!isJsonMode()) {
            const chalk = (await import('chalk')).default
            console.log()
            console.log(chalk.green('Swap executed successfully'))
            console.log(`  TxID: ${chalk.bold(result.txid)}`)
            if (result.tronscanUrl) {
              console.log(`  Tronscan: ${chalk.underline(result.tronscanUrl)}`)
            }
            if (result.route) {
              console.log(`  Route: ${result.route.symbols?.join(' → ')}`)
              console.log(`  Amount Out: ${result.route.amountOut}`)
              console.log(`  Price Impact: ${result.route.impact}`)
            }
          }
        },
      })
    })

  program
    .command('swap:quote <tokenIn> <tokenOut> <amountIn>')
    .description('Get swap quote without executing (read-only)')
    .option('--all', 'Show all available routes instead of just the best one')
    .action(async (tokenInArg: string, tokenOutArg: string, amountIn: string, opts) => {
      try {
        const network = getNetwork()

        let tokenIn: string, tokenOut: string
        try {
          tokenIn = resolveTokenAddress(tokenInArg, network)
          tokenOut = resolveTokenAddress(tokenOutArg, network)
        } catch (err: any) {
          outputError('Invalid token', err)
          return
        }

        const routes = await withSpinner('Fetching quote...', () =>
          fetchSwapQuote(tokenIn, tokenOut, amountIn, network),
        )

        if (!routes || routes.length === 0) {
          outputError('No route found', new Error('No route available for this token pair'))
          return
        }

        const displayRoutes = opts.all ? routes : [routes[0]]

        if (isJsonMode()) {
          output(opts.all ? routes : routes[0])
        } else {
          const chalk = (await import('chalk')).default
          console.log()
          console.log(chalk.bold(`Found ${routes.length} route(s) for swap:`))
          console.log()

          for (let i = 0; i < displayRoutes.length; i++) {
            const route = displayRoutes[i]
            if (displayRoutes.length > 1) {
              console.log(chalk.cyan(`Route ${i + 1}:`))
            }
            console.log(`  ${chalk.gray('Path:')}         ${route.symbols.join(' → ')}`)
            console.log(`  ${chalk.gray('Pools:')}        ${route.poolVersions.join(' → ')}`)
            console.log(`  ${chalk.gray('Amount In:')}    ${route.amountIn}`)
            console.log(`  ${chalk.gray('Amount Out:')}   ${chalk.green(route.amountOut)}`)
            console.log(`  ${chalk.gray('Price Impact:')} ${route.impact}`)
            if (displayRoutes.length > 1) console.log()
          }

          if (!opts.all && routes.length > 1) {
            console.log()
            console.log(
              chalk.gray(`  (${routes.length - 1} more route(s) available, use --all to see them)`),
            )
          }
        }
      } catch (err: any) {
        outputError('Quote failed', err)
      }
    })

  program
    .command('swap:quote-raw')
    .description('Quote an exact-input swap via smart router contract (low-level)')
    .requiredOption('--router <address>', 'Smart router contract address')
    .option('--fn <name>', 'Quote function name', 'quoteExactInput')
    .requiredOption('--args <json>', 'Arguments as JSON array')
    .option('--abi <json>', 'Optional router ABI as JSON array')
    .action(async (opts) => {
      await readAction({
        spinnerLabel: 'Quoting swap...',
        errorLabel: 'Quote failed',
        execute: (sdk) =>
          readContractByAbi(sdk.runtime, {
            address: opts.router,
            functionName: opts.fn,
            args: JSON.parse(opts.args),
            abi: parseAbi(opts.abi),
          }),
        transform: (result) => ({ result }),
      })
    })

  program
    .command('swap:exact-input')
    .description('Execute a low-level swapExactInput via smart router')
    .requiredOption('--router <address>', 'Smart router contract address')
    .option('--fn <name>', 'Swap function name', 'swapExactInput')
    .requiredOption('--args <json>', 'Arguments as JSON array')
    .option('--value <sun>', 'TRX call value in Sun')
    .option('--abi <json>', 'Optional router ABI as JSON array')
    .action(async (opts) => {
      await writeAction({
        title: 'SwapExactInput',
        summary: {
          Router: opts.router,
          Function: opts.fn,
          Args: opts.args,
          Value: opts.value || '0',
        },
        confirmMsg: 'Execute this swap?',
        spinnerLabel: 'Executing swap...',
        errorLabel: 'SwapExactInput failed',
        execute: (kit) =>
          sendContractByAbi(kit.runtime, {
            address: opts.router,
            functionName: opts.fn,
            args: JSON.parse(opts.args),
            value: opts.value === undefined ? undefined : BigInt(opts.value),
            abi: parseAbi(opts.abi),
          }).then(toCliTxResult),
      })
    })
}
