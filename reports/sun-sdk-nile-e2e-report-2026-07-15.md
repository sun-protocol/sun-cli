# sun-cli / sun-sdk Nile E2E 测试报告

日期：2026-07-15 至 2026-07-16

CLI 分支：`feature/sdk-e2e-tests`

SDK 分支：`dev`

测试钱包：`TSTtBVZWFHzU5FS2a7MtsZcTLFG12kvzet`

## 最终结论

- `sun-cli` 已移除 `@sun-protocol/sun-kit`，直接依赖 registry 发布的 `@sun-sdk/* 0.1.14`。
- `npm ls` 确认全部直接及传递 `@sun-sdk/*` 依赖统一为 `0.1.14`，不是本地 workspace link。
- 最终真实 Nile write E2E：`44 total / 44 passed / 0 failed / 0 skipped`。
- 每个 write case 不仅检查 CLI 退出码，还提取全部 txid、查询 Nile receipt 并要求 `SUCCESS`。
- V3/V4 mint 后从本轮 receipt 的 NFT `Transfer` 日志动态取得 tokenId，再串联 increase/decrease/collect，不依赖历史仓位。
- E2E 同时断言原 CLI/API 的关键 JSON 输出结构；字段缺失或结构变化会直接判定失败。

## 验证结果

| 项目                         | 结果                                     |
| ---------------------------- | ---------------------------------------- |
| SDK unit                     | PASS，85 files / 419 tests               |
| SDK typecheck / build / lint | PASS                                     |
| CLI build                    | PASS                                     |
| CLI unit                     | PASS，10 suites / 113 tests              |
| CLI lint                     | PASS，0 errors；5 个既有 unused warnings |
| Registry 依赖                | PASS，全部 `@sun-sdk/* 0.1.14`           |
| Nile E2E write               | PASS，44 / 44，无失败、无跳过            |

执行命令：

```bash
npm run test:e2e:nile:write
```

前置条件：设置一次性 Nile 钱包私钥，钱包具备足够 TRX、USDT、TDqj、TGjg 测试资产。

## 测试参数

| 类型            | 值                                                                                    |
| --------------- | ------------------------------------------------------------------------------------- |
| Nile V2 Router  | `TYMjxCXfqLpMWW1QToP6hbcjpion7EE25p`                                                  |
| V2 pair         | USDT `TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` / TDqj `TDqjTkZ63yHB19w2n7vPm2qAkLHwn9fKKk` |
| V3 pair         | USDT / TGjg `TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK`，fee `3000`                          |
| V4 pair         | USDT / TGjg，fee `500`，tick `[-120,120]`                                             |
| V4 parameters   | `0x00000000000000000000000000000000000000000000000000000000000a0000`                  |
| V3 本轮 tokenId | `619`                                                                                 |
| V4 本轮 tokenId | `114`                                                                                 |

## 最终上链结果

| 模块  | 用例       | 参数摘要                                      | 最终 Tx Hash                                                       | Receipt                |
| ----- | ---------- | --------------------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| token | approve    | USDT -> V2 Router，amount `1`                 | `db6d2bd7b67f022208e2e2b7ccc37ac1a24678539a63a79d02080aa34b4f5f58` | SUCCESS                |
| swap  | TRX -> SUN | amountIn `1000000`                            | `bfbda185252fab8dce14a9a04f2a0814743885469e03a5b710f96cae58f4bf76` | SUCCESS                |
| V2    | add        | USDT/TDqj，amountA `100000`，amountB 自动计算 | `7301d06930bb33fd5132c6f0d5482c70bd4930ee4435501e2b7106d66427a752` | SUCCESS                |
| V2    | remove     | liquidity `1000000000000`                     | `d50382d4b9e6bfbff5e458e27496653dd2f9e661e109c838ad4cf99ff28164ff` | SUCCESS                |
| V3    | mint       | USDT/TGjg，fee `3000`                         | `0c67078a28c0cdc72aaf721f52b1388b626ebc430fdaf7d788c23546057110d5` | SUCCESS，tokenId `619` |
| V3    | increase   | tokenId `619`                                 | `4cf0f409ac4eb8b5a09d1f3e90d21297be231f9e55f3c08a871ef7c2816a8c4c` | SUCCESS                |
| V3    | decrease   | tokenId `619`，liquidity `1`                  | `1525f52c0b08f85879cf67a912835c50c4b63a0843fbe0d08a5c834e0ee41b24` | SUCCESS                |
| V3    | collect    | tokenId `619`                                 | `99d29a0dce94bd148da11961948a49e01a011d2b98b1796804c953fff8b3ea14` | SUCCESS                |
| V4    | mint       | USDT/TGjg，fee `500`，liquidity `100000`      | `f5859d9f02ad960e1164661798eeccf56e85d87201958c95c3672d9f644f7e1e` | SUCCESS，tokenId `114` |
| V4    | increase   | tokenId `114`，liquidity `100000`             | `25a46f4b688530f40c19d29d724ee69eae4542fd7353f309bff73092ec811e0b` | SUCCESS                |
| V4    | decrease   | tokenId `114`，liquidity `1`                  | `9c4ccd83aa8ce876ed3c9b08857249cc234aaaeec36322d34189f9dca6facebd` | SUCCESS                |
| V4    | collect    | tokenId `114`                                 | `a63011d552ebaf77fe476a18750d641facf6fc5c20b5911199c0b227a68aa2a7` | SUCCESS                |

