# DB-13A · 剩余 SQLite DAL 清点与下一批切换计划

> ## ✅ 本文提出的 DB-13B 切换包已于 2026-09-10 实施完成
>
> COMMUNITY + LEARNING + PUSH + PRAYER（整域）已切到 Postgres。
> 实施后复测：**import `db.ts` 的运行时消费者 15 → 5，被写入的 SQLite 表 18 → 2**
> （只剩 `users` 与 `room_realtime_events`，正是本文归入 C/D 两类的那两张）。
>
> 一处与本文预期不同、需要产品决定的结果：**课程目录的 admin 写路径已停用**
> （501），因为 `course_catalog` 的 `availability` / `sort_order` 是 NOT NULL
> 而 App 侧没有对应输入 —— 见 **D-43**。本文下方「courses 表本身不切」那段
> 提前点到了这个风险，实施时确认它确实是硬缺口。
>
> 本文其余内容保留为**当时的清点记录**，不再作为当前状态引用；
> 当前状态见 `docs/project-memory/CURRENT_STATE.md`。


> **基线**：App `9e374f5`（DB-12 已 CLOSED）。
> 本文的每个数字都是**当轮实测**：SQLite 侧读 canonical `backend/data/amas.sqlite`（只读），
> Postgres 侧对 live `amas-staging` 做只读 `GET ... Prefer: count=exact`。不引用旧报告。
>
> 扫描方式：机械匹配 `import { db } from '.../db.js'` 的文件，去注释后提取
> `FROM` / `JOIN` / `INSERT INTO` / `UPDATE ... SET` / `DELETE FROM` 的表名。
> **第一遍扫描漏了 5 个文件**（`posts.ts` / `friends.ts` / `images.ts` /
> `recordings.ts` / `auth/jwt.ts`）—— 它们根本不 import `db.js`。
> 补查后才发现下面那条最重要的结论。

---

## ⬤ 最重要的一条：四个域根本不在 SQLite，而在进程内存

`posts` / `friends` / `recordings` / `images` 的数据存在 **`new Map<>()`** 里：

| 路由 | 存储 | 后果 |
|---|---|---|
| `routes/posts.ts:41` | `const posts = new Map<string, PostRecord>()` | 重启即全丢 |
| `routes/friends.ts:27-28` | `requests` / `friendships` 两个 Map | 重启即全丢 |
| `routes/recordings.ts:20` | `const recordings = new Map<...>()` | 元数据重启即丢（文件仍在磁盘） |
| `routes/images.ts:19` | `const images = new Map<...>()` | 同上 |

因此 `db.ts` 里的 `posts` / `post_likes` / `post_comments` / `friend_requests` /
`friendships` / `image_uploads` / `recordings` 七张表是**没有任何消费者的死 schema**，
`refresh_jti`（111 行）也**没有写入方**（#RB-27 已记录）。

这改变了切换计划的性质：这些域的「切到 Postgres」**不是数据迁移，而是第一次获得持久化**。
没有历史数据会因此消失 —— 因为它现在就不存在。

---

## 消费者清点

```
import db.ts 的运行时消费者     15
  其中有写入                    11
  其中只读                       4
被写入的 SQLite 表             18
被读取的 SQLite 表             19
额外的内存存储路由（不碰 SQLite） 4
```

### 逐文件

| 文件 | 读 SQLite | 写 SQLite | 身份 |
|---|---|---|---|
| `auth/users.ts` | users | users | 无身份列（它就是身份表） |
| `auth/identity.ts` | legacy_user_map | — | Supabase UUID |
| `auth/jwt.ts` | refresh_jti（**已无写入方**） | — | — |
| `routes/announcements.ts` | announcements | announcements | 无（admin 写） |
| `routes/courses.ts` | courses · course_progress | courses · course_progress | legacy id |
| `routes/growth.ts` | growth_state | growth_state | legacy id |
| `routes/pt.ts` | pt_state | pt_state | legacy id |
| `routes/library.ts` | library_books · library_favorites | 同 | legacy id |
| `routes/prayer.ts` | prayer_shares · prayer_intercessions · prayer_share_reports · room_prayer_topics · users | 前四张 | legacy id + UUID（房间授权已用 UUID） |
| `routes/prayerSession.ts` | prayer_sessions · prayer_session_items · users | prayer_sessions · items · events | legacy id |
| `routes/prayerHistory.ts` | prayer_sessions · items · events · prayer_shares · prayer_intercessions · users | —（只读） | legacy id |
| `routes/roomReading.ts` | room_reading_state · users | room_reading_state | legacy id |
| `routes/push.ts` | push_tokens | push_tokens | legacy id |
| `routes/voice.ts` | users | —（只读） | legacy id |
| `realtime/roomEvents.ts` | room_realtime_events | room_realtime_events | 无身份列 |
| `scripts/room-moderator.ts` | users · legacy_user_map | —（只读） | 经映射换 UUID |

