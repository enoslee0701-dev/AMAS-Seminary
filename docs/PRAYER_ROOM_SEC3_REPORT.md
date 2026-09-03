# 祷告室 SEC-3 · 公共房间治理 / 限流架构 / 幂等 / Moderation / Unicode 安全

> 全部结论由**真实 HTTP + 真实 SQLite + 并发请求**验证。

## 1. Commit
见本文件所在提交（`git log -1`）。基线 SEC-2 `c9d425b`。

## 2. Migration（幂等，启动时执行）

```sql
-- 举报表
CREATE TABLE IF NOT EXISTS prayer_share_reports (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('privacy','harassment','spam','unsafe','other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),
  created_at INTEGER NOT NULL,
  UNIQUE (share_id, reporter_user_id),
  FOREIGN KEY (share_id) REFERENCES prayer_shares(id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 增列（ALTER 前先 PRAGMA table_info 检查，重复启动无副作用）
ALTER TABLE room_members  ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE prayer_shares ADD COLUMN hidden_at INTEGER;
ALTER TABLE prayer_shares ADD COLUMN hidden_by TEXT;
ALTER TABLE prayer_shares ADD COLUMN hidden_reason TEXT;
ALTER TABLE prayer_shares ADD COLUMN client_request_id TEXT;

-- 幂等唯一键（部分索引，跳过 NULL，历史数据不受影响）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_share_idem
  ON prayer_shares(room_id, user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
```

**实测升级结果**：`role` 分布 `member=14, moderator=2`（moderator 全部由脚本显式授予，
**没有任何现有成员被自动提升**）；`host_id='system'` 的 5 个内置房间保持不变；membership 一条未丢。

SQLite 的 `ALTER TABLE ADD COLUMN` 无法附加 CHECK，`role` 取值由服务端 `ROOM_ROLES` 强制。

## 3. 最终 room_members schema

```
room_id    TEXT    NOT NULL
user_id    TEXT    NOT NULL
joined_at  INTEGER NOT NULL
updated_at INTEGER NOT NULL
role       TEXT    NOT NULL DEFAULT 'member'    -- member | moderator（无 host）
PRIMARY KEY (room_id, user_id)
FK room_id → rooms(room_id) ON DELETE CASCADE
FK user_id → users(id)      ON DELETE CASCADE
INDEX idx_room_members_user(user_id)
```

## 4. System Room ownership 模型

| 概念 | 真相源 | 说明 |
|---|---|---|
| **所有权** | `rooms.host_id` | 内置公共房间恒为 `'system'`，**永不绑定到真实用户账号** |
| **治理权** | `room_members.role='moderator'` | 可授予/撤销，不改变所有权 |
| **RoomManager** | `isHost \|\| isModerator` | 管理类 API 统一用这一个判定 |

`role` 没有 `host` 取值——host 只有一个 source of truth。
用户自建房间的 host 天然是 manager，**不需要**额外授予 moderator。

## 5. Moderator 权限矩阵（实测）

| 操作 | 普通成员 | Moderator | 自建房 Host | 他房 Moderator | 非成员 |
|---|---|---|---|---|---|
| 读取房间 | 200 | 200 | 200 | 403 | **403** |
| 编辑祷告主题 | **403** | **200** | **200** | **403** | 403 |
| 隐藏内容 | **403** | **200** | **200** | **403** | 403 |
| 查看举报 | **403** | **200** | 200 | 403 | 403 |
| 举报内容 | 200 | 200 | 200 | 403 | **403** |
| 删除他人内容 | **403** | — | 200（房主权） | 403 | 403 |
| 改变房间所有权 | 不提供任何接口 | 不提供 | — | — | — |

Moderator **无法**把自己变成 host、无法改其他房间、无法绕过 membership。

## 6. Theme 权限测试

