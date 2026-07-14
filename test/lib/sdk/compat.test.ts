import { toCliTxResult } from '../../../src/lib/sdk/compat'

describe('SDK result compatibility', () => {
  it('keeps nested txResult txid shape for explorer enrichment', () => {
    expect(toCliTxResult({ txResult: { txid: 'abc' }, raw: { result: true } })).toEqual({
      txResult: { txid: 'abc' },
      raw: { result: true },
    })
  })

  it('maps SDK txID to existing txid shape', () => {
    expect(toCliTxResult({ txID: 'abc', result: true })).toEqual({
      txid: 'abc',
      result: true,
    })
  })
})
