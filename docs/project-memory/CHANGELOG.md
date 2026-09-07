# Changelog

**项目级规则与架构变化日志，不是 git log。**

只记录**会影响未来 Agent 理解项目**的变化：架构决定、规则确立、
方案否决、单一实现的抽取、边界的划定。

不记录：改了 margin 8px、换了一个 icon、调了颜色。

**Append-only。** 新条目加在最上面。结论被推翻时标 `SUPERSEDED`
并注明日期 / commit / 原因，保留原文。

---

## 2026-09-07（POST-LEGACY CANONICAL INTEGRATION）

- **确立：rebase 之后必须做语义保全审计，`CONFLICT = 0` 不构成证据。**
  本项目已两次证明 git 不报冲突却静默丢语义（`d3e860d` 世系陷阱、
  AUTH 资产被无冲突删除）。本轮 rebase 后逐项核对 17 项能力（main 侧 8 +
  release 侧 9）是否同时存在，而不是只看 rebase 退出码。
- **确立：ACTIVE TASK OWNER 必须真的登记。** 此前 `AI_HANDOFF_RULES` 的表长期
  停在「（无）/ IDLE」，而 DB-3 早已被另一条会话做完 —— 「实际 ACTIVE、文档 IDLE」
  正是 D-16 要防的状态。本轮登记 POST-LEGACY RELEASE RECONCILIATION 为当前 owner，
  并写明与 DB-3 世系正交；交还写权时改回 IDLE。
- **CI 正式承担 release gate。** 新增 `regression` job 执行
  `npm run verify:local-release`（backend test:local + 双 typecheck + 前端单测 +
  build + 五套 App 回归）。**禁止** `|| true` / `continue-on-error` / 吞 exit code。
  external（真实 Supabase / SMTP / LiveKit / 真机）不进本地绿色判据 ——
  runner 不持有那些前提，混进来只会制造另一种假信号。
- **口径固定：MIGRATION PROCESS: LOCAL VERIFIED ≠ PRODUCTION USERS MIGRATED。**
  迁移流程已端到端跑通（dry-run → apply → 幂等 → 迁移后真的能登录），
  但不存在权威 production 用户人口，真实 cutover 从未执行。
- **迁移退出码债（#18）分级明确**：`LOCAL release gate unaffected` /
  `STAGING automation blocked`。通用 migration 执行器的退出码只能由
  migration correctness 决定，dataset-specific 断言必须拆到独立的验收层。

## 2026-09-07（POST-LEGACY RELEASE BLOCKER CLOSURE）

- **确立：删关键 API 必须同时修回归套件，且回归套件必须挂在会红的入口上。**
  AUTH-M7 删掉 `POST /api/auth/register` 时，五个 App 回归脚本仍靠它造用户，
  于是启动即崩、199 项断言一条未执行——而它们不在 `npm test` 里，CI 全绿。
  新增 `npm run test:regression`（五套聚合）与 `npm run verify:local-release`
  （本地 Release Gate 聚合：前端单测 + 后端 test:local + 前后端 typecheck +
  build + regression）。**以后同类事故会让 Gate 变红。**
- **确立：SINGLE TEST AUTH HARNESS。** Supabase 测试身份基础设施只有
  `backend/src/test/helpers/supabaseHarness.ts` 一份。**禁止**再写第二套
  fake Supabase server / token signer / JWKS helper。为支撑迁移验收，
  admin API（`/auth/v1/admin/users` 列举与建号）也并入这同一份，
  而不是另起炉灶。回归脚本改用 tsx 运行以复用该 TS harness。
- **确立：回归用户必须按 post-legacy 真实模型 provision。**
  fake Supabase identity → canonical `users` 行 → `legacy_user_map`
  → mapped/provisioned → 真实可验签 token → 调 App API。
  **不得**出现 test-only production bypass、fake requireAuth 捷径、
  信任请求头 user id、legacy JWT。
- **确立口径：MIGRATION PROCESS: LOCAL VERIFIED ≠ PRODUCTION USERS MIGRATED。**
  迁移流程已在一次性 fixture 上端到端跑通（dry-run → apply → 幂等 → 迁移后
  真的能登录并读写业务层），但不存在权威 production 用户人口，
  真实 cutover 从未执行。删除 legacy auth 之后，没有映射的既有用户会被
  **永久锁死**且 App 侧不自动 provision —— 这是既定的 fail-closed 产品决策。
- **`requireAdmin` 中不可达的 legacy 授权分支删除。**
  它按 `principal.user.role === 'admin'` 判权。legacy user auth 删除后已不可达，
  但形状危险：一旦将来新增任何 authSource，SQLite `users.role` 会**静默重新
  成为授权来源**，与 R-2「Supabase user_roles 是授权唯一 SoT」直接冲突。
  改为显式 fail closed。

## 2026-09-07（AUTH-M7 / Strategy B，只在 integration 分支）

- **确立：Supabase 注册 ≠ AMAS 学生身份。** 运行时必须把 Supabase UUID 经
  `legacy_user_map` 解析成 canonical SQLite user，解析不出一律 403
  `IDENTITY_NOT_PROVISIONED`，**不得自动 provision**。
  理由：AMAS 身份只能来自申请 → 审核/录取的正式业务流程；自动建号等于让
  任何能在 Supabase 注册的人取得学员身份。
