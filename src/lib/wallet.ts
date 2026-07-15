import { resolveWalletProvider } from '@bankofai/agent-wallet'
import type { WalletAdapter } from '@sun-sdk/runtime'
import { AgentWalletSdkAdapter } from './sdk/wallet'

export type Wallet = WalletAdapter

let _wallet: Wallet | null = null

export async function initWallet(): Promise<void> {
  _wallet = null
  try {
    const provider = resolveWalletProvider({ network: 'tron' })
    const activeWallet = await provider.getActiveWallet()
    if (activeWallet === null || activeWallet === undefined) {
      _wallet = null
      return
    }
    _wallet = new AgentWalletSdkAdapter(activeWallet)
  } catch {
    _wallet = null
  }
}

export function getWallet(): Wallet {
  if (!_wallet) {
    throw new Error(
      'No wallet configured. Set AGENT_WALLET_PRIVATE_KEY, AGENT_WALLET_MNEMONIC, or AGENT_WALLET_PASSWORD for agent-wallet.',
    )
  }
  return _wallet
}

export function isWalletConfigured(): boolean {
  return _wallet !== null
}

export async function getWalletAddress(): Promise<string> {
  return getWallet().getAddress()
}
