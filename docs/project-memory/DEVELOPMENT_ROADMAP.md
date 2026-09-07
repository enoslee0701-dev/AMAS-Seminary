> ### RB-01 数据库迁移阶段计划（DB-1 定版，2026-09-07）
>
> 每一阶段可独立验收与回退。**禁止 32 张表一次搬完再一起测。**
>
> ```
> DB-2   只读事实采集（schema 基线快照 + 五项扫描），零写入
> DB-3   0023_app_core.sql：身份扩展 + app_user_profile_ext + migration.* 工具表
> DB-4   身份迁移：crosswalk 填充 + 人工复核（DBR-17 强制）
> DB-5   角色迁移：ADMIN_ROLE_MIGRATION_MANIFEST 逐人裁定
> DB-6   课程合并：course_catalog EXTEND（67 条已 1:1 对齐）
> DB-7   Christian Profile 迁移 + 三层 Gate（双哈希 / 20 regression / 3 snapshot）
> DB-8   学习数据   DB-9 房间与祷告   DB-10 社群   DB-11 附属
> DB-12  DAL 切换（repository 接口层 + async 改造 + 事务契约）
> DB-13  双写/影子验证 + 切流
> ```
>
> **SQLite 直到 DB-13 验收通过前不删除。**
> 契约全文见 `amas-website/docs/operations/DB-1-TARGET-SCHEMA-AND-MIGRATION-CONTRACT.md`。

---

> ## ⚠ 阶段已切换（2026-09-07）
>
> 项目从「功能开发阶段」进入
> **RELEASE READINESS → STAGING → PRODUCTION VERIFICATION**。
>
> **暂停新增产品功能。** 下方路线图中未完成的功能项一律推迟，
> 优先级让位于上线就绪度工作。
>
> 当前最高允许状态：`TESTED LOCALLY`。
> 阻塞清单见 `amas-website/docs/operations/ARCHITECTURE-PREMERGE-REVIEW.md` §13。
> 正式决策见 [DECISION_LOG.md](DECISION_LOG.md)。

# Development Roadmap

状态标签只用这六个：`DONE` · `IN_PROGRESS` · `NEXT` · `TODO` · `BLOCKED` · `DEPRECATED`

不用「finished / ready / almost / probably done / 80%」这类词。
代码完成但未生产验收的，写 **`DONE — Code-stage acceptance`**。

---

## 总览

| 阶段 | 名称 | 状态 | Commit |
|---|---|---|---|
| P0 | 拆除四房假象 | `DONE — Code-stage acceptance` | `d8abbd6` `9609d22` |
| P1-1 | 真实 Membership + Presence | `DONE — Code-stage acceptance` | `5d2df0f` |
| P1-2 | 读经室共享阅读位置 | `DONE — Code-stage acceptance` | `d0d6030` |
| **P1-3** | **交通室分享墙** | **`NEXT`** | — |
| P2 | 赞美室音频 | `TODO` | — |
| Phase 4B | 实时语音 | `BLOCKED` | — |
| **AUTH-M7** | **Runtime Identity Resolution**（Strategy B 集成分支内） | **`DONE — LOCAL VERIFIED`** | `integration/auth-strategy-b`，**未合 main** |

已完成的更早阶段（祷告室）见 [ACCEPTANCE_HISTORY.md](ACCEPTANCE_HISTORY.md)
与 `docs/PRAYER_*` 系列报告。

---

## P0 — 拆除四房假象 · `DONE`

**Commit** `d8abbd6`（假播放 / 举手 / 文案）、`9609d22`（死代码）

**目标** 在接真之前，先把用户看得见的假象拆掉。

**范围**
- 赞美室「正在播放」音乐条（无任何音频代码）
- 举手上麦脚本（等 1 秒自己提自己为 speaker）
- 四处不兑现的说明文案
- 读经室里整块不可达的旧祷告墙死代码

**不做什么** 不加新功能。拆完房间会显得空 —— 那才是真实状态。

**验收条件** `verify-rooms-render.mjs` 断言假象不复活。

---

## P1-1 — 真实 Membership + Presence · `DONE — Code-stage acceptance`

**Commit** `5d2df0f`

**目标** 四个公共房间接上后端真实在线状态。

**范围**
- 抽取 `backend/src/rooms/presence.ts` 为唯一实现，prayer.ts 改为复用
- 新增 `GET/POST heartbeat/DELETE /api/rooms/:id/presence`
- 前端 `useRoomPresence` + `RoomMembers` 共享
- 移除头像上的麦克风角标

**不做什么** 不开发语音；不重新加入假 participant / speaker / playing。

**依赖** 无。

**验收条件**
```
三用户 × 四房 · 跨房隔离 · moderator 回归 · 空房单人 · mock 开启回归
```

**实测** presence E2E 54/54 · rooms render 41/41（mock 开启同样 41/41）

---

## P1-2 — 读经室共享阅读位置 · `DONE — Code-stage acceptance`

**Commit** `d0d6030`

**目标** 让 `bible_reading` 真正可以多人共读，而不是视觉假同步。

**范围**
- 新表 `room_reading_state`（只存位置，不存正文）
- `GET/PUT /api/rooms/:id/reading-position`
- `bibleCanon.ts` 从 `cuv.json` 派生校验数据
- 本地阅读位置与房间位置严格分离；moderator 显式发布
- 跟随 / 暂停跟随 / 回到房间进度
- revision 乐观并发

