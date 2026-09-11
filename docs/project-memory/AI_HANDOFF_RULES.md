> ## ⛔ 写代码前必读（一）：CANONICAL WRITE OWNER —— D-38
>
> **同一仓库在任一时刻只能有一个会话拥有 canonical write authority。**
> 其他会话可以 `READ` / `AUDIT` / `REVIEW` / `ISOLATED EXPERIMENT`，
> 但**不得直接 push** `origin/main` 或 `origin/master`。
>
> | REPOSITORY | CANONICAL_WRITE_OWNER | ACTIVE_TASK | ACTIVE_BRANCH | BASE_COMMIT | STARTED_AT | STATUS |
> |---|---|---|---|---|---|---|
> | `AMAS-Seminary` | （无） | — | — | — | — | **IDLE** |
> | `amas-website` | （无） | — | — | — | — | **IDLE** |
>
> **准备写某个 repo 之前必须先读这张表。** 若已有 `ACTIVE` writer：
>
> ```
> STOP CANONICAL WRITE
> ```
>
> 认领时填表，完成或交接后改回 `IDLE`。
>
> ### Main Drift Rule
>
> 认领时记录 `BASE_COMMIT`（= 当时的 `origin/main`）。**push 之前必须**：
>
> ```
> git fetch origin
> ```
>
> 若 `origin/main` 已不是预期世系，**不得直接 push**（更不得 force）。
> 先做 **LINEAGE RECONCILIATION**：真实合并 → 逐项证明双方成果都在
> （本项目有过 `CONFLICT = 0` 却静默删除的事故，**git 不报冲突不构成证据**）
> → 跑完整回归 → 再 push。
>
> ### 最近一次认领与交回
>
> | OWNER | REPO | TASK | BASE | STARTED | ENDED | 结果 |
> |---|---|---|---|---|---|---|
> | Claude | App | **APP STAGING**（仓库侧准备） | — | 2026-09-07 | 2026-09-07 | `APP STAGING: BLOCKED BY EXTERNAL PREREQUISITES`，已交回 IDLE |
> | Claude | 两仓 | STAGING-0（设计，**已被 APP STAGING 取代为当前口径**） | App `47bd23d` / web `a12078b` | 2026-09-07 | 2026-09-07 | `STAGING-0 NEEDS OWNER ACTION`，已交回 IDLE |
> | Claude | 两仓 | RB-01 **DB-6.1** | App `51bfd11` / web `fb0e444` | 2026-09-07 | 2026-09-07 | `DB-6.1 LOCALLY VERIFIED`，已交回 IDLE |
> | Claude | 两仓 | RB-01 **DB-6** | App `02903a1` / web `661e7af` | 2026-09-07 | 2026-09-07 | `DB-6 LOCALLY VERIFIED`；push 时遇 main 漂移，已做 lineage reconciliation |
> | Claude | 两仓 | RB-01 **DB-3.5** | — | 2026-09-07 | 2026-09-07 | `DBR-22 CLOSED` |
>
> **当前被冻结的世系**：`release/post-legacy-gate@e35923b`
> —— 状态 `RELEASE CANDIDATE SUPERSEDED`（8/8 能力已在 main，DB-6.1 §9 只读比对）。
> **保留为 recovery ref，不删除、不合并。**
>
> ---
>
> ### ⬤ 当前阶段状态（写代码前必须先确认这一条）
>
> ```
> DB-3 ~ DB-12  = CLOSED    DB-13A = CLOSED    DB-13B = CLOSED（均已验收）
> DB-13C        = 完成，等 Supervisor 验收
>                 realtime 事件日志已切到 Postgres
> ACTIVE SQLITE WRITE TABLES = 1（只剩 users）
> ```
>
> **DB-13C 起**：`room_realtime_events` 运行时读写 = 0，事件日志在
> `public.app_room_realtime_events`，`eventId` 由 Postgres IDENTITY 分配。
> 唯一还在写 SQLite 的是 `users`（身份域，属 DB-4，**不要动**）。
>
> **多实例口径不得夸大**：事件日志跨实例可见 ≠ 整个后端支持多实例。
> legacy 用户身份仍在本地 SQLite，所以「整体多实例」**尚未验证**。
>
> **DB-13B 起的硬规则**：这四个域的运行时数据在 **Postgres**，身份是
> **Supabase UUID**（D-42）。SQLite 里对应的表**运行时写入必须为 0** ——
> 看到有人往 `posts` / `prayer_shares` / `push_tokens` 之类写 SQLite，
> 那是双写，不是兼容。仍留在 SQLite 的只有：`users` · `legacy_user_map` ·
> `refresh_jti` · `room_realtime_events` · `rooms`/`room_members`/`room_presence`。
>
> 课程目录（`course_catalog`）对 App **只读**；admin 写路径返回 501，
> 理由见 **D-43**。不要「顺手把它接回来」。
>
> **DB-13A 起的硬规则**：任何后端进程 / 测试 / 脚本都必须显式给出 `DB_PATH`。
> 测试上下文缺 `DB_PATH` 会**拒绝启动**；对 canonical 缺省库改 schema
> 需要 `AMAS_ALLOW_CANONICAL_SCHEMA_CHANGE=1`。见 `backend/src/dbPath.ts` 与
> OPEN_ISSUES #26。**不要**为了让某个脚本跑起来而绕开它。
>
> **不得**在验收前开工：剩余域 DAL 迁移 · STAGING-1B · 0027 · public staging 硬化 · production。
>
> 已过期的旧口径（勿再引用）：「APP STAGING: BLOCKED BY EXTERNAL PREREQUISITES」——
> 凭据已交付、staging 数据库已就绪并已被真实读取（`OPEN_ISSUES #19` 已 CLOSED）。
>
> **仍然禁止**：0027 应用到 live（ABSENT / DO NOT APPLY）· public staging 暴露
> （NOT AUTHORIZED）· 创建 staging personas · 往空的 `app_*` 表塞假数据。
>
> **权威来源**：`docs/project-memory/CURRENT_STATE.md` ·
> `docs/operations/APP-STAGING-RUNBOOK.md` · `OPEN_ISSUES #19 / #24 / #25`
> —— **不是**较早的 `amas-website/docs/operations/STAGING-0-READINESS-REPORT.md`。
>
> **状态入口**：[`docs/operations/APP-STAGING-STATUS-SNAPSHOT.md`](../operations/APP-STAGING-STATUS-SNAPSHOT.md)
> —— 一页看完当前状态、外部前提、禁令与测试证据；执行步骤仍以 runbook 为准。
>
> **仓库侧 staging preparation 已完成，禁止重复开发**：
> staging environment templates · Supabase identity diagnostics ·
> `APP-STAGING-RUNBOOK` · migration exit-code fix（#18 CLOSED）·
> local release gates · GitHub CI · external prerequisite inventory。
>
> **`DB-4` = `PAUSED`，不得自行恢复**（Supervisor 指示，2026-09-07；
> 此前记为 `BLOCKED_BY_EXTERNAL_ENV`，现口径为 `PAUSED`）。
>
> **等待 Product Owner 确认的第一优先级**：
> `amas-staging` Supabase project 是否仍然存在。
>
> **在 Owner 确认之前，以下一律禁止**：
>
> ```
> 创建新的 Supabase project
> 部署 Railway
> 创建真实 Supabase users
> 运行 DB-4 identity migration
> 配置 Production
> 把 localhost / mock 算作 staging
> ```
>
> **当前没有新的代码任务。** 认领前先读本节；若无 Owner 的新指示，
> 正确做法是 `READ / AUDIT / REVIEW`，而不是开新的实现世系。
>
> **D-39 仍然成立**：不必为 staging 安装 Docker ——
> 迁移通道是 `supabase db push --db-url`，已实测无需 Docker。

