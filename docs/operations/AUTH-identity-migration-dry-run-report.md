# AUTH-M6 · 身份迁移 dry-run 报告

> 本报告由 `backend/scripts/identity-migration-dryrun.mjs` 自动生成，**只读、不做任何写入**。
> 生成时间：2026-09-03 08:36:18
> 数据库：`C:/Users/enosl/Desktop/amas-auth-worktree/backend/data/amas-auth-migration.sqlite`
> Supabase：可达（https://sdrwyebizfdwldlfjyim.supabase.co）

## 0. 结论

**READY** —— 未发现阻断项。仍须人工复核本报告后方可执行迁移。

---

## 0.1 守恒式结果

| 项 | 数量 |
|---|---:|
| Legacy accounts | 11 |
| Explicit test accounts | 10 |
| Real accounts | 1 |
| Provisioned Supabase identities | 1 |
| Mapped user-linked rows | 263 |
| Disposable session rows | 80 |
| Explicit disposable fixtures | 2 |
| Historical tombstone rows | 0 |
| Sentinel/non-user rows | 3 |
| Unresolved orphan | 0 |
| Ambiguous mappings | 0 |
| Lost rows | 0 |
| Unexpected privilege grants | 0 |

> `Explicit disposable fixtures` 与 `Historical tombstone rows` 是**两件不同的事**：
> 前者是本来就不该进入正式数据集的测试产物（按 `identity-migration-test-artifacts.json`
> 的确定性 id 识别，正式迁移时删除）；后者才是真实历史主体消失后按 R-10 保留的内容。

---

## 1. Legacy account inventory

共 11 个 legacy 账号（其中已登记测试账号 10 个）。

| legacy UUID | normalized email | 是否测试账号 | Supabase 账号 | 目标 Supabase UUID | mapping status |
|---|---|---|---|---|---|
| `6ea90950-d17f-457d-9d16-693a159592a2` | s1780377335744@amas.test | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `9492e7f2-7b60-48f7-88da-7f5bb428b779` | s1780377880150@amas.test | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `5b3896e6-4c53-46d8-8479-38a8d1bb07b5` | s1780377952749@amas.test | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `d470e79a-f155-44c5-aaaf-cc299fc04d4b` | estherzh0528@gmail.com | **否 → 按真实账号处理** | 已存在 | `c50ea5c3-04d0-45e8-827f-b3d00fdf27fa` | MAP(已有 Supabase 账号) |
| `1cb28215-30f6-408d-a68e-ae1178ef0c46` | sec2_a_17884084639119eka@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `dc4c6c4d-1ebd-4021-9b81-d9f5e31f38d2` | sec2_b_1788408463981p4mn@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `1c028145-14de-494a-a08d-fdba2ff4c13d` | sec2_c_1788408464022tn2z@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `48863e03-af5b-4be7-83fe-aa3e131aabbb` | p4_17884156045797ehq@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `35b63b3f-6ca6-4485-8f32-892443cd0960` | p4_17884156046633kfc@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `61ec0b6f-639a-42e5-a534-9033558c1a29` | p4_1788415604708tgcj@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |
| `80fb4dbd-6b73-4722-93a0-ec353f9418f6` | p4_1788415604752nk32@amas.local | 是（已登记） | 无 | — | SKIP(已登记测试账号，不迁移、只留映射) |

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
| prayer_shares | user_id | 12 | — | — | — | 2 | 0 | UPDATE ... SET col = map(col) |
| prayer_shares | hidden_by | 12 | — | — | — | 0 | 0 | UPDATE ... SET col = map(col) |
| pt_state | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| push_tokens | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| recordings | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| refresh_jti | user_id | 91 | — | — | — | 91 | 0 | 整表作废（legacy 会话产物） |
| room_members | user_id | 3 | users.id | NO ACTION | CASCADE | 2 | 0 | UPDATE ... SET col = map(col) |
| room_prayer_topics | created_by | 2 | — | — | — | 1 | 0 | UPDATE ... SET col = map(col) |
| room_presence | user_id | 0 | — | — | — | 0 | 0 | 结构迁移（无数据） |
| rooms | host_id | 7 | — | — | — | 3 | 0 | UPDATE ... SET col = map(col) |

---

## 4. Orphan scan

`orphan_before` = **0**（另有哨兵值 3 个、可丢弃会话产物 80 个，均不计入）

三类"不在 users 表内的值"被显式分开，避免把它们混成一个数字：

| 类别 | 数量 | 处置 |
|---|---:|---|
| **哨兵值**（`system` / `catalog-migration` / `seed` / `import`） | 3 | 本来就不是用户 ID。不迁移、不删除、不计入 orphan |
| **可丢弃会话产物**（refresh_jti） | 80 | legacy token 在迁移时整体作废，逐行确认归属没有意义 |
| **已解决 orphan（tombstone）** | 4 | 作者已按 D-AUTH-1 置为 `deleted_account`，内容保留、无人拥有。**不再计为 blocker** |
| **真正的 orphan** | 0 | 作者账号已不存在的真实数据，**须人工裁决，不得静默删除** |

迁移前无 orphan。迁移后必须复跑本脚本，确认 `orphan_after` 未新增。

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
