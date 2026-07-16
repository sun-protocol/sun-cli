import { extractTxids } from '../../src/commands/e2e'

describe('E2E result parsing', () => {
  it('extracts and deduplicates transaction ids from SDK-compatible output', () => {
    const first = 'a'.repeat(64)
    const second = 'b'.repeat(64)

    expect(
      extractTxids({
        txid: second,
        raw: { txids: [first, second], finalResult: { txID: second } },
      }),
    ).toEqual([second, first])
  })

  it('ignores hashes outside transaction result fields', () => {
    expect(extractTxids({ poolId: 'a'.repeat(64), txid: 'not-a-txid' })).toEqual([])
  })
})
