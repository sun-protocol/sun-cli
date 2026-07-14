import { AgentWalletSdkAdapter } from '../../../src/lib/sdk/wallet'

describe('AgentWalletSdkAdapter', () => {
  it('adapts agent-wallet signing to SDK WalletAdapter', async () => {
    const agentWallet = {
      getAddress: jest.fn().mockResolvedValue('TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX'),
      signTransaction: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ txID: 'abc', signature: ['sig'] })),
      signMessage: jest.fn().mockResolvedValue('signed'),
      signTypedData: jest.fn().mockResolvedValue('0xtyped'),
    }

    const wallet = new AgentWalletSdkAdapter(agentWallet as any)

    expect(wallet.kind).toBe('custom')
    expect(wallet.capabilities).toEqual({
      signTransaction: true,
      signAndSendTransaction: false,
      signTypedData: true,
      userInteractive: false,
    })
    expect(await wallet.getAddress()).toBe('TAUN6FwrnwwmaEqYcckffC7wYmbaS6cBiX')
    expect(await wallet.signTransaction!({ txID: 'abc' })).toEqual({
      txID: 'abc',
      signature: ['sig'],
    })
    expect(await wallet.signMessage!('hello')).toBe('signed')
    expect(await wallet.signTypedData!({ domain: {}, types: {}, message: {} })).toBe('typed')
    expect(agentWallet.signMessage).toHaveBeenCalledWith(Buffer.from('hello', 'utf-8'))
  })
})
