# Acceptance History

**Append-only。** 新验收追加在文件末尾，旧记录**不删除、不覆盖**。

结论后来被推翻时，在原条目上标 `SUPERSEDED` 并注明日期、commit、原因，
保留原文 —— 「当时我们是这么判断的」本身就是有价值的信息。

所有条目的 **Acceptance level** 目前都是 `Code-stage acceptance`：
代码测试通过 ≠ 生产正式验收完成。

---

## 2026-09-03 — P0 拆除四房假象

**Commit**：`d8abbd6`（假播放 / 举手 / 文案）、`9609d22`（死代码 + render guard）

**Result**：PASS **FAIL**：0

**Tests**
- rooms render guard 17/17（首版，真 backend + 真登录态）
- frontend 123/123 · backend 103/103 · 前后端 tsc clean · build PASS

**Major verified behavior**
- 赞美室不再显示「正在播放」与均衡器动画（项目内无任何音频播放代码）
- 举手不再自己把自己提成 speaker，改为如实说明实时语音未开放
- 读经室说明删掉「经文会自动同步给房间内所有参与者」（当时确为假话）
- 交通室三条空承诺改为如实说明
- `VoiceRoomOverlay.tsx` 中不可达的旧祷告墙整块移除（含 localStorage 持久化）
- 五间房逐间进入，覆盖层均非白屏，读经室经文/章节选择器/字号正常

**Known limitations**
- 拆完后四间房内容很空 —— 这是真实状态，不是缺陷
- 赞美室仍无音频能力

**Acceptance level**：Code-stage acceptance。

---

## 2026-09-03 — P1-1 真实 Membership + Presence

**Commit**：`5d2df0f`

**Result**：PASS **FAIL**：0

**Tests**
- frontend 123/123
- backend 103/103
- room presence E2E 54/54
- rooms render 41/41（`ROOMS_GUARD_TRANSPORT=mock` 下同样 41/41）
- prayer Phase 5 24/24
- system room moderator 26/26
- frontend tsc clean · backend tsc clean · build PASS

**Major verified behavior**
- 四房各自：A 进 → 1 人；B 进 → 两端都看到 2；C 进 → 三端都看到 3；B 退 → 2
- 显示名来自服务器 `users.name`，非请求体
- presence 响应搜不到 `speaking / speaker / muted / micOn / raisedHand`
- 同账号重复心跳仍算 1 人（主键 `(room_id, user_id)`）
- 跨房隔离：A 在 bible_reading、B 在 praise_room 互不出现
- 非成员 403 且不泄漏成员姓名；无 token 401
- moderator 被授权后**不会自动上线**，必须真实进房才算在线
- 空房 `onlineCount = 0`，单人如实显示 1 人（不补虚拟头像）
- 杀掉 backend：读经室不白屏、圣经可读、显示「成员状态暂时无法更新」

**Known limitations**
- presence TTL 45s，离线判定有延迟（已知 backlog，本阶段不重新设计）
- 读经室左侧舞台头像与「1 人在线」卡片会显示同一人，视觉重复（UI 问题，非数据错误）

**过程中的发现（非缺陷）**
E2E 首轮 1 个 FAIL，查明是心跳限流**按用户** 10 次/分钟，而脚本把数小时活动
压进几秒，同一用户第 11 次心跳被挡（429）。改为分散到不同用户，
**保留生产限流不放宽**。真实客户端每房 3 次/分钟，有 3 倍余量。

**Acceptance level**：Code-stage acceptance。

---

## 2026-09-03 — P1-2 读经室共享阅读位置

**Commit**：`d0d6030`

**Result**：PASS **FAIL**：0

**Tests**
- room reading position E2E 44/44（Case 1–12 全覆盖）
- rooms render guard 51/51（新增 8 项读经室断言）
- frontend 123/123 · backend 103/103
- 回归：presence 54/54 · prayer Phase 5 24/24 · system room moderator 26/26
- frontend tsc clean · backend tsc clean · build PASS

**Major verified behavior**
- 初始无共享位置 → `position: null`，UI 写「尚未设置共同阅读位置」，**不伪造成创世记 1:1**
- moderator 发布 约翰福音 3:16 → M/A/B 三端读到相同 canonical location
- 响应只含位置，不含经文正文
- 普通成员 PUT → 403 且数据库未变
- 非成员 GET/PUT → 403 且不泄漏当前读到哪里；无 JWT → 401
- 八种非法输入（`book=hahaha`、`chapter=9999/0/1.5/'1'`、`verse=-3/999`、
  `book=43`）全部 400，数据库未污染
- 本地浏览隔离：源码断言 `handleSelectScripture` 函数体内无任何发布调用
- 两个 moderator 并发：恰好一个 200、一个 409，revision 只 +1；过期 revision 再写仍 409
- **backend 重启后位置仍在**（证明不是内存状态）
- 四个非读经房 GET/PUT 均 404，不静默映射
- presence 响应不含任何阅读字段
- 杀掉 backend：不白屏、圣经可读、显示「房间阅读进度暂时无法同步」、不显示虚构位置

**过程中修正的两处**
1. PUT 在非读经房返回 403 而非 404 —— `requireRoomManager` 排在房间能力检查之前，
   把真正原因盖掉了。已把 `requireReadingRoom` 插到 member 之后、manager 之前。
2. 仓库根 tsconfig 未开 strict，判别联合无法收窄；`validateLocation` 改为
   「单一形状 + 可选字段」。

另有 2 个 FAIL 是验证脚本自身的粗糙正则误报（用「函数名后 1200 字符内出现
publish」匹配，把紧随其后的 `publishReading` 定义误判），已改为精确取函数体断言。

**Known limitations**
- 只同步 book+chapter+verse，不同步滚动位置、无多人光标
- 阅读器无按节定位入口（后端已支持并校验 verse）
- 3s 轮询，主持人切换后其他人最多 3 秒后看到
- 个人阅读进度不持久化

**Acceptance level**：Code-stage acceptance。

---

## 2026-09-04 — 仓库整理（非功能阶段）

**Commit**：`2ac94fa`（杂项移出跟踪）、`ecff6cc`（历史瘦身脚本）

**Result**：PASS **FAIL**：0

**内容**
- `migrated_prompt_history/`（32 MB 旧 AI 对话记录）、无引用散图、
  一次性报告移出 git 跟踪（**文件保留在本地磁盘**）
- `AUDIT_OTHER_TABS.md` 移入 `docs/`
- 跟踪文件数 315 → 302
- remote 由 SSH 改为 HTTPS（本机无 SSH 密钥，这是长期推不上去的原因）
- 69 个提交推送到 `origin/main`
- 远端旧分支 `backup/vite-2026-04` 删除（删前已在本地建 `archive/vite-2026-04`
  存档，它有 42 个 main 里没有的提交）

**未完成**
git 历史瘦身（31.3 MB 仍在历史里）需要 `git filter-branch` + force-push，
Claude Code 权限门禁不允许 AI 执行，已提供 `scripts/purge-large-history.sh`
供人工运行。`.git` 完整备份在 `.git-backup-before-history-rewrite/`。

**Acceptance level**：不适用（非功能变更）。

---

<!--
下一条追加模板：

## YYYY-MM-DD — 阶段名

**Commit**：

**Result**：PASS / FAIL   **FAIL**：N

**Tests**
- ...

**Major verified behavior**
- ...

**Known limitations**
- ...

**Acceptance level**：Code-stage acceptance / Production acceptance
-->
