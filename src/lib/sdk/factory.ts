import { SunApiClient } from '@sun-sdk/api'
import type { Network } from '@sun-sdk/core'
import { SunSDK } from '@sun-sdk/protocols'
import {
  createRuntime,
  type ContractRead,
  type Runtime,
  type SignedTronTransaction,
  type TronProvider,
  type WalletAdapter,
} from '@sun-sdk/runtime'
import { TronWeb } from 'tronweb'

const DEFAULT_CONSTANT_CALL_OWNER = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

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
  tronWeb.setAddress(DEFAULT_CONSTANT_CALL_OWNER)
  return tronWeb
}

function assertSdkNetwork(network: string): Network {
  if (network === 'mainnet' || network === 'nile') return network
  throw new Error(`Unsupported SDK network: ${network}`)
}

function hexWord(hex: string, index: number): string {
  return hex.slice(index * 64, (index + 1) * 64)
}

function wordToAddress(tronWeb: TronWeb, word: string): string {
  return tronWeb.address.fromHex(`41${word.slice(24)}`)
}

function wordToNumber(word: string): number {
  return Number(BigInt(`0x${word}`))
}

function wordToSignedNumber(word: string, bits: number): number {
  return Number(BigInt.asIntN(bits, BigInt(`0x${word}`)))
}

function decodeV3PositionRead(tronWeb: TronWeb, selector: string, raw: string): unknown {
  if (selector === 'ownerOf(uint256)' || selector === 'getApproved(uint256)') {
    return wordToAddress(tronWeb, hexWord(raw, 0))
  }
  if (selector === 'isApprovedForAll(address,address)') {
    return BigInt(`0x${hexWord(raw, 0)}`) !== 0n
  }
  if (selector === 'positions(uint256)') {
    return [
      BigInt(`0x${hexWord(raw, 0)}`).toString(),
      wordToAddress(tronWeb, hexWord(raw, 1)),
      wordToAddress(tronWeb, hexWord(raw, 2)),
      wordToAddress(tronWeb, hexWord(raw, 3)),
      wordToNumber(hexWord(raw, 4)),
      wordToSignedNumber(hexWord(raw, 5), 24),
      wordToSignedNumber(hexWord(raw, 6), 24),
      BigInt(`0x${hexWord(raw, 7)}`).toString(),
      BigInt(`0x${hexWord(raw, 8)}`).toString(),
      BigInt(`0x${hexWord(raw, 9)}`).toString(),
      BigInt(`0x${hexWord(raw, 10)}`).toString(),
      BigInt(`0x${hexWord(raw, 11)}`).toString(),
    ]
  }
  return undefined
}

function decodeV4PositionRead(
  network: Network,
  tronWeb: TronWeb,
  selector: string,
  raw: string,
): unknown {
  if (selector === 'ownerOf(uint256)' || selector === 'getApproved(uint256)') {
    return wordToAddress(tronWeb, hexWord(raw, 0))
  }
  if (selector === 'getPositionLiquidity(uint256)') {
    return BigInt(`0x${hexWord(raw, 0)}`).toString()
  }
  if (selector === 'getPoolAndPositionInfo(uint256)') {
    const positionInfo = hexWord(raw, 5)
    return {
      poolKey: {
        network,
        currency0: wordToAddress(tronWeb, hexWord(raw, 0)),
        currency1: wordToAddress(tronWeb, hexWord(raw, 1)),
        hooks: wordToAddress(tronWeb, hexWord(raw, 2)),
        fee: wordToNumber(hexWord(raw, 3)),
        parameters: `0x${hexWord(raw, 4)}`,
      },
      tickLower: wordToSignedNumber(positionInfo.slice(-8, -2), 24),
      tickUpper: wordToSignedNumber(positionInfo.slice(-14, -8), 24),
    }
  }
  return undefined
}

function decodeV4PoolRead(tronWeb: TronWeb, selector: string, raw: string): unknown {
  if (selector === 'getSlot0(bytes32)') {
    return [
      BigInt(`0x${hexWord(raw, 0)}`).toString(),
      wordToSignedNumber(hexWord(raw, 1), 24),
    ]
  }
  if (selector === 'getLiquidity(bytes32)') {
    return BigInt(`0x${hexWord(raw, 0)}`).toString()
  }
  if (selector === 'poolIdToPoolKey(bytes32)') {
    return {
      currency0: wordToAddress(tronWeb, hexWord(raw, 0)),
      currency1: wordToAddress(tronWeb, hexWord(raw, 1)),
      hooks: wordToAddress(tronWeb, hexWord(raw, 2)),
      fee: wordToNumber(hexWord(raw, 3)),
      parameters: `0x${hexWord(raw, 4)}`,
    }
  }
  if (selector === 'getFeeGrowthGlobals(bytes32)') {
    return [
      BigInt(`0x${hexWord(raw, 0)}`).toString(),
      BigInt(`0x${hexWord(raw, 1)}`).toString(),
    ]
  }
  return undefined
}

