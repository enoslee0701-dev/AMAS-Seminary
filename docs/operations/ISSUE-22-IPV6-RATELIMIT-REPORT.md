# OPEN_ISSUES #22 — IPv6 RATE-LIMIT NORMALIZATION REPORT

> 执行者：AMAS App Claude（本仓唯一执行者，未启动第二个 writer）
> 日期：2026-09-11 · 基线：`origin/main = f50dc4020720a32a60721836da32e0a853eca9f7`
> 交付位置：隔离分支 `worktree-db-13c-realtime` · **本会话未推 main**

---

## 结论

```
ISSUE #22:                 CLOSED
BYPASS REPRODUCED:         YES（修复前 3 条断言失败，确定性，非时序依赖）
FIX:                       ipKeyGenerator(req.ip)，仅改未认证回落分支
INSTALLED LIB VERSION:     express-rate-limit 8.5.2（实测，非记忆）
VALIDATOR WARNING:         ERR_ERL_KEY_GEN_IPV6 出现次数 0（修复前持续刷屏）
IPv4 BEHAVIOUR:            不变
AUTHENTICATED BEHAVIOUR:   不变（仍按 canonical userId，与 IP 无关）
BACKEND TESTS:             280/280
FRONTEND TESTS:            187/187 (21 files)
VERIFY LOCAL RELEASE:      PASS (exit 0)
CANONICAL SQLITE:          UNCHANGED
LIVE / SCHEMA / PERSONA / 0027 / PUBLIC DEPLOY:  NONE TOUCHED
```

**范围限定**：#22 关闭只解除**它自己**那一条闸门。PUBLIC STAGING 仍
`NOT AUTHORIZED` —— OPEN_ISSUES **#26**（canonical SQLite 写入围堵）仍 OPEN
且仍阻塞公开 staging / 生产，真实多用户验收也仍缺合法身份。

---

## 1. 缺陷（读 issue 原文 + 读已安装库，不凭记忆）

`backend/src/middleware/rateLimit.ts` 的 `byUser()` 在**未认证**时回落到裸 `req.ip`：

```ts
const id = p && p.kind === 'user' && p.user ? p.user.id : (req.ip ?? 'anon');
```

IPv6 用户手里通常握着整段地址（家宽常见 /64，甚至 /56）。裸 IP 当 key 意味着
换一个地址就换一个计数桶 —— Layer B 这一层的 IP 回落形同虚设。
`express-rate-limit` 的内置校验器据此报 `ERR_ERL_KEY_GEN_IPV6`。

**全仓只有这一个自定义 keyGenerator**：其余 limiter
（`generalApiLimiter` / `tokenLimiter` / `authLimiter`）用默认 keyGenerator，
其内部本来就调用 `ipKeyGenerator`（见 `dist/index.mjs:791`）。

### 已安装版本与官方 API（实测）

```
express-rate-limit 8.5.2
导出符号：MemoryStore · default · ipKeyGenerator · rateLimit
签名：    ipKeyGenerator(ip, ipv6Subnet = 56)
```

官方文档（`ERR_ERL_KEY_GEN_IPV6` 页）给的模式就是「认证用户按稳定标识计数，
未认证回落时把 IP 交给 `ipKeyGenerator()`」—— 与本仓 Layer B 的结构一致，
因此不需要改变分层设计，只需在回落分支加一次归一。

### 本轮实测的归一行为

```
203.0.113.9            -> 203.0.113.9                IPv4 原样
::ffff:203.0.113.9     -> 203.0.113.9                IPv4-mapped 还原为 IPv4
2001:db8:abcd:12::1    -> 2001:db8:abcd::/56
2001:db8:abcd:12::ffff -> 2001:db8:abcd::/56         同 /64 → 同一个桶
2001:db8:abcd:ff::1    -> 2001:db8:abcd::/56         同 /56 不同 /64 → 同一个桶
2001:db8:abcd:100::1   -> 2001:db8:abcd:100::/56     不同 /56 → 各自计数
2001:db8:9999:12::1    -> 2001:db8:9999::/56
```

---

## 2. 受控复现

`backend/src/test/issue22-ipv6-ratelimit.test.ts`（8 项，已并入 `test:local`）。

