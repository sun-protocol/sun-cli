import type { CliError } from './types'

function hasStringCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as any).code === 'string'
}

export function mapSdkError(error: unknown, fallbackCode = 'UNKNOWN'): CliError {
  if (error instanceof Error && /wallet required|agent-wallet|no wallet/i.test(error.message)) {
    return Object.assign(error, { code: 'NO_WALLET' })
  }

  if (hasStringCode(error)) {
    return error
  }

  if (error instanceof Error) {
    return Object.assign(error, { code: fallbackCode })
  }

  return Object.assign(new Error(String(error)), { code: fallbackCode, detail: error })
}
