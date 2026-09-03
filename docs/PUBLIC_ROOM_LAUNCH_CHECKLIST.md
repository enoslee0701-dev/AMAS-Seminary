# Public Room Launch Checklist｜内置公共房间正式开放前的检查表

适用于五个内置公共房间：

```
prayer_room  praise_room  bible_reading  preaching_room  fellowship_room
```

---

## 一、这些房间的权限模型（先读懂再操作）

| 概念 | 真相源 | 说明 |
|---|---|---|
| **所有权** | `rooms.host_id` | 五个内置房间恒为 `'system'`。**永远不要改成真实用户。** |
| **成员** | `room_members` 有行 | 进房即成员，`join` 只创建 `role='member'` |
| **治理权** | `room_members.role = 'moderator'` | 由服务器端 CLI 授予，可随时撤销 |
| **管理能力** | `requireRoomManager` = 真人 host **或** 本房 moderator | 内置房间没有真人 host，所以完全依赖 moderator |

`'system'` 不是真实用户，因此内置房间**没有房主**，也没有人能「拥有」它们。
运营权只以 moderator 的形式存在——**可授予、可撤销，且不改变所有权**。

> 为什么不给内置房间指定一个真人房主：房主是所有权，撤销要动
> `rooms.host_id`，而所有权变更没有审计、没有回退，一旦指错人很难干净收回。
> moderator 是治理权，grant / revoke 对称，撤销即时生效。

---

## 二、正式开放前的必做项

### ☐ 1. 每个开放的房间至少有 **2 位已验证真人 moderator**

一位不够：请假、离线、账号问题都会让房间瞬间无人可管。

```bash
cd backend
node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts list prayer_room
```

输出里 `[M]` 前缀的就是 moderator。数一数，必须 ≥ 2。

### ☐ 2. 授予（在服务器上执行，客户端没有这个接口）

```bash
cd backend
node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts grant <roomId> <email>
```

- 幂等：已是成员的只提升角色，不重复建 membership
- **绝不修改 `rooms.host_id`**
- 脚本不 hardcode 任何 email / userId，全部来自命令行参数

### ☐ 3. 撤销演练

正式开放前，至少完整走一遍 grant → revoke → grant，确认：

```bash
node node_modules/tsx/dist/cli.mjs scripts/room-moderator.ts revoke <roomId> <email>
```

- 撤销后该用户**立即**失去 manager 能力（授权每次现查，不看旧 token，
  不需要对方重新登录）
- 撤销后该用户**仍是成员**，可以继续正常参加聚会——
  收回的是治理权，不是把人赶出去

### ☐ 4. 「已验证真人」的含义

至少满足：

- 是真实的人，不是共享账号、测试账号或机器账号
- 邮箱可达，出事能联系上
- 知道自己被授予了什么权限（能隐藏他人分享、能主持祷告会）
- 明白匿名分享的边界：**moderator 也拿不到匿名作者的身份**
  （见 [PRAYER_ROOM_SEC3_REPORT.md](PRAYER_ROOM_SEC3_REPORT.md) §9）

**不要**为了让检查表变绿而随便指派一个人。

---

## 三、启动诊断

后端启动时会逐个检查内置房间的 moderator 数量：

```
[amas-backend] SYSTEM_ROOM_HAS_NO_MODERATOR room=prayer_room
[amas-backend] system rooms below launch threshold (< 2 moderators): praise_room(1)
```

一切就绪时：

```
[amas-backend] system rooms OK — 5 room(s), each with >= 2 moderator(s).
```

三点说明：

1. **只写服务端日志。** `SYSTEM_ROOM_HAS_NO_MODERATOR` 这类技术错误码
   绝不进入任何 HTTP 响应，普通用户永远看不到。
2. **不会让服务启动失败。** 没有 moderator 的房间照样可以浏览、发代祷——
   缺的是运营权限，不是可用性。让服务起不来只会更糟。
3. **绝不自动指派任何人。** 由谁运营公共房间是人的决定，
   不是启动脚本能替人做的决定。诊断只报告，不修复。

---

## 四、明确禁止

- ❌ 把任何真实用户设为内置房间的 `host_id`
- ❌ 在前端 hardcode moderator 名单
- ❌ 开放任何让客户端自我提升为 moderator 的接口
- ❌ 由脚本或启动流程自动挑选 moderator
- ❌ 把「平台管理员（`users.role='admin'`）」自动等同于「房间 moderator」——
  平台管理与房间运营是两件事，需要分别授予

---

## 五、验证

`scripts/verify-system-room-moderator.mjs` 用真 backend + 真 SQLite + 真 HTTP
跑完整闭环（26/26 PASS）：

```bash
node scripts/verify-system-room-moderator.mjs
```

覆盖：五个房间的 grant/revoke、`host_id` 恒为 `system`、
Moderator A 创建 / Moderator B 编辑主持 / Member C 403、
撤销后立即失效且仍保留成员身份、启动诊断如实报出缺人。
