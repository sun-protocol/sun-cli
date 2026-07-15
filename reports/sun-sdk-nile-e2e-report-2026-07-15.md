# sun-cli / sun-sdk Nile E2E 测试报告

日期：2026-07-15
分支：`feature/sdk-e2e-tests`
测试钱包：`TSTtBVZWFHzU5FS2a7MtsZcTLFG12kvzet`

## 结论

- `sun-cli` 当前已直接依赖 `@sun-sdk/* 0.1.2`，没有 `@sun-protocol/sun-kit` 依赖。
- 本机 `node_modules/@sun-sdk/*` 解析到 `/Users/felix/Documents/Tron/Projects/sun-sdk/packages/*` workspace symlink，本次 CLI 自测实际覆盖本地 sun-sdk 包实现。
- Read-only API、router quote、contract read/send、wallet address/balances、approve、swap、V2/V3/V4 liquidity dry-run/info 均已覆盖。
- 使用一次性真实 Nile 钱包完成真实上链复测，V2 add/remove、V3 mint/increase/decrease/collect、V4 mint/increase/decrease/collect receipt 均为 `SUCCESS`。
- 已补充交易 receipt 校验：广播成功但链上 `REVERT`/`FAILED` 会被判定为失败。

## 本地验证

| 项目 | 结果 |
| ---- | ---- |
| `npm run build` | PASS |
| `npm test -- --runInBand` | PASS，8 suites / 110 tests |
| `npm run dev -- --network nile e2e nile --timeout 60000` | PASS，32 total / 32 passed / 0 failed / 0 skipped |

## 关键测试参数

| 类型 | 值 |
| ---- | -- |
| Nile V2 Router | `TYMjxCXfqLpMWW1QToP6hbcjpion7EE25p` |
| V2 pair | `USDT = TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` / `TDqj = TDqjTkZ63yHB19w2n7vPm2qAkLHwn9fKKk` |
| V3 pair | `USDT = TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` / `TGjg = TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK`，fee `3000` |
| V4 pair | `USDT = TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf` / `TGjg = TGjgvdTWWrybVLaVeFqSyVqJQWjxqRYbaK`，fee `500`，parameters `0x00000000000000000000000000000000000000000000000000000000000a0000` |
| V4 poolId | `0x083dc86ce202fe0271c63e7622c9aa019c3480b08cd36d3c8e54e48822107222` |

## 真实上链结果

| 模块 | 用例 | 参数摘要 | Tx Hash | Receipt |
| ---- | ---- | -------- | ------- | ------- |
| wallet | address | `wallet address` | N/A | 返回 `TSTtBVZWFHzU5FS2a7MtsZcTLFG12kvzet` |
| wallet | balances | `wallet balances --tokens TRX,USDT` | N/A | 返回 TRX / USDT balance |
| token | approve | `USDT -> V2 router, amount=1` | `a63035892d628578236fb482fa33c2cc377d5eafe27fe8b0a553b4921a9af1f4` | SUCCESS |
| swap | TRX -> SUN | `amountIn=1000000` | `ed3505b36549ec7a0900613d7233e0b0ad08f757a39cd28ade81d10c36b11e46` | SUCCESS |
| swap | TRX -> USDT | `amountIn=1000000` | `f2978f999a8cacd92841c10a37bb4750662e807a5dcf17a4c7e9cae7b39d8f17` | SUCCESS |
| swap | TRX -> TDqj | `amountIn=1000000` | `30b269d57292d89271af16a5d7793774e1ecc43b242dd88fc0c2b9d8a02ca19d` | SUCCESS |
| swap | TRX -> TGjg | `amountIn=1000000` | `3bd58111d7ee6c9da25fbfd16d57cf343b68aff669b9ad0608a64ada147a0948` | SUCCESS |
| V2 | add liquidity | `USDT/TDqj amountA=100000, amountB auto-ratio` | `1144109d4f288d3d331d9ac47f3b05b7660bab59da5abfd9c439412209c3653d` | SUCCESS |
| V2 | remove liquidity | `USDT/TDqj liquidity=1000000000000` | `6db98f7ea9c94e259b7d6b2b6ea401fd6fdde1024ac9b782a7d336361ce14d3d` | SUCCESS |
| V3 | mint | `USDT/TGjg fee=3000 amount0=100000 amount1=100000000000000000 slippage=1` | `60d21f3349a04432d6d389792a531c0c4b148bb7f3cc676297063c8d96816df6` | SUCCESS，tokenId `613` |
| V3 | increase | `tokenId=613 amount0=100000000000000000 amount1=10000 slippage=1` | `85f5fc21394013b451086dceabda01e5ffa123b8ad8bdb26f62c8f75e421b50e` | SUCCESS |
| V3 | decrease | `tokenId=613 liquidity=100000000000 slippage=1` | `07a2f35110071d36afb2b835e891d08964b1550be7aa5b0cef6f9a5d6969a1ae` | SUCCESS |
| V3 | collect | `tokenId=613` | `ed15279ab6bffc71756f815046e1e02f2eadeafdf448cb9a530be2cb397a1d01` | SUCCESS |
| V4 | Permit2 token approve | `TGjg -> Permit2` | `7eea99c3bcb432deca0cc5bf20a65e3b10a2a56f782f5a205d5405ab8fcf67db` | SUCCESS |
| V4 | Permit2 token approve | `USDT -> Permit2` | `c263c5774ba61555c222c7ca75d08935d8ab0c2e2060d2fc226f7fb9221f04ce` | SUCCESS |
| V4 | Permit2 allowance | `TGjg, spender=V4 PositionManager` | `166d967da45eea418785fa2ee31a5fc63dec2d9569e29db6be270c9f117a4baa` | SUCCESS |
| V4 | Permit2 allowance | `USDT, spender=V4 PositionManager` | `1dc3409406a328049366efffc2e480e4a03869e62064beee74449d79bbd43040` | SUCCESS |
| V4 | mint | `USDT/TGjg fee=500 tick=[-120,120] liquidity=100000` | `f8764033c5ecdfd5336bdeddc60c72d4fdf2d8968351e19ac59cd4313fd6862d` | SUCCESS，tokenId `108` |
| V4 | increase | `tokenId=108 liquidity=100000` | `a9179f1f640d612c9bd206f2a6bfc97ded1439ef62bd15b2227e64c1934bbc8b` | SUCCESS |
| V4 | decrease | `tokenId=108 liquidity=100000` | `5a2963141cfb136cc18c289f778e0311bd33efe36cdd055d6c241e82ca415bec` | SUCCESS |
| V4 | collect | `tokenId=108` | `53d9a945e046f17f6185624507155ea14733ab3a95b8c6458d735bfd3ebd6d18` | SUCCESS |

