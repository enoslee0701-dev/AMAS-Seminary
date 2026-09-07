# Decision Log

**Append-only。** 正式架构与产品决策按时间倒序记录。推翻旧决策时标 `SUPERSEDED`
并注明日期与理由，**保留原文**。

---

## D-41｜`amas-staging` 是获批的 APP STAGING Supabase 目标

```
日期     2026-09-07
状态     APPROVED（Owner 决定）
阶段     STAGING-1A
```

**决策**：既有 `amas-staging` 获批为正式的 **APP STAGING SUPABASE TARGET**。

```
status     ACTIVE_HEALTHY
region     ap-southeast-1
Postgres   17.6
```

**不得创建第二个 staging Supabase project。**

**凭据口径**（Owner 澄清，以下两句**不矛盾**，不再作为文档矛盾重开）：

```
STAGING PROJECT EXISTS
RUNTIME CREDENTIALS NOT YET PROVISIONED
```

前者说的是 Supabase 项目侧对象存在；
后者说的是这些值尚未交付到前端构建环境 / 后端运行时 / CI 三个消费位。

**如何应用**：任何「要不要再建一个 staging」的讨论到此为止；
缺的是把凭据送到 §9 定义的目的地，不是缺项目。

**证据**：`docs/operations/STAGING-1A-EXISTING-SUPABASE-ADOPTION-REPORT.md` §2

---

## D-40｜Staging 与 Production 相互隔离

```
日期     2026-09-07
状态     APPROVED（Supervisor 裁定）
阶段     STAGING-0
```

**决策**：Staging 与 Production 的**基础设施与数据群体相互隔离**。
Staging fixtures **默认永不**成为 Production 身份。

必须是不同的 Supabase project · 不同的部署目标 · **不同的构建产物** ——
`anonKey` 会被打进前端 bundle，一次构建复用两个环境
等于让 staging 前端连 production 库。

**理由**：与 D-34 同源。测试装置一旦被当成「迁移成功人口」，
就会在正式环境里产生没有真人对应的账号（R-7）。

---

## D-39｜Docker 不是 Staging 的前置条件

```
日期     2026-09-07
状态     APPROVED（Supervisor 裁定）
阶段     STAGING-0
```

**决策**：**不把安装 Docker 作为 AMAS Staging 的前置条件。**

本地 PostgreSQL 17.6 已足以承担：
`schema development` · `migration replay` · `rollback testing` · `contract testing`。

真正的 staging migration 走：

```
版本化 SQL migrations
  → 受控 migration runner / CI
  → Supabase Staging PostgreSQL
```

或经批准的 `psql` 直连。**不得因为 `supabase start` 跑不起来就让项目停摆。**

**实测证据**（靶子是本地 PG 17.6，不是任何真 Supabase）：

```
supabase db push --db-url   不需要 Docker、不需要 link
接受现有 0001_ 命名          26/26 应用成功
版本记账                     写入官方 supabase_migrations.schema_migrations（26 行）
幂等重放                     {"upToDate":true,"migrations":[]}
差异查询                     supabase migration list --db-url 给出 local vs remote
产出一致性                   与 psql 通道的 information_schema.columns 全表 md5 完全相同
                            且在该库上跑 DB-3 契约 53/53 PASS
```

**如何应用**：本仓的离线迁移工具继续只产出 SQL 与 manifest（D-27），
由通道负责施加；不要在工具里内嵌数据库连接。

**证据**：`amas-website/docs/operations/STAGING-0-READINESS-REPORT.md` §4–§6

---

## D-38｜ONE CANONICAL WRITER PER REPOSITORY

```
日期     2026-09-07
状态     APPROVED（Supervisor 裁定）
阶段     治理规则（D-16 的加强）
```

**决策**：同一仓库在任一时刻只能有一个会话拥有 canonical write authority。
其他会话可以 `READ` / `AUDIT` / `REVIEW` / `ISOLATED EXPERIMENT`，
但**不得直接 push** `origin/main` / `origin/master`。

