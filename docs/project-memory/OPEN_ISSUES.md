# Open Issues

bug · 风险 · 技术债 · BLOCKED · 等待用户决定 · 等待版权 · 等待生产环境 · UI 观感

每条至少有：`status` · `severity` · `owner / pending decision` · `related phase`。
不知道 owner 就写 `unassigned` —— **不要猜**。

状态标签：`OPEN` · `BLOCKED` · `PENDING_DECISION` · `DEFERRED` · `CLOSED`

---

## #1 Phase 4B 实时语音 BLOCKED

```
status:    BLOCKED
severity:  high（整条语音产品线卡住）
owner:     用户（需提供真实设备 + LiveKit 凭据）
phase:     Phase 4B
```

缺两台真实手机与 LiveKit 凭据，无法完成真人互听验证。
代码侧准备已完成（token 硬化、错误码、诊断面板、生产 mock 硬护栏、真机验收清单）。

**解除条件**见 [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md#phase-4b--实时语音--blocked)。
有设备之后**只执行验收，不继续开发**。

---

## #2 P1-3 交通室分享墙未实现

```
status:    OPEN（NEXT 阶段）
severity:  medium
owner:     unassigned
phase:     P1-3
```

`fellowship_room` 目前**只有一个背景色**，全文件搜 `fellowship` 仅一处命中。
说明文案已如实改为「这间房目前还没有专属功能」。

**待决定**：复用 `prayer_shares` / `prayer_intercessions`（表名带 prayer 前缀
但结构 room-generic），还是把表名泛化？泛化会动到已上线的真实数据。

---

## #3 P2 赞美室音频未实现 —— 需要版权授权

```
status:    BLOCKED
severity:  medium
owner:     用户（产品 / 法务决策）
phase:     P2
```

App 内没有任何音频播放能力。P0 已拆掉假播放条，现只显示「推荐诗歌」清单。

**阻塞项**：诗歌版权授权 + 音频托管方案。这是产品/法务问题，不是技术任务。
**在拿到授权前，不得恢复任何播放状态显示。**

---

## #4 个人阅读进度未持久化

```
status:    OPEN
severity:  low
owner:     unassigned
phase:     P1-2 之后
```

退出读经室后本地阅读位置丢失。房间共同位置已持久化（`room_reading_state`），
个人位置没有。

---

## #5 读经室成员显示视觉重复

```
status:    OPEN
severity:  low（UI 观感，非数据错误）
owner:     unassigned — 等待 UI 审查
phase:     P1-1
```

左侧舞台头像与「1 人在线」卡片会显示同一个人。
**两处都是真实数据、互不矛盾**，只是视觉上重复。

**当前决定：暂不修改**，等 UI 审查后再定是否合并成一处。
截图见 `screenshots/rooms/`。

---

## #6 五个内置房间均为 0 moderator

```
status:    PENDING_DECISION
severity:  medium（房间处于「无人可管」状态）
owner:     用户（由谁运营公共房间是人的决定）
phase:     独立轨道
```

`prayer_room / praise_room / bible_reading / preaching_room / fellowship_room`
的 `host_id = 'system'`，运营权只能以 moderator 形式授予。

机制齐备（`backend/scripts/room-moderator.ts`，26/26 验证通过），
但**还没给任何人授权**。没有 moderator 意味着：没人能创建祷告会、
没人能发布读经位置、出现不当内容也没人能隐藏。

启动诊断会打印 `SYSTEM_ROOM_HAS_NO_MODERATOR room=<id>`（仅服务端日志，
不下发客户端）。正式开放前每房至少 2 位已验证真人 moderator，
清单见 [PUBLIC_ROOM_LAUNCH_CHECKLIST.md](../PUBLIC_ROOM_LAUNCH_CHECKLIST.md)。

**绝不自动指派任何人。**

---

## #7 git 历史仍带 31.3 MB 无关文件

```
status:    OPEN — 需人工执行
severity:  low（只影响 clone 体积）
owner:     用户（涉及 force-push，AI 权限门禁不允许自动执行）
phase:     独立轨道
```

`2ac94fa` 只把它们移出跟踪，历史里仍在，clone 依旧会拉到。

脚本已备好：`scripts/purge-large-history.sh`（自带备份、确认、校验；
force-push 不在脚本里）。`.git` 完整备份在 `.git-backup-before-history-rewrite/`。
执行后**所有提交哈希都会改变**。预期 `.git` 59 MB → 约 27 MB。

---

## #8 Supabase Auth 分支未与 main 合并

```
status:    DEFERRED
severity:  medium
owner:     用户
phase:     独立轨道
```

`auth/supabase-unification` 停在本地（未推远端）。`d3e860d` 已把未经独立验收的
Supabase 代码从 main 移出。

**合并时的已知陷阱**：该分支已合过 main 到 `d5f2f8a`，下次再合 main 会看到
`d3e860d` 这个 revert，**可能把分支上的 Supabase 代码一并删掉**。
标准解法是在分支上先 revert 掉那个 revert。

---

## #9 presence TTL 45s 的离线判定延迟

```
status:    DEFERRED（已知 backlog）
severity:  low
owner:     unassigned
phase:     P1-1
```

用户直接关闭 App 后，最多 45 秒才从在线列表消失。
**P1-1 明确不重新设计 TTL**，保持现状。

---

## #10 voiceCapability 初始化时未下发

```
status:    DEFERRED
severity:  low（UX 打磨）
owner:     unassigned
phase:     Phase 4B 之前
```

当前是「显示加入语音 → 点击 → backend 503 → 入口消失」。
期望房间初始化时就拿到 `voiceCapability: { available: false }`。

**约束**：只能表达 `available`，**不得**下发 `LIVEKIT_URL`、配置项存在与否、
供应商名称、内部错误。详见 [PRAYER_ROOM_BACKLOG.md](../PRAYER_ROOM_BACKLOG.md) B-1。

LiveKit 真正部署前 `available` 恒为 false，做了也看不出差别，因此推迟。

---

## #11 讲道录音与未来实时语音的边界待重新界定

```
status:    OPEN
severity:  medium（涉及 Voice 隐私边界）
owner:     unassigned
phase:     Phase 4B 之前
```

`SermonRecorder` 是真实的 `MediaRecorder`，但**只录本机麦克风**。
单人自录语义成立，**真实语音接入后必须重新划线** —— 不能顺势变成
「录整个房间」，那会撞上 Phase 4B 明令禁止的「录制祷告 / 云端录音」。

---

## #12 Supabase-only ghost identity 可写业务数据（已修，未合 main）

```
status:    OPEN —— 修复在 integration/auth-strategy-b，main 未合入
severity:  P1（Supabase 一旦接通生产即升 P0）
owner:     用户 / GPT（合并窗口）
phase:     AUTH-M7
```

`auth/supabase-unification` 的 requireAuth 在 Supabase 分支从不查 SQLite，
`principal.user.id` 直接取 `payload.sub`。19 张用户相关表里 16 张没有外键，
于是只存在于 Supabase 的身份可写 growth_state / pt_state / posts /
course_progress / library_favorites / push_tokens，并能用 **token 里的名字**发帖。

修复见 AUTH-M7（`backend/src/auth/identity.ts`），本地 19/19 PASS。
完整分析：[AUTH-P1-GHOST-IDENTITY-FINDING.md](../operations/AUTH-P1-GHOST-IDENTITY-FINDING.md)

**未关闭的原因**：修复只在集成分支上；main 合入前该风险随 Auth 集成一起存在。

---

## #13 USER FOREIGN KEY / DATA INTEGRITY DEBT

```
status:    OPEN
severity:  P2
owner:     unassigned
phase:     独立 hardening
```

19 张用户相关表里只有 3 张有 `REFERENCES users(id)`
（`room_members` / `prayer_sessions` / `prayer_share_reports`），其余 16 张没有。

此前靠「用户一定存在」这个隐含前提兜着。AUTH-M7 保证了不存在的 canonical user
进不了业务层，但**没有补外键** —— 一旦有别的路径写入，数据库层仍然不设防。
且有外键的那三张，拒绝方式是 SQLITE_ERROR → 500，不是干净的鉴权拒绝。

本轮明确**不做**大规模补 FK。后续单独 hardening 立项。

---

## #14 /api/auth/me 不走 requireAuth — `CLOSED`

```
status:    CLOSED（d564c4c，2026-09-07）
severity:  P3（fail closed，不是安全漏洞）
```

该端点原先自己 `verifyAccess(token)`，只认 legacy 自签 token，Supabase 用户会 401 ——
统一边界上的一个洞。`d564c4c` 已把 **GET 与 PATCH 双双**接入 `requireAuth`，
直接返回 `principal.user`，不再自建第二套身份解析。

验证：`smoke`（GET/PATCH 正常路径）+ `auth-post-legacy-audit`
（越权面：请求体的 id / role / email / authId 一律不可写；ghost → 403；
token 里的 name/avatar/role 不得冒充 canonical 资料）。

> **编号说明（审计留痕）**：`#15`（PATCH /api/auth/me 未统一）曾登记在
> `release/auth-final-gate` 分支上。该分支已判定 DEPRECATED / DO NOT MERGE
> （它建立在 legacy auth 仍存在的架构上），其记录未进入 canonical main，
> 因此本文件的数字序列从 #14 直接跳到 #16。**这是有意的断层，不是遗漏。**
> #15 描述的问题本身已由 `d564c4c` 一并解决（PATCH 同样接入 requireAuth）。

---

## #16 五套 App 回归曾因 legacy register 删除而全线失效 — `CLOSED`

```
status:    CLOSED（release/post-legacy-gate，2026-09-07）
severity:  P1（当时）
```

AUTH-M7 删除 `POST /api/auth/register` 时，五个回归脚本仍靠它造测试用户，
于是 **启动即崩、199 项断言一条都没执行**；因为它们不在 `npm test` 里，CI 全绿。

修复：测试身份改由唯一的 `backend/src/test/helpers/supabaseHarness.ts` provision
（fake Supabase identity → canonical users → legacy_user_map → 真实 token），
脚本改用 tsx 运行以复用该 TS harness。

防复发：新增 `npm run test:regression`（五套聚合）与
`npm run verify:local-release`（本地 Release Gate 聚合）。
关键 API 再被删掉时，Gate 会 RED，而不是静静地一条都不跑。

---

## #17 迁移映射在真实环境尚未建立

```
status:    OPEN
severity:  P1 — MIGRATION CUTOVER BLOCKER（针对流程，非当前 production）
owner:     用户 / 运维
phase:     真实 Staging cutover
```

删除 legacy user auth 之后，没有 `mapped/provisioned` 映射的既有用户会被**永久锁死**，
且 App 侧不自动 provision（既定产品决策，fail closed）。

现状：
```
本机开发库 backend/data/amas.sqlite   7 个 canonical 用户 · legacy_user_map 0 行
production                            NO PRODUCTION USER POPULATION（App 从未部署）
```

流程本身已在一次性 fixture 上端到端验证通过（见 ACCEPTANCE_HISTORY 的
MIGRATION PROCESS: LOCAL VERIFIED），**但从未在任何真实环境执行过**。
真实人口出现前必须先跑通 cutover，否则全体锁死。

---

## #18 迁移 apply 收尾断言绑定真实数据集 — `CLOSED`

```
status:    CLOSED（staging/app-release-candidate，2026-09-07）
severity:  曾为 STAGING CUTOVER BLOCKER
```

`identity-migration-apply.mjs` 曾写死 `prayer_shares rows === 12`，
于是迁移完全成功、退出码却是 1，通用 migration 命令的 exit code 不可信。

修法（断言分层）：

```
C(...)  migration correctness —— 任何数据集都成立，**决定退出码**
        「prayer_shares 一行未丢」改为迁移前后守恒断言，不再写死行数
D(...)  dataset acceptance    —— 用 --expect-prayer-shares=<n> 传入，
        默认只报告；要参与判定必须显式 --dataset-gate
```

护栏：`auth-migration-cutover.test.ts` 新增专项 —— 故意给错基线时默认退出码
仍为 0 且如实报告，加 `--dataset-gate` 后才为 1。

---

## #19 App Staging 缺外部前提 — `CLOSED`（2026-09-10）

```
status:    CLOSED
severity:  —
owner:     —
phase:     APP STAGING
```

**关闭依据（live 只读实测，2026-09-10）**：凭据已交付并可用；staging 数据库已就绪
（ledger 0001–0026、74 行业务数据已迁入、身份 1/1/1）。DB-12 已在此基础上开工。
原文保留在下方作为历史记录，**不再作为当前事实引用**。

<details><summary>历史原文</summary>

```
status:    BLOCKED
severity:  P1（阻断 APP STAGING 阶段的全部真实验收）
owner:     用户
phase:     APP STAGING
```

仓库侧准备已完成（环境模板、启动身份自述、运行手册、#18 关闭）。
缺的全是外部凭据，互不阻塞，拿到哪项解锁哪项：

```
Supabase staging URL / anon key / service-role key   MISSING
托管凭据（前端 / 后端）                                MISSING
staging 域名                                          MISSING
SMTP / 发信域                                         MISSING → 密码找回无法验证
LiveKit 凭据                                          MISSING → 语音保持关闭
Android 真机 + 域名关联                                MISSING → Deep Link 无法验证
```

流程与验收矩阵见 [APP-STAGING-RUNBOOK.md](../operations/APP-STAGING-RUNBOOK.md)。

---

</details>

## #20 VITE_APP_SECRET 是废弃且危险的配置项

```
status:    OPEN（已在模板中标注 DEPRECATED）
severity:  P3
owner:     unassigned
```

`.env.example` 仍保留该行。前端代码**已不读取**它（全仓库仅剩该行与 backend 的
一处注释）。但 `VITE_` 前缀意味着值会被打进前端 bundle —— 一旦有人从旧文档抄回来
并填上 APP_SECRET，等于把机器管理员凭据公开发布。

本轮已在模板里显式标注 DEPRECATED 并说明后果。彻底删除该行需确认没有任何
既有部署仍依赖它。

---

## 已关闭

| # | 问题 | 关闭于 | 说明 |
|---|---|---|---|
| — | 四房无真实成员，roster 恒为「我」一人 | `5d2df0f` | P1-1 接上 room_presence |
| — | 读经室「经文自动同步」是假话 | `d0d6030` | P1-2 做成真的 |
| — | 赞美室假播放 / 举手脚本 / 空承诺文案 | `d8abbd6` | P0 拆除 |
| — | 读经室内不可达的旧祷告墙死代码 | `9609d22` | P0 移除 |
| — | `POST /api/auth/_promote` 隐藏提权端点 | `ae02348` | 已移除，带 404/403 回归测试 |
| — | main 上混入未验收的 Supabase Auth 代码 | `d3e860d` | surgical partial revert；fail-closed 修复保留 |
| — | SSH 无密钥导致无法推送 | `2026-09-04` | remote 改为 HTTPS |


---

## #RB-22 AUTH 验收测试在 CI 中从未真正执行

```
status:    OPEN
severity:  medium
owner:     unassigned
phase:     AUTH-M2~M6.5B
```

`backend/src/test/supabase-auth.test.ts`、`credential-recovery*.test.ts`、
`password-change-reauth.test.ts`、`redirect-matrix.test.ts` 均在缺 `AMAS_ENV`
时**整组跳过**（设计如此，避免 CI 因缺环境假失败）。

由于 `staging.env` 从未存在于 CI，**这些 AUTH 断言在 CI 中一次都没跑过**。
历史报告里的 23/23、8/8、17/17、135/135 是**当时有人在本机带环境跑出来的**，
不构成持续保护。

**解除条件**：staging 就绪后在 CI 注入 `AMAS_ENV`，或提供专用 CI secret。

---

## #RB-21 Christian Profile 核心算法零测试覆盖 —— 已关闭

```
status:    CLOSED（2026-09-07）
severity:  was high
```

`services/christianProfile/scoring.ts`（474 行）此前无任何测试。
已新增 `tests/services/christianProfileScoring.test.ts`：20 条断言 + 3 个 golden
snapshot，并用「加进去 → 断言倾向一字不变」钉死铁律边界（课程/实践/导师证据
不得污染 12 项倾向）。

---

## #RB-06 生产启动护栏缺失 —— 已关闭

```
status:    CLOSED（2026-09-07）
severity:  was high
```

原先缺关键配置时后端会静默降级启动（JWT 密钥回落为进程内随机值、CORS 指向
localhost），只打印一行 `console.warn`。

已新增 `backend/src/startupGuard.ts`：`NODE_ENV=production` 下缺
`JWT_SECRET` / `DB_PATH` / `CORS_ORIGINS`（或含 localhost）即 `process.exit(1)`，
**绝不自动生成生产密钥、绝不回落 dev 默认值**。13 条测试覆盖三种情形，
并已纳入 `npm test`。


---

## #RB-24 Merge completeness / test coverage blind spot（静默删除）

```
status:    MITIGATED（护栏已上线，根因属 git 语义，无法根除）
severity:  high
owner:     unassigned
phase:     AUTH reconciliation
```

**发生了什么**：`d3e860d` 从 main 删除了 `backend/src/auth/supabase.ts` 等
Supabase 实现文件。`auth/supabase-unification` 分支之后未再修改它们，
git 于是判定「一侧删除、一侧未改 → 删除生效」，**合并时不报冲突**。

结果：`supabase-auth.test.ts`（266 行）被带回，**被测实现却没有回来**，
而 **typecheck 与全部测试仍然全绿** —— 该测试 spawn 子进程跑服务器，
不直接 import 那个模块，因此缺失完全不可见。

> 这是一类**测试存在、实现消失、CI 全绿**的盲区。
> 不逐文件核对的话，会以「全绿」姿态交付一个空的 reconciliation。

**缓解**：新增 `backend/src/test/auth-adapter-presence.test.ts`（7 项，已进 `test:local`）。
证明：adapter 可真实 import · 中间件确实调用它 · runtime 依赖已声明 ·
每个 AUTH 测试都有对应实现文件。刻意最小，不做 AST 分析、不 mock、不连网络。

**残留风险**：护栏只覆盖 AUTH adapter。其他领域若发生同型 revert 世系合并，
仍可能静默丢文件。合并 revert 世系时应先 `Revert the revert` 恢复三方语义（D-14）。

---

## #RB-22 AUTH 验收测试状态正式降级

```
status:    OPEN
severity:  medium
owner:     用户（需 staging 或 CI secret）
```

2026-09-07 逐个实跑，全部 **0 PASS / 1 SKIPPED**：

```
credential-recovery · credential-recovery-expiry · identity-migration
password-change-reauth · redirect-matrix · supabase-auth
```

因此历史报告中的 `23/23` `8/8` `17/17` `135/135` 在当前环境下
**NOT REPRODUCIBLE**。自即日起不得再把这些数字当作当前验收证据。

相关模块状态统一降级为：

```
IMPLEMENTED / ENVIRONMENT-UNVERIFIED
```

**这不等于代码有错**，而是：当前没有可复现证据证明真实 Supabase AUTH
integration 已通过。

`backend/package.json` 已把它们隔离到 `test:external`，与 `test:local` 分开计数。

---

## #RB-25 requireAppSecret 零路由使用（dead architecture candidate）

```
status:    OPEN（仅标记，本轮不删除）
severity:  low
```

`requireAppSecret` 中间件定义在 `middleware/auth.ts`，但**零路由挂载**。
`APP_SECRET` 的真实调用方是另外两条：

- `requireAuth` 第 1 级 service principal（特权端点）
- `checkWsAuthToken` ← `routes/gemini.ts:48`（Gemini WebSocket 代理，真实使用）

按 Supervisor 指令，本轮只标记不删除，避免扩大 scope。


---

## #RB-26 AUTH-M7 已实施，但未在真实 Supabase 环境验证

```
status:    OPEN
severity:  medium
owner:     用户（需 Supabase staging）
phase:     AUTH-M7
```

legacy user authentication 已从 active production code **删除**（不是默认关闭）：
后端不再签发任何 user token，`/api/auth/{register,login,refresh,change-password,logout}`
全部移除，`middleware/auth.ts` 的 legacy 验签分支删除，`auth/jwt.ts` 190 行降为
41 行的纯类型模块，前端 legacy 分支同步移除。

**但**：全部验证均在本地假 Supabase（真 ES256 密钥对 + 真 JWKS + 真验签，
后端跑 100% 生产代码路径）上完成。真实 Supabase 项目上的行为**未验证**。

状态：`AUTH-M7 IMPLEMENTED / LOCALLY VERIFIED`。
**不得**升级为 INTEGRATION VERIFIED，直到有可用 staging 环境。

---

## #RB-27 refresh_jti 表已无写入方

```
status:    OPEN（本轮刻意不处理）
severity:  low
```

AUTH-M7 删除 refresh token 签发后，`db.ts` 中的 `refresh_jti` 表不再有任何写入方。
**未删除** —— 删表属 destructive migration，本轮明令禁止。
可在后续独立迁移中清理，届时需确认无历史数据依赖。

---

## #RB-28 前端在 Supabase 未配置时不可登录（预期行为）

```
status:    BY DESIGN（需部署时注意）
severity:  medium
```

AUTH-M7 之后 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 成为**硬依赖**。
未配置时 `register` / `login` 抛 503 并说明原因（`requireSupabase()`），
不再静默回落到已经不存在的 legacy 端点。

这是目标态而非缺陷，但**部署清单必须包含这两个变量** —— 否则 App 登录不可用。

---

## #DBR-01~16 RB-01 迁移风险登记（DB-0 产出）

```
status:    OPEN（DB-0 已识别，DB-1 前需决策）
severity:  见各条
owner:     用户 / GPT（4 项决策）
phase:     RB-01 DB-0 -> DB-1
```

完整报告见 `amas-website/docs/operations/DB-0-DATABASE-FACTS-AND-TARGET-DESIGN.md`。

**P0 四项**：

- **DBR-01 孤儿行** —— 32 张表仅 6 张有 FK；23 张用户所属表中 **20 张无 FK**，
  历史数据可能引用已不存在的 users.id。加 FK 前必须全表扫描，逐条决定。
- **DBR-02 admin 角色映射歧义** —— App `users.role` 只有 `student`/`admin`，
  Portal 有 9 个角色且 `ADMIN_ROLES = {registrar, academic_admin, super_admin}`。
  **`'admin'` 不在其中**：批量给 super_admin 是过度授权，给 content_admin 会静默掉权。
- **DBR-03 无 schema 版本号** —— schema 靠运行期 `PRAGMA table_info` +
  `ALTER TABLE ADD COLUMN` 打补丁，无法判定某部署处于哪个 schema 状态。
- **DBR-04 同步→异步 DAL** —— better-sqlite3 全同步，pg 全异步；
  5 处 `db.transaction()` 的同步闭包改异步后事务边界易断。
- **DBR-05 CP blob 归属错配** —— Christian Profile 全部数据在
  `growth_state.state_json` 一个不透明 JSON 列里，无 FK。
  映射错一个人，其全部成长档案归错人且 blob 内不含身份，**无从察觉**。

**具体陷阱**：`rooms.host_id = 'system'` 是哨兵值（非 uuid、非真实用户），
直接加 FK 会让 5 个内置公共房间插入失败（DBR-09）。

**DB-1 前必须由 Supervisor 决定的 4 项**：
admin 角色目标映射 · CP 迁移方案（保持 blob / 关系化） ·
course_progress 与 growth_state 的授权类型 · App users 表是否并入 profiles。


---

## #DBR-17 既有身份映射使用了被禁止的 email-only silent matching

```
status:    OPEN（迁移期强制人工复核）
severity:  migration gate — high
owner:     用户 / 教务
phase:     RB-01 DB-4
```

`backend/scripts/identity-migration-apply.mjs:88-101` 实测：

```js
const sbByEmail = new Map((sbList.users ?? []).map(u => [norm(u.email), u]));
mapping_status: existing ? 'mapped' : 'needs_provision',
mapping_reason: '该邮箱在 Supabase 已有账号，直接 1:1 映射'
```

`mapped` 分支**仅凭邮箱相同就静默判定为同一个人**，无其他证据、无人工复核 ——
正是 DB-1 契约 TASK 2 明令禁止的模式。

**处置**（DB-1 契约 §15）：迁入 crosswalk 时
`mapped` → `email_match_unreviewed` / confidence=low → **强制 NEEDS_MANUAL_REVIEW**；
`provisioned`（账号由迁移创建，归属无歧义）→ high → 自动放行。

⚠ 注意：`auth/identity.ts` 的运行时白名单是 `{'mapped','provisioned'}`，
即**今天 `mapped` 的账号已能正常登录**。本条不改变运行时行为（那属 AUTH 域），
只要求迁移期对这批账号人工复核后才写入 canonical crosswalk。

---

## DBR 严重度语义澄清

```
Production Incident Severity  —— App 尚未进入正式 Production，
                                 故 DBR-01~05 不是当前生产事故
Migration Gate Severity       —— DBR-01~05 为 DB MIGRATION HARD BLOCKERS
```

两者**都必须在 Production 前解决**，但语义不同，不要混用。


---

## #DBR-18 祷告会创建缺少幂等性

```
status:    OPEN（D-24 已批准修复，安排到 DAL/schema 修改阶段）
severity:  migration gate — medium
phase:     RB-01 DB-9 或 DB-12
```

`routes/prayerSession.ts:200` 的创建事务无幂等键：客户端重试会产生两条祷告会。
SQLite 下同样存在，非迁移引入 —— 但迁移是修它的合适时机。

**DB-2 实测**：`prayer_sessions` 当前 0 行，**无重复实例**。风险真实但暂无实例。
参照 `prayer_shares` 已有的 `client_request_id` + 部分唯一索引方案
（注意：现有 12 行 prayer_shares 全部没有幂等键，说明该机制尚未被客户端实际使用）。

---

## #DBR-19 哨兵值不能只靠已知清单查找

```
status:    OPEN（契约通则，DB-3 落实）
severity:  migration gate — medium
```

DB-2 只查已知的 `rooms.host_id='system'` 是不够的 —— 实测又发现两个：

```
courses.created_by = 'system'             35 行
courses.created_by = 'catalog-migration'  32 行
（courses 全部 67 行的 created_by 都不是真实用户）
```

**通则**：任何 owner 列在加 FK 前，必须做**全值域 uuid 合法性扫描**，
而不是只比对已知的哨兵字符串。已实现于
`backend/scripts/db2-data-preflight.mjs`（可重跑）。

本例不构成障碍：`courses` 按契约 MERGE 进 `course_catalog`，
而后者没有 `created_by` 列，该列本就不迁移。

---

## #DBR-20 `users.email` 大小写不敏感唯一性迁移后无对应保障

```
status:    OPEN
severity:  medium
owner:     unassigned
phase:     RB-01 / DB-4
```

SQLite `users.email` 是 `TEXT NOT NULL UNIQUE COLLATE NOCASE`。
迁移后 `users` 表不迁，邮箱唯一性交由 Supabase Auth 承担，
但 `public.profiles.email` 本身**没有**大小写不敏感唯一索引。

需确认 Auth 侧规则足以防止「同一邮箱大小写不同的两个账号」。
若不足，须在 `profiles` 上加 `unique (lower(email))` 或改用 `citext`。

**证据**：DB-3 报告 §11 类型契约 #8

---

## #DBR-21 App `avatar` 混存三种形态，与 `profiles.avatar_path` 语义不符

```
status:    OPEN
severity:  medium
owner:     unassigned
phase:     RB-01 / DB-12
```

App `users.avatar` 可能是上传 URL（`ProfileView.tsx:216`）、
**data URI**（`ProfileView.tsx:222`）或前端生成的首字母头像（`AuthView.tsx:56`）。
Portal `profiles.avatar_path` 的语义是 storage path。

实测 7/7 全为 NULL，**当前迁移成本为 0**；但 App 侧写入路径必须先归一为 storage path，
否则一旦有真实数据就会出现「路径列里存着几十 KB 的 base64」。

---

## #DBR-22 DB-3 在 PG 18.6 验证，Supabase 是 PG 17.6

```
status:    CLOSED（2026-09-07，DB-3.5）
severity:  high（曾为 DB-4 硬前置）
owner:     unassigned
phase:     RB-01 / DB-3.5
```

**关闭依据**（DB-3.5，全部在 `PostgreSQL 17.6` 实测）：

```
server_version = 17.6 / server_version_num = 170006
migrations     26 / 26 APPLIED
contract       53 / 53 PASS · FAIL 0 · SKIP 0
rollback       PASS（逐列与 0022 基线零差异）
forward replay PASS（53 / 53）
Portal 回归     PASS（表/policy/enum/触发器/外键 逐名零增删；+5 列为声明内 EXTEND）
```

**发现的真实版本差异**：见下方 DBR-24 的更正。
migrations 本身**未因版本做任何修改**。

**原记录**（保留）：

DB-3 的 schema 在本地 **PostgreSQL 18.6** 上执行并通过 52 条断言，
但 Supabase staging 是 **PG 17.6**。

所用特性（`generated always as ... stored` PG12+、identity 列 PG10+、
`deferrable initially deferred` FK、部分唯一索引）在 17.6 均支持，
但**未在 17.6 上实际执行过**。

**DB-4 开始前必须在 17.6 上重跑** `0023..0026` + `db3_schema_contract.sql`。
不得以「特性都支持」为由跳过。

---

## #DBR-23 Portal RLS policy 计数口径不一致（36 vs 33）

```
status:    OPEN
severity:  low
owner:     unassigned
phase:     RB-01 / DB-4
```

DB-0 记录 Portal 有 36 条 RLS policy；
由 `0001..0022` 在本地复现得到 **33 条**（`public` schema）。

基线与应用 DB-3 之后一致（33 = 33），**因此不是本轮回归**。
差异来源需核对 —— 可能 DB-0 的统计口径包含 `storage` 等其他 schema，
或线上库存在 migration 之外的手工 policy（后者才是真问题）。

---

## #DBR-24 DAL 改造必须处理两个 Postgres 语义差异

```
status:    OPEN
severity:  medium
owner:     unassigned
phase:     RB-01 / DB-12
```

DB-3 契约测试实测复现的两个陷阱：

1. **部分唯一索引作 `ON CONFLICT` 目标时必须重复 WHERE 谓词**。
   `on conflict (room_id, user_id, client_request_id) do nothing` 直接报错
   `there is no unique or exclusion constraint matching the ON CONFLICT specification` ——
   不是静默降级，是运行时 500。必须写成
   `... on conflict (cols) where client_request_id is not null do nothing`。

2. **`ON DELETE RESTRICT` 的 SQLSTATE 随 PG 版本不同** ——
   **【DB-3.5 更正】** DB-3 原文写「抛 `restrict_violation`(23001)」，
   那是 **PostgreSQL 18** 的行为，**在目标版本上是错的**：

   | | PostgreSQL **17.6**（Supabase 目标） | PostgreSQL 18.6 |
   |---|---|---|
   | `ON DELETE RESTRICT` 违反 | `23503 foreign_key_violation` | `23001 restrict_violation` |
   | `ON DELETE NO ACTION` 违反 | `23503` | `23503` |

   `restrict_violation` 是 PG 18 才引入的独立条件。
   **DAL 必须捕 `23503`，不得依赖 `23001`**；
   且在 17.6 上**无法**靠 SQLSTATE 区分 RESTRICT 与 NO ACTION，
   要区分只能看约束名。

   两版的**行为一致**（删除都被挡住），只有错误码不同。

**证据**：DB-3 报告 §11、§15；DB-3.5 报告 §8

---

## #DBR-25 retired 课程 `c_healing` 仍被现役代码引用

```
status:    CLOSED（2026-09-07，DB-6.1）
severity:  medium
owner:     unassigned
phase:     RB-01 / DB-6.1
```

**关闭依据**：

```
active production reference to nonexistent canonical course ID = 0
```

根因：`courseIds` 会被渲染成 `onCourseClick(c.id)` 按钮，是**可导航目标**；
`courseById()` 找不到时被 `.filter(Boolean)` 丢掉，所以从不报错、从不崩溃，
只是静默少一张卡片 —— 人眼审查发现不了。

处置：从 `SCENARIOS['care'].courseIds` 移除失效的 canonical 引用。
`theme: '牧养关怀与医治事工'` 与 `learn: [...'内在医治原则'...]` 是**纯文本**，予以保留 ——
主题没有丢，丢的只是一个指向不存在课程的 ID。

**未做**（刻意）：没有把它映射到 `c_healing_word` / `c_healing_inner`
（禁止按名称相近回填，D-37），也没有新增第 68 门课程。
这条推荐是否该补一门拆分后的课程，**属产品判断**，留给 Product Owner。

**防复发**：`tests/services/courseReferenceIntegrity.test.ts` —— 通用闸门，
不是一次性特判；已用注入坏引用的方式验证它确实会红。

**原记录**（保留）：

`components/CustomTheologyView.tsx:244`：

```ts
courseIds: ['c_counseling', 'c_healing'], boost: 'ministry',
```

`c_healing` 是 `RETIRED_COURSE_IDS` 之一，**两侧目录中都已不存在**
（App `OFFICIAL_CATALOG` 67 门无它，Portal `course_catalog` 67 条也无它）。
这条推荐规则会指向一门不存在的课程。

其余 3 个 retired id（`c_dr_pastoral` / `c_dr_peter` / `c_dr_johannine`）全仓**零引用**。

**修法待定**：拆分后的对应课程是 `c_healing_word`（神的话语医治）与
`c_healing_inner`（内在医治），但**哪一门该进这条推荐规则属产品判断，不是迁移能定的**
（DB-6 已裁定 4 个 retired id 均 `NONE FORMALLY KNOWN`，不做名称猜测）。

**证据**：DB-6 报告 §4、§16

---

## #DBR-26 `thumbnail` 的 32 条空串已逐字迁入

```
status:    OPEN
severity:  low
owner:     unassigned
phase:     RB-01 / DB-12（DAL / presentation semantics）
```

**DB-6.1 裁定**：迁移阶段继续**逐字保留**，本轮 `NO DATA NORMALIZATION`，
不得借 migration 偷偷改历史数据。

后续（DB-12）须统一定义三种取值在**读取/展示层**分别意味着什么：

```
NULL          —— 从未设置过封面
''            —— 历史上写入过空串（等价于「无封面」，但来源不同）
valid path    —— 有封面
```

SQLite `courses.thumbnail` 有 32 条是**空字符串**（不是 NULL），
恰好就是 `created_by='catalog-migration'` 的那 32 条。

DB-6 **逐字保留**空串迁入 `course_catalog.thumbnail_path` ——
把 `''` 悄悄改成 `NULL` 是一次未声明的数据改写，会让「App 当时写的是空串」这个事实消失。

应由 App 写入路径在 DB-12 归一（无封面时写 NULL 而不是 `''`），
归一后再补一次数据清理。

**证据**：DB-6 报告 §7

---

## #DBR-27 retired 课程的学习进度在 DB-3 schema 中无法表示

```
status:    CLOSED（2026-09-07，D-37 裁定）
severity:  medium
owner:     Supervisor（已裁定）
phase:     RB-01 / DB-6.1
```

**裁定结果（D-37）**：DB-3 现有的严格 FK 是**正确**的，**schema 不改**。
active `course_progress` 只能引用 canonical `course_catalog`；
未映射的 retired 进度以 `LEGACY_RETIRED` / `MIGRATION_REVIEW_REQUIRED`
存放在 migration manifest 与 quarantine 证据中，**不写入业务表**。

需要修订的是 **DB-1 §4.3 的措辞**（原文要求「迁入并标记」），不是 DB-3 的实现。

当前 `retired course_progress rows = 0`，因此**不新增任何 legacy-retired 业务表** ——
不为不存在的数据增加永久 schema。将来若出现此类数据，迁移必须
**fail closed / quarantine** 并提交 Product Owner。

**原记录**（保留）：

**契约与 schema 不一致**：

- DB-1 §4.3 要求：`course_progress.course_id ∈ RETIRED_COURSE_IDS` 的行
  **「迁入，但标记 `legacy_retired`，不得静默丢弃」**（学习历史属实践证据）。
- DB-3 实现：`app_course_progress.course_code` 是指向 `course_catalog(code)` 的真实外键，
  而 retired id 不在 canonical 目录中 —— 这类行**根本插不进去**。

当前 `course_progress = 0` 行，**因此不阻断**；
且 DB-6 已查证：迁移前备份中 `courses` 与 `course_progress` 同样是 0 行，
**没有任何真实学习历史丢失**。

两个方向，须 Supervisor 择一：

1. **保持 FK 严格** —— 承认「retired 进度不可表示」，并正式更新 DB-1 §4.3；
2. **另设 retired 引用登记表** —— 保留历史行但不进 canonical 目录
   （注意 TASK 3 禁止第二套课程目录，须论证它不构成目录）。

DB-6 **未擅自加表**。现在决定成本最低（0 行数据）。

**证据**：DB-6 报告 §4、§16

---

## #RB-29 `.env.example` 缺少全部 `SUPABASE_*` 变量

```
status:    CLOSED（2026-09-07，由 APP STAGING 的环境模板补齐提交修复）
severity:  medium（上手阻塞，非运行期缺陷）
owner:     unassigned
phase:     APP STAGING
```

**关闭依据**（实测当前文件）：

```
.env.example          VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY
backend/.env.example  SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · NODE_ENV
```

同批还把 `VITE_APP_SECRET` 标为 `DEPRECATED`（见 #20）——
`VITE_` 前缀意味着值会进 bundle，填上等于公开发布管理员凭据。

**原记录**（保留）：

两份示例文件都**没有**列出前后端实际依赖的 Supabase 变量：

```
App/.env.example        GEMINI_API_KEY · VITE_API_BASE_URL · VITE_APP_SECRET · VITE_VOICE_TRANSPORT
backend/.env.example    PORT · APP_SECRET · JWT_SECRET · CORS_ORIGINS · GEMINI_API_KEY
                        LIVEKIT_* · AGORA_* · ROOM_STORE_URL · DB_PATH · APNS_*
```

但实际必需的是：

```
backend    SUPABASE_URL                （config.ts:52）
           SUPABASE_SERVICE_ROLE_KEY   （config.ts:53，高敏，绝不下发客户端）
frontend   VITE_SUPABASE_URL           （services/supabaseAuth.ts）
           VITE_SUPABASE_ANON_KEY      （同上）
```

**后果**：照着示例配置的人会得到一个「登录直接 503」的环境，
而 503 的提示虽然写明了缺哪两个变量（`authService.ts:221` `requireSupabase()`），
示例文件里却找不到它们 —— 上手时会以为是 bug。

**未在 STAGING-0 修复的原因**：该阶段的约束是「除文档更新外不改业务代码」，
`.env.example` 属配置文件，留待下一个有写权限的实施阶段一并补。

**证据**：STAGING-0 报告 §3

---

## #RB-28 复核结论（2026-09-07，STAGING-0）

原记录担心「missing Supabase config → silent fallback」。逐处核对后：

| 位置 | 实际行为 | 判定 |
|---|---|---|
| App 认证 `services/authService.ts:221` | `requireSupabase()` **抛 503 并附明确提示**，注释写明「未配置就是不能用，而不是悄悄回落到一条已经不存在的链路上」 | ✅ **已修好**，认证部分可关闭 |
| Portal 官网 `assets/js/main.js:861` | `if(!S.url || !S.anonKey) return;` 静默跳过 | ⚠ **设计如此且有文档** —— 该通道是邮件通道之外的**次要**数据库通道（`supabase-config.js` 注释：「留空 = 仅邮件通道，网站正常工作」）。不是缺陷，但**是 staging 配置清单项**：忘了填就没有任何提示，官网提交不会入库 |

**处置**：认证部分关闭；官网数据库通道转为 STAGING ENTRY CHECKLIST 的检查项。

**证据**：STAGING-0 报告 §14

---

## #21 canonical HEAD 的 CI 假红（端口抢占）

```
status:    CLOSED（2026-09-08，连续三次 CI 全绿）
severity:  medium（不是代码回归，但 canonical HEAD 红灯会掩盖真实回归）
owner:     unassigned
phase:     STAGING-1A 发现
```

**修复**：`e2b801e` 把 `backend/package.json` 的 `test:local` 加上
`--test-concurrency=1`，让测试文件串行执行。

**根因（比首次诊断更准确）**：`test:local` 并行跑 7 个测试文件，其中多个
各自拉起一个 backend 进程；两个撞到同一端口时后者永远起不来，
撞上 20 秒就绪超时 → 报「server 未就绪」。
这解释了偶发性、为何只影响那两个启动真实 server 的文件、
以及为何本机串行环境下 166/166 恒绿。

> 我在 STAGING-1A 首次诊断时只判到「20 秒就绪超时、慢 runner 上偶发」，
> **机制没查到底**；`e2b801e` 补上了这一层。记此以免后来者停在同一深度。

**已确认**：`Backend (type-check + test + build)` job 在 `e2b801e` 与 `5af3d4b`
上**均为 success**（`# tests 166 · # pass 166 · # fail 0`）。端口抢占症状已消除。

> ⚠ **注意不要误读**：`e2b801e` 这次运行的**整体**结论仍是 failure，
> 但失败的是 `Release gate` 里的另一条间歇断言（见 `#23`），**不是 Backend job**。
> 两者是独立的两件事。

**关闭依据（2026-09-08）**：`5af3d4b` / `5c68b46` / `f855103`
**连续三次四个 job 全绿**，Backend job 稳定在 166/166。

**原记录**（保留）：

`6a7d68f`（纯文档提交）的 CI 结论为 **failure**。四个 job 中只有
`Backend (type-check + test + build)` 失败：**166 tests · 156 pass · 10 fail**。

失败的 10 条全部来自 `auth-post-legacy-audit.test.ts` 与
`auth-migration-cutover.test.ts`，`failureType: 'hookFailed'`，`duration_ms ≈ 20137`
—— 即撞上这两处的 20 秒就绪超时：

```
backend/src/test/auth-post-legacy-audit.test.ts:123
backend/src/test/auth-migration-cutover.test.ts:169
  if (Date.now() - start > 20_000) throw new Error(`server 未就绪：
${stderr}`);
```

**不是代码回归**，三条证据：

1. `express-rate-limit@8.5.2` 的校验器被包在 `try/catch` 中，
   捕获后 `logger.error`，**从不抛出** —— stderr 里那条 `ValidationError` 是噪音；
2. 本机同一代码同一 lockfile 跑 `test:local` **166/166 全过**；
3. 同一份代码在 `43805b9` 与 `5ea70f6` 的 CI 上**两次通过**。

**待定方向**（属工程决定，STAGING-1A 未擅自修改）：
重跑一次确认偶发 / 放宽这两处的就绪超时 / 让 harness 在超时时区分
「进程已退出」与「进程还活着但未就绪」。

**证据**：STAGING-1A 报告 §1

---

## #22 `rateLimit.ts` 的自定义 keyGenerator 未做 IPv6 归一 — `CLOSED`（2026-09-11）

```
status:    CLOSED
severity:  P2 SECURITY HARDENING（Supervisor 定级，2026-09-07）
gate:      本项不再阻塞 PUBLIC STAGING EXPOSURE
owner:     —
phase:     DB-13C 之后的 release hardening
```

**修复**：`middleware/rateLimit.ts` 的 `byUser()` 在未认证回落分支改用
`ipKeyGenerator(req.ip)`（已安装 express-rate-limit **8.5.2** 导出的官方 helper，
用法取自其 `ERR_ERL_KEY_GEN_IPV6` 文档页）。

**本轮实测的归一行为**（非记忆）：

```
203.0.113.9            -> 203.0.113.9              IPv4 原样
::ffff:203.0.113.9     -> 203.0.113.9              IPv4-mapped 还原
2001:db8:abcd:12::1    -> 2001:db8:abcd::/56
2001:db8:abcd:ff::1    -> 2001:db8:abcd::/56       同 /56 → 同一个桶
2001:db8:abcd:100::1   -> 2001:db8:abcd:100::/56   不同 /56 → 各自计数
```

**绕过已确定性复现**：修复前同一 /56 内换地址会拿到两个不同的 key
＝ 两份独立配额；`backend/src/test/issue22-ipv6-ratelimit.test.ts`
（8 项，已并入 `test:local`）中有 3 条在修复前失败、修复后通过。

**未改动的语义**：认证用户仍按 canonical userId 计数（换网络不换桶）；
缺 `req.ip` 时仍回落 `'anon'`；不同动作仍各自计数；Layer A 的 IP 限流未动。
其余 limiter 用的是默认 keyGenerator，它内部本来就调用 `ipKeyGenerator`。

**可观察结果**：`ERR_ERL_KEY_GEN_IPV6` 校验警告消失 ——
修复前它在每次 `test:local` 与 CI 日志里持续刷屏，修复后计数为 0。

<details><summary>历史原文</summary>

```
status:    OPEN
severity:  P2 SECURITY HARDENING
gate:      BLOCKS PUBLIC STAGING EXPOSURE
```

**Supervisor 裁定**：Layer A 的 IP 限流仍在，影响面受限，因此**不是 P0/P1**；
但**在修好之前不得暴露任何公开的 backend staging URL**。

**排期约束**：**不要**在凭据交接 / 只读 Supabase 审计期间修它 ——
那会把两条独立的线混在一起。安排在公开 staging smoke 之前。

> ⚠ **编号已裁定（Supervisor，2026-09-08）**：本项的 canonical ID 是
> **`OPEN_ISSUES #22 — IPv6 rate-limit hardening`**。**以后不要再称它为 `RB-22`。**
> 本文件中既有的历史 `#RB-22`（第 389 行、第 471 行，均为 AUTH 验收测试相关）
> **保持原样，不重编号、不改历史引用**。

`backend/src/middleware/rateLimit.ts:101` 的 `byUser()`：

```ts
const id = p && p.kind === 'user' && p.user ? p.user.id : (req.ip ?? 'anon');
```

未认证请求回落到 `req.ip`，**未经 `ipKeyGenerator` 归一化**。
`express-rate-limit` 的校验器据此报 `ERR_ERL_KEY_GEN_IPV6`：
**IPv6 客户端可能绕过这一层限流**（同一 /64 内换地址即换 key）。

影响面受限 —— 代码注释本身写明「未认证请求回落到 IP
（此时 Layer A 才是主要防线）」，Layer A 的 IP 限流仍在。
但这一层的回落形同虚设，且会持续污染日志。

**修法**：对 IP 回落分支改用 `ipKeyGenerator(req.ip)`，
或显式声明 `ipv6Subnet`。**本轮只报告，未修改代码。**

**证据**：STAGING-1A 报告 §1

</details>


---

## #23 `verify-rooms-render.mjs` 的 presence 提示断言在 CI 上间歇失败 — `CLOSED`（2026-09-10）

```
status:    CLOSED
severity:  medium（使 Release gate 偶发红灯，会掩盖真实回归）
owner:     —
phase:     DB-13B 收尾时修复
```

**修复**（commit `099f59b`）：该用例杀掉 backend 后用固定 `sleep(13000)` 等一次
presence 轮询失败，而轮询周期是 10s —— 只有 3s 余量。DB-13B 之后每次请求都要走
一趟 Postgres，启动与首轮轮询都变慢，这 3s 在 CI 的慢机上不够。
固定 sleep 改成**有界轮询**（等到降级提示出现或压根没有人数显示，最多 30s）。

判定依据：`1e36ec5` 的 CI 首次红在这一条、重跑即绿，而本地稳定通过 ——
是时序余量问题，不是行为变化。修复后 `099f59b` / `f50dc40` 的 CI 均一次通过。

<details><summary>历史原文</summary>

```
status:    OPEN
severity:  medium
```

`e2b801e` 的 CI 整体 failure，失败 job 是 **`Release gate (verify:local-release)`**
（**不是** Backend —— Backend 已由 `--test-concurrency=1` 修好，见 `#21`）。

具体位置：`scripts/verify-rooms-render.mjs` **50/51**，唯一失败：

```
FAIL  presence 失败显示轻量提示，不显示假人数 — (无提示)
```

**本机同一提交跑同一脚本：`51/51 PASS`**，该条输出「已显示轻量提示」。
下一个提交 `5af3d4b` 的 CI 四个 job **全绿**。

**性质**：浏览器渲染时序敏感 —— presence 请求失败后提示才渲染，
CI runner 上偶尔在断言时刻尚未出现。**与端口抢占无关，与 Supabase / 凭据无关。**

**Supervisor 裁定（2026-09-08）**：

```
#23 ≠ STAGING-1A credential audit blocker
```

`f855103` 的 CI 已全绿，因此它不阻塞当前的凭据交接与只读审计，**后续单独 hardening**。
**证据保留，不删除。**

**修复原则（不可协商）**：

```
explicit wait for required UI state
```

**不得**通过放宽产品断言来解决。下面这条行为标准本身不许降低：

```
presence failure must show a lightweight error
and must not show fake user count
```

（`5af3d4b` / `5c68b46` / `f855103` 三次均未复现 ——
但间歇项不能因为几次没出现就当作不存在，条目保持 OPEN。）

**证据**：STAGING-1A CONTINUATION 报告 §2


</details>

---

## #24 DB-12：app_* 的身份口径与 App 的 D-1 双身份模型冲突 — `RESOLVED`（2026-09-10）

```
status:    RESOLVED
severity:  —
owner:     —
phase:     DB-12
```

**裁定（见 D-42）**：迁移域的业务主体 = `profiles.id`（Supabase UUID）。
**不放宽** DB-3 外键，**不**在 Postgres 侧建第二套身份命名空间。
过渡规则：已切域用 `principal.authId`，未切的 SQLite 域可暂用 `principal.user.id`。

**已落地**：rooms / 成员制 / presence 全部切到 Postgres 并以 Supabase UUID 为身份；
房间创建权威从请求体 `hostId` 改为认证上下文；`x-host-id` 不再具备授权效力。
下方原文保留为背景。

**事实（live 只读实测）**：`app_*` 中**每一个** uuid 身份列都外键到 `profiles.id`
（即 `auth.users.id`，Supabase UUID）。共 33 条此类外键，含：

```
app_rooms.host_user_id        -> profiles.id
app_room_members.user_id      -> profiles.id
app_room_presence.user_id     -> profiles.id
app_course_files.uploader_id  -> profiles.id
app_posts.user_id / app_prayer_shares.user_id / … 等 28 条
```

**冲突**：App 后端当前按 D-1 用 `principal.user.id`（canonical SQLite id，**非 uuid**）
作为业务数据主体，而 Postgres 侧要求 `profiles.id`。两者不是同一个值域。

**具体表现**：`POST /api/rooms` 目前接受**客户端传入**的 `hostId`（测试里是
`'host-1'` 这类自由字符串）。写进 `app_rooms.host_user_id` 会因类型与外键双重失败。
`room_members.user_id` 同理。

**已切换的域为何不受影响**：`app_course_files.uploader_id` 已改写 `principal.authId`
（Supabase UUID）；`app_cooperation_submissions` 不含身份列。

**为什么本轮没有擅自解决**：把 rooms 域改成按 Supabase UUID 键控，等于修改 D-1
身份模型在业务数据上的落点，波及 `requireRoomExists` 的 36 处调用点与
membership/presence 两张表。这是架构决定，不是 fast-track 能顺手带过的。
另外 staging 只有 1 个 profile，任何 user-scoped 写入都只能属于那一个身份 ——
按 §5，正确行为是返回"不可用/无权限"，而**不是**造一个学生身份让测试变绿。

**待裁定**：rooms / 成员制 / presence 的业务主体，用 `profiles.id`（Supabase UUID）
还是保留 canonical SQLite id 并在边界处解析？前者需要改 App 身份模型，
后者需要 DB-3 的外键让步 —— 两条路都不该由实现者单方面选。

---

## #25 旧 SQLite 库仍带指向 `rooms` 的失效外键 — `CLOSED`（2026-09-10）

```
status:    CLOSED
severity:  P1（升级安装的运行时故障，新装不受影响）
owner:     —
phase:     DB-12 closeout
```

**缺陷**：DB-12 把房间迁到 Postgres 后，`backend/src/db.ts` 已从建表语句里去掉
`prayer_sessions.room_id → rooms(room_id)` 与 `room_reading_state.room_id → rooms(room_id)`。
但 `CREATE TABLE IF NOT EXISTS` **不会改动已经存在的表** —— 因此**已经存在的**
`amas.sqlite` 仍带着这两条外键，而 SQLite 的 `rooms` 里没有 Postgres 新建的房间。

**实测确认（`PRAGMA foreign_key_list`，只读，在副本上做）**：
`backend/data/amas.sqlite`（450560 字节 / 32 业务表）两条外键均 **PRESENT**。

**故障路径（已复现）**：Postgres 建房 → 开祷告会 →
`SqliteError: FOREIGN KEY constraint failed`（`routes/prayerSession.ts:201`）。
负对照证明：临时禁掉迁移，行为测试立刻红；恢复后转绿 —— 测试不是空转。

**修复**：`backend/src/migrations/db12RoomFkCompat.ts`，启动时按 SQLite 官方 12 步
流程重建这两张表，**只**去掉指向 `rooms` 的外键。新表 DDL 取自该表自己在
`sqlite_master` 里的真实文本（不硬编码），因此列序 / CHECK / DEFAULT / 其余外键
逐字保留；重建前后逐项比对列指纹与外键指纹，不一致即抛错回滚。

```
幂等         新库与已升级库 = NO-OP
事务化       失败整体回滚，不留半迁移状态
数据         逐行 JSON 比对一致，一条不丢也一处不改
收尾         PRAGMA foreign_key_check = 0 违规；foreign_keys 恢复为 ON
```

**刻意未处理**：`room_members.room_id → rooms(room_id)` 同样存在，但该表运行时
已无写入（成员制在 `app_room_members`），按 DB-12 §12 保留作回滚参考，**不动**。
若将来要回滚房间域到 SQLite，这条外键仍然有用。

**未处理但已知**：`backend/data/amas.sqlite` 本体尚未迁移 —— 本轮只在字节相同的
副本上验证。它会在**下一次后端启动时自动完成**迁移。刻意不提前手工改动生产数据文件。

**回归**：`backend/src/test/db12-sqlite-compat.test.ts`（18 项，已并入 `test:local`）。

---

## #27 DB-13B 期间撞出并修掉的三个既有缺陷 — `CLOSED`（2026-09-10）

```
status:    CLOSED
severity:  #27a P1（身份可冒充）· #27b P2（功能恒失效）· #27c P2（测试卫生）
owner:     —
phase:     DB-13B
```

这三个都**不是** DB-13B 引入的，是切换时被新测试撞出来的。留档以免日后被
误当成「切换造成的回归」。

**#27a 录音上传的身份取自客户端请求头** ——
`POST /api/recordings` 用 `X-User-Id` 请求头当上传者身份。任何人都能声称
一段录音属于别人。DB-13B 把 `user_id` 改为一律取自已验证的认证上下文；
`X-User-Id` 若仍被旧客户端发送，**只做一致性校验**，不符即 403。
（`X-Room-Id` 保留 —— 它选的是房间，不是身份，且现在必须是既存房间。）

**#27b 公开动态墙的 `likedByMe` 恒为 false** ——
`GET /api/posts` 是公开接口，实现里读 `req.principal` 算 `likedByMe`，
但项目里**没有任何**中间件会在公开路由上填充 `req.principal`。
于是这个字段对所有人恒为 false，哪怕带着有效 token。
新增 `attachPrincipalIfPresent`（有凭据就解析、任何失败都不拒绝）并只挂在
这条路由上。**它绝不能替代 `requireAuth`** —— 它不做任何拒绝。

**#27c `auth-m7-identity.test.ts` 自带第二套 fake Supabase** ——
项目规则是「只允许 `helpers/supabaseHarness.ts` 一套」。那个内联实现只有
JWTS + user_roles，因此 DB-13B 把 growth / posts 切到 Postgres 后它一律 404。
已并入共享 harness，并给 harness 补了 `mintBadToken()`
（issuer 错 / 已过期 / 外来密钥），这样否定式断言不必各自持有第二把私钥。

**顺带**：`endedSessions` 的首页游标是 `Number.MAX_SAFE_INTEGER`，
在 SQLite 下直接参与数值比较毫无问题，但格式化成 timestamptz 时
`new Date(9007199254740991)` 是 Invalid Date，`toISOString()` 抛 RangeError ——
整个祷告会历史列表 500。这是 SQLite→PostgREST 翻译引入的**新**缺陷，
已在 `staging/sessionStore.ts` 修掉（超出可表示范围就不加上界过滤）。

---

## #26 CANONICAL SQLITE WRITE CONTAINMENT

```
status:    OPEN（收窄：开发写入已围堵；**存储布局本身仍未重新设计**）
severity:  P2 RELEASE HARDENING
owner:     unassigned
phase:     DB-13A → #26 开发围堵（2026-09-11）
blocking:  PUBLIC STAGING · PRODUCTION
不阻塞:     内部 staging 验收
```

**事实**：DB-12 收尾期间，一个以**默认 DB_PATH** 起来的后端进程
（`npm run dev` = `tsx watch src/server.ts`）在无人察觉的情况下对
canonical 数据文件 `backend/data/amas.sqlite` 执行了表重建级 schema 迁移。
结果是正确的（32 表 / 285 行一行不差、`integrity_check = ok`、
`foreign_key_check` 0 违规），但「隐式改写 canonical 数据文件」这个**模式**
不能继续存在 —— 这已是本机进程在无人预期时碰到 canonical 资产的第二次。

**不做的事**：不恢复旧字节（当前库是有效的，改动本身是兼容代码的预期行为）；
不改写 DB-2/DB-3 的历史 SHA（`0798526d…` 是**溯源记录**，不是当前校验和；
且 0023 是已应用的 canonical migration，不得编辑）。

**为什么之前没有任何东西报警（关键实测）**：`tsx --test` 下 `NODE_ENV` 是
**undefined**，只有 node 测试运行器注入的 `NODE_TEST_CONTEXT="child-v8"`。
因此任何只判断 `NODE_ENV === 'test'` 的守卫**一个测试都拦不到**。

**已封堵（DB-13A，`backend/src/dbPath.ts`）**：

```
测试上下文缺 DB_PATH        → 抛错拒绝启动（fail closed）
                             识别用 NODE_TEST_CONTEXT ∪ NODE_ENV=test
落到 canonical 缺省文件
  且要改 schema             → 需显式 AMAS_ALLOW_CANONICAL_SCHEMA_CHANGE=1
                             错误信息里列出会重建哪几张表，不让人盲签
启动日志                    → 总是打印解析出的路径与来源（env / 缺省）
运维脚本                    → identity-migration-apply / -dryrun /
                             migrate-catalog 现在都会打印它操作的是哪个文件
production                  → 早已由 RB-06 强制：缺 DB_PATH 直接 exit 1
```

**已补齐（#26 开发围堵，2026-09-11）**：上面那条「dev 仍可对 canonical 做行级
写入」的残留已经封掉。当时的判断是「堵掉会破坏开发流程」，这个判断不成立 ——
破坏开发流程的不是围堵，是**围堵之后没给开发一条路**。现在两件事一起做：

```
开发上下文缺 DB_PATH        → 抛错拒绝启动（与测试上下文同样 fail closed）
                             错误信息给出三条可操作出路，不是一句「拒绝」
npm run dev                 → 经 backend/scripts/dev.mjs 显式指向
                             <backend>/.tmp-dev/dev.sqlite（一次性，可随时删）
                             跨平台：Windows 的 cmd/PowerShell 不支持内联环境变量，
                             故用 node 包装器而非新增 cross-env 依赖
兼容逃生口                  → AMAS_ALLOW_CANONICAL_DB=1 恢复旧行为，
                             启动日志显式标注；**不放宽** schema 守卫
production                  → 语义刻意不变：仍落 canonical，仍由 RB-06
                             startupGuard 统一列出缺配置后 exit(1)。
                             在 dbPath 里提前抛会把那份清单换成一条模块加载
                             异常，是退步不是加固。
```

**启动顺序（Codex 复核追加，2026-09-11）**：production 分支在 startupGuard
之前就返回 canonical，那 db.ts 究竟在 exit(1) 之前还是之后打开文件？实测答案是
**之前**，而且不止打开 —— 修复前那次运行日志里有
`SEC-3 migration: +prayer_sessions.title, …`：一个被判定配置不合格、随即拒绝
启动的实例，已经改过 canonical 的 schema 了。

根因是 ESM 的 **import 先于模块体求值**：`server.ts` 的门禁调用写在模块体里
（看起来很靠前），但那一串路由 import 里有 `db.ts`，db.ts 的模块体先跑完。

修法：`backend/src/bootstrap/productionGate.ts` 把 `assertProductionConfigOrExit()`
放进模块体，并成为 `server.ts` 的**第一个 import**。RB-06 语义一字未改 ——
同一个函数、同一份三项清单、同一个 exit(1)，只是提前跑。刻意**不**把检查搬进
`dbPath.ts`：那样会把完整清单换成一条孤立的 DB_PATH 异常。

```
修复前   exit 1 · canonical 文件被创建 = true  · 日志有 SQLite: / SEC-3 migration
修复后   exit 1 · canonical 文件被创建 = false · 日志中二者皆无，三项清单完整
```

**精确边界（不要误读为整条已关）**：
```
production 缺 DB_PATH 经 server.ts 启动 → 门禁先跑，数据文件一个字节不碰
production 缺 DB_PATH 但直接 import db.ts（运维脚本等不经 server.ts 的入口）
                                       → 仍返回 canonical。刻意保留：
                                         那类入口本就是操作者指名要跑的。
存储布局本身                           → 未重新设计，#26 因此仍 OPEN
```

**仍 OPEN 的部分**：canonical 数据文件位于仓库目录内的一个**缺省**路径上 ——
重新设计存储布局不属于本轮范围（Supervisor：不要在本阶段重构存储）。
本条因此仍 OPEN，只是范围收窄到「存储布局」这一项。

**回归**：`backend/src/test/issue26-dev-db-containment.test.ts`（18 项，已并入
`test:local`）。负向控制：临时把 dev 分支改回旧行为重跑，5 条转红 ——
其中一条正是「canonical 文件在本组用例全程未被改动」，旧代码确实会把
`backend/data/amas.sqlite` 凭空创建出来。恢复后 17/17。
另有一次 `npm run dev` 实机冒烟：health 200、dev 库落在 `.tmp-dev`、
canonical 未被创建。

**注意**：`db13a-canonical-db-guard.test.ts` 里原先断言「非测试上下文缺 DB_PATH
→ 落 canonical」的那条，断言的正是本轮要封的行为，已改为断言新语义
（production 一路仍落 canonical，开发一路拒绝）。DB-13A 的两条保证未被削弱，
有独立用例钉住。

**回归**：`backend/src/test/db13a-canonical-db-guard.test.ts`（16 项，已并入
`test:local`），含一个真进程用例证明缺 DB_PATH 时拒绝启动，
以及一条断言证明 canonical 文件在整套测试全程未被改动
（CI 上该文件不存在 —— 则断言它**也没有被创建出来**）。

---

## #28 底部标签栏与多个弹窗同为 `z-50`，靠「内容够不到底部」侥幸不撞 — `CLOSED`（2026-09-11）

```
status:    CLOSED —— 标签页里的全屏弹窗统一走 services/layers.ts 的 MODAL_LAYER
severity:  medium（同类只要内容贴到底部就是「完全点不到」）
owner:     unassigned
phase:     触控目标巡检（2026-09-11）
```

**事实**：`components/Navigation.tsx` 的常驻标签栏是
`fixed bottom-0 … z-50`，并且在 `App.tsx` 里渲染在视图内容**之后**。
视图内部的弹窗若也用 `z-50`，层级相同、DOM 靠前 —— 标签栏画在弹窗上面。

`LibraryView` 的 AI 助教弹窗在手机上是 `items-end` + `h-[85vh]`，
提问框和发送键正好落在标签栏底下。实测 `document.elementFromPoint`
在发送键正中返回的是标签栏的 `校友圈` 图标：**这个功能在手机上完全不可用**，
既点不到也聚焦不到。本轮已把该弹窗抬到 `z-[60]`（与同文件的书籍预览弹窗同层）。

**未处理的同类**：`ProfileView` 的编辑资料弹窗与设置弹窗同样是 `z-50`。
320/375px 实测它们的控件都在标签栏上方，当前没有撞上 —— 但这是
「内容恰好不够高」带来的，不是层级保证的。表单再长一点就会复现。

**收尾（2026-09-11）**：新增 `services/layers.ts`，导出 `NAV_LAYER` / `MODAL_LAYER`，
并把 `ProfileView` 的编辑资料与设置弹窗、`LibraryView` 的 AI 助教与书籍预览弹窗
四处改为引用 `MODAL_LAYER`，不再各写各的字面值。

**先复现再修**：在 320×568（矮屏那一档）打开「编辑资料」滚到底，
`document.elementFromPoint` 在保存键正中返回的是标签栏的图标 —— 真的点不到。
375×720 上同一处是过的，正好印证「靠内容不够高侥幸躲开」这个判断。
回归脚本 `scripts/verify-modal-layering.mjs`：两个视口 × 三个弹窗，
各验打开 / 滚到底 / 底栏遮挡 / 键盘焦点进得去 / 关得掉，修复前 21/24，修复后 24/24。

**未纳入本条的同类**：`CourseDetailView` 与 `College/AdmissionsSection` 里也有
`z-50` / `z-40` 的全屏浮层，但那两个视图渲染时常驻标签栏不在场（App.tsx 的
标签分支之外），当前不构成遮挡，本轮不动。

---

## #29 七个 UI / 流程回归脚本未并入 CI，仅有本地聚合入口

```
status:    已备好独立 CI job（ci.yml 的 ui-flows），是否启用/合入由监督裁定
severity:  low（不影响运行时；影响的是这些断言会不会随时间失效）
owner:     unassigned
phase:     触控目标 / 核心流程巡检（2026-09-11）
```

**事实**：本阶段陆续新增了七个用真实浏览器跑的回归脚本，覆盖触控目标、弹窗
层级、核心用户流程与 discover 同源副本。它们都不写真实数据（只写浏览器
localStorage 里各自用到的键，用例间自行清理），也不需要后端、真实身份或
live 配置，但**都没有并入 `test:regression`**，此前只能逐个手敲。

为避免永久游离，`package.json` 新增本地聚合入口：

```bash
npm run verify:ui-flows
```

串起来的七个（各自会自起 vite 或极小静态服务器 + Chrome headless）：

```
verify-discover-exit          47/47   discover 同源副本：App 返航路径 + 焦点/进度语义
verify-dashboard-search-a11y  16/16   首页两个搜索键的 tab 序
verify-global-search-modal    15/15   全局搜索浮层的模态语义
verify-touch-targets         100/100  九个视图的触控目标与可访问名称（320 / 375px）
verify-modal-layering         60/60   五个弹窗的层级 / 滚动 / 焦点 / 底栏遮挡
verify-course-flow            29/29   首页进课 → 返回状态保留 → 收藏 → 进度跨页 → 发帖
verify-assessment-resume      18/18   30 题评估的退出续答（按 CHRISTIAN_PROFILE_SPEC 铁律）
verify-custom-groups          19/19   自建群的身份隔离与坏格式安全恢复
```

`CHROME_PATH` 可覆盖 Chrome 路径。全套单跑约 10–15 分钟 —— 这也是没有直接塞进
`test:regression` 的原因：那条链子目前是 CI 里跑的，多出十几分钟需要监督先裁定。

**已做**：在本隔离分支的 `.github/workflows/ci.yml` 里加了**独立 job `ui-flows`**，
与 `regression` 并行、互不阻塞，**没有塞进 `verify:local-release` 那条 && 链** ——
塞进去会把发布门禁时长翻倍，而且某个 UI 断言抖动会连带挡住后端与构建的信号。
job 里没有 `continue-on-error` / `|| true`（那就又是假绿了）。

**待决**：这个 job 是否随分支合入主线即生效。合入前它不会在任何地方触发
（本分支未 push，CI 只在 push / PR 到 main 时跑）。

---

## #30 「写好了却没人调用」的功能开关清点

```
status:    部分 CLOSED（三处已接上入口），其余按产品规则刻意不接
severity:  medium（用户侧表现为「文档说有、界面里没有」）
owner:     unassigned
phase:     核心流程巡检（2026-09-11）
```

走核心流程时先撞上一处（校友圈发帖），随后做了一次针对性清点：找出所有
`useState(false)` 且**全仓没有任何一处置为 true**、也没有作为 prop 传下去的
布尔开关。粗扫会有大量假阳性（`setX(v => !v)`、经由 prop 传给子组件的
`setIsRoomMinimized` 等），逐个核实后剩下四处。

### 已接上入口（按产品原始规则判定应当可达）

| 开关 | 已实现但打不开的东西 | 依据 |
|---|---|---|
| `CommunityView.showCreateMoment` | 发帖撰写页（正文 / 最多 9 图 / 关联课程 / 乐观插入） | README 把校友圈列为「✅ 动态流」 |
| `VoiceRoomOverlay.showPasswordSettings` | 房间密码设置弹窗 | README 把「房间密码（scrypt + timingSafeEqual）」列为已完成能力 |
| `CommunityView.showCreateGroup` | 发起群聊（挑联系人 / 建会话 / toast） | 通讯录本就有会话列表与 GROUP 角标 |

发起群聊连带修掉一处落点错误：原本建完把用户送到「官方群组」栏，
而那一栏列的是 `OFFICIAL_GROUPS`，新建的群是一条 `Conversation`、
只在「最近消息」里出现 —— 跳过去用户会以为没建成。改为落在「最近消息」。

### 刻意不接

**`CoursesView.showAddModal`（新增课程）** —— 不是遗漏，是被上游挡住了。
课程目录的 admin 写路径已按 **D-43** 停用（后端返回 501
`CATALOG_MUTATION_UNSUPPORTED`），产品口径待定。现在把入口放出来，等于给
管理员一个按下去必然失败的按钮。**等 D-43 有结论再说。**

### 顺带查出、未处理的两处

1. `CommunityView.showCommentEmojiPicker` —— 声明了、被置过一次 false，
   但**从来没有被读来渲染任何东西**。它不是「入口缺失」，是纯死状态；
   删掉是零风险清理，但对用户没有任何可见改善，本轮不为清扫而改。
2. ~~`handleCreateGroupChat` 把新群写进 `localStorage['amas_custom_groups']`，
   而全仓没有任何一处读回它 —— 刷新后自建群消失。~~
   **这条判断是错的，已于同日实测推翻并更正，见 #31。** `App.tsx` 的
   `conversations` 初始化本来就读了那个键并按 id 去重合并，刷新后是在的。
   错误来自只 grep 了写入侧、没查读回侧 —— 一个只看半边就下结论的教训。
   那一处真正的缺陷是身份隔离与坏格式恢复，已在 #31 修掉。


---

## #31 自建群聊：身份之间串数据；坏格式会把会话列表弄坏 — `CLOSED`（2026-09-11）

```
status:    CLOSED —— 读写收到 services/customGroups.ts，按身份分桶 + 安全恢复
severity:  medium（身份串数据是隐私问题；坏格式会让整个会话列表打不开）
owner:     unassigned
phase:     核心流程巡检（2026-09-11）
```

### 先把事实摆正

`#30` 里曾写「自建群刷新即消失」。**那句话是错的。** 本轮实测：建群 → 刷新 →
仍可见。`App.tsx` 的 `conversations` 初始化本来就读 `amas_custom_groups` 并按 id
去重合并。前一轮的错误来自只 grep 了写入侧、没查读回侧。已在 #30 原处划掉更正。

### 真正的两条缺陷（都实测复现过）

```
1. 键是全局的 amas_custom_groups，不带任何身份
   甲登录建群 → 换乙登录 → 乙的会话列表里看得见甲建的群
2. 只挡语法坏掉的 JSON，挡不住「合法 JSON 但类型不对」
   把键写成 '"not-an-array"' → JSON.parse 得到字符串 →
   [...INITIAL, ...'not-an-array'] 摊成一堆单字符 → 会话列表打不开
```

### 修法（沿用既有的纯本地设计，没有改性质）

新增 `services/customGroups.ts`：

- 按身份分键 `amas_custom_groups:v2:<userId>`；未登录时不落盘（没有归属）。
- 逐项校验：不是数组就整份丢弃；数组里每项必须有非空字符串 `id` 与 `userName`，
  坏项只丢那一项而不是整份。
- 读取时**自愈回写**：清理掉的坏项/重复项写回存储，不留脏数据。
- 同 id 去重（保留后出现的那条，与 `App.tsx` 原有 Map 口径一致）；上限 200 条。
- 旧全局键的处理见下方「整合审查的两条必改」—— **不归属给任何身份**。
- `App.tsx` 加了一个按 `currentUser.id` 触发的 effect：登录/切换/登出都重算
  会话列表 —— 组件不会因为换人而重新挂载，光靠初始值不够，登出后必须把
  上一个身份的自建群从列表里撤掉。

**性质没有变，别说过头**：自建群聊仍然只存在这台设备的这个浏览器里，
不同步给群里其他人，也没有任何后端记录。本轮没有引入服务端同步、
没有新增真实账号、没有任何后端映射。

### 回归

`scripts/verify-custom-groups.mjs` 19/19，已并入 `npm run verify:ui-flows`：
建群→刷新仍可见 · 换身份不串（双向）· 四种坏格式下会话列表仍能打开 ·
旧全局键迁移后不丢数据且别的身份看不到 · 同 id 只留一条。


---

## #32 自建群迁移的两处必改（整合审查提出）— `CLOSED`（2026-09-11）

```
status:    CLOSED —— 迁移改为「写隔离位 → 读回核对 → 才删源」，旧数据不归属任何身份
severity:  high（一条会丢数据，一条会把甲的群送给乙）
owner:     unassigned
phase:     整合前审查（2026-09-11）
```

监督在整合审查里指出 `services/customGroups.ts` 两处必须修。两条都成立。

### 一、先删源后写新 → 写失败就丢数据

```ts
// 改前
legacy = parseList(raw);
localStorage.removeItem(LEGACY_KEY);   // ← 先删
...
write(userId, merged);                 // ← 后写，而且 write 把异常吞掉
```

配额满或隐私模式下 `write` 失败，旧数据永久没了，而且没有任何人会知道。

**改后的铁律**：写隔离位 → `getItem` 读回来**逐字节核对** → 核对通过才删源。
任何一步不成立就原地不动（源保持原样，下次再试）。
只看 `setItem` 没抛异常是不够的 —— 某些隐私模式下它静默不生效，
所以必须读回核对。同一条也用在 `addCustomGroup`：新增 `persisted` 返回值，
落盘失败时 `CommunityView` 的 toast 改成「已创建（仅本次使用，未能保存到本机）」，
**不拿「创建成功」盖过去**。

### 二、旧数据归属未知，却自动分给第一个登录的身份

改前的理由是「这套数据通常只有一个人在用」。**那个理由不成立** ——
使用习惯不能当作身份归属的依据。真实后果：乙先登录一次，甲的旧群就变成乙的。

**改后**：

```
旧键内容原样搬到隔离位 amas_custom_groups:unclaimed:v1
不归给任何身份，不出现在任何人的会话列表里
不在任何界面上显示 —— 连「有 N 条」都不显示，那会泄露「另一个人有过 N 个群」
只对外暴露非泄露的恢复状态 getUnclaimedLegacyState() → { present, count }
  刻意只有布尔与计数，**不读出群名**，也不暴露成员与时间
要认领给谁，需要一次明确的产品决定，本模块不替代
隔离位已有内容时不覆盖也不删源 —— 两批未认领数据都保住
```

### 三、不得根据「当前解析器认不认识」去删原始内容（第二轮审查提出）

第一版改完之后还留了一个分支：`parseList` 解析不出条目就把旧键清掉，
理由是「那不是真实数据」。**这个判断同样不成立** —— `parseList` 只认识当前
这一种结构，读不出来可能是更早的结构（例如外面包了一层对象）、可能是可修复
的损坏，也可能只是一个合法的空数组。**解析器不认识 ≠ 不是真数据。**

该分支已删除。现在隔离**完全不看内容**：原字节搬走、原字节保留，可以不显示、
不解析，但不替用户做删除决定。

`getUnclaimedLegacyState()` 相应改为：`present` 看的是**原字节在不在**
（不是能不能解析），另加 `parsable` 说清这一版读不读得懂。
否则一份读不懂的旧数据会被报成「没有」，而它其实还在那里等着被认领。

### 顺带作废的一条过宽结论

`scripts/verify-custom-groups.mjs` 第 4 段此前断言「旧全局键里的群仍看得见
（迁移后不丢数据）」。那条断言**把泄露行为写成了验收标准**，已按新语义改写为：
旧数据不出现在任何身份的列表里、隔离位内容逐字节一致、换身份同样看不到。

### 回归

```
tests/services/customGroups.test.ts   40/40  fixture 级（21 → 40）
  原字节保留 ×4 种输入（旧结构 / 损坏 JSON / 空数组 / 非数组标量）：
    搬进隔离位逐字节一致 · 源确认写成功后才删 · 不进任何身份列表
    恢复状态报 present=true / parsable=false · 写失败时源原地不动 · 重复加载不删不改
  乙先登录拿不到 / 甲随后也拿不到 / 原样保在隔离位 / 恢复状态不含群名
  setItem 抛异常时源原地不动 / 静默不生效时源也原地不动 / 失败后下次仍能补做
  建群落盘失败返回 persisted=false（抛异常与静默不生效两种都覆盖）
  无身份不读不写但当次可见 / 重复读取幂等且不反复回写
scripts/verify-custom-groups.mjs      27/27  浏览器级（19 → 21 → 27）
```

测试自身踩到的坑也记下来：`vi.spyOn(Storage.prototype, 'setItem')` 在 happy-dom
里**根本拦不到**，`not.toHaveBeenCalled()` 因此变成空跑假绿；改挂实例又还原不
干净，一个用例把 `setItem` 打坏后面全部连环带红。最后整块换成自己实现的假
storage（`mode` 控制写入行为），并在「未被调用」类断言前先自证计数真的在动。


---

## #33 课程列表补直接收藏入口 — `CLOSED`（2026-09-11）

```
status:    CLOSED
severity:  low-medium（功能缺口：收藏课程只能在详情页下拉里点到）
owner:     unassigned
phase:     产品完善（2026-09-11）
```

**产品决定**：课程列表每行补一个直接收藏 / 取消收藏的入口。

`CoursesView` 一直收着 `favoriteCourseIds` 与 `onToggleFavorite` 两个 prop，
却**一次都没用过** —— 收藏课程此前只能进详情页、打开「更多操作」下拉才点得到。
而「我的」页的「我的学习」只列收藏过的课，入口这么深意味着那一栏基本是空的。

**接的是同一套状态，没有第二份数据**：按钮直接调 `onToggleFavorite(course.id)`，
读 `favoriteCourseIds.includes(...)`，也就是 `App.tsx` 里那一份
`favoriteCourseIds`（`handleToggleFavorite`）。详情页菜单、列表、
「我的」页的收藏课程计数天然一致，不需要任何同步逻辑。

**不误触打开课程**：整行是可点的 `role="button"`，所以按钮的 `onClick` 里
`stopPropagation`；行的 `onKeyDown` 本来就有 `e.target !== e.currentTarget` 判断，
按钮上的回车/空格不会穿透，按钮上再显式 `stopPropagation` 兜一层。
两条都有实测断言。

**可访问性**：`aria-pressed` 反映当前状态，`aria-label` 带课程名
（「收藏课程 马太福音」/「取消收藏课程 马太福音」），读屏能分清是哪一门。
可视 28×28 保持紧凑，热区用 `before:` 伪元素扩到 44×45。

### 回归

`scripts/verify-course-flow.mjs` 44 → 60，新增一段 16 条：

```
每行都有收藏键 · 可聚焦且名称带课程名 · 热区 44×45（可视 28×28）
点收藏不会误触打开详情 · 回车不会穿透去打开详情 · 点一下状态与名称同步
「我的」页收藏课程计数变 1 且该课出现在「我的学习」里
切页回来仍是已收藏 · 详情页菜单显示「取消收藏」
在详情页取消，列表那一行同步变回未收藏
```

`verify-touch-targets` 100/100：课程页受检控件从 28 涨到 44 个
（新增 16 个收藏键），全部达标且都有名称。

---

## #34 课程收藏根本不落盘，刷新即空 — `CLOSED`（2026-09-12）

```
status:    CLOSED
severity:  medium（用户可见：收藏过的课刷新就没了）
owner:     unassigned
phase:     产品完善（2026-09-12）
```

`App.tsx` 里 `favoriteCourseIds` 一直是 `useState<string[]>([])` —— 既不落盘，
也不往任何地方同步。#33 把入口做到列表每一行之后这条更显眼：顺手收几门课，
刷新回来「我的学习」又是空的。

**为什么这里写本地是对的，而图书馆收藏刻意不写**（不是双标）：

```
图书馆收藏   后端有 /api/library/favorites（GET + POST）
             写本地会造出一份被服务端覆盖的影子副本，让人误以为已经存好了
课程收藏     后端**没有任何对应端点**（backend/src/routes 里只有 library 那两条）
             本地不是影子副本，而是**唯一的存储**；不写就等于这个功能不存在
```

理由写在 `services/courseFavorites.ts` 顶部，将来真有端点了改成
「服务端说了算、空列表不覆盖本地」即可。

沿用 `services/customGroups.ts` 那套已经过审的纪律：按身份分键
`amas_course_favorites:v1:<userId>`、未登录既不读也不写、写入后读回逐字节核对、
落盘失败如实返回 `persisted=false`、解析逐项校验（不是数组整份丢弃，数组里的
坏项只丢那一项）、读取自愈只动自己那个桶、上限 500 条。

**没有引入服务端同步、没有新增真实账号、没有任何后端映射。**

### 回归

```
tests/services/courseFavorites.test.ts  33/33（fixture，假 storage）
verify-course-flow 60 → 67：刷新后还在 · 落在带身份的键上 · 没有全局键
  换身份看不到上一个人的收藏 · 新身份不覆盖旧桶 · 切回原身份原样恢复
```

探针那一节起步前会先清 `amas_course_favorites:*` —— 第 6 节在详情页收过一门课，
收藏现在是真落盘的，不清就不是从「还没收藏」起步。

---

## #35 房间密码改了从不推给服务端，提示却说「已设置」 — `CLOSED`（2026-09-12）

```
status:    CLOSED
severity:  medium（诚实性：界面说的和服务端的实际状态不一致）
owner:     unassigned
phase:     产品完善（2026-09-12）
```

三处，都是源码里直接看得见的：

```
1  VoiceRoomOverlay.handleSavePassword 只改本地 room 对象就弹「房间密码已设置」，
   中间**从来没有调过 registerRoom**。进房校验查的是服务端那份记录
   （/api/rooms/validate），那份记录压根没被更新过。
   services/roomService.ts 顶上的注释写的是「创建房间时调用，房间设置里改密码时
   再调一次」—— 第二次一直没兑现。
2  CommunityView.handleCreateRoom 里是 `result ? '房间创建成功！' : '房间创建成功！'`，
   三元的两个分支字面完全一样：登记失败也照样说创建成功。
3  CreateRoomModal 留着 password / isPrivate 两个 state，但**没有任何控件去设**，
   `setIsPrivate` 全仓没有调用点，提交时永远是 onCreate(name, type, undefined)。
```

改法：改密码与建房都按三种情形分开说 —— 没配 `VITE_API_BASE_URL` 时本地模式
是设计本身、不报错（`roomService` 明写 best-effort）；登记成功照常说成功；
登记失败如实说「没能同步到服务器（服务端仍是原来的设置）」。

### 为什么删掉死开关而不是补上「私密房间」

产品依据就在仓里：`docs/VOICE_ROOMS_INVENTORY.md` §3.4 —— 进房校验在
`not-registered / network` 时会**回落到客户端明文比对**，密码存在 localStorage，
所以这个能力**不能对外宣称「私密房间」**。补开关等于把一个保证不了的能力
摆到台面上。真要做，得先处理掉那条回落，那是产品决定，不是顺手改 UI。
房主建完房仍可在房间设置里设密码。措辞上也只说「同步上没上去」，
不说「私密已开启」。

### 回归与边界

`verify-course-flow` 67 → 74，新增 7 条，**明确标注为源码级断言**：

```
改密码调了 registerRoom · 同步失败如实说 · 没配后端不谎报失败
建房各分支不再说同一句话 · 登记失败说清是「没能同步到服务器」
不再留 isPrivate 死状态 · 注明了不宣称私密房间的依据
```

拦得住的是「入口或诚实措辞又被改掉」这类回归。**拦不住真实后端往返** ——
`/api/rooms` 的写入与校验、以及房间里的实际使用，都仍未验证，
需要可用后端与真机。这三段各管各的，不把任何一段说成另一段。

---

## #36 聊天「+」里发出去的消息看不见，开语音房还选不了主题 — `CLOSED`（2026-09-12）

```
status:    CLOSED
severity:  medium（用户可见：以为消息没发出去；一半的房间主题点不到）
owner:     unassigned
phase:     产品完善（2026-09-12）
```

一个流程里三处，都实测复现过：

```
1  发出去的消息是空气泡
   Message 的 type 声明了 13 种，渲染分支只接了 4 种
   （text / audio / image / course）。「分享经文」发 type:'verse'，
   「语音房间」发 type:'room-invite' —— 两种都落进没人接的分支，
   气泡里一个字都没有，只剩下面那行时间戳。
2  开语音房选不了主题
   selectedRoomType 声明了却没有任何控件去改（setSelectedRoomType
   全仓零调用点），恒为 'fellowship'；THEME_CONFIGS 只是 import 了没用过。
   从聊天里开的房永远只能是交通室，而校友圈那条路五种主题都能选。
   房间的 icon / color / desc 还是写死的 emerald + Radio +「新房间」。
3  「+」菜单八个入口都没有可访问名称
   按钮里只有一个图标，名字在旁边那个 span 上，读屏八个都念「按钮」。
```

改法见提交 `06a3837`。只补**本仓里真的会被发出来**的那两种气泡；
其余七种（video / location / file / prayer / question / assignment / notice）
没有任何入口会产生，不凭空发明语义。主题选择器复用同一份 `THEME_CONFIGS`。

**措辞边界**：这一版会话是本地 mock，`sendMessage` 改的是本地 state、
没有任何传输，消息只存在自己这边。所以邀请卡片只说「已开启」，
**不说「已邀请对方」**，并有一条断言专门钉住这点。

### 回归

新增 `scripts/verify-chat-composer.mjs` 25/25，已接入 `verify:ui-flows`
与 CI 的独立 `ui-flows` job。未验证：真实房间里的使用（要麦克风与传输通道）、
任何多人投递。邀请卡片只断言在 DOM 里且内容对，不断言此刻肉眼可见 ——
刚开房就被房间覆盖层盖住是正常的。

---

## #37 聊天「+」里三个入口点开是空白面板 — `CLOSED`（2026-09-12）

```
status:    CLOSED（产品口径已定：入口保留，但不得再打开空白卡片）
severity:  medium（用户可见：点了之后是一张空白卡片，只有关闭键）
owner:     unassigned
phase:     发现并修复于 2026-09-12（#36 同一流程）
```

「+」菜单有八个入口，面板体只渲染了三种：

```
有面板   推荐课程（course）· 分享经文（scripture）· 语音房间（room）
无面板   学术提问（question）· 递交作业（assignment）· 发布代祷（prayer）
         → setActivePicker 照样把弹层打开，里面什么都没有，只剩右上角的叉
相册 / 文件  走的是另外的附件路径，不在这个 activePicker 分支里
```

`Message` 的 type 里已经声明了 `question` / `assignment` / `prayer`，
但没有任何面板去产生它们，也没有渲染分支去显示它们。

### 产品口径与落地（提交 `7264cb0`）

口径：**入口保留，但不能再打开空白卡片；能对上现成流程的接现成流程，
对不上的把暂不可用的原因说清楚并给返回；一律不许伪造。**

逐项查了现有可复用的真实路径，两项对得上，一项确实没有：

```
学术提问  → 接现成流程：图书馆的 AI 牧者
   LibraryView 调 generateTheologicalResponse，带超时与失败处理；
   未配 GEMINI_API_KEY 时它自己就会明说「AI 功能暂不可用」。
   所以不在聊天里再搭一套问答，只把人带过去（新增 onOpenLibrary prop）。
发布代祷  → 接现成流程：祷告室的代祷墙
   后端真有：/api/rooms/:roomId/prayer/shares；前端在 PrayerRoomPanel，
   连「需要连接服务器后才能发布代祷」这句诚实提示都已经写好了。
   它是**房间范围**的，所以先进一间祷告室 —— 走「语音房间」同一条流程，
   只把主题预定成祷告室，**不新建第二套代祷数据**。
递交作业  → 没有现成流程，如实说明
   backend/src/routes 里**没有任何作业提交端点**
   （cooperation_submissions 是事工合作表单，不是作业）；
   前端除这个菜单标签外全仓没有作业的任何实现，也没有批改回执。
   所以既不接也不假装提交，面板明说「不是暂时的网络问题」
   「点一下不会有任何东西被交出去」，并指一条真的可用的路
   （用「文件」把材料发到会话里并说明是哪门课哪次作业）。
```

**没有伪造任何东西**：不假装已提交作业、不假装已发布代祷、不在聊天里编造
AI 回答、没有新建第二套业务数据、没有假传输。原有正常入口
（相册 / 推荐课程 / 分享经文 / 语音房间 / 文件）一个没动。

顺带的普通 UI 修复：菜单按钮名称直接带上实际可用范围
（「递交作业（暂不可用）」等），读屏在菜单上就知道会发生什么；
附件面板补 `role="dialog"` 与 Esc 关闭（此前只能点叉或点背景，键盘没出口）；
关闭键补可访问名称与 44px 热区。

### 回归

`verify-chat-composer` 25 → 50，新增一节 25 条：三项在菜单上就标明可用范围、
三项都不再是空白卡片、各自的诚实措辞逐条钉住、三项各自按 Esc 都能关掉，
以及最要紧的一条 —— **三项点完会话里没有多出任何消息（不误发）**。
联动 `verify-course-flow` 74/74、`verify-modal-layering` 60/60（这轮动了 App.tsx）。

仍未验证：祷告室里实际发布代祷、图书馆 AI 的真实回答，都需要可用后端；
真实语音房还需要麦克风与传输通道。面板只承诺把人带到那两个地方，
**不对那边的结果做任何承诺**。

---

## #38 校友圈分享功能完全不可达，接上后还说了三句不实的话 — `CLOSED`（2026-09-12）

```
status:    CLOSED
severity:  medium-high（用户可见：功能没有入口；接上后曾谎称已发送给对方）
owner:     unassigned
phase:     产品完善（2026-09-12）
```

三处，都实测复现过：

```
1  整个分享功能不可达
   SharePostModal 是完整实现的（复制、系统分享、放入会话），但全仓
   没有任何地方打开它：Share2 只出现在 import 行里从没被渲染；
   onShareClick 传给了个人主页那个列表、解构出来后一次都没调用过。
2  「复制链接」复制的不是链接
   写进剪贴板的是 `看这个帖子: <前20字>...`，而本应用没有指向单条帖子
   的 URL（SPA 无单帖路由）。writeText 是会 reject 的 Promise，
   原来连 catch 都没有，失败照样弹「链接已复制」。
3  「分享到会话」什么都没做
   只弹一句「已发送给 N 个会话」，打开那个会话里面什么都没有。
```

改法见提交 `fb95319`：接上入口用的是已有的 `setPostToShare` / `onShareClick`，
投递复用 `amas_chat_messages`（ChatView 挂载时读的、语音房分享写的同一份），
消息类型用 `text` 而不是渲染分支不认识的类型（那会变成空气泡，正是 #36 的毛病），
写入后读回逐字节核对。

### 这条线必须守住：写进 localStorage ≠ 送达对方

这一版的会话**没有任何传输层**。写本地只意味着「你自己再打开那个会话时看得到」。
所以措辞一律照实说：

```
提示   「已放入 N 个会话（仅本机，未发送给对方）」，不说「已发送 / 已送达」
按钮   「发送」改叫「放入会话」
说明   面板写明「只会保存在这台设备的会话记录里，不会发送给对方」，
       并用 aria-describedby 关联给读屏
连带   语音房那条「分享给会话」写的是同一个存储、说的是同一句谎话，
       一并改成同样的措辞
```

回归里有一条专门钉这个：**提示里不得出现「已发送 / 已送达 / 对方已收到」**。

### 回归

`verify-chat-composer` 50 → 64，新增一节 14 条，全部 fixture / 本机，
不连后端、不碰真实数据。联动 `verify-custom-groups` 27/27、
`verify-modal-layering` 60/60、`verify-touch-targets` 100/100。

**未验证 / 不承诺**：任何真实多人投递。这次改的全部是本机会话记录。

### 遗留观察（未做，未承诺）

`amas_chat_messages` 现在有三个写入方（ChatView 自己、语音房分享、校友圈分享），
彼此没有合并策略：ChatView 挂载时整份读、变更时整份写。目前各条路径之间
都隔着一次视图卸载，实测没有互相覆盖；但这不是设计出来的保证。
真要多端/多写入方并存，需要一个带合并的存储层 —— 那是另一件事，没有顺手做。