- **确立：principal 必须同时携带认证身份与业务身份。**
  `authId`（Supabase UUID）用于 `fetchActiveRoles`，`user.id`（canonical SQLite id）
  用于业务数据。**否决**「把 user.id 改写成 canonical id」的单 id 方案 ——
  那会让角色现查查不到任何行，所有管理员静默掉权（D-1）。
- **确立：401 与 403 语义分离。** 认证失败 401；认证有效但无 AMAS 身份
  403 + `IDENTITY_NOT_PROVISIONED`。拒绝原因只进服务端日志，不下发客户端
  （否则等于泄漏某个 Supabase 账号是否已登记）。
- **确立：db.ts 是 schema owner，迁移脚本只写数据。**
  `legacy_user_map` 此前只由 `identity-migration-apply.mjs` 建表，导致没跑过迁移的库
  运行时 500。DDL 收归 `db.ts`，脚本改为防御性断言、缺表即退出，**不偷偷补建**。
- **确立：merge 前必须做静默删除审计。** `d3e860d`（revert）落在 merge-base
  `d5f2f8a` 之后，直接 merge `auth/supabase-unification` 会**无冲突地**删掉
  `backend/src/auth/supabase.ts`、`services/supabaseAuth.ts`、`@supabase/supabase-js`
  依赖，并把 config / middleware / authService 静默退回 main 版本。
  冲突数量不反映真实损失。解法：先 `revert d3e860d` 再 merge（Strategy B）。
- **backend 测试入口分层。** `npm test` 曾经只跑 smoke 一个文件，于是
  「六个 AUTH 测试文件存在但从不运行」长期看不出来。现在
  `test:local`（零外部前提，CI 必须全绿）/ `test:external`（缺 staging 凭据时
  SKIP，**不得**被 CI 判红）。
- 判别联合在仓库根 tsconfig（未开 strict）下无法收窄 —— `IdentityResolution`
  沿用 P1-2 `validateLocation` 的既有解法：单一形状 + 可选字段。

## 2026-09-04（补）

- **补齐四份缺失的记忆文档。** 首版八份偏重语音房间（那是最近几个阶段的工作），
  新 AI 读完会误判项目范围。补上：
  `PRODUCT_OVERVIEW`（项目全貌 + Christian Profile 九条铁律 + 两仓库 discover.html 同步）·
  `ENVIRONMENT_AND_TOOLING`（9 个已踩过的坑 + 怎么跑 + 验证脚本套路）·
  `DATA_MODEL`（30 张表 + authoritative source 对照表）·
  `WORKING_AGREEMENTS`（用户的证据标准与协作方式）。
- 阅读顺序改为 11 份，并给出「5 分钟最短路径」与「动手前再补两份」。

## 2026-09-04

- **建立 `docs/project-memory/` 作为开发接力 Source of Truth。**
  确立优先级：用户最新决定 > 代码真实状态 > CURRENT_STATE > ARCHITECTURE_RULES
  > 验收记录 > 旧聊天。**旧聊天不能覆盖新规则；文档不能覆盖代码事实。**
- 确立状态标签词表：`DONE / IN_PROGRESS / NEXT / TODO / BLOCKED / DEPRECATED`；
  代码完成但未生产验收一律写 `DONE — Code-stage acceptance`。
- 确立「每阶段完成必须同步更新五个记忆文件」为强制项，写入 AI_HANDOFF_RULES。
- 仓库边界：与项目无关的旧资料移出 git 跟踪（旧 AI 对话记录 32 MB、
  无引用散图、一次性报告）。**文件保留在本地磁盘，不删除。**
- remote 由 SSH 改为 HTTPS —— 本机无 SSH 密钥，这是长期推不上去的真正原因。
- 远端只保留 `main` 一个分支；旧分支 `backup/vite-2026-04` 删除前
  已在本地建 `archive/vite-2026-04` 存档（它有 42 个 main 里没有的提交）。

## 2026-09-03

- **P1-2：共享阅读位置确立为独立 domain。**
  `room_reading_state` 表只存位置不存正文；经文正文由各客户端自己的阅读器加载。
  理由：避免内容漂移、数据重复、版权处理复杂化、多译本状态混乱。
- **canonical 圣经标识确定为「中文书名」。**
  `cuv.json` 的键、`BIBLE_STRUCTURE`、`loadScripture(book, chapter)` 本来就是
  同一套标识。**否决引入数字 book id** —— 会造出第三套需要人工维护的映射。
- **圣经校验数据从 `public/scripture/cuv.json` 派生**，否决在后端手抄
  `{创世记:50,...}`。数据集缺失时 fail closed（写入 503），不放行任意输入。
- 共享阅读沿用祷告会的乐观并发方案（`revision` + `expectedRevision` +
  条件 UPDATE + 409），**不另造一套锁**。
