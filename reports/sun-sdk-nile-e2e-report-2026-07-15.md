# sun-cli / sun-sdk Nile E2E 测试报告

日期：2026-07-15
分支：`feature/sdk-e2e-tests`
目标：验证 Caleb 迁移后的 `sun-cli` 直接依赖 `@sun-sdk/*`，不再依赖 `@sun-protocol/sun-kit`，并用 Nile 环境覆盖核心 CLI 功能。

## 迁移与测试代码调整

- 已确认源码、测试、README、package 中不再引用 `@sun-protocol/sun-kit` / `sun-kit` / `SunKit`。
- `token approve` 已恢复为基于 `@sun-sdk/core#createApproveAction` + `@sun-sdk/runtime#sendAction` 的 CLI write 命令。
- 新增 CLI 本地 `runtime-compat`，用于补齐当前 SDK runtime 未直接导出的 CLI 便捷能力：ABI contract read/send、wallet balances。
- Nile token registry 已补充 `USDD = TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz`，用于 Caleb/Leon 推荐的 `USDD-USDT` 测试路径。
- V4 position read 已通过 CLI provider 兼容层改为低层 `triggerConstantContract` 读取，规避 TronWeb 自动 ABI 解析 V4 PositionManager 时的 `EE Error`。

## 本地静态与单测

| 项目                      | 结果                       |
| ------------------------- | -------------------------- |
| `npm run build`           | 通过                       |
| `npm test -- --runInBand` | 通过，8 suites / 110 tests |
| sun-kit 残留扫描          | 通过，无残留引用           |

## Nile Read-only / Dry-run E2E

命令：

```bash
npm run dev -- --network nile e2e nile --timeout 30000
```

结果：

| Total | Passed | Failed | Skipped |
| ----: | -----: | -----: | ------: |
|    32 |     30 |      0 |       2 |

Skipped 项：

- `wallet address`
- `wallet balances`

原因：Codex 执行进程没有继承本地终端里的 `AGENT_WALLET_PRIVATE_KEY`。这两个 case 需要在已配置一次性钱包私钥的终端里跑。

## Nile Write E2E

命令：

```bash
npm run dev -- --network nile e2e nile --write --timeout 30000
```

钱包：

- Address: `TSTtBVZWFHzU5FS2a7MtsZcTLFG12kvzet`

结果：

| Total | Passed | Failed | Skipped |
| ----: | -----: | -----: | ------: |
|    35 |     35 |      0 |       0 |

真实 broadcast：

| 功能                   | 参数                                                                     | Tx Hash                                                            |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| approve write          | `token approve --token USDT --spender TMn1... --amount 1`                | `a63035892d628578236fb482fa33c2cc377d5eafe27fe8b0a553b4921a9af1f4` |
| swap write             | `swap TRX SUN 1000000`                                                   | `ed3505b36549ec7a0900613d7233e0b0ad08f757a39cd28ade81d10c36b11e46` |
| V2 add liquidity write | `liquidity v2:add --token-a TRX --token-b SUN --amount-a 1 --amount-b 1` | `8a21892fd776216d74b9ffbb2bb4be747348a98319f1e58ffe95c5dd07b3b744` |

V2 add liquidity 额外自动执行了一笔 SUN approve：

- `71db2def496cca387b82aa27cd266ac2bc26892c5e0822af4f7647cfe14cc6fd`

## 功能覆盖明细

