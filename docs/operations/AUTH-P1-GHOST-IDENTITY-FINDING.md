# AUTH · P1 Ghost Identity Finding

> **状态**：已修复（AUTH-M7），修复只存在于 `integration/auth-strategy-b`，**未合入 main**。
> **发现于**：2026-09-07，AUTH MERGE REHEARSAL 期间对 `auth/supabase-unification` 的代码审计。
> **验收**：本地 19/19 PASS（`backend npm run test:local` 内的 `auth-m7-identity.test.ts`）。

---

## 1. 问题

`auth/supabase-unification` 的 `requireAuth` 里，Supabase 分支这样构造 principal：

```ts
const payload = await verifySupabaseAccess(presented);
req.principal = {
  kind: 'user',
  user: { id: payload.sub, email: payload.email ?? '', name, role: 'student', … },
  payload,
};
```

**它从头到尾没有查过 SQLite。**

于是链路变成：

```
Supabase 登录成功
→ 后端认为你有身份
→ 但 SQLite 根本没有这个 UUID 对应的人
→ 请求仍被放行
```

legacy 分支恰恰相反——`findById(payload.sub)` 查不到就 401。**两条链路不对称，
而且不对称的方向是新链路更松。**

## 2. 影响范围（实测，不是推断）

数据库层挡不住：19 张用户相关表里**只有 3 张**有 `REFERENCES users(id)`
（`room_members` / `prayer_sessions` / `prayer_share_reports`），其余 16 张没有外键。

因此只需 `requireAuth` 的写端点，幽灵身份可直接使用：

```
PUT  /api/growth/state          信仰成长档案数据
PUT  /api/pt/state
POST /api/posts                 校友圈发帖
POST /api/posts/:id/like · comment
POST /api/courses/:id/progress
POST /api/library/favorites/:bookId
POST /api/push/register
```

最具体的后果：`POST /api/posts` 把 `principal.user.name / avatar / role` 直接落库。
Supabase principal 的 `name` 取自 token，`role` 硬编码 `'student'`，`avatar` 字段
**在该 principal 上根本不存在**（`undefined`）。也就是说——

> 一个只存在于 Supabase、SQLite 里查无此人的身份，可以用 **token 里自带的名字**
> 在校友圈发帖，绕过项目既有的「显示名必须来自服务器 `users.name`」不变式。

有外键的那三张表挡得住，但挡法是 **SQLITE_ERROR → 500**，不是干净的鉴权拒绝。

## 3. 定级

```
P1（既有代码，非本次引入）
Supabase 一旦接通生产即升 P0
```

判定依据：该路径仅在 `isSupabaseConfigured()` 为真时存在。`main` 上没有 Supabase 代码，
因此这是 auth 分支上的**潜伏缺陷**，不是当时的线上问题。它会在 Auth 集成生效的那一刻激活。

## 4. 修复（AUTH-M7）

```
Supabase UUID
→ legacy_user_map.supabase_user_id
→ mapping_status 门禁（白名单：mapped / provisioned）
→ legacy_user_id
→ users.id
→ canonical PublicUser
→ principal.user
→ business routes
```

实现：`backend/src/auth/identity.ts` 的 `resolveCanonicalUserFromSupabase()`，
在 `requireAuth` 的统一边界一次拦住——业务路由**不需要**各自再做身份映射。

### 产品决策（已定）

```
FAIL CLOSED。不得自动 provision。
```

AMAS 身份只能来自正式业务流程：申请 → 审核/录取 → canonical user → identity mapping
→ App access。**Supabase 注册 ≠ AMAS 学生身份。**若将来要开放注册，单独立项。

### 错误语义

| 情况 | 响应 |
|---|---|
| 缺 token / 验签失败 / 过期 / issuer 不符 | `401` |
| token 有效，但没有 AMAS 身份 | `403` + `code: IDENTITY_NOT_PROVISIONED` |

