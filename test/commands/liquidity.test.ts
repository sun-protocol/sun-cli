import { toV2TokenRef } from '../../src/commands/liquidity'

describe('V2 liquidity token adapter', () => {
  it('converts a TRON base58 token address to the EVM address expected by sun-sdk Token', () => {
    expect(toV2TokenRef('TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf')).toEqual({
      address: '0xeca9bc828a3005b9a3b909f2cc5c2a54794de05f',
    })
  })
})
