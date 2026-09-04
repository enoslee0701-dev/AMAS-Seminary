# Changelog

**项目级规则与架构变化日志，不是 git log。**

只记录**会影响未来 Agent 理解项目**的变化：架构决定、规则确立、
方案否决、单一实现的抽取、边界的划定。

不记录：改了 margin 8px、换了一个 icon、调了颜色。

**Append-only。** 新条目加在最上面。结论被推翻时标 `SUPERSEDED`
并注明日期 / commit / 原因，保留原文。

---

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
