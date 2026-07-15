import { createContractCallAction, type ContractParameter, type TronAddress } from '@sun-sdk/core'
import type { Runtime } from '@sun-sdk/runtime'

interface AbiInput {
  type: string
  name?: string
  components?: readonly AbiInput[]
}

interface AbiOutput {
  type: string
  name?: string
  components?: readonly AbiInput[]
}

interface AbiFunction {
  type?: string
  name: string
  inputs?: readonly AbiInput[]
  outputs?: readonly AbiOutput[]
}

interface ContractAbiCallInput {
  address: string
  functionName: string
  args?: readonly unknown[]
  abi: readonly AbiFunction[]
  value?: bigint
  feeLimit?: number
}

interface BalanceInput {
  owner: string
  tokens: readonly string[]
}

interface BalanceResult {
  token: string
  balance: string
  decimals?: number
}

function findFunction(abi: readonly AbiFunction[], functionName: string): AbiFunction {
  const item = abi.find(
    (entry) => (entry.type === 'function' || !entry.type) && entry.name === functionName,
  )
  if (!item) throw new Error(`ABI function not found: ${functionName}`)
  return item
}

function abiType(input: AbiInput | AbiOutput): string {
  if (!input.type.startsWith('tuple')) return input.type
  const components = input.components ?? []
  const tuple = `(${components.map(abiType).join(',')})`
  return input.type.replace(/^tuple/, tuple)
}

function buildContractCall(input: ContractAbiCallInput) {
  const fn = findFunction(input.abi, input.functionName)
  const inputs = fn.inputs ?? []
  const args = input.args ?? []
  if (args.length !== inputs.length) {
    throw new Error(`${input.functionName} expects ${inputs.length} args, received ${args.length}`)
  }

  return {
    target: input.address as TronAddress,
    functionSelector: `${fn.name}(${inputs.map(abiType).join(',')})`,
    parameters: inputs.map(
      (abiInput, index): ContractParameter => ({
        type: abiType(abiInput),
        value: args[index],
      }),
    ),
    outputs: (fn.outputs ?? []).map((output) => ({
      type: abiType(output),
      ...(output.name ? { name: output.name } : {}),
    })),
  }
}

export async function readContractByAbi(
  runtime: Runtime,
  input: ContractAbiCallInput,
): Promise<unknown> {
  const call = buildContractCall(input)
  return runtime.readContract({
    target: call.target,
    functionSelector: call.functionSelector,
    parameters: call.parameters,
    outputs: call.outputs,
  })
}

export async function sendContractByAbi(
  runtime: Runtime,
  input: ContractAbiCallInput,
): Promise<unknown> {
  const call = buildContractCall(input)
  const action = createContractCallAction({
    id: `${input.functionName}-${Date.now()}`,
    target: call.target,
    functionSelector: call.functionSelector,
    parameters: call.parameters,
    ...(input.value !== undefined ? { callValue: input.value } : {}),
    ...(input.feeLimit !== undefined ? { feeLimit: input.feeLimit } : {}),
  })
  return runtime.sendAction(action)
}

async function readTrc20Balance(runtime: Runtime, owner: string, token: string): Promise<string> {
  return runtime.readContract<string>({
    target: token as TronAddress,
    functionSelector: 'balanceOf(address)',
    parameters: [{ type: 'address', value: owner }],
    outputs: [{ type: 'uint256' }],
  })
}

async function readTrc20Decimals(runtime: Runtime, token: string): Promise<number | undefined> {
  try {
    const value = await runtime.readContract<string>({
      target: token as TronAddress,
      functionSelector: 'decimals()',
      outputs: [{ type: 'uint8' }],
    })
    const decimals = Number(value)
    return Number.isFinite(decimals) ? decimals : undefined
  } catch {
    return undefined
  }
}

async function readTrxBalance(runtime: Runtime, owner: string): Promise<string> {
  const tronWeb = (runtime.provider as unknown as { __tronWeb?: any }).__tronWeb
  if (!tronWeb?.trx?.getBalance) {
    throw new Error('TRX balance reads require a TronWeb-backed sun-sdk runtime')
  }
  const balance = await tronWeb.trx.getBalance(owner)
  return String(balance)
}

export async function readBalances(
  runtime: Runtime,
  input: BalanceInput,
): Promise<BalanceResult[]> {
  return Promise.all(
    input.tokens.map(async (token) => {
      if (token.toUpperCase() === 'TRX') {
        return {
          token: 'TRX',
          balance: await readTrxBalance(runtime, input.owner),
          decimals: 6,
        }
      }

      const [balance, decimals] = await Promise.all([
        readTrc20Balance(runtime, input.owner, token),
        readTrc20Decimals(runtime, token),
      ])
      return { token, balance, decimals }
    }),
  )
}