**不做什么** 不做实时语音、聊天、批注、多人光标、共享滚动位置、
个人阅读历史、AI 解经；不引入 WebSocket 栈。

**依赖** `public/scripture/cuv.json` 必须可达（缺失时写入返回 503，fail closed）。

**验收条件** §17 Case 1–12 全覆盖 + presence 不被污染。

**实测** reading position E2E 44/44 · rooms render 51/51

---

## P1-3 — 交通室分享墙 · `NEXT`

**目标** 让 `fellowship_room` 有真实内容。目前它**只有一个背景色**，
说明文案已如实改为「这间房目前还没有专属功能」。

**范围（建议，未最终确定）**
- 复用祷告室已有的分享机制：`prayer_shares` + `prayer_intercessions`
  （含匿名、举报、隐藏、软删除整条治理链）
- 表名带 `prayer` 前缀但结构是 room-generic，按 room_id 分区

**不做什么**
- 不新建平行的分享表
- 不重新发明匿名 / 举报 / 治理逻辑
- 不做实时语音、不做聊天室

**依赖** 需先确认：是复用 `prayer_shares` 还是把表名泛化
（泛化会动到已上线的真实数据，风险更高）—— **待用户决定**。

**验收条件（预期）**
```
真实 JWT + 真实 DB 的多用户读写
匿名对房间成员成立（房主/moderator 也拿不到作者）
删除 / 隐藏 治理链有效
跨房隔离
失败隔离：分享墙挂掉不影响房间其余部分
render guard 断言无假数据
```

---

## P2 — 赞美室音频 · `TODO`

**目标** 让赞美室真的能播诗歌。

**当前状态** 完全没有音频能力。P0 已拆掉假播放条，现在只显示一份
「推荐诗歌」清单（无播放按钮、无时长、无播放状态）。

**依赖（阻塞项）**
```
诗歌版权授权     ← 产品/法务决策，不是技术任务
音频托管方案
```

**不做什么** 在拿到授权之前，**不得**恢复任何播放状态显示。

---

## Phase 4B — 实时语音 · `BLOCKED`

**阻塞原因** 缺真实设备（两台手机）+ LiveKit 凭据。无法完成真人互听验证。

**已完成的准备** token 端点硬化、语音踢出、错误码分类、诊断面板、
生产 mock 硬护栏、真机验收清单
（[PRAYER_VOICE_DEVICE_ACCEPTANCE.md](../PRAYER_VOICE_DEVICE_ACCEPTANCE.md)）。

**解除条件（顺序不可颠倒，第一项约 2 分钟）**
```
1. 手机 A 加入语音 → 开麦 → 说「测试一二三」
2. 手机 B 真实人耳听见
3. 手机 B 开麦 → 说「收到」
4. 手机 A 真实人耳听见

以上 PASS 后才依次测：
mute → cleanup（麦克风指示灯熄灭）→ Wi-Fi/4G 切换 → 断网恢复
→ 后台恢复 → eviction → 多设备 identity
```

**明确不做** 麦序、举手、主持人静音等 Phase 4.5 功能。
**有设备之后只执行验收，不继续开发。**

---

## 独立轨道（不在 P 序列内）

| 项 | 状态 | 说明 |
|---|---|---|
| Supabase Auth 统一身份 | `IN_PROGRESS`（独立分支） | 本地分支 `auth/supabase-unification`，未合入 main，未推远端。等独立验收后再谈合并 |
| 内置房间 moderator 授予 | `TODO — 等你拍板` | 机制齐备，五房均 0 moderator。见 [PUBLIC_ROOM_LAUNCH_CHECKLIST.md](../PUBLIC_ROOM_LAUNCH_CHECKLIST.md) |
| git 历史瘦身 | `TODO — 需人工执行` | `scripts/purge-large-history.sh`，涉及 force-push，AI 权限门禁不允许自动执行 |

---

## AUTH-M7 — Runtime Identity Resolution · `DONE — LOCAL VERIFIED`

**分支** `integration/auth-strategy-b`（从 main 建，**未合入 main**）

**目标** 让「Supabase 登录成功」不再等于「拥有 AMAS 业务身份」。

**范围**
- `backend/src/auth/identity.ts`：Supabase UUID → `legacy_user_map` → canonical SQLite user
- principal 携带双身份（`authId` 认证 / `user.id` 业务），`requireAdmin` 改用 `authId`
- `legacy_user_map` DDL 收归 `backend/src/db.ts`；迁移脚本只写数据
- 401（认证失败）与 403 `IDENTITY_NOT_PROVISIONED`（无 AMAS 身份）分离
- backend 测试入口分层：`test:local`（零外部前提）/ `test:external`（需 staging 凭据）

**不做什么**
- **不自动 provision**（产品决策已定，fail closed）
- 不补 16 张表缺失的外键（P2 独立 hardening）
- 不合入 main、不 push、不部署

**依赖** Strategy B 的前置：`revert d3e860d` 恢复 Auth 世系后再 merge。

**验收条件** 双身份分离 · mapping_status 白名单 · 资料信任边界 · ghost 写入全拒 · 401/403 可区分

**实测** `auth-m7-identity` 19/19 · backend local 135/135 · 前端 181/181 ·
前后端 tsc clean · build PASS · 回归 presence 54 / reading 44 / render 51 / phase5 24 / moderator 26

