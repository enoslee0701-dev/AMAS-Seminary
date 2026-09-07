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

## 2026-09-07 — AUTH-M7 Runtime Identity Resolution（Strategy B 集成分支）

**Commit**：`integration/auth-strategy-b`（`cf90eb7` revert → 合并 → AUTH-M7）
**未合入 main，未 push，未部署。**

**Result**：PASS **FAIL**：0

**Tests**（全部本轮实跑）
- auth-m7-identity 19/19（本地可重复，零外部前提）
- backend local 135/135（smoke + startup-guard + auth-m7）
- frontend 181/181（20 文件）
- 前端 tsc clean · 后端 tsc clean · build PASS
- 回归：presence 54/54 · reading 44/44 · rooms render 51/51 ·
  phase5 24/24 · system moderator 26/26
- test:external 6 项全部 SKIP（AMAS_ENV 未提供）→ NOT RUN — EXTERNAL PREREQUISITE

**Major verified behavior**
- principal 双身份：`authId`=Supabase UUID 用于角色现查，
  `user.id`=canonical SQLite id 用于业务数据；两者不混用
- D-1 回归：角色只挂在 canonical SQLite id 上时必须 403
  （证明 fetchActiveRoles 用的不是 user.id）
- mapping_status 白名单：mapped / provisioned 放行；needs_provision /
  provision_failed / skipped_test_account / 未知状态 / 无映射 /
  supabase_user_id 为 NULL / canonical 用户已删 —— 全部 403
- 资料信任边界：token 里的 `Fake Admin Name` 与 attacker avatar 不进业务数据；
  发帖落库的是服务器 canonical user 的 name/avatar
- token 自称 `app_metadata.role = admin` 不产生任何管理员权限
- ghost 身份对 6 个写端点全部 403，且 posts / growth_state / pt_state /
  course_progress / library_favorites / push_tokens 六张表零残留
- ghost 加入房间在 auth 层 403，不再靠 room_members 外键报 500
- 401（缺 token / 伪造签名 / 过期 / issuer 不符）与 403（无 AMAS 身份）可区分

**Known limitations**
- 修复只存在于集成分支；main 未合入
- 16/19 张用户表仍无外键（P2，OPEN_ISSUES #13）
- `/api/auth/me` 仍不走 requireAuth（P3，OPEN_ISSUES #14）
- AUTH-M2/M5/M6/M6.5A/M6.5B 的外部验收仍需 staging 凭据，本轮 NOT RUN

**Acceptance level**：LOCAL VERIFIED（本地可重复）。
**不是** Code-stage acceptance 的上位词，也**不是** Production acceptance ——
真实 Supabase 项目、真实 JWKS、真实 user_roles 表均未参与。

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


---

## 2026-09-07 — AUTH Canonicalization（D-14 裁定后的唯一权威世系）

**Canonical branch**：`integration/auth-strategy-b` → consolidation → `main`
**Commit**：`8b820d6`（基于 `78985e5`）

**Result**：PASS（本地） **FAIL**：0

### 测试分项计数（SKIP 不并入 PASS）

```
前端                PASS 181   FAIL 0   SKIP 0     (20 files)
后端 test:local     PASS 142   FAIL 0   SKIP 0
后端 test:external  PASS   0   FAIL 0   SKIP 6     ← BLOCKED_BY_ENV
typecheck           前端 clean · 后端 clean
build               exit 0
Christian Profile   20/20，3 个 golden snapshot 未变（算法无漂移）
startup guard       13/13
auth adapter guard  7/7（新增）
```

### 重要更正

- 历史 AUTH 验收数字（23/23 · 8/8 · 17/17 · 135/135）在当前环境
  **NOT REPRODUCIBLE**，相关状态降级为 `IMPLEMENTED / ENVIRONMENT-UNVERIFIED`。
  原条目不删除，此处标注更正。
- `78985e5` 标题所称 AUTH-M7 实为 **Runtime Identity Resolution**；
  按 D-15 定义的 AUTH-M7（删除 legacy user authentication）**尚未完成**。

### 本轮发现

一次 **merge completeness / test coverage blind spot**：测试文件回来了、
被测实现没回来，而 CI 全绿。详见 OPEN_ISSUES #RB-24。已加回归护栏。

**Acceptance level**：`CANONICALIZED / LOCALLY VERIFIED`。
未在真实环境验证，不得写成 INTEGRATION / STAGING / PRODUCTION VERIFIED。

---

## 2026-09-07 — AUTH-M7：legacy user authentication 删除

**Branch**：`main`（canonical）
**Result**：PASS（本地） **FAIL**：0