---

> ## ⛔ 写代码前必读（二）：ACTIVE TASK OWNER
>
> **规则 D-16 —— One Active Implementation Lineage Per Task。**
> 同一个 issue / phase / merge / migration / release operation，
> 只能有**一个** Claude 会话拥有写权限。其他会话只能 `READ / REVIEW / AUDIT`。
>
> 新会话开始写代码前**必须**先查下表。发现已有 active owner 时，
> **不得开启第二条实现世系** —— 改为向 owner 汇报，或申请交接。
>
> | ACTIVE_TASK_OWNER | ACTIVE_BRANCH | ACTIVE_PHASE | STARTED_AT | STATUS |
> |---|---|---|---|---|
> | **APP STAGING** | `staging/app-release-candidate` | APP STAGING（部署前准备） | 2026-09-07 | **ACTIVE** |
>
> 说明：POST-LEGACY RELEASE RECONCILIATION 已于 2026-09-07 完成并交还写权
> （main 集成 + GitHub CI 全绿），故本表回到 IDLE。DB-3 由另一条会话完成，
> 成果在 `amas-website`（`supabase/migrations/0023–0026` + DB-3 实施报告），
> 状态 LOCALLY VERIFIED / READY FOR DB-4；DB-4 由 Supervisor 暂停中。
>
> ⚠️ 本表此前长期停在 `（无）/ IDLE`，而实际上 DB-3 已被做完 —— 「实际 ACTIVE、
> 文档 IDLE」正是 D-16 要防的那种状态。认领即登记，交还写权时改回 IDLE。
>
> **最近一次认领与交回**：
>
> | OWNER | BRANCH | PHASE | STARTED | ENDED | 结果 |
> |---|---|---|---|---|---|
> | Claude | website `master` / App `main` | RB-01 **DB-6** | 2026-09-07 | 2026-09-07 | `DB-6 LOCALLY VERIFIED`，已交回 IDLE |
> | Claude | website `master` / App `main` | RB-01 **DB-3.5** | 2026-09-07 | 2026-09-07 | `DBR-22 CLOSED`，已交回 IDLE |
>
> **当前被冻结、禁止触碰的世系**：`release/post-legacy-gate@e35923b`
> （`FROZEN LOCAL RELEASE CANDIDATE` —— 禁止 merge / rebase / cherry-pick / 修改）。
>
> **DB-4 不是可认领任务**：状态为 `BLOCKED_BY_EXTERNAL_ENV = STAGING SUPABASE REQUIRED`（D-36）。
> 在真实 staging Supabase 就绪前认领它，只会产出无法验证的身份映射。
>
> 认领任务时在本表登记；完成或交接后改回 IDLE。
>
> **来源**：2026-09-07 两条会话同时做 AUTH reconciliation，各自产出一条完整
> merge 世系。两者最终实现高度趋同 —— 重复投入，且需额外一轮裁定才能收敛。
> 这是治理错误，不是代码错误。

