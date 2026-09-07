# Decision Log

**Append-only。** 正式架构与产品决策按时间倒序记录。推翻旧决策时标 `SUPERSEDED`
并注明日期与理由，**保留原文**。

---

## D-26｜默认迁移策略是受控切换，不是长期双写

```
日期     2026-09-07     状态  APPROVED
```

```
SQLite → 迁移演练 → 全量对账 → 短暂写冻结 → 最终导出
      → PostgreSQL 导入 → 验证 → 切换后端 → SQLite 保留为只读回滚快照
```

**不采用**长期 SQLite/Postgres 双写。理由：无双写漂移、无两套 SoT、
回滚更清楚、实施范围明显更小。App 尚未进入正式 Production，无零停机要求。

仅当未来证明存在 **production zero-downtime requirement** 时，
才提交独立的 **DUAL-WRITE CHANGE PROPOSAL** 单独审批。

（此条修正 DB-1 §13 原写的「DB-13 双写/影子验证 + 切流」。）

---

## D-25｜默认不创建 app_user_profile_ext

```
日期     2026-09-07     状态  APPROVED
```

**不能因为「App 以前有 users 表」就自然产生一张 extension 表。**

必须对 SQLite `users` 每个字段逐项归宿：
`auth.users` / `profiles` / `user_roles` / 既有 canonical 表 / obsolete / 确属 App 独有。

只有确实满足「App 独有 + 仍有产品价值 + 无法放入现有 canonical model」的字段，
才允许提出 extension table。**一个都没有 → `app_user_profile_ext = DO NOT CREATE`。**

目标是**消灭第二套 users 模型，而不是换个名字继续保留**。

---

## D-24｜祷告会创建必须在生产迁移前具备幂等性

```
日期     2026-09-07     状态  APPROVED（DBR-18）
```

同一次「创建祷告会」请求即使客户端重试，也只能创建一个房间。

Acceptance：同一认证创建者 + 同一 idempotency request → 同一逻辑房间、无重复行；
新的合法请求 → 新房间。并须验证：事务回滚 · 并发重复请求 · 超时后重试 ·
commit 前失败 · commit 后响应前失败。

**不为这一项引入复杂分布式系统。** 安排到真正修改 target schema / DAL 的阶段。

---

## D-23｜既有 Portal 角色优先于 legacy App admin

```
日期     2026-09-07     状态  APPROVED
```

**情况 A**：canonical user 在 Portal `user_roles` 中已有真实角色 →
**保留 Portal 现有角色**。旧 SQLite `admin` **不得覆盖或扩大**它。

**情况 B**：legacy `admin` 对应用户在 Portal 无管理角色 →
状态 `OWNER_ROLE_DECISION_REQUIRED`，**不得自动授予**
`registrar` / `academic_admin` / `super_admin` / `content_admin` 中的任何一个。

**legacy admin 永不自动提权。**

---

## D-22｜email-only 身份匹配必须人工复核

```
日期     2026-09-07     状态  APPROVED
```

```
email-only match → LOW CONFIDENCE → MANUAL REVIEW REQUIRED
```

不得直接进入正式 identity migration。

只有存在**独立于 email 的确定性证据**（如 AUTH-M5/M6 的
`provisioned_by_migration`：账号由迁移脚本据 legacy 记录创建，归属定义上无歧义）
才能提升为 `VERIFIED`。

**不能因为「email + display name 看起来一样」就自动放行。禁止静默修正。**

---

## D-21｜App users 并入 canonical Supabase/Portal 身份

```
日期     2026-09-07     状态  APPROVED
```

迁移后**不保留第二个可写的 App 身份空间**。App 全部 owner 列直接 FK 到 `profiles.id`。

实测裁定：Portal `profiles.id uuid primary key references auth.users(id) on delete cascade`
—— **`profiles.id` 本身就是 `auth.users.id`**，不存在 `profiles.user_id` 列。现有 schema 正确，不改。

App 专属字段（`degree` / `bio` 等）放 `app_user_profile_ext`，
主键即 `profiles.id` 的外键，**不产生第二个 user id**。
`users.password_hash` / `salt` **不迁移** —— Supabase 已持凭据，复制是纯负债。

---

## D-20｜course_progress 与 growth_state 保持 backend-owned（TYPE A）

