# sun-cli 接入公网 SUN SDK 方案

## 1. 背景与目标

本次改造沿用 SUN.io 接入 SUN SDK 的原则：保留 `sun-cli` 已有命令、参数、输出和确认流程，命令底层改用公网 npm 上的 SUN SDK 实现。

目标：

- 保持现有 CLI API 兼容，避免调用方迁移。
- 删除 `@sun-protocol/sun-kit`、旧私有 `@sun-sdk/*` 和私有 npm registry 依赖。
- 统一通过 SUN SDK 完成 API 查询、链上读取、交易构建和执行。
- 复用 `agent-wallet`，通过适配器满足 SDK 的 `WalletAdapter` 契约。
- 支持 mainnet 和 Nile；公网 SDK 当前不支持 Shasta，SDK 命令在 Shasta 下应返回明确错误。

非目标：

- 不调整命令名称、参数语义或默认输出格式。
- 不把带真实私钥的 E2E 脚本、报告或测试账户提交到仓库。
- 不在本次需求中重做 SUN SDK 内部协议算法。

## 2. 依赖策略

正式依赖最终固定到通过验证的公网版本。当前 manifest 暂时保留 `0.1.0`，本地联调同时安装 SUN SDK 功能分支产出的 protocols 与 sunswap-v2 tarball；Steven 发布 beta 后，再把以下依赖统一更新并锁定到该 beta 版本：

| 包                                | 用途                                       |
| --------------------------------- | ------------------------------------------ |
| `@sun-protocol/sun-sdk-api`       | SUN.IO 和 SunPump HTTP API                 |
| `@sun-protocol/sun-sdk-chains`    | 网络配置、协议合约地址、WTRX 地址          |
| `@sun-protocol/sun-sdk-core`      | Network、TRON 地址和通用类型               |
| `@sun-protocol/sun-sdk-protocols` | Swap、V2/V3/V4 流动性、Position、SunPump   |
| `@sun-protocol/sun-sdk-runtime`   | TronWeb client、合约读写、余额和钱包运行时 |

SDK 要求 Node.js 20 及以上，因此 CLI 的 `engines.node` 和 CI 矩阵同步调整为 Node 20/22。版本先精确锁定，后续 SDK 升级单独验证并更新锁文件，避免协议行为随安装时间漂移。

## 3. 分层设计

### 3.1 SDK 工厂

`src/lib/sdk/factory.ts` 负责：

1. 校验 SDK 网络。
2. 根据 `TRON_RPC_URL`、TronGrid API Key 和网络创建只读 `TronWeb`。
3. 使用公网 runtime 的 Node 入口创建 `TronClient`。
4. 注入 `WalletAdapter` 创建 `Runtime`。
5. 创建一个进程内复用的 `SunSDK`。

CLI 创建的 SDK 始终带 runtime，因此使用 `CliSunSDK` 将 SDK 中可选的 `runtime` 收紧为必选，命令层不再依赖 `any`。

### 3.2 钱包适配

`AgentWalletSdkAdapter` 把现有 `agent-wallet` 映射到 SUN SDK：

- `getAddress()`：返回当前 TRON 地址。
- `signTransaction()`：签名 SDK 构建的 TRON 交易。
- `signMessage()` / `signTypedData()`：保留消息和 Permit2 typed-data 能力。
- 不在 SDK 层读取或持久化私钥。

读命令可以在没有钱包时执行；写命令仍由 `writeAction` 在确认前检查钱包。

### 3.3 命令映射

| CLI 能力                 | 公网 SDK 调用                           |
| ------------------------ | --------------------------------------- |
| SUN.IO 查询              | `SunApiClient`                          |
| SunPump 查询             | `SunPumpApiClient`                      |
| 钱包余额                 | `readBalances(runtime.tronClient, ...)` |
| 通用合约读取/发送        | `runtime.contract.read/write`           |
| 高层 Swap                | `sdk.swap.router.quote/execute`         |
| V2 增减流动性            | `sdk.liquidity.v2.add/remove`           |
| V3 Mint/Increase         | `sdk.liquidity.v3.add/increase`         |
| V3 Decrease/Collect      | `sdk.positions.v3.remove/collect`       |
| V4 Mint/Increase         | `sdk.liquidity.v4.add/increase`         |
| V4 Decrease/Collect/Info | `sdk.positions.v4.remove/collect/read`  |
| SunPump 买卖             | `sdk.pump.buy/sell.quote/execute`       |

