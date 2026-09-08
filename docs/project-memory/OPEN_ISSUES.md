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

## #19 App Staging 缺外部前提

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

## #22 `rateLimit.ts` 的自定义 keyGenerator 未做 IPv6 归一

```
status:    OPEN
severity:  P2 SECURITY HARDENING（Supervisor 定级，2026-09-07）
gate:      BLOCKS PUBLIC STAGING EXPOSURE
owner:     unassigned
phase:     公开 staging smoke 之前修复
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


---

## #23 `verify-rooms-render.mjs` 的 presence 提示断言在 CI 上间歇失败

```
status:    OPEN
severity:  medium（使 Release gate 偶发红灯，会掩盖真实回归）
owner:     unassigned
phase:     STAGING-1A 续 发现
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