```
日期     2026-09-07     状态  APPROVED
```

访问路径 `Frontend → Express Backend → PostgreSQL`。
**不新增 Browser → Supabase 直连表访问**。尤其 `growth_state` 保持 backend-owned。

将来 Portal 确需直读，须另提 **TYPE A → TYPE C CHANGE PROPOSAL**，
不为「以后可能需要」预先扩大暴露面。

---

## D-19｜Christian Profile 以 preserve blob 迁移

```
日期     2026-09-07     状态  APPROVED
```

迁移期**不 relationize / normalize / reconstruct / recompute**，不改内部评分字段名，
不借迁移之机修改算法。

三层 Gate：
1. **双哈希** —— `source_raw_hash`（SQLite 原始字节）+ `canonical_semantic_hash`
   （递归 key 排序、数组保序的规范化 JSON）。判据用后者：**jsonb 会重排 key**，
   拿数据库导出的原始字符串比对会误判。目标是证明**内容**没变，不是证明序列化格式没变。
2. 20 项 CP regression 全绿
3. 3 个 golden snapshot 无未解释变化

---

## D-18｜Legacy App admin 无自动 Portal 角色映射

```
日期     2026-09-07     状态  APPROVED
```

**禁止**任何全局映射：`admin → super_admin` / `registrar` / `academic_admin` / `content_admin`。
旧 App 的 `admin` 信息粒度不足，无法安全推导 Portal 的具体管理职能。

`ADMIN_ROLES = {registrar, academic_admin, super_admin}`：
映射成 `content_admin` 会让原管理员**静默掉权**；映射成 `super_admin` 是**未经授权的提权**。

管理角色迁移必须经 `ADMIN_ROLE_MIGRATION_MANIFEST` 逐人裁定。
证据不足者**不授予任何管理角色**，流程停在 `NEEDS_MANUAL_ROLE_REVIEW`。**不得猜测权限。**

---

## D-17｜AUTH-M7 必须先于 RB-01 数据库迁移完成

```
日期     2026-09-07
状态     APPROVED
```

**决策**：AUTH-M7（删除 legacy user authentication）必须在 RB-01
（SQLite → PostgreSQL 迁移）之前完成。RB-01 期间不得并行进行 DAL 重构。

**理由**：canonical identity 必须先稳定，才能把用户所属数据迁往 PostgreSQL。
若身份来源仍是双轨（legacy 自签 + Supabase），迁移时无法确定每行数据的
canonical owner —— 迁完再改身份，等于要把所有归属关系重做一遍。

**执行结果**（2026-09-07）：AUTH-M7 已实施完成，见
`amas-website/docs/operations/AUTH-M7-COMPLETION-REPORT.md`。
状态 `AUTH-M7 IMPLEMENTED / LOCALLY VERIFIED` —— 尚未在真实 Supabase
staging 验证，**不得**写成 INTEGRATION VERIFIED。

---

## D-16｜One Active Implementation Lineage Per Task

```
日期     2026-09-07
状态     APPROVED
```

同一个 issue / phase / merge / migration / release operation，
**只能有一个 Claude 会话拥有写权限**。其他会话只能 `READ / REVIEW / AUDIT`，
不得同时开启第二条实现世系。

**来源**：2026-09-07 两条会话同时执行 AUTH reconciliation，各自产出一条完整
merge 世系（`main` 上的 `4c139ec` 与 `integration/auth-strategy-b` 的 `78985e5`）。
两条世系的 4 个核心 AUTH 文件最终逐字节相同 —— 说明**这不是代码错误，是治理错误**：
重复投入、并发风险、且需要额外一轮裁定才能收敛。

**执行方式**：写代码前必须先查 `AI_HANDOFF_RULES.md` 的 ACTIVE TASK OWNER 表。
发现已有 active owner 时，不得开启第二条实现世系。

---

## D-15｜AUTH-M7 的定义

```
日期     2026-09-07
状态     APPROVED
```

**AUTH-M7 = legacy USER authentication 被 _删除_，而不只是默认关闭。**

