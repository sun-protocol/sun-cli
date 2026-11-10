import { TRX_ADDRESS, WTRX_MAINNET, WTRX_NILE } from '../../../src/lib/sdk/constants'

describe('SDK compatibility constants', () => {
  it('keeps TRX and WTRX addresses compatible with the old CLI registry', () => {
    expect(TRX_ADDRESS).toBe('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')
    expect(WTRX_MAINNET).toBe('TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR')
    expect(WTRX_NILE).toBe('TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a')
  })
})
