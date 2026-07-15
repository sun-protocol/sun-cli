/**
 * Token symbol <-> address resolution utilities.
 * Provides a unified way to resolve token symbols to addresses across all commands.
 */

import { TRX_ADDRESS, WTRX_MAINNET, WTRX_NILE } from './sdk/constants'

export interface TokenInfo {
  symbol: string
  address: string
  decimals: number
}

// Mainnet tokens (aligned with common_tokens.json + common extras)
const MAINNET_TOKENS: Record<string, TokenInfo> = {
  TRX: { symbol: 'TRX', address: TRX_ADDRESS, decimals: 6 },
  WTRX: { symbol: 'WTRX', address: WTRX_MAINNET, decimals: 6 },
  USDT: { symbol: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 },
  USDC: { symbol: 'USDC', address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6 },
  USDD: { symbol: 'USDD', address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', decimals: 18 },
  SUN: { symbol: 'SUN', address: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S', decimals: 18 },
  JST: { symbol: 'JST', address: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9', decimals: 18 },
  BTT: { symbol: 'BTT', address: 'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4', decimals: 18 },
  WIN: { symbol: 'WIN', address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7', decimals: 6 },
  NFT: { symbol: 'NFT', address: 'TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq', decimals: 6 },
  TUSD: { symbol: 'TUSD', address: 'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4', decimals: 18 },
  USDJ: { symbol: 'USDJ', address: 'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT', decimals: 18 },
}

// Nile testnet tokens (from common_tokens.json)
const NILE_TOKENS: Record<string, TokenInfo> = {
  TRX: { symbol: 'TRX', address: TRX_ADDRESS, decimals: 6 },
  WTRX: { symbol: 'WTRX', address: WTRX_NILE, decimals: 6 },
  USDT: { symbol: 'USDT', address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf', decimals: 6 },
  USDC: { symbol: 'USDC', address: 'TWMCMCoJPqCGw5RR7eChF2HoY3a9B8eYA3', decimals: 6 },
  USDD: { symbol: 'USDD', address: 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz', decimals: 18 },
  SUN: { symbol: 'SUN', address: 'TWrZRHY9aKQZcyjpovdH6qeCEyYZrRQDZt', decimals: 18 },
  USDJ: { symbol: 'USDJ', address: 'TLBaRhANQoJFTqre9Nf1mjuwNWjCJeYqUL', decimals: 18 },
  TUSD: { symbol: 'TUSD', address: 'TRz7J6dD2QWxBoumfYt4b3FaiRG23pXfop', decimals: 18 },
  JST: { symbol: 'JST', address: 'TF17BgPaZYbz8oxbjhriubPDsA7ArKoLX3', decimals: 18 },
}

const TOKEN_REGISTRY: Record<string, Record<string, TokenInfo>> = {
  mainnet: MAINNET_TOKENS,
  nile: NILE_TOKENS,
}

/**
 * Get the token registry for a given network
 */
export function getTokenRegistry(network: string): Record<string, TokenInfo> {
  const normalized = network.toLowerCase()
  return TOKEN_REGISTRY[normalized] || MAINNET_TOKENS
}

/**
 * Check if the input looks like a TRON address (starts with T and is ~34 chars)
 */
export function isAddress(input: string): boolean {
  return input.startsWith('T') && input.length >= 30 && input.length <= 36
}

/**
 * Resolve a token input (symbol or address) to a token address.
 * Returns the input as-is if it's already an address.
 * Throws if the symbol is not found.
 */
export function resolveTokenAddress(input: string, network: string): string {
  if (isAddress(input)) {
    return input
  }

  const registry = getTokenRegistry(network)
  const upper = input.toUpperCase()
  const token = registry[upper]

  if (token) {
    return token.address
  }

  throw new Error(
    `Unknown token symbol: ${input}. ` +
      `Known symbols for ${network}: ${Object.keys(registry).join(', ')}. ` +
      `Or use a token address directly.`,
  )
}

/**
 * Try to resolve a token input, returning null if not found (no throw)
 */
export function tryResolveTokenAddress(input: string, network: string): string | null {
  try {
    return resolveTokenAddress(input, network)
  } catch {
    return null
  }
}

/**
 * Get token info by address (reverse lookup)
 */
export function getTokenByAddress(address: string, network: string): TokenInfo | null {
  const registry = getTokenRegistry(network)
  for (const token of Object.values(registry)) {
    if (token.address === address) {
      return token
    }
  }
  return null
}

/**
 * Get symbol for an address, returns the address if not found
 */
export function getSymbolOrAddress(address: string, network: string): string {
  const token = getTokenByAddress(address, network)
  return token?.symbol || address
}

/**
 * List all known token symbols for a network
 */
export function listKnownSymbols(network: string): string[] {
  return Object.keys(getTokenRegistry(network))
}