### 测试分项（SKIP 不并入 PASS）

```
前端                PASS 181   FAIL 0   SKIP 0    (20 files)
后端 test:local     PASS 138   FAIL 0   SKIP 0
后端 test:external  PASS   0   FAIL 0   SKIP 6    ← BLOCKED_BY_ENV
typecheck           前端 clean · 后端 clean
build               exit 0
Christian Profile   20/20，3 个 golden snapshot 未变
```

### 测试增减（全部可解释，无一被删以换绿灯）

```
删除 7 项：对 /api/auth/{register,login,refresh} 的直接测试
          —— 它们测的是已经不存在的 active production behavior
新增 3 项：legacy HS256 token 被拒 401 · 5 个已移除端点均 404 · 畸形 bearer 401
后端 103 -> 96 -> 99（smoke）；test:local 总计 135 -> 138
```

### 关键改动

```
routes/auth.ts        316 行 -> 86 行，只剩 GET/PATCH /api/auth/me，改用 requireAuth
middleware/auth.ts    legacy 验签分支删除，无凭据一律 401，绝不回退
config.ts             acceptLegacy / AUTH_ACCEPT_LEGACY 删除
auth/jwt.ts           190 行 -> 41 行，仅剩 AccessPayload 类型
services/authService  前端 legacy 分支删除，未配置 Supabase 时抛 503 并说明
```

### 测试装置变更

新增 `backend/src/test/helpers/supabaseHarness.ts`：本地假 Supabase
（真 ES256 密钥对 + 真 JWKS 端点 + 真验签 + user_roles REST）。
**不是 mock** —— 后端跑 100% 生产代码路径，只有 issuer 地址指向本地。

过程中发现一处真实陷阱：SQLite `users.role` 用 `'admin'`，
而 Supabase `user_roles` 的管理角色词表是
`{registrar, academic_admin, super_admin}`（与 Portal `is_admin_any` 对齐）。
直接把 `'admin'` 写进 user_roles 不会被 `isAdminRole` 认可，会**静默 403**。
装置已做显式转换并注释说明。

**Acceptance level**：`AUTH-M7 IMPLEMENTED / LOCALLY VERIFIED`。
真实 Supabase 环境未验证 —— 6 个 external AUTH 测试仍 BLOCKED_BY_ENV。
**不得**写成 INTEGRATION / STAGING / PRODUCTION VERIFIED。

---

## 2026-09-07 — RB-01 DB-1：目标 schema 与迁移契约定版

**Result**：`DB-1 COMPLETE / READY FOR DB-2 REVIEW`
**性质**：设计与契约，**零实施** —— 未改 DAL、未切 driver、未迁数据、未建 production Supabase、未删 SQLite。

四项决策 D-18～D-21 全部落实。32 张 SQLite 表**全部**得到明确结果，无 TBD：
`MERGE 2 · EXTEND 1 · CREATE NEW 25 · TRANSFORM 3 · DO NOT MIGRATE 3`。

### 本轮量化结论

```
课程目录   App OFFICIAL_CATALOG 67 条  vs  Portal course_catalog 67 条
           交集 67，两侧差集均为 0 —— 已完全对齐，禁止新建 app_courses
身份关联键 profiles.id 本身就是 auth.users.id（PK=FK, ON DELETE CASCADE）
           不存在 profiles.user_id；现有 schema 正确，不改
FK 生命周期 CASCADE 11 张 · SET NULL + tombstone 11 张 · 不迁移 2 张
           （按业务意义逐张裁定，未机械全 CASCADE）
事务契约   5 处逐个定版；#3 已有乐观并发（revision + 409），
           #2 是唯一需补幂等键的（当前重试会产生两条祷告会）
```

### 本轮发现

**DBR-17**：既有 `identity-migration-apply.mjs` 的 `mapped` 分支
**仅凭邮箱相同就静默判定为同一个人**，正是契约明令禁止的 email-only silent matching。
迁移期强制转 `NEEDS_MANUAL_REVIEW`。

**系统哨兵解决**：`rooms.host_id='system'` 改为
`host_type enum + host_user_id nullable + CHECK` —— 5 个内置房间合法存在，
真人 host 必有有效 canonical identity，非法 orphan host 数据库层写不进去。
**不建假 auth.users、不塞字符串进 uuid FK、不为过 migration 禁 FK。**

**Migration ownership**：`amas-website/supabase/migrations` 继续作为唯一 SoT，
App repo 不建第二套竞争的 Supabase migrations。

**Acceptance level**：设计定版，无实施。不适用 PASS/FAIL 测试口径。