---

## 表级对照（SQLite 实测 vs live staging 实测）

| SQLite 表 | 行数 | Postgres 对应表 | live 行数 | 切过去会变空吗 |
|---|---:|---|---:|---|
| users | **7** | `profiles` | **1** | 是 —— 身份域，非 DAL 任务 |
| legacy_user_map | 0 | （App 内部映射，无对应） | — | — |
| refresh_jti | 111 | （无对应） | — | 无消费者，死数据 |
| announcements | 0 | `app_announcements` | 0 | 否 |
| courses | 67 | `course_catalog` | **67** | 否（DB-6 已迁，数量一致） |
| course_progress | 0 | `app_course_progress` | 0 | 否 |
| growth_state | 0 | `app_christian_profile` | 0 | 否（**列不同，见下**） |
| pt_state | 0 | `app_practice_training_state` | 0 | 否 |
| library_books | 0 | `app_library_books` | 0 | 否 |
| library_favorites | 0 | `app_library_favorites` | 0 | 否 |
| prayer_shares | **12** | `app_prayer_shares` | 0 | 会变空，但**空即正确终态**（见下）|
| prayer_intercessions | **1** | `app_prayer_intercessions` | 0 | 同上 |
| room_prayer_topics | **2** | `app_room_prayer_topics` | 0 | 同上 |
| prayer_share_reports | 0 | `app_prayer_share_reports` | 0 | 否 |
| prayer_sessions | 0 | `app_prayer_sessions` | 0 | 否 |
| prayer_session_items | 0 | `app_prayer_session_items` | 0 | 否 |
| prayer_session_events | 0 | `app_prayer_session_events` | 0 | 否 |
| room_reading_state | 0 | `app_room_reading_state` | 0 | 否 |
| room_realtime_events | **6** | `app_room_realtime_events` | 0 | 否（临时事件日志） |
| push_tokens | 0 | `app_push_tokens` | 0 | 否 |
| posts / post_* / friend_* / friendships / image_uploads / recordings | 0（**无消费者**） | `app_posts` · `app_post_likes` · `app_post_comments` · `app_friend_requests` · `app_friendships` · `app_image_uploads` · `app_recordings` | 全 0 | 否（数据在内存） |

**形状差异（需处理，不是阻塞）**：`app_christian_profile` 比 SQLite `growth_state`
多两列 `source_raw_hash` / `canonical_semantic_hash`，且 `state` 是 `jsonb` 而非 TEXT。
`app_practice_training_state` 与 `pt_state` 三列一一对应。

**live staging 共有 28 张 `app_*` 表**，本清点覆盖其中 26 张（另 2 张
`app_cooperation_submissions` / `app_course_files` 已在 DB-12 切完）。

---

## 分类结论

### A. 可以直接切（需要同一处身份适配，无数据风险）

```
COMMUNITY   posts · friends · recordings · images · announcements
LEARNING    courses(catalog 只读) · course_progress · growth_state · pt_state
            library_books · library_favorites
OTHER       push_tokens
PRAYER      整域 —— sessions · items · events · room_reading_state
            share_reports · prayer_shares · prayer_intercessions
            · room_prayer_topics（后三张见下方「空即正确终态」）
```

共同点：Postgres 目标表全部存在；用户域表**两侧都是 0 行**；
唯一需要的改动是把身份从 `principal.user.id` 换成 `activeUserUuid(req)`（D-42），
与 DB-12 对 rooms 做的**完全同一个改动**。

### B. 需要先做身份适配 —— 上面 A 类**全部**属于这一类

所有 `app_*` 的 uuid 身份列都外键到 `profiles.id`（#24 / D-42，共 33 条）。
现有消费者一律传 legacy SQLite id，值域不同，直接写必然违反外键。
这不是阻塞，是 A 类必须一起完成的前提。

### C. 必须先做 DB-4 业务数据迁移才能切

```
users                  7 行   ← 身份域（D-34/D-35：6 个测试装置 + 1 个待核实真人）
```

**只剩这一张。** 七行 crosswalk 全部未解决，是真正开放的身份问题。