⚠ **命名冲突警告**：`integration/auth-strategy-b` 的 `78985e5` 提交标题写的是
「AUTH-M7: 运行时身份解析」，但它实际完成的是 **Runtime Identity Resolution**
（Supabase 登录成功 ≠ 拥有 AMAS 身份，解析不出一律 403 `IDENTITY_NOT_PROVISIONED`，
fail closed 不自动 provision）—— 那是一项真实且重要的修复，但**不是** D-15 定义的 M7。

2026-09-07 静态审计实测，legacy 消费者仍然活跃：

```
routes/auth.ts:80/113/149   issueTokens()  仍在签发自签 token
middleware/auth.ts:215      verifyAccess() 仍在校验自签 token
config.ts                   acceptLegacy   仍被读取
```

**因此按 D-15 定义，AUTH-M7 尚未完成。** legacy config 不得删除；
当前以「production 缺省关闭」作为过渡防护（R1-3）。

---

## D-14｜AUTH reconciliation 权威世系

```
日期     2026-09-07
状态     APPROVED
```

**canonical lineage = `integration/auth-strategy-b` @ `78985e5`。**

理由：已完成运行时身份解析；通过 revert `d3e860d` 恢复正确的三方合并语义，
从而避免了另一条世系实际遭遇的 silent deletion；四个核心 AUTH 文件证明两条
世系最终实现高度趋同，没有理由维持第二条正式世系。

**另一条世系（`4c139ec`）**：保全为 `recovery/lineage-a-4c139ec`，
作为 recovery evidence，**不再演进**。
**`rehearsal/auth-merge-2026-09-07`**：`FROZEN / NON-CANONICAL`，
其 worktree 内有另一会话的 88 项未提交工作，**禁止 reset / clean / delete / prune / checkout 覆盖**。

移植裁决（逐项语义审查，非整块 cherry-pick）：

| 差异 | 裁决 |
|---|---|
| `config.ts` legacy 生产默认关闭 | **移植** —— legacy 仍活跃，此为 D-15 完成前的必要过渡防护 |
| `routes/auth.ts` 注释合并 | **拒绝** —— 剥离注释后两侧可执行代码完全相同 |
| `smoke.test.ts` 删孤儿 seedAdmin | **无需** —— canonical 分支上本就不存在该孤儿 |

---

## D-11｜SQLite 不作为 AMAS App 最终 Production 架构

```
日期     2026-09-07
状态     APPROVED
决策人   甲方（Supervisor Review）
```

**决策**：不接受「SQLite + 持久卷」作为 AMAS App 的长期 Production 架构。
最终方向继续采用 **Supabase-based authentication + managed persistent database**。

**SQLite 的合法用途**（不变）：local development · isolated test · temporary compatibility。
**不得**成为正式 Production 架构的终点。

**附带认定 —— 两件事必须分开描述**：

> # AUTH MIGRATION ≠ APPLICATION DATABASE MIGRATION

代码审计（2026-09-07）确认 `auth/supabase-unification` 分支**只做了认证适配**：

- `backend/src/db.ts` 仅改 7 行，且改的仍是 **SQLite DDL**（`author_state` 列，R-10 tombstone）
- **零张表**迁往 Postgres，**零个** Postgres migration，DAL 仍是 `better-sqlite3`
- `package.json` **未新增**任何 `supabase` / `pg` / `postgres` 依赖
- `backend/src/auth/supabase.ts` 自述为「身份**适配层**」，且 legacy 自签 token 仍被接受
  （移除计划在 AUTH-M7，当前 `NOT_STARTED`）

**因此**：合并 auth 分支**不能**解决 RB-01（数据持久化）。
此后二者分开排期，不再合并描述。

**证据**：`amas-website/docs/operations/ARCHITECTURE-PREMERGE-REVIEW.md` §2

---

## D-10｜阶段切换：功能开发 → RELEASE READINESS

```
日期     2026-09-07
状态     APPROVED
```

**决策**：暂停新增产品功能。项目进入
`RELEASE READINESS → STAGING → PRODUCTION VERIFICATION`。

**当前最高允许状态**：`TESTED LOCALLY`。
**不得**描述为「完成」或「已经上线可用」，不得提升至 INTEGRATION VERIFIED /
READY FOR STAGING / STAGING VERIFIED / READY FOR PRODUCTION，除非有真实证据。

**证据**：`amas-website/docs/operations/RELEASE-READINESS-REPORT.md`
