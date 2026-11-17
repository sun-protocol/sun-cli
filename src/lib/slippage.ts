export interface ParsedDecimalSlippage {
  /** Slippage in whole basis points. */
  bips: number
  /** Percentage string accepted by the public SDK. */
  sdk: `${number}%`
  /** Stable human-readable percentage. */
  display: string
}

/**
 * Parse the CLI's decimal-ratio syntax exactly: 0.01 means 1%.
 * Four decimal places are the smallest value representable as whole basis points.
 */
export function parseDecimalSlippage(value: string, label = '--slippage'): ParsedDecimalSlippage {
  const match = /^(0|1)(?:\.(\d+))?$/.exec(value)
  const fraction = match?.[2] ?? ''
  if (!match || fraction.length > 4 || (match[1] === '1' && /[1-9]/.test(fraction))) {
    throw new Error(`${label} must be a decimal between 0 and 1 with at most 4 decimal places`)
  }

  const bips = Number(match[1]) * 10_000 + Number(fraction.padEnd(4, '0'))
  const percent = bips / 100
  return {
    bips,
    sdk: `${percent}%`,
    display: `${percent.toFixed(2)}%`,
  }
}
