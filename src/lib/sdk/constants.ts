import { getWrappedNativeAddress } from '@sun-sdk/chains'
import { TRON_ZERO_ADDRESS } from '@sun-sdk/core'

export const TRX_ADDRESS = TRON_ZERO_ADDRESS
export const WTRX_MAINNET = getWrappedNativeAddress('mainnet')
export const WTRX_NILE = getWrappedNativeAddress('nile')