---

# AI Handoff Rules

任何 AI（Claude / ChatGPT / Codex / 其他）或新开发者接手本项目后，
必须遵守以下规则。

---

## 第一步：先读，不要先写

按顺序阅读（前四份是必读，约 5 分钟）：

```
1. PRODUCT_OVERVIEW.md      这个项目到底是什么 —— 不读会误判范围
2. CURRENT_STATE.md         做到哪里、下一步
3. ARCHITECTURE_RULES.md    什么不能破坏
4. WORKING_AGREEMENTS.md    用户的证据标准与协作方式
5. DEVELOPMENT_ROADMAP.md
6. OPEN_ISSUES.md
7. ACCEPTANCE_HISTORY.md 的最后一条
```

**动手写代码前再补两份**：

```
ENVIRONMENT_AND_TOOLING.md   怎么跑、已经踩过哪些坑（省最多时间）
DATA_MODEL.md                有哪些表、某个状态该信谁
```

如果要改**定制化神学 / Christian Profile**，额外必读
`docs/CHRISTIAN_PROFILE_SPEC.md` 的「§1 产品定位与铁律」—— 那有九条硬约束。

---

## 第二步：检查 git 真实状态

```bash
git status
git log --oneline -10
git branch --show-current
```

---

## 第三步：核对代码与 CURRENT_STATE 是否一致

**如果不一致：不要直接改代码。**

先判断谁更新 —— 按 Source of Truth 优先级，**代码事实 > 文档**。
然后：

1. **明确指出不一致**（不要静默修正）
2. 更新 CURRENT_STATE.md 使其符合代码
3. 再继续开发

> 本目录第一版建立时就命中了这条：交接说明称最新是 P1-1，
> 而仓库里 P1-2 已完成。处理方式是报告 + 以代码为准，不是照文档回退代码。

---

## 第四步：继续当前 NEXT 阶段

```
禁止重新实现已经 DONE 的阶段
禁止顺手重构已经验收通过的核心模块
禁止把 ARCHITECTURE_RULES.md 里 Deprecated 区的模式重新引入
```

在旧代码里找到某个被废弃的模式，**不代表它是当前规则** ——
先查 Deprecated 区。

---

## 第五步：完成阶段后必须更新项目记忆

这是**强制项，不需要用户提醒**。每完成一个阶段，同一个 commit 里更新：

