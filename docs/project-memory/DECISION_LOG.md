# Decision Log

**Append-only。** 正式架构与产品决策按时间倒序记录。推翻旧决策时标 `SUPERSEDED`
并注明日期与理由，**保留原文**。

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
