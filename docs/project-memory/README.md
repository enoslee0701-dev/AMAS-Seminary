# AMAS / CSC Project Memory

本目录是项目开发过程的长期接力与 **Source of Truth**。

适用于：Claude · ChatGPT · Codex · 人类开发者 · 新会话 · 新工作区 · 项目交接。

它存在的唯一理由：让任何人（或任何 AI）**只读这一个目录**，就能知道
项目是什么、现在做到哪里、什么已经验收、什么不能改、下一步做什么 ——
不依赖聊天记忆，不重新发明架构，不把已经废弃的方案重新做回来。

---

## 阅读顺序

| # | 文件 | 回答什么问题 |
|---|---|---|
| 1 | [CURRENT_STATE.md](CURRENT_STATE.md) | 现在做到哪里？下一步是什么？ |
| 2 | [ARCHITECTURE_RULES.md](ARCHITECTURE_RULES.md) | 什么绝对不能破坏？哪些方案已被否定？ |
| 3 | [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | 各阶段的目标、范围、不做什么、验收条件 |
| 4 | [OPEN_ISSUES.md](OPEN_ISSUES.md) | 有哪些已知问题、风险、BLOCKED、待你决定的事 |
| 5 | [ACCEPTANCE_HISTORY.md](ACCEPTANCE_HISTORY.md) | 每个阶段实际验收了什么（append-only） |
| 6 | [AI_HANDOFF_RULES.md](AI_HANDOFF_RULES.md) | 接手时必须遵守的规则 + 新对话启动模板 |
| 7 | [CHANGELOG.md](CHANGELOG.md) | 影响未来判断的架构与规则变化（append-only） |

赶时间只读两份：**CURRENT_STATE.md** 与 **ARCHITECTURE_RULES.md**。

---

## Source of Truth 优先级

冲突时按这个顺序裁决，**上位覆盖下位**：

```
1. 用户当前对话中的最新明确决定
2. 当前代码与数据库的真实状态
3. docs/project-memory/CURRENT_STATE.md
4. docs/project-memory/ARCHITECTURE_RULES.md
5. 最新的验收记录（ACCEPTANCE_HISTORY.md）
6. 旧聊天记录与旧文档
```

两条硬规矩：

- **旧聊天不能覆盖新规则。** 一段三个月前的对话不构成对今天架构决定的否决。
- **文档不能覆盖代码事实。** 如果文档说 X 已完成而代码里没有，那就是**文档错了**，
  应当先报告不一致、再更新文档 —— 不是照着文档去改代码。

> 本目录第一版建立时就遇到了这种情况：交接说明称最新阶段是 P1-1（`5d2df0f`），
> 而仓库里 P1-2 已经完成并推送。按上述优先级，以代码为准。详见 CURRENT_STATE.md。

---

## 与既有文档的关系

`docs/` 下已有 23 份阶段报告与审计（`PRAYER_*`、`VOICE_ROOMS_INVENTORY.md` 等）。
它们**继续保留**，是各阶段的详细证据。

本目录**不复制**它们的内容，只在需要时链接过去。分工：

- `docs/project-memory/` —— 少量、高密度、当前有效的**判断依据**
- `docs/*.md` —— 大量、一次性、写完就冻结的**阶段证据**

---

## 维护规则（不可省略）

每完成一个阶段，**必须同时更新**：

```
CURRENT_STATE.md        当前阶段、NEXT、最近 commit、测试基线
DEVELOPMENT_ROADMAP.md  该阶段状态 + commit
ACCEPTANCE_HISTORY.md   追加一条验收记录（不删旧的）
OPEN_ISSUES.md          关闭已解决的、补充新发现的
CHANGELOG.md            只写影响未来理解的架构/规则变化
```

`ACCEPTANCE_HISTORY.md` 与 `CHANGELOG.md` **以追加为主**。
历史结论被推翻时标 `SUPERSEDED` 并注明日期、commit、原因，**不要删除**。

---

## 禁止写入本目录的内容

```
JWT · password · Supabase service key · API key · secret
private key · 真实用户个人数据 · 真实账号凭据
```

只记录「某能力依赖哪一类 secret」，**不记录 secret 本身**。