function isV4PositionRead(selector: string): boolean {
  return (
    selector === 'ownerOf(uint256)' ||
    selector === 'getApproved(uint256)' ||
    selector === 'getPositionLiquidity(uint256)' ||
    selector === 'getPoolAndPositionInfo(uint256)'
  )
}

function isV4PoolRead(selector: string): boolean {
  return (
    selector === 'getSlot0(bytes32)' ||
    selector === 'getLiquidity(bytes32)' ||
    selector === 'poolIdToPoolKey(bytes32)' ||
    selector === 'getFeeGrowthGlobals(bytes32)'
  )
}

function isV3PositionRead(selector: string): boolean {
  return (
    selector === 'positions(uint256)' ||
    selector === 'ownerOf(uint256)' ||
    selector === 'getApproved(uint256)' ||
    selector === 'isApprovedForAll(address,address)'
  )
}

async function waitForTransactionInfo(tronWeb: TronWeb, txid: string): Promise<any> {
  for (let i = 0; i < 90; i++) {
    const info = await tronWeb.trx.getTransactionInfo(txid)
    if (info?.receipt || info?.result || info?.contractResult) return info
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return null
}

function wrapProviderForCli(
  network: Network,
  tronWeb: TronWeb,
  provider: TronProvider,
): TronProvider {
  return {
    ...provider,
    async readContract<T = unknown>(call: ContractRead): Promise<T> {
      if (isV3PositionRead(call.functionSelector)) {
        const result = await tronWeb.transactionBuilder.triggerConstantContract(
          call.target,
          call.functionSelector,
          {},
          (call.parameters ?? []) as never,
          DEFAULT_CONSTANT_CALL_OWNER,
        )
        const raw = (result as { constant_result?: string[] }).constant_result?.[0]
        if (raw) return decodeV3PositionRead(tronWeb, call.functionSelector, raw) as T
      }
      if (isV4PositionRead(call.functionSelector)) {
        const result = await tronWeb.transactionBuilder.triggerConstantContract(
          call.target,
          call.functionSelector,
          {},
          (call.parameters ?? []) as never,
          DEFAULT_CONSTANT_CALL_OWNER,
        )
        const raw = (result as { constant_result?: string[] }).constant_result?.[0]
        if (raw) return decodeV4PositionRead(network, tronWeb, call.functionSelector, raw) as T
      }
      if (isV4PoolRead(call.functionSelector)) {
        const result = await tronWeb.transactionBuilder.triggerConstantContract(
          call.target,
          call.functionSelector,
          {},
          (call.parameters ?? []) as never,
          DEFAULT_CONSTANT_CALL_OWNER,
        )
        const raw = (result as { constant_result?: string[] }).constant_result?.[0]
        if (raw) return decodeV4PoolRead(tronWeb, call.functionSelector, raw) as T
      }
      return provider.readContract<T>(call)
    },
    async broadcastTransaction(tx: SignedTronTransaction) {
      const result = await provider.broadcastTransaction(tx)
      const info = await waitForTransactionInfo(tronWeb, result.txid)
      if (!info) {
        throw new Error(`Transaction ${result.txid} broadcasted but no receipt was available before timeout`)
      }

      if (info.result === 'FAILED' || info.receipt?.result === 'REVERT') {
        const contractResult = Array.isArray(info.contractResult)
          ? info.contractResult[0]
          : undefined
        throw new Error(
          `Transaction ${result.txid} failed on-chain: ${info.receipt?.result || info.result}${
            contractResult ? ` (${contractResult})` : ''
          }`,
        )
      }

      return {
        txid: result.txid,
        raw: {
          ...(result.raw && typeof result.raw === 'object' ? result.raw : { result: result.raw }),
          transactionInfo: info,
        },
      }
    },
  }
}

export async function createSdkRuntime(options: SdkRuntimeOptions = {}): Promise<Runtime> {
  const network = assertSdkNetwork(options.network ?? 'mainnet')
  const tronWeb = createReadonlyTronWeb(options)
  const { createTronWebProvider } = require('@sun-sdk/runtime/node') as {
    createTronWebProvider(input: { network: Network; tronWeb: TronWeb }): TronProvider
  }
  const provider = wrapProviderForCli(
    network,
    tronWeb,
    createTronWebProvider({
      network,
      tronWeb,
    }),
  )
  ;(provider as TronProvider & { __tronWeb?: TronWeb }).__tronWeb = tronWeb
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
