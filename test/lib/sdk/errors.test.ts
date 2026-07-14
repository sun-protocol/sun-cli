import { mapSdkError } from '../../../src/lib/sdk/errors'

describe('SDK error compatibility', () => {
  it('preserves existing wallet error code', () => {
    const err = mapSdkError(
      new Error('Wallet required. Set agent-wallet credentials before running this command.'),
    )

    expect((err as any).code).toBe('NO_WALLET')
  })

  it('preserves SDK error codes when present', () => {
    const err = mapSdkError(Object.assign(new Error('bad params'), { code: 'INVALID_ARGUMENT' }))

    expect(err.message).toBe('bad params')
    expect((err as any).code).toBe('INVALID_ARGUMENT')
  })
})
