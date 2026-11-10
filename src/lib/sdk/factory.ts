import { SunApiClient } from '@sun-protocol/sun-sdk-api'
import type { Network } from '@sun-protocol/sun-sdk-core'
import { SunSDK } from '@sun-protocol/sun-sdk-protocols'
import {
  createRuntime,
  createContractRuntime,
  withContractAbi,
  type ContractRuntime,
  type RuntimeNetwork,
  type AbiItem,
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

function getDefaultRpcUrl(network: RuntimeNetwork): string {
  if (network === 'shasta') return 'https://api.shasta.trongrid.io'
  return network === 'nile' ? 'https://nile.trongrid.io' : 'https://api.trongrid.io'
}

export function createReadonlyTronWeb(options: SdkRuntimeOptions = {}): TronWeb {
  const network = options.network ?? 'mainnet'
  const fullHost = options.rpcUrl || getDefaultRpcUrl(assertRuntimeNetwork(network))
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

function assertRuntimeNetwork(network: string): RuntimeNetwork {
  if (network === 'mainnet' || network === 'nile' || network === 'shasta') return network
  throw new Error(`Unsupported SDK network: ${network}`)
}

export async function createGenericRuntime(
  options: SdkRuntimeOptions = {},
): Promise<ContractRuntime> {
  const network = assertRuntimeNetwork(options.network ?? 'mainnet')
  const tronWeb = createReadonlyTronWeb(options)
  const { createTronWebClient } = require('@sun-protocol/sun-sdk-runtime/node') as {
    createTronWebClient(input: {
      network: RuntimeNetwork
      tronWeb: TronWeb
    }): TronClient<RuntimeNetwork>
  }
  return createContractRuntime({
    network,
    tronClient: createTronWebClient({ network, tronWeb }),
    wallet: options.wallet,
  })
}

/** A fresh runtime confines an explicit ABI to this command, without mutating shared SDK state. */
export async function withLiquidityAbi(
  sdk: CliSunSDK,
  address: string,
  json?: string,
  readSelectors: readonly string[] = [],
): Promise<CliSunSDK> {
  if (json === undefined) return sdk
  const abi = JSON.parse(json) as readonly AbiItem[]
  const scopedClient = withContractAbi(sdk.runtime.tronClient, address, abi)
  const runtime = createRuntime({
    network: sdk.network,
    tronClient: {
      ...scopedClient,
      // Legacy PM overrides applied to writes and only to the positions read
      // used by single-side increase. Extra SDK planning views use their own ABI.
      readContract: (call) =>
        readSelectors.includes(call.functionSelector)
          ? scopedClient.readContract(call)
          : sdk.runtime.tronClient.readContract(call),
    },
    getWallet: () => sdk.runtime.getWallet(),
  })
  const scoped = await SunSDK.create({ network: sdk.network, runtime })
  return scoped as CliSunSDK
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
