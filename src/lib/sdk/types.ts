import type { SunSDK } from '@sun-protocol/sun-sdk-protocols'
import type { Runtime } from '@sun-protocol/sun-sdk-runtime'

export type CliNetwork = 'mainnet' | 'nile' | 'shasta'

export type CliError = Error & {
  code?: string
  detail?: unknown
}

/**
 * The CLI always creates SunSDK with a runtime.  Keep that invariant visible to
 * command implementations even though the public SDK also supports read-only
 * construction without one.
 */
export type CliSunSDK = SunSDK & { readonly runtime: Runtime }