V2 add 的两笔 token approve txid：

- `6c34ff99cd9fcb2d6adb799942544fbf8d55ec2160dcdc05c6a4b964be748032`
- `83b8cc6dd8d2e40c1c84e80aa33d6f73d7fed9fac894282e90e5bc50004d4f87`

V2 remove 的 LP approve txid：`b905037b416407b5440e43c52929d5430fb19fd40a9ccdb938c6cd723028ab30`。

## Case List / Status

| ID  | 模块       | 覆盖内容                                                | 类型         | 状态         |
| --- | ---------- | ------------------------------------------------------- | ------------ | ------------ |
| C01 | dependency | 无 sun-kit；registry SDK 0.1.14 依赖树                  | static       | PASS         |
| C02 | build/unit | SDK + CLI build、unit、typecheck、lint                  | local        | PASS         |
| C03 | wallet     | address / TRX 与 TRC20 balances                         | Nile read    | PASS         |
| C04 | OpenAPI    | price/token/pool/pair/farm/tx/protocol/position         | Nile read    | PASS         |
| C05 | router     | TRX->USDT、TRX->SUN quote                               | Nile read    | PASS         |
| C06 | contract   | TRC20 decimals read；send dry-run                       | read/dry-run | PASS         |
| C07 | token      | approve dry-run + write                                 | write        | PASS_ONCHAIN |
| C08 | swap       | quote、dry-run、TRX->SUN write                          | write        | PASS_ONCHAIN |
| C09 | V2         | add dry-run + approve + add                             | write        | PASS_ONCHAIN |
| C10 | V2         | remove dry-run + LP approve + remove                    | write        | PASS_ONCHAIN |
| C11 | V3         | mint + 动态 tokenId                                     | write        | PASS_ONCHAIN |
| C12 | V3         | increase / decrease / collect                           | write        | PASS_ONCHAIN |
| C13 | V4         | position info / packed tick read                        | Nile read    | PASS         |
| C14 | V4         | mint + 动态 tokenId                                     | write        | PASS_ONCHAIN |
| C15 | V4         | increase / decrease / collect                           | write        | PASS_ONCHAIN |
| C16 | V4 Permit2 | token->Permit2、Permit2->PositionManager 自动规划       | unit + write | PASS         |
| C17 | output     | list/meta、quote、dry-run、txid、position info 字段断言 | contract     | PASS         |
| C18 | receipt    | 所有返回 txid 必须查到链上 SUCCESS                      | Nile receipt | PASS         |

## API 输出一致性

最终 E2E 对迁移前 CLI 的关键输出契约执行自动断言：

- OpenAPI 列表命令保持 `list/meta`，price/hooks/protocol 保持数组结构。
- Quote 保持 `amountIn`、`amountOut`、`impact`、`tokens`、`poolVersions` 等字段。
- Dry-run 保持 `dryRun/action/params`。
- Wallet 保持 `address/network` 和 balance 数组。
- V4 info 保持 `currency0/currency1/fee/tickLower/tickUpper/liquidity`。
- Write 保持有效的 64 位 `txid`；原始交易继续放在 `raw`。

动态价格、余额、quote 数值及 txid 本身会随区块变化，因此验证的是兼容字段、类型、语义和链上结果，不要求动态值逐字相同。

## 本轮发现并修复

1. V2 低层 builder 需要 EVM hex token address，CLI 已统一从 TRON Base58 转换。
2. V2 approve 后立即广播 router 交易存在 Nile 状态确认竞态，现已等待 approve receipt 后再执行 add/remove。
3. V2 remove 过小 LP 数量会因取整失败，E2E 使用可实际 burn 的数量。
4. V3 集中流动性使用现有 USDT/TGjg 池，不再误用仅用于 V2 的 TDqj pair。
5. SDK V3 position owner/token 的 Nile `41...` hex 返回现统一转为 Base58。
6. SDK V4 position poolKey currency 和 packed tick 返回现统一解析。
7. SDK V4 planner 已自动规划 token -> Permit2 及 Permit2 -> PositionManager 授权；无历史 allowance 的路径有单测覆盖，已有 allowance 时自动跳过多余交易。
8. CLI 对 Nile 较慢的 receipt 索引增加可配置等待时间，避免链上已成功但命令过早超时。

## 可重复性边界

在相同代码版本、Nile 服务可用、钱包私钥有效且测试资产充足的前提下，其他测试人员可运行同一命令得到同样的 case 通过结果。链上环境、池流动性和测试资产余额属于外部状态，无法保证永远不变；E2E 会在这些前置条件不满足时明确失败，而不会误报通过。
