import { getWrappedNativeAddress } from '@sun-protocol/sun-sdk-chains'
import { TRON_ZERO_ADDRESS } from '@sun-protocol/sun-sdk-core'

export const TRX_ADDRESS = TRON_ZERO_ADDRESS
export const WTRX_MAINNET = getWrappedNativeAddress('mainnet')
export const WTRX_NILE = getWrappedNativeAddress('nile')

// Preserve the fee defaults of the pre-migration SunKit implementation.
// Fees are expressed in millionths: 3000 = 0.3%, 500 = 0.05%.
export const DEFAULT_V3_FEE = 3000
export const DEFAULT_V4_FEE = 500

// The CLI's legacy Nile V3 deployment differs from the SUN.io SDK default.
export const CLI_V3_FACTORY = {
  mainnet: 'TThJt8zaJzJMhCEScH7zWKnp5buVZqys9x',
  nile: 'TLJWAScHZ4Qmk1axyKMzrnoYuu2pSLer1F',
} as const
