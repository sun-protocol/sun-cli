export function toCliTxResult<T>(result: T): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result
  }

  const record = result as Record<string, unknown>
  const finalResult = record.finalResult as Record<string, unknown> | undefined
  if (finalResult && finalResult.type === 'transaction' && typeof finalResult.txid === 'string') {
    return {
      txid: finalResult.txid,
      raw: finalResult.raw,
    }
  }

  if (Array.isArray(record.txids) && typeof record.txids[record.txids.length - 1] === 'string') {
    return {
      txid: record.txids[record.txids.length - 1],
      raw: result,
    }
  }

  if (typeof record.txid === 'string') return result
  if (typeof record.txID !== 'string') return result

  const { txID, ...rest } = record
  void txID
  return { txid: record.txID, ...rest } as T & { txid: string }
}
