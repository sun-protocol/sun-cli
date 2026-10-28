export function toCliTxResult<T>(result: T): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result
  }

  const record = result as Record<string, unknown>
  const metadata = (record.plan as { metadata?: Record<string, unknown> } | undefined)?.metadata
  const finalResult = record.finalResult as Record<string, unknown> | undefined
  if (finalResult && finalResult.type === 'transaction' && typeof finalResult.txid === 'string') {
    const txResult = { result: true, txid: finalResult.txid }
    if (metadata?.operation === 'launchpad-buy-exact-trx') {
      return {
        txResult,
        tokenAddress: metadata.token,
        trxSpent: metadata.trxAmount,
        expectedTokens: metadata.quotedTokenAmount,
        minTokenOut: metadata.minTokenOut,
      }
    }
    if (metadata?.operation === 'launchpad-sell-exact-token') {
      return {
        txResult,
        tokenAddress: metadata.token,
        tokensSold: metadata.tokenAmount,
        expectedTrx: metadata.quotedTrxAmount,
        minTrxOut: metadata.minTrxOut,
      }
    }
    if (metadata?.protocol === 'sunswap-v3' || metadata?.protocol === 'sunswap-v4') {
      if (metadata.protocol === 'sunswap-v3' && metadata.operation === 'remove-position')
        return txResult
      const mapped: Record<string, unknown> = { txResult }
      for (const key of [
        'computedAmounts',
        'computedTicks',
        'computedAmountMin',
        'estimatedFees',
      ]) {
        if (metadata[key] !== undefined) mapped[key] = metadata[key]
      }
      if (metadata.operation === 'mint-position') mapped.poolCreated = metadata.createPool
      return mapped
    }
    return txResult
  }

  if (Array.isArray(record.txids) && typeof record.txids[record.txids.length - 1] === 'string') {
    return {
      txid: record.txids[record.txids.length - 1],
      result: true,
    }
  }

  if (typeof record.txid === 'string') {
    return 'raw' in record ? { result: true, txid: record.txid } : result
  }
  if (typeof record.txID !== 'string') return result

  const { txID, ...rest } = record
  void txID
  return { txid: record.txID, ...rest } as T & { txid: string }
}
