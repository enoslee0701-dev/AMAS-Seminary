# Decision Log

**Append-only。** 正式架构与产品决策按时间倒序记录。推翻旧决策时标 `SUPERSEDED`
并注明日期与理由，**保留原文**。

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