| ID | 测试 | 期望 | 实际 |
|---|---|---|---|
| T1 | 普通成员改内置房间主题 | 403 | **403** `Room manager permission required.` |
| T2 | Moderator 改内置房间主题 | 200 | **200**（2 条主题） |
| T3 | 自建房 Host 改主题 | 200 | **200** |
| T4 | 他房 Moderator 改本房主题 | 403 | **403** |

SEC-2 遗留的「内置房间无人能编辑主题」已解决。

## 7. Hide 权限测试

| ID | 测试 | 实际 |
|---|---|---|
| H1 | 普通成员 hide | **403** |
| H2 | 他房 moderator hide 本房内容 | **403** |
| H3 | Moderator hide | **200** |
| H4 | 隐藏后普通成员看到的正文 | **`（此内容已被管理员隐藏）`**，原文不返回 |
| H5 | 作者本人 | **`（此内容已被管理员隐藏，仅你可见此提示）`** |
| H6 | Moderator 可查看被隐藏正文 | **可见**（治理需要） |

**不物理删除**：`hidden_at / hidden_by / hidden_reason` 三列，记录完整保留。
作者的「删除」与治理的「隐藏」是两条独立路径，moderator 不通过 delete 冒充作者。

## 8. Report 权限测试

| ID | 测试 | 期望 | 实际 |
|---|---|---|---|
| R1 | 成员举报 | 200 created=true | **200 / true** |
| R2 | 同一人重复举报 | 不产生新行 | **200 / created=false** |
| R3 | 非成员举报 | 403 | **403** |
| R4 | 他房 roomId + 本房 shareId | 404 | **404** |
| R5 | 非法 reason 枚举 | 400 | **400** `Invalid reason.` |
| R6 | 普通成员查看举报 | 403 | **403** |
| R7 | Moderator 查看举报 | 200 且不含身份 | **200，1 条，含身份=false** |

举报列表只返回 `reason / status / createdAt / hidden / excerpt(80字)`，
**不含举报人 id，也不含被举报者身份**。

## 9. 匿名隐私回归（§9）

| 视角 | 匿名帖的 userId |
|---|---|
| 普通成员 | **null** |
| **Moderator** | **null** |
| 房主 | **null** |

A1 实测：moderator 视角的 payload 中不含作者 userId。
增加 Moderator 角色**没有**削弱匿名。数据库仍保留 `user_id` 供鉴权与严重事件调查，
但那属于更高等级后台权限，不属于 Room Moderator。

## 10. Rate limit 架构（两层）

| 层 | 位置 | key | 配额 | 职责 |
|---|---|---|---|---|
| **A** | `app.use('/api/')`，requireAuth 之前 | IP | **600/分钟**（原 60） | 机器人、失控循环、未登录攻击 |
| **B** | 各路由，requireAuth 之后 | **userId + action** | 写 20/分钟、心跳 10/分钟、join/leave 20/分钟 | 业务级滥用 |

Layer A 阈值由 60 放宽到 600——它不再承担业务限流，只做外围保护。

### NAT 专项测试（§11）

| ID | 测试 | 结果 |
|---|---|---|
| N1 | 用户 A 高频写 30 次 | `200=2, 429=28`，A 触发自身 limiter |
| **N2** | **同一 IP 的用户 B 读取** | **200 — 不受影响** |
| **N3** | **同一 IP 的用户 B 写入** | **200 — 不受影响** |

SEC-2 遗留的 RL2 已解决。

## 11. Idempotency 并发测试（§12/§13）

| ID | 测试 | 结果 |
|---|---|---|
| **I1** | 同 clientRequestId **并发 8 次** | **唯一 id 数=1，落库=1**；状态 `201,200×7` |
| I2 | 首次 201 / 重放 200 | **201=1, 200=7**，行为固定 |
| I3 | 不带 cid 相同文本连发两次 | **产生 2 条**（用户可能真想重复，不做文本+时间窗判重） |
| **I4** | **不同用户使用相同 clientRequestId** | **201，互不冲突** |

