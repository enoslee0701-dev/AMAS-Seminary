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

## #14 /api/auth/me 不走 requireAuth

```
status:    OPEN
severity:  P3（fail closed，不是安全漏洞）
owner:     unassigned
phase:     AUTH-M7 之后
```

该端点自己 `verifyAccess(token)`，只认 legacy 自签 token。Supabase 用户访问会 401。
统一边界（requireAuth → identity resolution → 业务路由）上的一个洞。
建议下一轮并入 requireAuth。

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
