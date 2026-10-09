import { SunApiClient } from '@sun-protocol/sun-sdk-api'
import type { Network } from '@sun-protocol/sun-sdk-core'
import { SunSDK } from '@sun-protocol/sun-sdk-protocols'
import {
  createRuntime,
  type Runtime,
  type TronClient,
  type WalletAdapter,
} from '@sun-protocol/sun-sdk-runtime'
import { TronWeb } from 'tronweb'
import { TRX_ADDRESS } from './constants'
import type { CliSunSDK } from './types'

export interface SdkRuntimeOptions {
  network?: string
  wallet?: WalletAdapter
  tronGridApiKey?: string
  rpcUrl?: string
}

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
  const tronWeb = new TronWeb({ fullHost, headers })
  // TronGrid requires owner_address even for constant calls. Set the zero address
  // as a read-only caller without introducing a signing key.
  tronWeb.setAddress(TRX_ADDRESS)
  return tronWeb
}

function assertSdkNetwork(network: string): Network {
  if (network === 'mainnet' || network === 'nile') return network
  throw new Error(`Unsupported SDK network: ${network}`)
}

export async function createSdkRuntime(options: SdkRuntimeOptions = {}): Promise<Runtime> {
  const network = assertSdkNetwork(options.network ?? 'mainnet')
  const tronWeb = createReadonlyTronWeb(options)
  const { createTronWebClient } = require('@sun-protocol/sun-sdk-runtime/node') as {
    createTronWebClient(input: { network: Network; tronWeb: TronWeb }): TronClient
  }
  const tronClient = createTronWebClient({
    network,
    tronWeb,
  })
  return createRuntime({
    network,
    tronClient,
    wallet: options.wallet,
  })
}

export function createSunApiClient(): SunApiClient {
  return new SunApiClient()
}

export async function createSunSDK(options: SdkRuntimeOptions = {}): Promise<CliSunSDK> {
  const network = assertSdkNetwork(options.network ?? 'mainnet')
  const runtime = await createSdkRuntime(options)
  const sdk = await SunSDK.create({
    network,
    runtime,
  })
  if (!sdk.runtime) {
    throw new Error('SUN SDK runtime initialization failed')
  }
  return sdk as CliSunSDK
}
