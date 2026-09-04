# Data Model

后端是 **Express + better-sqlite3**（WAL 模式，`foreign_keys = ON`）。
schema 全部集中在 `backend/src/db.ts` 一个 `db.exec()` 块里 +
末尾若干 `hasColumn()` 守卫的 `ALTER TABLE` 迁移。

**迁移必须可重复执行**：所有建表用 `CREATE TABLE IF NOT EXISTS`，
加列前先 `hasColumn()` 判断。不要写一次性迁移脚本。

---

## Authoritative source 对照表

**这张表是判断「某个状态该信谁」的依据。**

| 状态 | Authoritative source | 唯一实现 |
|---|---|---|
| 用户身份 | JWT（服务端签发/校验） | `backend/src/auth/` |
| 房间成员资格 | `room_members` | `backend/src/middleware/roomAuth.ts` |
| 谁在线 | `room_presence` | `backend/src/rooms/presence.ts` |
| 房间共同阅读位置 | `room_reading_state` | `backend/src/routes/roomReading.ts` |
| 祷告会共享状态 | `prayer_sessions` | `backend/src/routes/prayerSession.ts` |
| 经文正文 | `public/scripture/cuv.json` | `services/scriptureService.ts` |
| 经文位置合法性 | 同上（派生索引） | `backend/src/rooms/bibleCanon.ts` |
| 音频连接状态 | —— | **尚未实现**（Phase 4B BLOCKED） |

**判据**：backend 重启后状态还在吗？不在就说明它不是 authoritative source。

---

## 全部表（30 张）

### 身份与授权

```
users              id · email · password_hash · salt · name · role · avatar · created_at
refresh_jti        refresh token 黑名单
```

`users.role` 是 `student | admin`。**平台 admin ≠ 房间 moderator**，两者互不蕴含。

### 房间

```
rooms              room_id(PK) · host_id · password_hash · salt · created_at
room_members       (room_id, user_id) · role: member | moderator
room_presence      (room_id, user_id) · name · avatar · role · last_seen_at
room_realtime_events  自增 id 作 cursor · room_id · event_type · entity_id · entity_revision
room_reading_state room_id(PK) · book · chapter · verse · revision · updated_by · updated_at
```

- 五个内置房间 `host_id = 'system'`（不是真实用户）→ 不产生 `room_members` 行，
  任何真人都不是 host。治理权只能靠 moderator。
- **`room_members.role` 里没有 `host`。** host 的真相源只有 `rooms.host_id`。
- `room_presence` 在 leave 与超时清扫时都是 `DELETE` —— **只存当下，不存历史**。
  这就是「祷告会参与人数」做不出来的根本原因。
- `room_reading_state` 每房至多一行；**没有行是合法状态**（尚未设置共同位置），
  接口返回 `null`，不伪造默认章节。

### 祷告室

```
room_prayer_topics    本次祷告主题（房主/manager 可写）
prayer_shares         id · room_id · user_id · text · is_anonymous
                      · created_at · deleted_at · hidden_at · hidden_by · hidden_reason
                      · client_request_id（幂等）
prayer_intercessions  (share_id, user_id) —— 「我为你祷告」，不是点赞
prayer_share_reports  (share_id, reporter_user_id) UNIQUE · reason · status
prayer_sessions       id · room_id · status(scheduled|active|ended) · title
                      · created_by · facilitator_user_id · started_at · ended_at
                      · current_item_id · revision · created_at · updated_at
prayer_session_items  id · session_id · position · title · description
                      · scripture_ref · scripture_text
prayer_session_events id · session_id · actor_user_id
                      · event_type(created|started|item_changed|facilitator_changed|ended)
                      · from_item_id · to_item_id · created_at
```

**关键索引 / 约束**

```sql
-- 同房同刻只能有一个进行中的祷告会（数据库层保证，不靠先 SELECT 再 INSERT）
CREATE UNIQUE INDEX uniq_active_session_per_room
  ON prayer_sessions(room_id) WHERE status = 'active';

-- 幂等：同 room + 同 user + 同 clientRequestId 只能有一条
CREATE UNIQUE INDEX uniq_share_idem
  ON prayer_shares(room_id, user_id, client_request_id) WHERE client_request_id IS NOT NULL;
```

> `uniq_active_session_per_room` 是 P1-2 里「用时间窗归属代祷事项」能成立的前提：
> 因为同一时刻只有一个 active session，所以
> `created_at BETWEEN started_at AND ended_at` 是**精确事实**而非推测。

**`prayer_session_events` 是「实际发生了什么」的唯一依据**：
`started` 给第一项，`item_changed` 给每次切换，`ended` 给收尾时刻。
「今日共同祷告了什么」由它重建，**不是直接列 items** —— 计划过 ≠ 进行过。

**表名带 `prayer` 前缀，但结构是 room-generic**（按 `room_id` 分区）。
P1-3 交通室分享墙可以直接复用，**不要新建平行的分享表**。

### 其它业务

```
posts · post_likes · post_comments        校友圈动态
announcements                             公告
courses · course_progress · course_files  课程
friend_requests · friendships             好友
library_books · library_favorites         图书馆
cooperation_submissions                   同工申请
image_uploads                             图片
recordings                                讲道录音（元数据；二进制在磁盘 recordings/）
growth_state · pt_state                   成长档案 / 口袋神学，按用户存 JSON
push_tokens                               (user_id, token) · platform
```

---

## 并发模型

统一用**乐观并发**，不要另造锁：

```
GET   → revision = N
PUT   → 带 expectedRevision = N
        UPDATE ... SET revision = revision + 1 WHERE id = ? AND revision = ?
        changes === 0  → 409 冲突，并把最新状态一并返回供客户端刷新
```

已经这么做的：`prayer_sessions`（`SESSION_STATE_CONFLICT`）、
`room_reading_state`（`READING_STATE_CONFLICT`）。

---

## 隐私与治理

**匿名 = 对房间成员匿名。**
`is_anonymous` 为真时 `userId` 对**所有人**返回 `null` —— 包括 moderator 与房主。
数据库仍保留 `user_id` 用于鉴权、滥用治理、删除与严重滥用调查。

定义为「**对房间成员匿名，对系统不匿名**」。禁止写「完全匿名」「无法追踪」。

**软删除与隐藏是两条独立路径**：

```
deleted_at   作者对自己内容的权利
hidden_at    moderator 的治理手段（不物理删除，正文保留供治理与申诉）
```

Moderator **不应通过 delete 冒充作者删除内容**。

**历史视图不是绕过治理的后门**：`deleted_at` 或 `hidden_at` 非空的内容
不出现在任何历史纪要里 —— 连房主看也没有。

---

## 显示名安全

`room_presence.name` / `avatar` **只从 `users` 表读**，
不接受请求体里的任何身份字段，再经
`backend/src/middleware/textSafety.ts` 的 `sanitizeDisplayName()`
剥离 bidi 控制符与零宽字符（防止伪装成管理员/牧师）。
阿拉伯文、希伯来文等正常 RTL 名字不受影响。

---

## 限流

`backend/src/middleware/rateLimit.ts`，全部**按用户**（`byUser`），不是按 IP：

```
prayerWriteLimiter        20 次/分钟
prayerHeartbeatLimiter    10 次/分钟
roomMembershipLimiter     20 次/分钟
sessionCommandLimiter     30 次/分钟
```

`NODE_ENV=test` 时上限提到 10000。
**限流状态不得污染权限判断** —— 这是 SEC-3 立的规矩。