CLI 的小数滑点继续接受 `0.005` 形式，在适配边界转换成 SDK 的百分比形式 `0.5%`。TRX/WTRX、交易结果和 SDK 错误也集中在适配层转换，命令输出继续使用 CLI 原有结构。

## 4. 兼容性约束

- 命令清单、参数名称、帮助文本和退出码通过契约测试锁定。
- 写操作保留摘要、二次确认、`--yes`、`--dry-run` 和 Tronscan 链接。
- JSON 模式继续输出机器可解析对象；交易结果规范化为 `txid`。
- 原生 TRX 在需要 ERC20/TRC20 地址的 V2/V3/V4 场景转换成对应网络 WTRX。
- V4 mint 在旧 CLI 未提供 fee/tick 时使用 `fee=3000`、`tickSpacing=60` 和 `[-120, 120]`；`--recipient` 映射到公网 SDK 的 `owner`。V4 increase/remove/collect 由 SDK 根据 `tokenId` 读取并校验 pool key，CLI 不拼装不完整的 pool key。
- 未配置钱包时，读命令正常工作；写命令统一返回 `NO_WALLET` 类错误。
- `--network shasta` 参数为兼容性继续保留，但 SDK 支持范围仅 mainnet/Nile。

### 4.1 公网 0.1.0 的兼容补充

公网协议层 `0.1.0` 尚未把旧 CLI 的所有“显式最小到账量”暴露为高层入参：

- V2 remove 的 `--min-a/--min-b`。
- V3 increase 的 `--min0/--min1`。
- V3 decrease 的 `--min0/--min1`。

高层 SDK 会按 slippage 自行计算 minimum，直接透传这些额外字段不能视为已经支持。已采用方案 A：在 SUN SDK 的 `feature/sun-cli-compat-minimums` 分支补充显式 minimum 字段及单元测试，并通过本地 pack 供 sun-cli 联调。待 beta 验证通过后，再将 CLI 的精确依赖版本升级到公网发布版。

本地 pack 的 Nile 真实链上 E2E 已验证 V2 remove、V3 increase 和 V3 decrease 的显式 minimum；正式发布验收仍需等 Steven 发布 beta 后，在干净安装环境重新执行同一组用例。

### 4.2 本地 pack 联调结果

- V2 add/remove：真实交易成功，remove 后 LP 余额精确减少指定的 `100000000`，并收到两种底层资产。
- V3 mint：在 TRX/USDT 0.05% 池创建仓位 `#705`；同时确认自动 tick 参数由 CLI 按旧实现的 `100 × tickSpacing` 透传给 SDK。
- V3 单边金额：补齐 SDK 的区间内自动配比逻辑，只传 `amount0` 或 `amount1` 时仍能生成非零流动性；CLI 在 token 输入顺序与池顺序相反时同步交换 amount/minimum，保持旧参数语义。
- V3 increase：显式 `amount0Min=1`、`amount1Min=1`，仓位流动性由 `177636846` 增至 `195400530`。
- V3 decrease：显式 `amount0Min=1`、`amount1Min=1`，移除 `10000000` 后仓位流动性精确变为 `185400530`。
- 所有写交易均在 Nile 成功上链；密钥、临时执行脚本和原始签名交易均未写入仓库。

## 5. 自动化测试

### 5.1 单元测试

