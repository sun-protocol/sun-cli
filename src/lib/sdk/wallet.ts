import type {
  SignedTronTransaction,
  TypedDataPayload,
  UnsignedTronTransaction,
  WalletAdapter,
} from '@sun-sdk/runtime'
import type { Wallet as AgentWallet, Eip712Capable } from '@bankofai/agent-wallet'

export class AgentWalletSdkAdapter implements WalletAdapter {
  readonly kind = 'custom' as const
  readonly capabilities = {
    signTransaction: true,
    signAndSendTransaction: false,
    signTypedData: true,
    userInteractive: false,
  }

  constructor(private readonly agentWallet: AgentWallet) {}

  async getAddress(): Promise<string> {
    return this.agentWallet.getAddress()
  }

  async signTransaction(tx: UnsignedTronTransaction): Promise<SignedTronTransaction> {
    const signedJson = await this.agentWallet.signTransaction(tx as Record<string, unknown>)
    return JSON.parse(signedJson)
  }

  async signMessage(message: string): Promise<string> {
    return this.agentWallet.signMessage(Buffer.from(message, 'utf-8'))
  }

  async signTypedData(payload: TypedDataPayload): Promise<string> {
    const sig = await (this.agentWallet as unknown as Eip712Capable).signTypedData(
      payload as unknown as Record<string, unknown>,
    )
    return sig.startsWith('0x') ? sig.slice(2) : sig
  }
}