**为什么 D-16 不够**：D-16 说的是「同一个 task 不能有两条实现世系」。
2026-09-07 本轮出现的情况是**两个不同 task**（DB-6 与 AUTH 加固 / CI 闸门）
同时写同一个仓库的 canonical branch —— 严格说不违反 D-16，
但一样造成了：project-memory 冲突 · merge 风险 · 状态基线漂移 ·
一方不知道另一方已经 push。

**如何应用**：
`AI_HANDOFF_RULES.md` 顶部维护 `REPOSITORY / CANONICAL_WRITE_OWNER / ACTIVE_TASK /
ACTIVE_BRANCH / BASE_COMMIT / STARTED_AT / STATUS` 表。写之前先读；已有 ACTIVE writer 则
`STOP CANONICAL WRITE`。

**Main Drift Rule**：认领时记录 `BASE_ORIGIN_MAIN`；push 前必须 `git fetch origin`。
若 `origin/main` 已不是预期世系，不得直接 push —— 先做 **LINEAGE RECONCILIATION**
（真实合并 + 逐项证明双方成果都在 + 全量回归）。

---

## D-37｜未映射的 retired 课程进度永不进入 active course_progress

```
日期     2026-09-07
状态     APPROVED（Supervisor 裁定，修订 DB-1 §4.3）
阶段     RB-01 / DB-6.1
```

**决策**：active `course_progress` 只能引用 canonical `course_catalog`。

对于「retired legacy course + 无正式批准的 canonical 替代」的进度行：

**禁止** —— 猜一个最接近的课程 · 创建假 canonical course · 关闭 FK · 静默删除 progress。

迁移状态定义为 `LEGACY_RETIRED` / `MIGRATION_REVIEW_REQUIRED`，
保存在 **migration manifest 与 quarantine 证据**中，**不写入** active `course_progress`。

**当前数据集**：已证明 `retired course_progress rows = 0`，
因此**本轮不新增任何 legacy-retired 业务表** —— 不为不存在的数据增加永久 schema。

**将来若真实数据集中出现此类数据**：迁移必须 **fail closed / quarantine**，
并提交 Product Owner 决策。

**这条同时关闭了 DBR-27**（DB-1 §4.3 与 DB-3 schema 的不一致）：
按本决策，DB-3 现有的严格 FK 是**正确**的，不需要改 schema；
需要改的是 DB-1 §4.3 的措辞。

---

## D-36｜DB-6 先于 DB-4 —— 顺序调整，不是并行开发

```
日期     2026-09-07
状态     APPROVED（Supervisor 批准）
阶段     RB-01
```

**决策**：迁移执行顺序调整为
`DB-6 课程 → DB-4 身份（待 staging Supabase）→ DB-5 角色及其余身份相关阶段`。
DB-4 记为 `DB-4 IMPLEMENTATION PREREQUISITE = STAGING SUPABASE REQUIRED`，
性质是 **`BLOCKED_BY_EXTERNAL_ENV`，不是失败**。

**理由**：课程迁移不依赖 user identity，67↔67 canonical 映射已完全确认；
让整条迁移链卡在一个外部环境依赖上没有收益。

**如何应用**：这是**顺序调整**，不是并行。仍然遵守 D-16 ——
同一时刻只有一条 active implementation lineage。

---

## D-35｜疑似真实身份必须确定性或人工验证

```
日期     2026-09-07
状态     APPROVED（Supervisor 裁定）
阶段     RB-01 / DB-4 前置
```

**决策**：`estherzh0528@gmail.com` 状态为
`POTENTIAL_REAL_USER` / `IDENTITY_VERIFICATION_REQUIRED`。

**禁止 `same email -> silently mapped`。** 必须在真实 staging Supabase 中检查：

1. 是否已有 Supabase Auth account；
2. 是否已有 canonical `profiles.id`；
3. 是否有 AUTH-M5/M6 确定性映射证据；
4. 是否存在冲突账号；
5. 能否确定旧 SQLite 用户与 canonical identity 为同一个人。

映射结论只允许四种：
`VERIFIED_EXISTING_IDENTITY` · `PROVISIONED_NEW_IDENTITY` ·
`MANUAL_REVIEW_REQUIRED` · `CONFLICT`。
**仅邮箱相同 → `MANUAL_REVIEW_REQUIRED`**，不得自动放行。

