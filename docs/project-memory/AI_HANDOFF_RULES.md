# AI Handoff Rules

任何 AI（Claude / ChatGPT / Codex / 其他）或新开发者接手本项目后，
必须遵守以下规则。

---

## 第一步：先读，不要先写

按顺序阅读（前四份是必读，约 5 分钟）：

```
1. PRODUCT_OVERVIEW.md      这个项目到底是什么 —— 不读会误判范围
2. CURRENT_STATE.md         做到哪里、下一步
3. ARCHITECTURE_RULES.md    什么不能破坏
4. WORKING_AGREEMENTS.md    用户的证据标准与协作方式
5. DEVELOPMENT_ROADMAP.md
6. OPEN_ISSUES.md
7. ACCEPTANCE_HISTORY.md 的最后一条
```

**动手写代码前再补两份**：

```
ENVIRONMENT_AND_TOOLING.md   怎么跑、已经踩过哪些坑（省最多时间）
DATA_MODEL.md                有哪些表、某个状态该信谁
```

如果要改**定制化神学 / Christian Profile**，额外必读
`docs/CHRISTIAN_PROFILE_SPEC.md` 的「§1 产品定位与铁律」—— 那有九条硬约束。

---

## 第二步：检查 git 真实状态

```bash
git status
git log --oneline -10
git branch --show-current
```

---

## 第三步：核对代码与 CURRENT_STATE 是否一致

**如果不一致：不要直接改代码。**

先判断谁更新 —— 按 Source of Truth 优先级，**代码事实 > 文档**。
然后：

1. **明确指出不一致**（不要静默修正）
2. 更新 CURRENT_STATE.md 使其符合代码
3. 再继续开发

> 本目录第一版建立时就命中了这条：交接说明称最新是 P1-1，
> 而仓库里 P1-2 已完成。处理方式是报告 + 以代码为准，不是照文档回退代码。

---

## 第四步：继续当前 NEXT 阶段

```
禁止重新实现已经 DONE 的阶段
禁止顺手重构已经验收通过的核心模块
禁止把 ARCHITECTURE_RULES.md 里 Deprecated 区的模式重新引入
```

在旧代码里找到某个被废弃的模式，**不代表它是当前规则** ——
先查 Deprecated 区。

---

## 第五步：完成阶段后必须更新项目记忆

这是**强制项，不需要用户提醒**。每完成一个阶段，同一个 commit 里更新：

| 文件 | 更新内容 |
|---|---|
| `CURRENT_STATE.md` | 当前 DONE 改为本阶段；NEXT 改为下一阶段；最近 commit；测试基线 |
| `DEVELOPMENT_ROADMAP.md` | 本阶段状态改 DONE + 填 commit；下一阶段改 NEXT |
| `ACCEPTANCE_HISTORY.md` | **追加**一条验收记录（不删旧的） |
| `OPEN_ISSUES.md` | 关闭已解决的；补充新发现的 |
| `CHANGELOG.md` | 只写影响未来理解的架构/规则变化 |

例：P1-3 完成后 —— CURRENT_STATE 的 DONE 改成 P1-3、NEXT 改成 P2；
ROADMAP 里 P1-3 写 commit + PASS；ACCEPTANCE_HISTORY 追加 P1-3；
OPEN_ISSUES 关闭 #2；CHANGELOG 记录关键架构变化。

---

## 第六步：不得凭记忆宣布完成

> **AI 不得凭聊天记忆宣布某功能已完成。**

必须由以下四项**共同**证明：

```
代码存在  +  测试通过  +  commit 落地  +  验收记录
```

报告时给**实际跑出来的数字**，不引用文档里的旧数字。
测试失败就说失败并贴输出；跳过了某步就说跳过。

---

## 硬性纪律

### 验收口径

```
代码测试通过 ≠ 生产正式验收完成
```

真实 Supabase / JWT / RLS / Edge Function / 生产部署 / 真机
未完成真实环境验证前，只能写 `DONE — Code-stage acceptance`。

### 状态标签

只用：`DONE` · `IN_PROGRESS` · `NEXT` · `TODO` · `BLOCKED` · `DEPRECATED`
不用「finished / ready / almost / probably done / 80%」。

### 历史不可篡改

`ACCEPTANCE_HISTORY.md` 与 `CHANGELOG.md` **以追加为主**。
不要因为当前设计变了就删除旧历史。结论被推翻时写：

```
SUPERSEDED
superseded by: 日期 / commit / 原因
```

### 不得写入敏感信息

```
JWT · password · Supabase service key · API key · secret
private key · 真实用户数据 · 真实账号凭据
```

只记录「某能力依赖哪一类 secret」，不记录 secret 本身。

### 审计先于实施

改动现有真实业务数据结构之前，**先输出审计**：现有数据能支撑什么、
不能支撑什么、需要哪些改动、风险在哪。确认后再实施。

### 没有真实数据就不做真实 UI

这是本项目最核心的一条。不确定时问自己：
**这个数字/状态，backend 重启后还在吗？它对应数据库里的哪一行？**

答不上来，就不要显示它。

---

## 破坏性操作

以下操作 AI **不得自行执行**，必须由人按下回车：

```
git push --force / 任何历史重写（filter-branch / rebase 已推送的提交）
删除远端分支
rm -rf 用户数据目录
清空 / 重建生产数据库
```

需要时：写好脚本 + 说明风险 + 提供回滚方式，交给用户执行。

---

## 新对话启动模板

复制以下整段发给任何新的 AI 对话，即可恢复上下文：

```text
继续 AMAS / CSC 项目开发。

请先阅读：

docs/project-memory/README.md
docs/project-memory/PRODUCT_OVERVIEW.md
docs/project-memory/CURRENT_STATE.md
docs/project-memory/ARCHITECTURE_RULES.md
docs/project-memory/WORKING_AGREEMENTS.md
docs/project-memory/DEVELOPMENT_ROADMAP.md
docs/project-memory/OPEN_ISSUES.md
docs/project-memory/AI_HANDOFF_RULES.md

动手写代码前再读：
docs/project-memory/ENVIRONMENT_AND_TOOLING.md
docs/project-memory/DATA_MODEL.md

然后检查：
git status
git log --oneline -10

不要重新实现已经 DONE 的阶段。
不要顺手重构已经验收通过的核心模块。
不要把 ARCHITECTURE_RULES.md 里 Deprecated 区的模式重新引入。

确认当前 NEXT 阶段后直接继续开发。

如果文档与代码冲突：
以用户最新决定和真实代码为准，并明确指出冲突，不要静默修正。

破坏性操作（force push / 历史重写 / 删远端分支 / 删数据）不要自行执行，
写好脚本交给我。

每完成一个阶段，必须同时更新 docs/project-memory/ 下的五个文件
（CURRENT_STATE / DEVELOPMENT_ROADMAP / ACCEPTANCE_HISTORY / OPEN_ISSUES / CHANGELOG）。

用中文回复。证据标准见 WORKING_AGREEMENTS.md —— 报告必须给实际跑出来的
数字并写明 FAIL 数，不接受用 mock 冒充真实验证。
```
