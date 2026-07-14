export function toCliTxResult<T>(result: T): T | (T & { txid: string }) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result
  }

  const record = result as Record<string, unknown>
  if (typeof record.txid === 'string') return result
  if (typeof record.txID !== 'string') return result

  const { txID, ...rest } = record
  void txID
  return { txid: record.txID, ...rest } as T & { txid: string }
}