拒绝原因（`MAPPING_MISSING` / `MAPPING_STATUS_NOT_ALLOWED` / `MAPPING_INCOMPLETE` /
`CANONICAL_USER_MISSING` / `MAPPING_MISMATCH`）**只进服务端日志**：对外区分
「没有映射」与「映射被禁用」，等于把某个 Supabase 账号是否已登记泄漏给
任何持有效 token 的人。

## 5. D-1 · 双身份（必须同时携带，不能二选一）

`requireAdmin` 的角色现查打的是 Supabase REST：

```
/rest/v1/user_roles?user_id=eq.<id>&revoked_at=is.null
```

它要的是 **Supabase UUID**。若把 `principal.user.id` 改写成 canonical SQLite id，
这个查询查不到任何行 → `roles = []` → **所有管理员静默掉权**。
方向是 fail closed，但完全无声，且会把 AUTH-M4「授权以 Supabase 角色为准、每次现查」
这条铁律无声废掉。

因此 principal 携带两个身份：

```ts
{ kind: 'user';
  authSource: 'supabase' | 'legacy';
  authId: string;      // 认证身份：Supabase UUID（legacy 路径下即 SQLite id）
  user: PublicUser;    // canonical AMAS 业务身份，永远来自 SQLite users
  payload: AccessPayload }
```

```
fetchActiveRoles(principal.authId)     授权
principal.user.id / name / avatar      业务
```

顺带修掉一处脆弱实现：`requireAdmin` 原先**重新解析 Authorization 头**来判断走哪条分支，
现改为读 `principal.authSource`——判定只做一次，不会与 `requireAuth` 不一致。

## 6. D-2 · schema 所有权

`legacy_user_map` 此前**只由 `backend/scripts/identity-migration-apply.mjs` 建表**，
`backend/src/db.ts` 里没有。后果：任何没跑过迁移的库（fresh install / dev / test fixture /
CI / 既有部署）都没有这张表，运行时一 `SELECT` 就是 `SQLITE_ERROR` → 每个 Supabase 请求 500。

修复：DDL 移入 `db.ts`（含 `uq_legacy_map_supabase` 唯一部分索引），迁移脚本改为
只写数据 + 防御性断言（表或索引缺失即报错退出，**不偷偷补建**）。

原则确立：

```
db.ts          = schema owner
migration 脚本 = data migration / mapping writer
```

**表空不是错误状态**：空表 = 还没有人被 provision，运行时一律 403，不是 500。

## 7. 遗留

```
P2 — USER FOREIGN KEY / DATA INTEGRITY DEBT
     16/19 张用户相关表没有 FK → users(id)。AUTH-M7 只保证「不存在的
     canonical user 进不了业务层」，没有补外键。单独 hardening。

/api/auth/me 不走 requireAuth
     它自己 verifyAccess(token)，只认 legacy 自签 token。Supabase 用户在该端点
     会拿到 401 —— fail closed，不是安全漏洞，但是统一边界上的一个洞。
     建议下一轮并入 requireAuth。

email 变更 / Supabase 账号删除
     通用策略仍 NOT IMPLEMENTED（AUTH-M7 之后运行时按 id 解析，
     email 脆弱性已从运行时路径上摘除，只影响重跑迁移）。

服务端无 session 撤销机制
     登出只清前端 localStorage。
```

## 8. 验收证据

```
backend npm run test:local   135/135 PASS（含 auth-m7-identity 19 项）
  · 双身份分离：authId=UUID-A 取角色、user.id=LEGACY-123 取业务数据
  · D-1 回归：角色只挂 canonical id 时必须 403
  · mapping_status 门禁 6 种情形
  · 资料信任边界：token 里的 Fake Admin Name / attacker avatar 不进业务数据
  · ghost 写入 6 个端点全 403，且 6 张表零残留
  · 401 与 403 可区分（缺 token / 伪造签名 / 过期 / issuer 不符 → 401）

测试不依赖任何外部凭据：本地起 HTTP 服务提供真实 ES256 JWKS 与 user_roles，
把 SUPABASE_URL 指过去。后端跑的是 100% 生产代码路径，**没有新增任何
production 里也能打开的测试开关**。
```
