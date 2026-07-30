import { SunPump, SunPumpHttpError, SUNPUMP_DEFAULT_BASE_URL } from '../../src/lib/sunpump'

describe('SunPump', () => {
  it('uses default base URL', () => {
    const client = new SunPump()
    expect(SUNPUMP_DEFAULT_BASE_URL).toBe('https://api-v2.sunpump.meme/pump-api')
  })

  it('accepts custom base URL', () => {
    const client = new SunPump({ baseUrl: 'https://custom.example.com/api' })
    expect(client).toBeDefined()
  })

  it('accepts custom fetch implementation', () => {
    const mockFetch = jest.fn()
    const client = new SunPump({ fetchImpl: mockFetch as unknown as typeof fetch })
    expect(client).toBeDefined()
  })
})

describe('SunPumpHttpError', () => {
  it('has correct error code', () => {
    const err = new SunPumpHttpError('test error', 404, 'not found')
    expect(err.code).toBe('SUNPUMP_HTTP_ERROR')
    expect(err.status).toBe(404)
    expect(err.body).toBe('not found')
    expect(err.message).toBe('test error')
  })

  it('is an instance of Error', () => {
    const err = new SunPumpHttpError('test', 500)
    expect(err).toBeInstanceOf(Error)
  })
})
