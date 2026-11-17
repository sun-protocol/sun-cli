import { toCliTxResult } from '../../../src/lib/sdk/compat'

describe('SDK result compatibility', () => {
  const execution = (metadata: Record<string, unknown>) => ({
    plan: { metadata },
    txids: ['approval', 'tx'],
    finalResult: { type: 'transaction', txid: 'tx', raw: { result: true } },
  })

  it('restores legacy Pump business fields rather than exposing the internal execution plan', () => {
    expect(
      toCliTxResult(
        execution({
          operation: 'launchpad-buy-exact-trx',
          token: 'token',
          trxAmount: '100',
          quotedTokenAmount: '1000',
          minTokenOut: '0',
        }),
      ),
    ).toEqual({
      txResult: { result: true, txid: 'tx' },
      tokenAddress: 'token',
      trxSpent: '100',
      expectedTokens: '1000',
      minTokenOut: '0',
    })
    expect(
      toCliTxResult(
        execution({
          operation: 'launchpad-sell-exact-token',
          token: 'token',
          tokenAmount: '100',
          quotedTrxAmount: '900',
          minTrxOut: '800',
        }),
      ),
    ).toEqual({
      txResult: { result: true, txid: 'tx' },
      tokenAddress: 'token',
      tokensSold: '100',
      expectedTrx: '900',
      minTrxOut: '800',
    })
  })

  it('restores liquidity output fields without leaking other SDK metadata', () => {
    const computedTicks = { tickLower: -1000, tickUpper: 1000 }
    const computedAmounts = { amount0Desired: '100', amount1Desired: '200' }
    expect(
      toCliTxResult(
        execution({
          protocol: 'sunswap-v4',
          operation: 'mint-position',
          computedTicks,
          computedAmounts,
          createPool: false,
          deadline: '123',
        }),
      ),
    ).toEqual({
      txResult: { result: true, txid: 'tx' },
      computedTicks,
      computedAmounts,
      poolCreated: false,
    })
    expect(
      toCliTxResult(
        execution({
          protocol: 'sunswap-v3',
          operation: 'collect-position',
          estimatedFees: { amount0: '1', amount1: '2' },
        }),
      ),
    ).toEqual({
      txResult: { result: true, txid: 'tx' },
      estimatedFees: { amount0: '1', amount1: '2' },
    })
    expect(
      toCliTxResult(execution({ protocol: 'sunswap-v3', operation: 'remove-position' })),
    ).toEqual({ result: true, txid: 'tx' })
  })

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
      result: true,
    })
  })
})