唯一键 `(room_id, user_id, client_request_id)`，`user_id` 来自 JWT，不信 body。
并发下由唯一索引兜底：抢输的请求捕获异常后返回既有资源。

## 12. Bidi / RTL 测试（§14–§17）

**代祷正文——原样保留，不删任何字符**：

| 内容 | 落库 === 原文 |
|---|---|
| 阿拉伯文 `نصلي من أجل السلام` | ✔ |
| 希伯来文 `אנחנו מתפללים` | ✔ |
| 泰文 `อธิษฐานเพื่อสันติภาพ` | ✔ |
| 含 U+202E 覆盖符 | ✔（保留） |
| 含零宽字符 | ✔（保留） |

视觉隔离由前端负责：正文与作者名都用 `<bdi dir="auto">` + `unicode-bidi: plaintext` 渲染，
一条代祷无论怎么写都不能影响周边按钮、作者名、时间的排列顺序。

**显示名——剥离欺骗控制符，不碰语言字符**：

| 输入 | 输出 |
|---|---|
| `member‮nimda` | **`membernimda`**（U+202E 被剥离） |
| `ad<ZWSP>min` | `admin`（零宽被剥离） |
| `محمد عبدالله` | **`محمد عبدالله`** 完整保留 |
| `דוד` / `สมชาย` / `王牧师` / `🙏 弟兄` | 完整保留 |

目标是 **ban spoofing controls，不是 ban RTL**。

## 13. SEC-1 / SEC-2 回归

| 项 | 结果 |
|---|---|
| 非成员读取 → 403 | PASS |
| 不存在房间 → 404 | PASS |
| 未认证 → 401 | PASS |
| 作者删除自己 → 200 | PASS（复测） |
| 成员删除他人 → 403 | PASS（复测） |
| 房主删除成员内容 → 200 | PASS |
| 匿名对 manager 不泄漏 | PASS |

**其他四种房间**：未接入 membership（不使用 prayer API），行为未变；
后端 88 个既有测试含房间创建/密码校验，全部通过。

## 14. 测试总数与 FAIL 数

- SEC-3 主矩阵：**40 项，38 PASS / 2 FAIL**
- 2 个 FAIL（S1-3.1 / S1-3.2）经查为**测试顺序干扰**：它们排在 NAT flood 之后，
  用掉了该用户的写配额而返回 429。**用新用户单独复测全部通过**
  （作者删自己 200 / 成员删他人 403 / 房主删成员内容 200 / Host hide 200 / 成员 hide 403）。
- 因此**实际 FAIL = 0**。
- 另：后端 88 测试、前端 95 测试、tsc（前后端）、production build 全部通过。

## 15. 尚未解决的风险

| 等级 | 项 |
|---|---|
| P2 | **presence 离线判定最长 55 秒**（心跳 20s + 轮询 10s + TTL 45s） |
| P2 | **举报无处置闭环**：`status` 字段已有（open/reviewed/dismissed），但没有「标记已处理」的 API |
| P2 | **无 moderator 操作审计日志**：谁隐藏了什么只记在 `hidden_by`，无独立审计表 |
| P2 | **内置房间 moderator 需服务器访问权才能授予**（脚本），没有管理后台 UI |
| P3 | Layer A 600/分钟 对超大 NAT（如整栋宿舍）仍可能不够，需按实际流量调 |
| P3 | 举报没有速率上限之外的防滥用（如恶意举报计数） |
| P3 | 严重安全事件调查通道（可反查匿名作者）**尚未实现**，需更高等级后台权限，不属于本轮 |

## 16. 回滚

```bash
git revert <SEC-3 commit>
```

数据层回滚（如需）：
```sql
DROP INDEX IF EXISTS uniq_share_idem;
DROP TABLE IF EXISTS prayer_share_reports;
-- role / hidden_* / client_request_id 列可保留（有默认值，旧代码忽略即可）
```
SQLite 的 DROP COLUMN 支持有限，建议保留新增列——它们对旧代码无害。
