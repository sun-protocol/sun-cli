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

  it('maps SDK transaction plan execution to txid shape', () => {
    expect(
      toCliTxResult({
        txids: ['first', 'last'],
        finalResult: { type: 'transaction', txid: 'last', raw: { result: true } },
      }),
    ).toEqual({
      txid: 'last',
      raw: { result: true },
    })
  })
})
