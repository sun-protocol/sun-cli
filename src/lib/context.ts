/**
 * Global application context — lazily initializes SUN API, SunSDK, and wallet.
 */

import type { SunApiClient } from '@sun-protocol/sun-sdk-api'
import { initWallet, getWallet, isWalletConfigured } from './wallet'
import { createSunApiClient, createSunSDK } from './sdk/factory'
import type { CliSunSDK } from './sdk/types'

let _api: SunApiClient | null = null
let _sdk: CliSunSDK | null = null
let _initialized = false

function getNetwork(): string {
  return process.env.TRON_NETWORK || 'mainnet'
}

export function getApi(): SunApiClient {
  if (!_api) {
    _api = createSunApiClient()
  }
  return _api
}

export async function getSdk(): Promise<CliSunSDK> {
  if (!_initialized) {
    await initWallet()
    _initialized = true
  }

  if (!_sdk) {
    const wallet = isWalletConfigured() ? getWallet() : undefined
    _sdk = await createSunSDK({
      wallet,
      network: getNetwork(),
      tronGridApiKey: process.env.TRONGRID_API_KEY || process.env.TRON_GRID_API_KEY,
      rpcUrl: process.env.TRON_RPC_URL,
    })
  }

  return _sdk
}

/** @deprecated Use getSdk(). Kept for the existing sun-cli command API. */
export async function getKit(): Promise<CliSunSDK> {
  return getSdk()
}

export async function ensureWallet(): Promise<void> {
  if (!_initialized) {
    await initWallet()
    _initialized = true
  }
  if (!isWalletConfigured()) {
    throw new Error('Wallet required. Set agent-wallet credentials before running this command.')
  }
}

export { getNetwork }
