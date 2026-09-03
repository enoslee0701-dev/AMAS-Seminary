# AUTH-M6 · 身份迁移 dry-run 报告

> 本报告由 `backend/scripts/identity-migration-dryrun.mjs` 自动生成，**只读、不做任何写入**。
> 生成时间：2026-09-03 08:16:54
> 数据库：`C:/Users/enosl/Desktop/amas---asian-missionary-theological-seminary/backend/data/amas.sqlite`
> Supabase：可达（https://sdrwyebizfdwldlfjyim.supabase.co）

## 0. 结论

**BLOCKED —— 不得执行 ID 替换。** 待解决事项：

- 存在 2 个 orphan 用户引用，须先确认其归属（不得静默删除）
- 1 个真实账号在 Supabase 尚无对应账号，须先建号并安排密码重置

---

## 1. Legacy account inventory

共 7 个 legacy 账号（其中已登记测试账号 6 个）。

| legacy UUID | normalized email | 是否测试账号 | Supabase 账号 | 目标 Supabase UUID | mapping status |
|---|---|---|---|---|---|
| `6ea90950-d17f-457d-9d16-693a159592a2` | s1780377335744@amas.test | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `9492e7f2-7b60-48f7-88da-7f5bb428b779` | s1780377880150@amas.test | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `5b3896e6-4c53-46d8-8479-38a8d1bb07b5` | s1780377952749@amas.test | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `d470e79a-f155-44c5-aaaf-cc299fc04d4b` | estherzh0528@gmail.com | **否 → 按真实账号处理** | 无 | — | NEEDS_ACCOUNT(须先在 Supabase 建号并走密码重置) |
| `1cb28215-30f6-408d-a68e-ae1178ef0c46` | sec2_a_17884084639119eka@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `dc4c6c4d-1ebd-4021-9b81-d9f5e31f38d2` | sec2_b_1788408463981p4mn@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `1c028145-14de-494a-a08d-fdba2ff4c13d` | sec2_c_1788408464022tn2z@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |

> ★ 测试账号来自脚本内的**显式登记表**（`KNOWN_TEST_ACCOUNTS`）。
> 未登记的一律按真实账号处理——**不得通过"看起来像测试邮箱"猜测**（AUTH-M6 §7）。
> 新增测试账号必须同时更新该登记表，否则迁移工具会把它当真实账号并阻断。

---

## 2. Collision detection

未发现冲突。检测项：同邮箱多 legacy UUID / 多 legacy identity 指向同一 Supabase UUID / 一个 legacy UUID 可映射多个 Supabase UUID。

---

## 3. Table inventory

共 27 个用户关联列，分布在 23 张表；
其中声明了外键约束的列只有 **4 个** —— 其余列数据库不会替我们报错，**必须显式扫描**。

| 表 | 列 | 行数 | FK | ON UPDATE | ON DELETE | 去重用户数 | orphan | 迁移方式 |
|---|---|---:|---|---|---|---:|---:|---|
| course_files | uploader_id | 68 | — | — | — | 0 | 0 | UPDATE ... SET col = map(col) |
| course_progress | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| courses | created_by | 67 | — | — | — | 2 | 0 | UPDATE ... SET col = map(col) |
| friend_requests | from_user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| friend_requests | to_user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| friendships | user_a | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| friendships | user_b | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| growth_state | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| library_favorites | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| post_comments | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| post_likes | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| posts | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| prayer_intercessions | user_id | 1 | — | — | — | 1 | 0 | UPDATE ... SET col = map(col) |
| prayer_session_events | actor_user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| prayer_sessions | created_by | 0 | users.id | NO ACTION | CASCADE | 0 | 0 | 结构迁移（无数据） |
| prayer_sessions | facilitator_user_id | 0 | users.id | NO ACTION | SET NULL | 0 | 0 | 结构迁移（无数据） |
| prayer_share_reports | reporter_user_id | 0 | users.id | NO ACTION | CASCADE | 0 | 0 | 结构迁移（无数据） |
| prayer_shares | user_id | 12 | — | — | — | 4 | 2 | UPDATE ... SET col = map(col) |
| prayer_shares | hidden_by | 12 | — | — | — | 0 | 0 | UPDATE ... SET col = map(col) |
| pt_state | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| push_tokens | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| recordings | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| refresh_jti | user_id | 111 | — | — | — | 111 | 0 | 整表作废（legacy 会话产物） |
| room_members | user_id | 3 | users.id | NO ACTION | CASCADE | 2 | 0 | UPDATE ... SET col = map(col) |
| room_prayer_topics | created_by | 2 | — | — | — | 1 | 0 | UPDATE ... SET col = map(col) |
| room_presence | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| rooms | host_id | 7 | — | — | — | 3 | 0 | UPDATE ... SET col = map(col) |

---

## 4. Orphan scan

`orphan_before` = **2**（另有哨兵值 3 个、可丢弃会话产物 104 个，均不计入）

三类"不在 users 表内的值"被显式分开，避免把它们混成一个数字：

| 类别 | 数量 | 处置 |
|---|---:|---|
| **哨兵值**（`system` / `catalog-migration` / `seed` / `import`） | 3 | 本来就不是用户 ID。不迁移、不删除、不计入 orphan |
| **可丢弃会话产物**（refresh_jti） | 104 | legacy token 在迁移时整体作废，逐行确认归属没有意义 |
| **真正的 orphan** | 2 | 作者账号已不存在的真实数据，**须人工裁决，不得静默删除** |

**存在 orphan 用户引用，须先确认归属。涉及真实数据时不得静默删除。**

- `prayer_shares.user_id`：2 个，样例 `17907e6f-48b8-40db-8750-d1b8be64512f`, `728c6df5-88c2-490e-a5c9-a9257c33e259`

**验收口径**：迁移前后各跑一次本脚本，`orphan_after` **不得因迁移而新增**。

---

## 5. Atomicity 要求

- 同一 SQLite 文件内的 ID 替换必须在**单个事务**内完成
- 任何中途失败不得留下"一半 legacy ID、一半 Supabase ID"的状态
- 替换脚本必须支持 `--dry-run`（默认）与显式 `--apply`
- pre/post assertions：
  - pre：`SELECT COUNT(*) FROM <t> WHERE <col> IN (legacy ids)` 与本报告一致
  - post：同一查询必须为 0，且 `COUNT(*) WHERE <col> IN (supabase ids)` 等于 pre 值

---

## 6. Backup / rollback map

回滚依据是**显式映射表**，不是邮箱：

```sql
CREATE TABLE legacy_user_map (
  legacy_id   TEXT PRIMARY KEY,
  supabase_id TEXT NOT NULL,
  email       TEXT NOT NULL,
  is_test     INTEGER NOT NULL DEFAULT 0,
  migrated_at INTEGER NOT NULL,
  source      TEXT NOT NULL          -- 生成本次映射的报告文件名
);
```

- 迁移前先写入该表并**连同数据库文件一起备份**
- 回滚 = 对每张表执行反向 UPDATE（`supabase_id → legacy_id`），依据同一张表
- **映射表永不删除**，即使迁移成功

---

## 7. 真实账号保护

- 测试账号来源是脚本内的显式登记表，不是模式匹配
- 清理脚本只允许删除`is_test = 1`的账号
- 任何未登记账号被判定为真实账号，迁移工具遇到即阻断，要求人工确认

---

## 8. 复跑

```bash
AMAS_ENV=<path>/staging.env node backend/scripts/identity-migration-dryrun.mjs
```
