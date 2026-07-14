export type CliNetwork = 'mainnet' | 'nile' | 'shasta'

export type CliError = Error & {
  code?: string
  detail?: unknown
}