| 文件 | 更新内容 |
|---|---|
| `CURRENT_STATE.md` | 当前 DONE 改为本阶段；NEXT 改为下一阶段；最近 commit；测试基线 |
| `DEVELOPMENT_ROADMAP.md` | 本阶段状态改 DONE + 填 commit；下一阶段改 NEXT |
| `ACCEPTANCE_HISTORY.md` | **追加**一条验收记录（不删旧的） |
| `OPEN_ISSUES.md` | 关闭已解决的；补充新发现的 |
| `CHANGELOG.md` | 只写影响未来理解的架构/规则变化 |

例：P1-3 完成后 —— CURRENT_STATE 的 DONE 改成 P1-3、NEXT 改成 P2；
ROADMAP 里 P1-3 写 commit + PASS；ACCEPTANCE_HISTORY 追加 P1-3；
OPEN_ISSUES 关闭 #2；CHANGELOG 记录关键架构变化。

---

## 第六步：不得凭记忆宣布完成

> **AI 不得凭聊天记忆宣布某功能已完成。**

必须由以下四项**共同**证明：

```
代码存在  +  测试通过  +  commit 落地  +  验收记录
```

报告时给**实际跑出来的数字**，不引用文档里的旧数字。
测试失败就说失败并贴输出；跳过了某步就说跳过。

---

## 硬性纪律

### 验收口径

```
代码测试通过 ≠ 生产正式验收完成
```

真实 Supabase / JWT / RLS / Edge Function / 生产部署 / 真机
未完成真实环境验证前，只能写 `DONE — Code-stage acceptance`。

### 状态标签

只用：`DONE` · `IN_PROGRESS` · `NEXT` · `TODO` · `BLOCKED` · `DEPRECATED`
不用「finished / ready / almost / probably done / 80%」。

### 历史不可篡改

`ACCEPTANCE_HISTORY.md` 与 `CHANGELOG.md` **以追加为主**。
不要因为当前设计变了就删除旧历史。结论被推翻时写：

```
SUPERSEDED
superseded by: 日期 / commit / 原因
```

### 不得写入敏感信息

```
JWT · password · Supabase service key · API key · secret
private key · 真实用户数据 · 真实账号凭据
```

只记录「某能力依赖哪一类 secret」，不记录 secret 本身。

### 审计先于实施

改动现有真实业务数据结构之前，**先输出审计**：现有数据能支撑什么、
不能支撑什么、需要哪些改动、风险在哪。确认后再实施。

### 没有真实数据就不做真实 UI

这是本项目最核心的一条。不确定时问自己：
**这个数字/状态，backend 重启后还在吗？它对应数据库里的哪一行？**

答不上来，就不要显示它。

---

## 破坏性操作

以下操作 AI **不得自行执行**，必须由人按下回车：

```
git push --force / 任何历史重写（filter-branch / rebase 已推送的提交）
删除远端分支
rm -rf 用户数据目录
清空 / 重建生产数据库
```

需要时：写好脚本 + 说明风险 + 提供回滚方式，交给用户执行。

---

## 新对话启动模板

复制以下整段发给任何新的 AI 对话，即可恢复上下文：

```text
继续 AMAS / CSC 项目开发。

请先阅读：

docs/project-memory/README.md
docs/project-memory/PRODUCT_OVERVIEW.md
docs/project-memory/CURRENT_STATE.md
docs/project-memory/ARCHITECTURE_RULES.md
docs/project-memory/WORKING_AGREEMENTS.md
docs/project-memory/DEVELOPMENT_ROADMAP.md
docs/project-memory/OPEN_ISSUES.md
docs/project-memory/AI_HANDOFF_RULES.md

动手写代码前再读：
docs/project-memory/ENVIRONMENT_AND_TOOLING.md
docs/project-memory/DATA_MODEL.md

然后检查：
git status
git log --oneline -10

不要重新实现已经 DONE 的阶段。
不要顺手重构已经验收通过的核心模块。
不要把 ARCHITECTURE_RULES.md 里 Deprecated 区的模式重新引入。

确认当前 NEXT 阶段后直接继续开发。

如果文档与代码冲突：
以用户最新决定和真实代码为准，并明确指出冲突，不要静默修正。

破坏性操作（force push / 历史重写 / 删远端分支 / 删数据）不要自行执行，
写好脚本交给我。

每完成一个阶段，必须同时更新 docs/project-memory/ 下的五个文件
（CURRENT_STATE / DEVELOPMENT_ROADMAP / ACCEPTANCE_HISTORY / OPEN_ISSUES / CHANGELOG）。

用中文回复。证据标准见 WORKING_AGREEMENTS.md —— 报告必须给实际跑出来的
数字并写明 FAIL 数，不接受用 mock 冒充真实验证。
```