> #### ⚠️ 本文初版在这里判错了，已更正
>
> 初版把 `prayer_shares`(12) · `prayer_intercessions`(1) · `room_prayer_topics`(2)
> 也列为 NEEDS DB-4，理由是「切到空表会丢数据」。**结论的后半句对，前半句错。**
>
> 这 15 行不是在等身份裁定，而是 STAGING-1A11 已**永久裁定 SKIP**，
> 依据是 fixture 溯源。live `migration.row_manifest`：
>
> ```
> prayer_shares         SKIPPED  TEST_FIXTURE_DERIVED          10
> prayer_shares         SKIPPED  ORPHAN_MISSING_ROOM_PARENT     2
> prayer_intercessions  SKIPPED  TEST_FIXTURE_DERIVED           1
> room_prayer_topics    SKIPPED  TEST_FIXTURE_DERIVED           2
> ```
>
> **本地独立核对（读 canonical SQLite，只读）与之逐项吻合**：
>
> ```
> 10 行  归属 sec2_* 装置用户（房主甲 1cb28215… / 成员乙 dc4c6c4d…）
>        位于 sec2_r1 / sec2_r2 装置房间
>  2 行  room_id = 字面量 'no_such_room_9x'，其 user_id 根本不在 users 表内
>  1 行  intercession 归属成员乙        2 行 topic 由房主甲创建
> ```
>
> 关键一条：`est***@gmail.com`（D-35 的 POTENTIAL_REAL_USER）在这三张表里
> **一行都不占**。所以没有任何真实用户内容会因此消失。
>
> 13 行因源自 6 个 D-34 装置而被排除 —— **DB-4 的身份裁定怎么变都不会改变这个理由**。
> 另 2 行是孤儿分享，父房间在源库里就不存在，而
> `app_prayer_shares.room_id` 是 NOT NULL 外键到 `app_rooms` —— 任何身份决定都修不好它。
>
> **对切换的实际影响**：这三张 Postgres 表是**按裁定为空**，不是**尚欠 15 行未迁**。
> 祷告域的 DAL 切换应把「空」当作这份数据集的正确终态，
> 而不是当作一笔待还的迁移债。

### D. 应继续暂留 SQLite

```
room_realtime_events   实时 SSE 扇出日志。改成 PostgREST 逐事件往返会给实时路径
                       增加网络延迟 —— 那是性能回退，不是迁移。正确方向是换传输
                       （Supabase Realtime），不是换 DAL。6 行是临时数据。
refresh_jti            已无写入方（#RB-27）。既不切也不删（删表属破坏性迁移）。
rooms / room_members / room_presence
                       DB-12 §12 保留作回滚参考，运行时 0 写入。不动。
```

---

## 一个初版误判、现已澄清的点

`routes/prayerHistory.ts` **同时读** `prayer_sessions`(0) 与
`prayer_shares` / `prayer_intercessions`(13)。初版据此担心它会横跨两个存储。

~~按文件边界切，它会变成一个跨两个存储的读取端。~~
**这个顾虑随上面的更正一起消失了**：既然 shares / intercessions 也属于
可切的 A 类，`prayerHistory.ts` 读的六张表可以在同一批里一起切走，
不存在跨库聚合。它应当**与 `prayer.ts` / `prayerSession.ts` 同批**完成，
否则才会真的出现一个读取端横跨两个存储。

---

## 下一批切换建议（Internal Fast Track，一个包）

```
DB-13B  COMMUNITY + LEARNING + PUSH + PRAYER（整域）
```

一个包而不是十几个小阶段，理由：它们共享**同一处改动**（身份换 UUID），
共享同一个前置条件（目标表两侧 0 行），且互相之间没有数据依赖。

顺序建议（同一个包内的实施次序）：

1. **COMMUNITY**（posts / friends / recordings / images / announcements）
   —— 收益最大：把「重启即丢」变成持久化，且不可能丢数据（现在就没有）。
2. **LEARNING**（course_progress / growth_state / pt_state / library_*）
   —— 全 0/0；`growth_state → app_christian_profile` 要处理多出来的两列。
3. **PUSH**（push_tokens）—— 0/0，最小。
4. **PRAYER 整域**（prayer.ts / prayerSession.ts / prayerHistory.ts / roomReading.ts）
   —— sessions / items / events / room_reading_state / share_reports 两侧 0/0；
   shares / intercessions / topics 的 15 行按 1A11 裁定为 SKIP，**空即终态**。
   四个文件必须同批，否则 `prayerHistory.ts` 会横跨两个存储。

**明确不在本包内**：`users`（身份域，NEEDS DB-4）· `room_realtime_events`
（实时扇出日志，应换传输而非换 DAL）· `refresh_jti`（无消费者）·
`rooms`/`room_members`/`room_presence`（§12 回滚参考）。

`courses` 表本身（67 行）**不切**：`course_catalog` 已是权威副本且数量一致，
但 `courses.ts` 目前仍有 admin 写入路径（`INSERT INTO courses` / `UPDATE courses`），
切之前要先确认「课程目录的写权威在哪一侧」—— 那是产品决定，不是 DAL 决定。
