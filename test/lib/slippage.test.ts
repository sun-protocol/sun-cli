import { parseDecimalSlippage } from '../../src/lib/slippage'

describe('parseDecimalSlippage', () => {
  it.each([
    ['0', 0, '0%', '0.00%'],
    ['0.005', 50, '0.5%', '0.50%'],
    ['0.01', 100, '1%', '1.00%'],
    ['1', 10000, '100%', '100.00%'],
  ])('parses %s as a decimal ratio', (value, bips, sdk, display) => {
    expect(parseDecimalSlippage(value)).toEqual({ bips, sdk, display })
  })

  it.each(['', '-0.01', '0.00001', '0.01junk', '1.0001', '1e-2', '2', 'abc'])(
    'rejects invalid input %p',
    (value) => {
      expect(() => parseDecimalSlippage(value)).toThrow(
        '--slippage must be a decimal between 0 and 1 with at most 4 decimal places',
      )
    },
  )
})
