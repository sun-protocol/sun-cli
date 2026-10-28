import { assertTronAddress } from '@sun-protocol/sun-sdk-core'
import { buildV3PoolStateReads, buildV3PositionRead } from '@sun-protocol/sun-sdk-sunswap-v3'
import { TronWeb } from 'tronweb'
import { CLI_V3_FACTORY, TRX_ADDRESS } from './constants'
import type { CliSunSDK } from './types'

function address(value: unknown): string {
  const raw = String(Array.isArray(value) ? value[0] : value)
  return raw.startsWith('T')
    ? raw
    : TronWeb.address.fromHex(raw.startsWith('0x') ? `41${raw.slice(2)}` : raw)
}

/** Look up the exact legacy CLI pool on-chain; do not assume the SDK's factory/init-code hash. */
export async function resolveLegacyV3Pool(
  sdk: CliSunSDK,
  input: {
    token0?: string
    token1?: string
    fee?: number
    tokenId?: string
    positionManager?: string
    positionAbi?: string
  },
) {
  let { token0, token1, fee } = input
  if (token0 === undefined || token1 === undefined || fee === undefined) {
    if (!input.tokenId || !input.positionManager) throw new Error('V3 position context is required')
    const position = (await (input.positionAbi === undefined
      ? sdk.runtime.readContract(
          buildV3PositionRead({
            network: sdk.network,
            tokenId: input.tokenId,
            positionManager: assertTronAddress(input.positionManager),
          }),
        )
      : sdk.runtime.contract.read({
          address: input.positionManager,
          abi: JSON.parse(input.positionAbi),
          functionName: 'positions',
          args: [input.tokenId],
        }))) as Record<string, unknown> | readonly unknown[]
    const values = position as Record<string, unknown>
    token0 = address(values.token0 ?? values[2])
    token1 = address(values.token1 ?? values[3])
    fee = Number(values.fee ?? values[4])
  }
  const pool = address(
    await sdk.runtime.contract.read({
      address: CLI_V3_FACTORY[sdk.network],
      functionSelector: 'getPool(address,address,uint24)',
      parameters: [
        { type: 'address', value: token0 },
        { type: 'address', value: token1 },
        { type: 'uint24', value: fee },
      ],
      outputs: [{ type: 'address' }],
    }),
  )
  if (pool === TRX_ADDRESS) throw new Error(`V3 pool not found for ${token0}/${token1} fee=${fee}`)
  const reads = buildV3PoolStateReads({ pool: assertTronAddress(pool) })
  const results = await sdk.runtime.multicall([reads[0]!, reads[1]!, reads[3]!])
  if (results.some((result) => !result.success)) throw new Error('V3 legacy pool state read failed')
  const slot = results[0]!.value as Record<string, unknown>
  return {
    sqrtRatioX96: String(slot.sqrtPriceX96 ?? slot[0]),
    tickCurrent: Number(slot.tick ?? slot[1]),
    liquidity: String(results[1]!.value),
    tickSpacing: Number(results[2]!.value),
  }
}
