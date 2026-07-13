import { buildBalanceTokenList } from '../../src/commands/wallet'

describe('buildBalanceTokenList', () => {
  it('resolves token symbols for wallet balance checks', () => {
    expect(buildBalanceTokenList('TRX,SUN,USDT,USDD', undefined, 'nile')).toEqual([
      { address: '', type: 'TRX' },
      {
        address: '',
        type: 'TRC20',
        tokenAddress: 'TWrZRHY9aKQZcyjpovdH6qeCEyYZrRQDZt',
      },
      {
        address: '',
        type: 'TRC20',
        tokenAddress: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
      },
      {
        address: '',
        type: 'TRC20',
        tokenAddress: 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz',
      },
    ])
  })

  it('keeps explicit token addresses as-is', () => {
    const address = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'

    expect(buildBalanceTokenList(address, 'TOwnerAddress', 'nile')).toEqual([
      {
        address: 'TOwnerAddress',
        type: 'TRC20',
        tokenAddress: address,
      },
    ])
  })
})
