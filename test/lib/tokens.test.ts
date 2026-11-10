import {
  resolveTokenAddress,
  tryResolveTokenAddress,
  getTokenByAddress,
  getSymbolOrAddress,
  listKnownSymbols,
  isAddress,
} from '../../src/lib/tokens'

/**
 * Expected CLI aliases and token metadata for each network.
 * If a token is added/removed from the registry, update this map and src/lib/tokens.ts together.
 */
const EXPECTED: Record<string, Record<string, { address: string; decimals: number }>> = {
  mainnet: {
    TRX: { address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', decimals: 6 },
    WTRX: { address: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR', decimals: 6 },
    USDT: { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
    USDCOLD: { address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6 },
    USDDOLD: { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', decimals: 18 },
    USDD: { address: 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz', decimals: 18 },
    BTT: { address: 'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4', decimals: 18 },
    JST: { address: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9', decimals: 18 },
    SUN: { address: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S', decimals: 18 },
  },
  nile: {
    TRX: { address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', decimals: 6 },
    WTRX: { address: 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a', decimals: 6 },
    USDT: { address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf', decimals: 6 },
    USDCOLD: { address: 'TWMCMCoJPqCGw5RR7eChF2HoY3a9B8eYA3', decimals: 6 },
    USDDOLD: { address: 'TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK', decimals: 18 },
    USDD: { address: 'TZ78R2E6ejfFhxq8hxrmuqT6hGBxjHQbo4', decimals: 18 },
    SUN: { address: 'TWrZRHY9aKQZcyjpovdH6qeCEyYZrRQDZt', decimals: 18 },
    USDJ: { address: 'TLBaRhANQoJFTqre9Nf1mjuwNWjCJeYqUL', decimals: 18 },
    TUSD: { address: 'TRz7J6dD2QWxBoumfYt4b3FaiRG23pXfop', decimals: 18 },
    JST: { address: 'TF17BgPaZYbz8oxbjhriubPDsA7ArKoLX3', decimals: 18 },
  },
}

describe('token registry', () => {
  for (const [network, tokens] of Object.entries(EXPECTED)) {
    describe(network, () => {
      for (const [symbol, info] of Object.entries(tokens)) {
        it(`resolves ${symbol} → ${info.address}`, () => {
          expect(resolveTokenAddress(symbol, network)).toBe(info.address)
        })

        it(`reverse-lookups ${info.address} → ${symbol}`, () => {
          const token = getTokenByAddress(info.address, network)
          expect(token).toEqual({ symbol, ...info })
        })
      }

      it('listKnownSymbols includes all expected symbols', () => {
        const symbols = listKnownSymbols(network)
        for (const symbol of Object.keys(tokens)) {
          expect(symbols).toContain(symbol)
        }
      })
    })
  }
})

describe('resolveTokenAddress', () => {
  it('returns address as-is when a valid TRON address is passed', () => {
    const addr = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    expect(resolveTokenAddress(addr, 'mainnet')).toBe(addr)
  })

  it('is case-insensitive for symbols', () => {
    expect(resolveTokenAddress('trx', 'mainnet')).toBe('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')
    expect(resolveTokenAddress('Usdt', 'mainnet')).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
  })

  it('throws for unknown symbol', () => {
    expect(() => resolveTokenAddress('UNKNOWN_TOKEN', 'mainnet')).toThrow('Unknown token symbol')
  })
})

describe('tryResolveTokenAddress', () => {
  it('returns address for known symbol', () => {
    expect(tryResolveTokenAddress('USDT', 'mainnet')).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
  })

  it('returns null for unknown symbol', () => {
    expect(tryResolveTokenAddress('NONEXISTENT', 'mainnet')).toBeNull()
  })
})

describe('getSymbolOrAddress', () => {
  it('returns symbol for known address', () => {
    expect(getSymbolOrAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'mainnet')).toBe('USDT')
  })

  it('returns address unchanged for unknown address', () => {
    const addr = 'TUnknownAddr1234567890123456789012'
    expect(getSymbolOrAddress(addr, 'mainnet')).toBe(addr)
  })
})

describe('isAddress', () => {
  it('recognises valid TRON addresses', () => {
    expect(isAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe(true)
    expect(isAddress('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')).toBe(true)
  })

  it('rejects non-address strings', () => {
    expect(isAddress('USDT')).toBe(false)
    expect(isAddress('0x1234')).toBe(false)
    expect(isAddress('')).toBe(false)
  })
})