**理由**：邮箱可复用、可转让、可被他人注册。仅凭邮箱相同就合并身份，
一旦错了就是把一个人的学习档案交给另一个人。

---

## D-34｜Legacy 测试账号不进入 Production 身份群体

```
日期     2026-09-07
状态     APPROVED（Supervisor 裁定）
阶段     RB-01 / DB-4 前置
```

**决策**：6 个 legacy identity（3×`@amas.test` + 3×`@amas.local`）正式定义为
`TEST FIXTURE` / `DO NOT MIGRATE TO PRODUCTION`。

**禁止**为它们：创建 Production Supabase Auth 用户 · 创建 Production `profiles` ·
写 Production `user_roles` · 迁移成正式 student/person ·
**为了让 migration count 对齐而制造假用户**。

它们在迁移账本中只保留 `SKIPPED_TEST_ACCOUNT` 作为 audit evidence。

**Staging 测试身份政策**：staging 若需要测试身份，应**重新创建**
`STAGING-ONLY TEST FIXTURES`，要求：明确 test 标识 · 与 Production population 分离 ·
可重复创建/销毁 · 不继承旧 SQLite 测试账号的正式迁移身份 ·
不进入 Production migration manifest。

**理由**：为不存在的人创建生产账号本身就是造假数据（R-7）；
迁移计数对齐不是制造用户的理由。

---

## D-33｜目标版本验证不可用「理论兼容」替代

```
日期     2026-09-07
状态     APPROVED（Supervisor 裁定）
阶段     RB-01 / DB-3.5
```

**决策**：schema / DDL 的验证必须在**目标部署版本**上真实执行。
「所用特性在目标版本都支持」只能作为静态补充，**不能**作为通过依据。
版本不一致时状态必须写成 `TARGET VERSION VERIFICATION REQUIRED`，**不得**写 `VERIFIED`。

**理由**：DB-3 在 PostgreSQL 18.6 上全绿，其「特性都支持 17.6」的判断本身也没错 ——
但 DB-3.5 在真实 17.6 上仍抓到一处差异：

| | PostgreSQL 17.6（Supabase 目标） | PostgreSQL 18.6 |
|---|---|---|
| `ON DELETE RESTRICT` 违反 | `23503 foreign_key_violation` | `23001 restrict_violation` |
| `ON DELETE NO ACTION` 违反 | `23503` | `23503` |

它不属于「特性支持与否」，而属于**行为细节**，静态推理看不见。

**如何应用**：任何跨版本 / 跨引擎的结论，先问「在目标版本上跑过没有」；
没跑过就标 `UNVERIFIED`。本仓 DB-12 的 DAL 异常处理直接受此约束（见 DBR-24）。

**证据**：`amas-website/docs/operations/DB-3.5-POSTGRESQL-17.6-COMPATIBILITY-REPORT.md` §8

---

## D-32｜主键类型跟随真实 id 生成器

```
日期     2026-09-07
状态     APPROVED
阶段     RB-01 / DB-3
```

**决策**：目标 PK 类型按每张表**实际的 id 生成器**逐表裁定，不一刀切成 uuid。
`crypto.randomUUID()` 的表用 `uuid`；`crypto.randomBytes(9).toString('hex')`（18 位 hex）
与人类可读码的表用 `text`。

**理由**：DB-1 §8 #9 字面写「TEXT uuid 主键 → uuid」，但实测
`prayer_shares`（12/12）、`rooms`（7/7）、`courses`（67/67）的 id 根本不是 uuid，
照字面执行会在类型转换处**整批失败**。

**如何应用**：类型契约必须以**代码里的生成器 + 全表实测形态**为准，
不能以列名或惯例推断。涉及本仓的两处生成器：
`backend/src/routes/prayer.ts:27`、`backend/src/routes/prayerSession.ts:25`。

**证据**：`amas-website/docs/operations/DB-3-POSTGRESQL-SCHEMA-IMPLEMENTATION-REPORT.md` §11

---

