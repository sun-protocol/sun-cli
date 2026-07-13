/**
 * Global application context — lazily initializes SunAPI, SunKit, and wallet.
 */

import { SunAPI, SunKit } from '@sun-protocol/sun-kit'
import { initWallet, getWallet, isWalletConfigured } from './wallet'

let _api: SunAPI | null = null
let _kit: SunKit | null = null
let _initialized = false

function getNetwork(): string {
  return process.env.TRON_NETWORK || 'mainnet'
}

export function getApi(): SunAPI {
  if (!_api) {
    _api = new SunAPI()
  }
  return _api
}

export async function getKit(): Promise<SunKit> {
  if (!_initialized) {
    await initWallet()
    _initialized = true
  }

  if (!_kit) {
    const wallet = isWalletConfigured() ? getWallet() : undefined
    _kit = new SunKit({
      wallet,
      network: getNetwork(),
      tronGridApiKey: process.env.TRONGRID_API_KEY || process.env.TRON_GRID_API_KEY,
      rpcUrl: process.env.TRON_RPC_URL,
    })
  }

  return _kit
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
