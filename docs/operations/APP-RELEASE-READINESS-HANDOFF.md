# APP RELEASE-READINESS HANDOFF

> 执行者：AMAS App Claude（本仓唯一执行者）· 日期：2026-09-11
> 基线：`origin/main = 152f9c111b4ede00129e7b1895a62eeb3a9a24cd`（CI **SUCCESS**）
> 本文只做**只读清点**：未重开任何已关审计，未实现 #26，未碰身份迁移 / 0027 /
> persona / live 写入 / 公开 staging / 生产。SQLite 与 `.gitignore` 均未改动。

---

## 0. 一句话结论

**本阶段内没有剩余的、已授权且未被外部前提阻塞的实现工作。**

App 侧的数据层收尾已经做完：活动 SQLite 写表 **1 张**（`users`，属 DB-4），
两个 release-hardening 闸门（#22 / #23）已关。其余每一项都落在下面三类之一：
**需要外部前提**、**需要产品/人决策**、或**被本阶段明令排除**。
详细证据见 §3。

---

## 1. 当前已验证事实（本轮实测，非引用旧报告）

```
origin/main            152f9c111b4ede00129e7b1895a62eeb3a9a24cd
GitHub CI (该 sha)      SUCCESS
backend tests          280/280
frontend tests         187/187 (21 files)
verify:local-release   PASS (exit 0)
  presence 54/54 · reading 44/44 · rooms render 51/51
  prayer phase5 24/24 · system room moderator 26/26

ACTIVE SQLITE WRITE TABLES   1   →  users
SQLITE READ TABLES           2   →  users · legacy_user_map
canonical amas.sqlite        458752 B · sha256 8de2d501…c8200 · 未改动
```

已关闭的阶段：DB-3 ~ DB-12 · DB-13A · DB-13B · DB-13C（均已验收或 CI 验证）。

---

## 2. 阻塞项总览

| 类别 | 条目 | 谁能解 |
|---|---|---|
| **A. 外部前提** | #1 实时语音 · #17 身份映射 · #RB-22 / #RB-26 AUTH 真实环境验收 · 真实多用户 realtime 验收 | 用户（设备 / 凭据 / 真实身份） |
| **B. 产品或人的决策** | #6 内置房间 0 moderator · #2 P1-3 分享墙 · #3 赞美室音频 · D-43 课程目录管理契约 | 用户 / 产品 |
| **C. 本阶段明令排除** | #26 canonical SQLite 存储围堵 · DB-4 身份迁移 · 0027 · persona · 公开 staging / 生产 | 后续被授权的阶段 |
| **D. 已修但记忆过期** | #12 · #RB-25 · #RB-27（见 §4） | 本文已给出证据，建议按证据更新记忆 |

---

## 3. 具体阻塞项（按「离可发布还差什么」排序）

### 3.1 真人用户一登录就会被锁死 —— #17（最高）

```
canonical amas.sqlite:  users = 7 行 · legacy_user_map = 0 行
```

AUTH-M7 之后，Supabase 登录成功 ≠ 拥有 AMAS 身份：`legacy_user_map` 解析不出
一律 403 `IDENTITY_NOT_PROVISIONED`（fail closed，产品决策，已定）。
**映射表现在是 0 行**，意味着任何真实用户登录后都拿不到业务权限。

这不是缺陷，是**迁移尚未执行**。解法属 DB-4 / 身份迁移范围，本阶段明令不碰。

> ⚠️ 这条是「能不能让真人用」的硬前提，优先级高于其余全部条目。

### 3.2 五个内置公共房间 0 moderator —— #6

`status: PENDING_DECISION`。内置房间 `host_type='system'`，**永远没有真人房主**，
内容治理完全依赖 moderator。机制齐备（`backend/scripts/room-moderator.ts`，
26/26 回归通过），但**还没给任何人授权**。

阻塞的是「授权给谁」这个人事决定，不是代码。且授予对象必须是已 provision 的
Supabase 身份 —— 因此它实际上**排在 #17 之后**。

### 3.3 #26 canonical SQLite 写入围堵（本阶段排除）

`status: OPEN` · P2 RELEASE HARDENING · **阻塞 PUBLIC STAGING / PRODUCTION**。

DB-13A 已封堵「静默写入」向量（测试缺 `DB_PATH` 拒绝启动、改 schema 需显式
opt-in、启动日志打印解析路径）。仍 OPEN 的是**存储布局本身** ——
canonical 数据文件位于仓库目录内的缺省路径上。

**本阶段明令不实现。** 它是公开 staging 前必须处理的最后一类结构性问题。

### 3.4 真实环境验收的三条（全部缺外部前提）

| 条目 | 现状 | 缺什么 |
|---|---|---|
| #RB-22 | `test:external` 6 项全 SKIP | `AMAS_ENV` / 真实 staging 凭据 |
| #RB-26 | AUTH-M7 未在真实 Supabase 验证 | 同上 |
| 多用户 realtime / room 写入验收 | EXTERNAL TEST IDENTITY BLOCKED | **一个合法 provision 的 staging 学生身份** |