## Case List / Status

| ID | 模块 | 用例 | 测试类型 | 状态 |
| -- | ---- | ---- | -------- | ---- |
| C01 | dependency | 移除 sun-kit 依赖 | static | PASS |
| C02 | build/unit | build + unit tests | local | PASS |
| C03 | wallet | address / balances | real read | PASS |
| C04 | API | price / token / pool / pair / farm / tx / protocol / position | read E2E | PASS |
| C05 | router | TRX->USDT、TRX->SUN quote | read E2E | PASS |
| C06 | contract | TRC20 decimals read | read E2E | PASS |
| C07 | contract | generic contract send dry-run | dry-run | PASS |
| C08 | token | approve dry-run + write | dry-run/write | PASS_ONCHAIN |
| C09 | swap | dry-run + TRX->SUN / TRX->USDT write | dry-run/write | PASS_ONCHAIN |
| C10 | V2 | add dry-run + add write | dry-run/write | PASS_ONCHAIN |
| C11 | V2 | remove dry-run + remove write | dry-run/write | PASS_ONCHAIN |
| C12 | V3 | mint dry-run + mint write | dry-run/write | PASS_ONCHAIN |
| C13 | V3 | increase dry-run + write | dry-run/write | PASS_ONCHAIN |
| C14 | V3 | decrease dry-run + write | dry-run/write | PASS_ONCHAIN |
| C15 | V3 | collect dry-run + write | dry-run/write | PASS_ONCHAIN |
| C16 | V4 | pool read / position info | read | PASS |
| C17 | V4 | mint dry-run + write | dry-run/write | PASS_ONCHAIN |
| C18 | V4 | increase dry-run + write | dry-run/write | PASS_ONCHAIN |
| C19 | V4 | decrease dry-run + write | dry-run/write | PASS_ONCHAIN |
| C20 | V4 | collect dry-run + write | dry-run/write | PASS_ONCHAIN |

## 与原 CLI API 输出一致性

- OpenAPI 查询命令仍输出原来的 `list/meta` 或数组结构。
- Router quote 输出保留 `amountIn`、`amountOut`、`impact`、`tokens`、`symbols`、`poolVersions` 等字段。
- Dry-run write 命令仍统一输出 `dryRun/action/params`。
- 交易结果统一输出 `txid/raw`，并额外在 `raw.transactionInfo.receipt.result` 中保留链上 receipt。
- `contract read/send` 迁移后基于 sun-sdk runtime，需要显式传 ABI；E2E 已覆盖 ABI 路径。

## 发现与注意点

1. 旧 V2 router 会导致 `Not Allowed Trading Pair`，已按 Leon 确认改为 `TYMjxCXfqLpMWW1QToP6hbcjpion7EE25p`。
2. V2 add liquidity 不能硬编码两侧金额；E2E 默认只传 `amount-a`，由 CLI 按池子储备自动计算 `amount-b`。
3. V3 `USDT/TDqj fee=3000` 池子当前 liquidity 为 0，真实 mint 使用 sun-kit demo 推荐的 `USDT/TGjg` 路径。
4. V4 write 直接调用 sun-sdk `liquidity.v4.add` 首次失败，链上自定义错误为 `AllowanceExpired(uint256)`。补充 `token -> Permit2` 和 `Permit2.approve(token, V4 PositionManager, amount, expiration)` 后，sun-sdk V4 mint/increase/decrease/collect 均真实上链成功。建议后续在 sun-sdk V4 planner 中内置 Permit2 permit/allowance 流程，避免 CLI 使用方手动前置授权。
5. TronWeb 对 V3/V4 部分 ABI 自动解析会出现 `EE Error`/`unknown function`，CLI provider 已用 `triggerConstantContract` 增加低层 read 兼容。