## D-31｜`app_rooms` 三形态房主模型

```
日期     2026-09-07
状态     APPROVED
阶段     RB-01 / DB-3
```

**决策**：`host_type` × `host_user_id` × `host_orphaned_at` 三形态 ——
`system`/NULL/NULL、`user`/NOT NULL/NULL、`user`/NULL/NOT NULL（房主已注销）。

**理由**：DB-1 §6 的 `ON DELETE SET NULL` 与 §7 的 `NOT NULL` CHECK **不可能同时成立**。
DB-3 契约测试实测证明：它会让**任何开过房间的用户永远无法注销**。

**如何应用**：凡「保留内容 + 置空作者」的表，若同时有形态 CHECK，
**必须先验证注销路径能跑通** —— 约束正确与流程可用是两件事。

**证据**：`amas-website/docs/operations/DB-3-POSTGRESQL-SCHEMA-IMPLEMENTATION-REPORT.md` §6

---

## D-30｜`app_user_profile_ext` = DO NOT CREATE（确认 D-25）

```
日期     2026-09-07
状态     APPROVED（以实测证据确认 D-25 的默认立场）
阶段     RB-01 / DB-3 GATE 0
```

**决策**：不创建 App 用户扩展表。`bio` 以一列扩展 canonical `profiles`；
`degree` **不迁移**，App 的学位展示改读 `student_records.program_code`，
未建档用户显示「未确定」而**不得回填默认值**。

**理由**：`degree` 实测 7/7 全 NULL、由用户注册时自选
（`components/AuthView.tsx:55` 未选时硬编码回填 `'M.Div'`）、非权威学籍，
迁移它会制造第二个学位真相源（R-2 展示 ≠ 权威）；
`bio` 是通用档案属性，能放进 canonical schema，因此按 GATE 0 规则不得为它单开一张表。

**待办（DB-12）**：`components/ProfileView.tsx` 的学位展示改源；
`backend/src/auth/users.ts` 的 `degree` 写入路径退役。

**证据**：`amas-website/docs/operations/DB-3-POSTGRESQL-SCHEMA-IMPLEMENTATION-REPORT.md` GATE 0

---

## D-29｜DB-3 是 schema only

```
日期     2026-09-07
状态     APPROVED
阶段     RB-01 / DB-3
```

**决策**：DB-3 只创建结构，不迁移任何一行业务数据。
数据迁移在 DB-4 ～ DB-11 分阶段进行，每阶段独立验收与回退。

**理由**：结构与数据同批推进会让失败无法归因 ——
分不清是 schema 错了还是转换错了，也无法单独回退。

**实测**：本轮业务数据写入行数 = 0；App 仓库代码零改动。

---

## D-28｜`courses.created_by` 是来源标记，不是身份

```
日期     2026-09-07
状态     APPROVED
阶段     RB-01 / DB-3
```

**决策**：承接为 `course_catalog.created_by_provenance text`，**刻意不设外键**。
若将来出现真人创建的课程，须**另加**一列 `created_by uuid references profiles(id)`，不得复用本列。

**理由**：DB-2 实测 67/67 行全部是哨兵（`system` 35 / `catalog-migration` 32），无一指向真实用户。
设成 uuid FK 就必须发明一个不存在的「system 用户」，违反 DB-1 §7 三禁令与 R-7。

---

## D-27｜Migration 归属：website 仓库是唯一 source of truth

```
日期     2026-09-07
状态     APPROVED
阶段     RB-01 / DB-3
```

**决策**：`amas-website/supabase/migrations` 是 AMAS Supabase database 的**唯一** migration source of truth。
**本仓库（App）不得建立第二套 Supabase migrations**，
只保留离线迁移工具（读 SQLite、产出 manifest、写 Postgres），不含 DDL。

**理由**：Portal 与 App 迁移后共用同一个数据库；两套竞争的 migration 目录
必然产生「谁先跑」「版本号撞车」「schema 漂移」三类问题。与 D-9 的治理文档归属一致。

**SQLite 侧**：`M-0` schema 基线快照工具仍在本仓（它只服务于 SQLite 的一次性导出）。

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