| 功能                  | 参数/命令摘要                                                                            | 结果摘要                                                                        | Tx Hash |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------- |
| wallet address        | `wallet address`                                                                         | 返回 `TSTtBVZWFHzU5FS2a7MtsZcTLFG12kvzet`                                       | N/A     |
| wallet balances       | `wallet balances --tokens TRX,TXYZ...`                                                   | 返回 TRX balance、USDT balance                                                  | N/A     |
| price                 | `price TRX`                                                                              | 返回 TRX USD price                                                              | N/A     |
| token list            | `token list --address TXYZ... --page-size 1`                                             | 返回 `list/meta`，空列表合法                                                    | N/A     |
| token search          | `token search USDT --page-size 1`                                                        | 返回 USDT token 信息                                                            | N/A     |
| pool list             | `pool list --token USDT --page-size 1`                                                   | 返回 `list/meta`                                                                | N/A     |
| pool search           | `pool search TRX USDT --page-size 1`                                                     | 返回 V3 WTRX/USDT pool                                                          | N/A     |
| pool search USDD/USDT | `pool search USDD USDT --page-size 5`                                                    | 返回 V3、CURVE、V4 pool，覆盖推荐交易对                                         | N/A     |
| pool top apy          | `pool top-apy --page-size 1`                                                             | 返回 top APY pool                                                               | N/A     |
| pool hooks            | `pool hooks`                                                                             | 返回 V4 Dynamic Fee hook                                                        | N/A     |
| pair info             | `pair info --token TXYZ... --page-size 1`                                                | 返回 `list/meta`，空列表合法                                                    | N/A     |
| farm list             | `farm list --page-size 1`                                                                | 返回 farm 信息                                                                  | N/A     |
| tx scan               | `tx scan --token TXYZ... --page-size 1`                                                  | 返回 `list/meta`                                                                | N/A     |
| protocol info         | `protocol info`                                                                          | 返回 V1/V1_5/V2/CURVE/V3/V4/ALL 汇总                                            | N/A     |
| position list         | `position list --page-size 1`                                                            | 返回 V3 position 信息                                                           | N/A     |
| router quote          | `swap:quote TRX USDT 1000000`                                                            | 返回 route、amountOut、impact、poolVersions                                     | N/A     |
| router quote          | `swap:quote TRX SUN 1000000`                                                             | 返回 TRX -> SUN route                                                           | N/A     |
| contract read         | `contract read USDT decimals --abi ...`                                                  | 返回 `{"result":"6"}`                                                           | N/A     |
| approve dry-run       | `--dry-run token approve --token USDT --spender TMn1... --amount 1`                      | 返回 dryRun action/params                                                       | N/A     |
| swap dry-run          | `--dry-run swap TRX SUN 1000000`                                                         | 返回 Swap Preview action/params                                                 | N/A     |
| V2 add dry-run        | `--dry-run liquidity v2:add --token-a TRX --token-b SUN --amount-a 1 --amount-b 1`       | 返回 V2 Add Liquidity action/params                                             | N/A     |
| V2 remove dry-run     | `--dry-run liquidity v2:remove --token-a TRX --token-b SUN --liquidity 1`                | 返回 V2 Remove Liquidity action/params                                          | N/A     |
| V3 mint dry-run       | `--dry-run liquidity v3:mint --token0 USDD --token1 USDT --amount0 1`                    | 返回 V3 Mint Position action/params                                             | N/A     |
| V3 increase dry-run   | `--dry-run liquidity v3:increase --token-id 1 --amount0 1`                               | 返回 V3 Increase Liquidity action/params                                        | N/A     |
| V3 decrease dry-run   | `--dry-run liquidity v3:decrease --token-id 1 --liquidity 1`                             | 返回 V3 Decrease Liquidity action/params                                        | N/A     |
| V3 collect dry-run    | `--dry-run liquidity v3:collect --token-id 1`                                            | 返回 V3 Collect Fees action/params                                              | N/A     |
| V4 mint dry-run       | `--dry-run liquidity v4:mint --token0 USDD --token1 USDT --amount0 1`                    | 返回 V4 Mint Position action/params                                             | N/A     |
| V4 increase dry-run   | `--dry-run liquidity v4:increase --token-id 1 --token0 USDD --token1 USDT --amount0 1`   | 返回 V4 Increase Liquidity action/params                                        | N/A     |
| V4 decrease dry-run   | `--dry-run liquidity v4:decrease --token-id 1 --liquidity 1 --token0 USDD --token1 USDT` | 返回 V4 Decrease Liquidity action/params                                        | N/A     |
| V4 collect dry-run    | `--dry-run liquidity v4:collect --token-id 1`                                            | 返回 V4 Collect Fees action/params                                              | N/A     |
| V4 info               | `liquidity v4:info --pm TMTQ... --token-id 1`                                            | 返回 `currency0=TWM...`、`currency1=TXYZ...`、`fee=500`、`liquidity=2759705520` | N/A     |
| contract send dry-run | `--dry-run contract send USDT approve --args [...] --abi ...`                            | 返回 Contract Transaction action/params                                         | N/A     |

## 与原 CLI API 输出一致性

- OpenAPI 类查询命令仍输出原来的 `list/meta` 或数组结构，例如 token/pool/farm/tx/protocol/position。
- Router quote 输出保留 `amountIn`、`amountOut`、`impact`、`tokens`、`symbols`、`poolVersions` 等字段。
- Dry-run write 命令仍统一输出 `dryRun/action/params`。
- 交易结果通过 `toCliTxResult` 统一成 CLI 侧 `txid/raw` 形态，保持对外展示兼容。
- 差异：generic `contract read/send` 现在基于 sun-sdk runtime，需要传 ABI 才能构建 selector 和 outputs；E2E 已补充 ABI。

## 结论

- Caleb 迁移后的 sun-sdk CLI 路径已完成 build、unit test、Nile read/dry-run E2E、Nile write E2E 验证。
- 本次真实 write E2E 已用一次性 Nile 钱包签名并广播，交易 hash 已记录。
- 不需要额外换测试币；当前默认 write set 依赖 TRX，swap 会产生后续 V2 add 所需的少量 SUN。
