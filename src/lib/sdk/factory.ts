import { SunApiClient } from '@sun-sdk/api'
import type { Network } from '@sun-sdk/core'
import { SunSDK } from '@sun-sdk/protocols'
import {
  createRuntime,
  type Runtime,
  type TronProvider,
  type WalletAdapter,
} from '@sun-sdk/runtime'
import { TronWeb } from 'tronweb'

export interface SdkRuntimeOptions {
  network?: string
  wallet?: WalletAdapter
  tronGridApiKey?: string
  rpcUrl?: string
  receiptTimeoutMs?: number
}

const DEFAULT_RECEIPT_TIMEOUT_MS = 120_000

export function getNetworkFromEnv(env: NodeJS.ProcessEnv = process.env): Network {
  const network = env.TRON_NETWORK || 'mainnet'
  if (network === 'mainnet' || network === 'nile') return network
  throw new Error(`Unsupported SDK network: ${network}`)
}

function getDefaultRpcUrl(network: Network): string {
  return network === 'nile' ? 'https://nile.trongrid.io' : 'https://api.trongrid.io'
}

export function createReadonlyTronWeb(options: SdkRuntimeOptions = {}): TronWeb {
  const network = options.network ?? 'mainnet'
  const fullHost = options.rpcUrl || getDefaultRpcUrl(assertSdkNetwork(network))
  const headers = options.tronGridApiKey
    ? { 'TRON-PRO-API-KEY': options.tronGridApiKey }
    : undefined
  return new TronWeb({ fullHost, headers })
}

function assertSdkNetwork(network: string): Network {
  if (network === 'mainnet' || network === 'nile') return network
  throw new Error(`Unsupported SDK network: ${network}`)
}

export async function createSdkRuntime(options: SdkRuntimeOptions = {}): Promise<Runtime> {
  const network = assertSdkNetwork(options.network ?? 'mainnet')
  const tronWeb = createReadonlyTronWeb(options)
  const { createTronWebProvider } = require('@sun-sdk/runtime/node') as {
    createTronWebProvider(input: { network: Network; tronWeb: TronWeb }): TronProvider
  }
  const baseProvider = createTronWebProvider({
    network,
    tronWeb,
  })
  const waitForTransactionReceipt = baseProvider.waitForTransactionReceipt
  const provider: TronProvider = waitForTransactionReceipt
    ? {
        ...baseProvider,
        waitForTransactionReceipt: (txid, waitOptions = {}) =>
          waitForTransactionReceipt(txid, {
            ...waitOptions,
            timeoutMs:
              waitOptions.timeoutMs ?? options.receiptTimeoutMs ?? DEFAULT_RECEIPT_TIMEOUT_MS,
          }),
      }
    : baseProvider
  return createRuntime({
    network,
    provider,
    wallet: options.wallet,
  })
}

export function createSunApiClient(): SunApiClient {
  return new SunApiClient()
}

export async function createSunSDK(options: SdkRuntimeOptions = {}): Promise<SunSDK> {
  const network = assertSdkNetwork(options.network ?? 'mainnet')
  const runtime = await createSdkRuntime(options)
  return SunSDK.create({
    network,
    runtime,
  })
}