最后一条与 #17 同源：没有合法身份就没有真实多用户验收，而造一个假的是明令禁止的。

### 3.5 产品线（阶段已切到 RELEASE READINESS，功能开发暂停）

```
#1  Phase 4B 实时语音     BLOCKED —— 缺真实设备 + LiveKit 凭据
#2  P1-3 交通室分享墙      NEXT    —— 功能开发暂停中
#3  P2 赞美室音频          BLOCKED —— 缺版权授权（产品/法务，不是技术）
D-43 课程目录管理契约       DEFERRED —— 待产品定 availability/排序/缩略图/删除权归属
```

### 3.6 已知技术债（不阻塞发布，登记在案）

`#4` 个人阅读进度未持久化 · `#5` 读经室成员显示视觉重复 · `#7` git 历史 31.3MB ·
`#9` presence TTL 45s 判定延迟 · `#10` voiceCapability 初始化 · `#11` 录音与语音边界 ·
`#13` USER FK 数据完整性债 · `#20` `VITE_APP_SECRET` 废弃项（`.env.example:28` 仍有条目，
`routes/gemini.ts` 注释提及）· 一批 `#DBR-*` 迁移契约条目。

---

## 4. 记忆里三条已过期的状态（附本轮证据）

这三条在 `OPEN_ISSUES.md` 里仍写着 OPEN，但代码事实已不同。
**本文只给证据，未改这三条的状态** —— 是否改由 Supervisor 决定。

| 条目 | 记忆写的 | 本轮实测 |
|---|---|---|
| **#12** ghost identity 可写业务数据「修复在 `integration/auth-strategy-b`，main 未合入」 | 未合入 | **已在 main**：`middleware/auth.ts:183` 调 `resolveCanonicalUserFromSupabase`，解析不出即 403 `IDENTITY_NOT_PROVISIONED`（文件内 2 处引用），并有 `auth-m7-identity.test.ts` 的否定式回归 |
| **#RB-25** `requireAppSecret` 零路由使用 | OPEN（仅标记） | 仍然成立：`backend/src` 中除定义处外**引用数 = 0** |
| **#RB-27** `refresh_jti` 已无写入方 | OPEN（刻意不处理） | 仍然成立：全仓**没有任何 INSERT**，唯一引用是 `db.ts:621` 测试用 `resetDb()` 里的 DELETE；canonical 库中仍有 111 行历史数据 |

---

## 5. 已授权且未被阻塞的下一步 —— 结论：**没有**

逐条排查「现在就能动手且已获授权」的工作：

| 候选 | 判定 | 依据 |
|---|---|---|
| 继续 DAL 切换 | **无对象** | 活动 SQLite 写表只剩 `users`，属 DB-4 身份域，本阶段明令不迁 |
| #26 存储围堵 | **排除** | 本阶段指令明确「remains outside this phase, do not implement」 |
| 0027 / DB-4 / persona / live 写入 / 公开 staging / 生产 | **排除** | 同上，且历次裁定一致 |
| #22 / #23 | **已关闭** | 本轮与 `099f59b` 已修，CI 验证 |
| #RB-22 / #RB-26 / 多用户验收 | **缺外部前提** | 需 `AMAS_ENV` 凭据或合法 staging 身份 |
| #6 moderator 授权 | **需人决策 + 依赖 #17** | 授予对象必须是已 provision 的身份 |
| P1-3 / P2 / Phase 4B | **阶段暂停 / 缺外部条件** | 功能开发已暂停；后两者缺凭据与版权 |
| 技术债（#4/#5/#9/#10/#20…） | **未获本阶段授权** | 指令要求不要发明工作 |

因此：**本阶段无剩余可执行实现项**。没有为了「有事做」而发明工作。

---

## 6. 建议的下一个可授权阶段（供 Supervisor 选择，不自行启动）

按「解锁价值 / 前提成熟度」排序，三条互不冲突：

1. **身份 provision 路径（解 #17）** —— 当前一切真实验收的共同前提。
   需要先定「真人怎么获得 AMAS 身份」这条链路，而不是先写代码。
2. **#26 存储布局** —— 公开 staging 前的最后一类结构性问题，已有明确记录。
3. **#6 moderator 授权** —— 纯运营动作，但依赖 1。

三者都需要 Supervisor 的显式授权与（1、3 的）人事/产品决定，本会话不启动。

---

## 7. 边界声明

```
未重开任何已关审计            未实现 #26
未迁移身份 / 未碰 DB-4        0027 未碰
未创建 persona               无 live 写入
未做公开 staging / 生产动作    canonical SQLite 未改动
.gitignore 未改未提交         本会话未推 main
```

本文所有数字均为本轮实测或来自当前 canonical 记忆并已标注来源；
过期处已在 §4 单独列出而非原样抄录。

等待 Supervisor 复核。