- SDK 网络选择和非法网络拒绝。
- `agent-wallet` 到 `WalletAdapter` 的地址、交易、消息和 typed-data 映射。
- SDK 错误到 CLI 错误码映射。
- SDK 多步交易结果到 CLI `txid` 的映射。
- TRX/WTRX 常量和网络地址。
- Wallet、Contract、Swap 和 SunPump 命令是否调用正确的公网 SDK namespace。

### 5.2 契约测试

- 根命令及子命令 help 清单不变。
- JSON 输出、错误输出和关键 golden output 不变。
- 生产代码和 `package.json` 不允许重新引入 `@sun-sdk/*` 或 `sun-kit`。
- 五个公网 SDK 直接依赖必须固定到已验证版本。

### 5.3 CI 门禁

Node 20 和 22 均执行：

1. `npm ci`
2. `npm run build`
3. `npm test`

另外执行 TypeScript 类型检查和 ESLint。`build` 必须先清理 `dist`，防止已删除的私有 SDK/E2E 产物进入 npm 包。

## 6. 人工自测用例

### 6.1 无钱包、无资金用例

| 场景       | 示例                                                    | 期望                                  |
| ---------- | ------------------------------------------------------- | ------------------------------------- |
| CLI 契约   | `sun --help`、各命令 `--help`                           | 命令和参数保持兼容                    |
| API 查询   | `sun price TRX --network nile --json`                   | 返回合法 JSON                         |
| Pool 查询  | `sun pool list --network nile --json`                   | API 正常、分页正常                    |
| Swap 报价  | `sun swap:quote TRX USDT 1000000 --network nile --json` | 返回可解析路由                        |
| 合约读取   | 带 ABI 执行 `contract read`                             | 使用 runtime contract client 返回结果 |
| 钱包缺失   | 执行任一写命令                                          | 确认前给出明确钱包错误，不广播交易    |
| Dry run    | 任一写命令加 `--dry-run --json`                         | 只输出动作与参数，不创建 SDK 交易     |
| 非支持网络 | SDK 命令加 `--network shasta`                           | 返回明确的 unsupported network 错误   |

### 6.2 Nile 小额写入用例

在隔离测试钱包、限额资金和显式 `--yes` 下执行：

1. Contract send：最小可验证合约写入。
2. Swap：TRX/WTRX 与常用 TRC20 的小额交换。
3. V2：add 后 remove，校验 LP 和余额变化。
4. V3：mint、increase、collect、decrease，校验 position 状态。
5. V4：已有池 mint/increase/collect/decrease；新池创建单独验证。
6. SunPump：quote-buy/quote-sell，再做允许范围内的小额 buy/sell。

每条写入验证：退出码为 0、输出包含 `txid`、Tronscan 可查询、交易 receipt 成功、前后余额或 position 状态符合预期。失败用例至少覆盖余额不足、滑点过低、无路由、无授权和过期 deadline。

真实网络 E2E 只用于发布前临时验证，脚本、密钥和运行产物保留在仓库外。

## 7. 发布与回滚

1. 在干净环境执行 `npm ci`、build、lint、test 和 `npm pack --dry-run`。
2. 检查 tarball 中不存在旧 `sun-kit`、私有 `@sun-sdk/*`、E2E 命令或测试报告。
3. Nile 完成小额冒烟后先发布 beta，观察 API/交易错误。
4. mainnet 只做受控小额冒烟，通过后再提升 latest。
5. 回滚以 npm dist-tag 指回上一稳定版为主；依赖已精确锁定，可复现本次构建。

### 7.1 当前依赖审计备注

截至 2026-10-08，已将 TronWeb 从锁文件中的 6.2.2 升级到 6.5.1，清除了旧版 `ws`、`form-data` 等高危链路。生产依赖审计仍报告 2 个 high，来源是 TronWeb 6.5.1 精确依赖的 Axios 1.18.0；`npm audit --force` 给出的方案会反向降级 TronWeb，不应采用。另有 SUN SDK V3 的 ethers v5/elliptic 低危无上游修复项。发布前需要跟踪 TronWeb 和 SUN SDK 的上游版本，而不是在 CLI 中强制覆盖不兼容的传递依赖。