- 否决为一个阅读位置引入 WebSocket / Realtime 栈；3s 轮询足够。
- `following`（跟随与否）确定为**纯客户端个人状态**，不上报服务器、不进 presence。
- 守卫顺序规则：`requireReadingRoom` 必须在 `requireRoomMember` 之后、
  `requireRoomManager` 之前 —— 否则「这个房间没有该功能」会被
  「你不是 manager」的 403 盖掉。

- **P1-1：Presence 抽取为单一实现 `backend/src/rooms/presence.ts`。**
  此前只写在 `routes/prayer.ts` 里；祷告室改为复用同一份。
  理由：四房接真时若各复制一份，TTL / 显示名清洗 / role 判定会慢慢漂移。
- **Membership 与 Presence 生命周期正式分离。**
  组件卸载只 `clearPresence`（保留 membership）；只有用户显式退出才 `leave`。
  切后台、断网、收起房间都不该丢授权。
- **移除房间 UI 上的 speaker / mic 假状态。**
  实时语音未接入时 `isSpeaking` 恒为 false，那个角标只能永远显示「静音」——
  一个没有依据的恒定状态标记。
- 五个公共 roomId 确认 **1:1，无 alias**（前端 CommunityView 与后端 PUBLIC_ROOMS）。
- 在线人数定义：`onlineCount = presence.length`；主键 `(room_id, user_id)`
  保证同账号多设备只算一人。
- 心跳限流确认为**按用户** 10 次/分钟（非按 IP）。客户端每房 3 次/分钟，3 倍余量。

- **P0：确立「没有真实数据，就不做看起来很真实的 UI」为项目第一原则。**
  据此拆除：赞美室假播放条（项目内无任何音频代码）、举手上麦脚本
  （等 1 秒自己把自己提成 speaker 再弹「主持人邀请您上麦」）、
  四处不兑现的说明文案、写死的「N 人在听」与恒亮「语音中」。
- 推论确立：**未知不是零。** `formatDuration(null)` 返回 `null`，
  UI 写「时长未记录」，不写 0 分钟。
- 新增 render guard（`scripts/verify-rooms-render.mjs`）：
  类型检查证明不了 JSX 还能渲染 —— 曾发生过 tsc 与 build 全绿而覆盖层白屏。

- **`POST /api/auth/_promote` 移除。** 它由 APP_SECRET 把关，可把任意账号
  **永久**提升为 admin。持有 APP_SECRET 者本来就被当作 machine-admin，
  该端点没给新能力；问题在于它把一次性机器凭据变成了挂在真人账号上的
  持久管理员权限 —— 轮换密钥后依然有效，界面上也看不出来。
- **auth 的 fail-closed 修复确立为不可回退项。**
  原实现在「无 Authorization 头**且**未配置 APP_SECRET」时放行为 service
  principal。这条修复与任何身份供应商无关，**不得因为回退某次认证改造而恢复旧逻辑**。
- 未经独立验收的 Supabase Auth 代码从 main 移出（surgical partial revert，
  不改写历史、不 force push）。

- **内置公共房间治理模型确立。** 五房 `host_id = 'system'`，
  **永远不把真实用户改成 host**；所有权与治理权分开，治理权只以
  `room_members.role='moderator'` 存在，grant/revoke 对称且不动 `rooms.host_id`。
- 启动诊断 `SYSTEM_ROOM_HAS_NO_MODERATOR`：只写服务端日志，
  不进任何 HTTP 响应，不让服务启动失败，**绝不自动指派任何人**。
- **勘误**：曾记录「内置房间没有 manager，谁也创建不了祷告会」——
  该结论**错误**，漏看了 `requireRoomManager = 真人 host 或本房 moderator`。
  机制从 SEC-3 起就存在，缺的只是还没授权。

- **生产构建禁用 mock 的硬护栏。** 移除通用逃生口 `VOICE_GUARD_ALLOW_MOCK`
  （那种开关迟早会被配进 CI 让流水线变绿）。演示改走独立的
  `npm run build:voice-demo`：输出 `dist-voice-demo/`、页面常驻不可关闭的
  DEMO 标识、写入 `DO_NOT_DEPLOY` 标记。放行走**命令行参数**而非环境变量 ——
  环境变量能被悄悄注入，argv 不能。

- **Phase 5：祷告会历史沉淀。** 确立「计划过 ≠ 进行过」：
  「今日共同祷告了什么」由事件日志重建实际带领序列，不是直接列计划清单。
  确立「历史不是绕过治理的后门」：`deleted_at` / `hidden_at` 非空的内容
  不出现在任何历史视图 —— 连房主看也没有。
- **否决**给 `prayer_shares` 加 `session_id` 列：只对新数据有效，
  回填历史等于编造归属；且没必要 —— 同房同刻只有一个 active session，
  时间窗是精确事实而非推测。
- **拒绝展示无数据支撑的指标。** 没有参与人数、没有累计人次、没有排行 ——
  不是显示成 0，是后端连字段都不返回。`room_presence` 在 leave 与超时清扫时
  都是 DELETE，只存当下不存历史。

---

<!--
追加模板：

## YYYY-MM-DD

- **变化标题。** 一句话说清楚变了什么。
  理由：为什么这么定 —— 这一行最重要，未来的人靠它判断能不能改。
-->