**修复前的实际结果**（先写测试、后改代码，顺序如此）：

```
not ok  ★ 同一 /56 内换地址不得换计数桶（修复前：可绕过）
not ok  IPv4-mapped IPv6 归一回 IPv4，与直连同一个桶
not ok  不同动作各自计数（suffix 仍然参与 key）
# tests 8 · pass 5 · fail 3
```

修复后 8/8 通过。

**为什么测 key 而不是打满 429**：限流阈值在 `NODE_ENV=test` 下被刻意调到
10000，打满既慢又脆（依赖时序与计数器状态）；而缺陷本身就在**键的取值**上，
测键才是测在点上，且结果是确定性的。

---

## 3. 最小修复

```ts
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const byUser = (suffix: string) => (req: Request): string => {
  const p = (req as { principal?: { kind: string; user?: { id: string } } }).principal;
  const id = p && p.kind === 'user' && p.user
    ? p.user.id
    // req.ip 可能是 undefined（例如 trust proxy 配置下取不到）——
    // 保持原有的 'anon' 回落，不要把 undefined 交给 ipKeyGenerator。
    : (req.ip ? ipKeyGenerator(req.ip) : 'anon');
  return `${id}:${suffix}`;
};
```

改动就这些。**没有**引入新依赖、没有改分层、没有动阈值、没有动 Layer A。

`byUser` 从模块私有改成导出 —— 只为让键生成可被直接断言；
它不是新的公共 API，注释里已写明用途。

---

## 4. 回归覆盖（IPv4 与 IPv6 各自成条）

| 断言 | 意图 |
|---|---|
| ★ 同 /64、同 /56 换地址 → 同一个 key | 绕过本身。修复前失败 |
| 不同 /56 → 不同 key | 不能归一过头，否则整段 ISP 互相连累 |
| IPv4 → key 完全不变；不同 IPv4 仍各自计数 | 修复不得影响 IPv4 |
| IPv4-mapped 与直连 IPv4 → 同一个 key | 同一客户端不该拿到第二份配额 |
| 认证用户换 IP → 同一个 key | Layer B 原有语义不得破坏 |
| 同 IP 两个认证用户 → 不同 key | 同 NAT 下 A 刷屏不连累 B |
| 无 `req.ip` → `anon` 回落 | 边界行为保持 |
| 四个动作 suffix → 四个不同桶，且都带 `/56` | 归一覆盖所有 Layer B limiter |

---

## 5. 可观察结果

`ERR_ERL_KEY_GEN_IPV6` 校验警告**消失**：

```
修复前  f50dc40 的 CI 日志与本地 test:local 中持续刷屏
修复后  test:local 全程出现次数 = 0
```

这条警告此前会淹没真实的服务端错误输出，属于附带收益。

---

## 6. 验证与边界

```
backend tests            280/280
frontend tests           187/187  (21 files)
backend tsc / frontend tsc  clean
build                    PASS
verify:local-release     PASS (exit 0)
  room presence 54/54 · reading 44/44 · rooms render 51/51
  prayer phase5 24/24 · system room moderator 26/26
```

**canonical SQLite（读原始绝对路径 `backend/data/amas.sqlite`，非 worktree 副本）**：

```
size 458752 · mtime 2026-09-10 17:31:06
sha256 8de2d50186c227980a56e74def515f2c8aee5d0707960df891e7d5fa0d4c8200
CHANGED: NO
```

**边界遵守**：无 live 写入 · 无 Supabase schema 改动 · 无 migration · 0027 未碰 ·
DB-4 未碰 · 未创建 persona · 未做任何公开部署 · `.gitignore` 未改未提交 ·
原 checkout 未被触碰 · **本会话未推 main**。

---

## 7. 顺带修正的一处过期记忆

`OPEN_ISSUES #23`（`verify-rooms-render.mjs` 的 presence 断言在 CI 上间歇失败）
状态仍挂着 `OPEN`，但它**已在 `099f59b` 修复**（固定 `sleep(13000)` 改为有界轮询）。
该状态是过期的，已改为 CLOSED 并写明依据。这不是本轮新做的工作，只是把记忆对齐事实。
