# AMAS 12 角色定制化课程与成长路径系统
## 补充规范 V1.1（配套 Claude 执行总规范 V1.0）

> 性质：对 V1.0 的**补齐**，不替代、不修改 V1.0 的任何约束
> 目的：让 Phase 0 / Phase 1 具备可执行性
> 状态：待用户确认　日期：2026-08-31
> 优先级：V1.0 > 本文件。两者冲突时以 V1.0 为准。

---

# A. 裁决：67 门中 21 门零课时课程如何处理

## A.1 矛盾点

- V1.0 §3：67 门是用户已确认拥有的现有课程，不可增删改。
- V1.0 §14.4：空课程页或 `totalLessons: 0` 的正式课程不得提供入口。

而 67 门里有 **21 门零课时**：帖撒罗尼迦前书、帖撒罗尼迦后书、士师记、圣经地理、福音派神学核心要义、基督教教育、中国教会的神学根基、基督教伦理、世界观、宗教比较、伊斯兰教理解、中国异端、讲道学、讲道实习、敬拜学、主日学教育、以色列文化、世界教会史、中国教会史、希伯来语、人工智能与教牧实践。

它们**既是学院官方课程，又暂时没有讲义**。

## A.2 裁决

> **本轮实施边界（用户 2026-08-31 明确）**
> - `availability` 只新增结构与默认值，**不得因字段新增而自动隐藏任何现有课程**；
> - 21 门零课时课程**仍属于已确认的 67 门正式课程**，只是内容状态为 `in_development`，
>   **不得被计成新增课程**；
> - 它们不得进入"现在开始"，可以进入"稍后探索"，并标注「课程内容筹备中」。


1. 67 门的**身份不变**：`approvalStatus: 'confirmed_existing'`、`officialCatalog: true`。
2. 用 `availability` 区分是否可学：

| availability | 门数 | 课程页显示 | 可否进入"现在开始" |
|---|---:|---|---|
| `available` | 46 | 正常，可进入学习 | 可以 |
| `in_development` | 21 | 标注「讲义筹备中」，可查看简介，**无学习入口** | **不可以**，只能进"稍后探索" |

3. V1.0 §14.4 的措辞按此修正为：**「`in_development` 的课程不得作为"现在开始"的入口，也不得出现"立即开始学习"按钮；可以出现在"稍后探索"并标注筹备中。」**
4. 推荐引擎的 Step 5 过滤条件相应写为：

```ts
canBeNow = approvalStatus in ('confirmed_existing','user_approved')
        && availability === 'available'
```

---

# B. 能力标签词表（Phase 1 的前置工作）

## B.1 设计原则

- 标签是**能力**，不是主题；课程和倾向都挂同一套标签，路径引擎靠标签做匹配，不靠硬编码课程 id。
- 一门课最多 3 个标签，第一个为主标签。
- 标签集合**固定 25 个**，新增需用户确认。

## B.2 25 个能力标签

| # | key | 中文 | 典型课程 |
|---:|---|---|---|
| 1 | `bible_knowledge` | 圣经知识 | 认识圣经、各书卷 |
| 2 | `exegesis` | 释经 | 研经标记法 |
| 3 | `biblical_theology` | 圣经神学脉络 | 认识圣经 |
| 4 | `theology_knowledge` | 教义认识 | 平信徒系统神学、改革宗与福音派神学 |
| 5 | `apologetics` | 分辨与护教 | 中国异端、宗教比较 |
| 6 | `worldview` | 世界观与伦理 | 世界观、基督教伦理 |
| 7 | `church_history` | 教会历史 | 世界教会史、中国教会史 |
| 8 | `language_tools` | 语言与工具 | 希腊语、希伯来语 |
| 9 | `teaching` | 教学与讲解 | 主日学教育、基督教教育 |
| 10 | `preaching` | 讲道 | 讲道学、讲道实习 |
| 11 | `curriculum_design` | 教材与课程设计 | 基督教教育 |
| 12 | `discipleship` | 门徒训练 | 门徒训练、新信徒事工 |
| 13 | `accompaniment` | 长期陪伴 | 门徒训练、小组运营 |
| 14 | `listening` | 倾听与提问 | 协谈学 |
| 15 | `counseling` | 协谈与辅导 | 协谈学 |
| 16 | `care` | 关怀与探访 | 内在医治、基督徒生活基础 |
| 17 | `boundaries` | 界限与自我照顾 | （现有课程未覆盖 → Phase 2 微课程） |
| 18 | `prayer` | 祷告与代祷 | 祷告与灵修生活 |
| 19 | `spiritual_discipline` | 属灵操练 | 祷告与灵修生活、属灵争战 |
| 20 | `worship` | 敬拜与礼仪 | 礼拜学、敬拜学 |
| 21 | `evangelism` | 布道与福音对话 | 传道法、罗马书 |
| 22 | `crosscultural` | 跨文化与处境化 | 处境化神学、伊斯兰教理解、以色列文化 |
| 23 | `leadership` | 带领与决策 | 教会运营、小组运营 |
| 24 | `systems_admin` | 系统与行政 | 教会运营、人工智能与教牧实践 |
| 25 | `hospitality_service` | 接待与实际服事 | 礼拜学、教会运营 |

## B.3 12 项倾向 → 能力标签映射（引擎匹配依据）

| 倾向 | 核心能力标签（权重高） | 组合能力标签 |
|---|---|---|
| 01 教导者 | `teaching` `exegesis` | `preaching` `theology_knowledge` `curriculum_design` |
| 02 研道者 | `exegesis` `bible_knowledge` | `language_tools` `church_history` `biblical_theology` |
| 03 装备者 | `discipleship` `curriculum_design` | `teaching` `accompaniment` `leadership` |
| 04 牧养者 | `accompaniment` `care` | `counseling` `discipleship` `boundaries` |
| 05 劝勉者 | `listening` `counseling` | `accompaniment` `care` `discipleship` |
| 06 怜悯者 | `care` `hospitality_service` | `counseling` `boundaries` `worldview` |
| 07 代祷者 | `prayer` `spiritual_discipline` | `worship` `apologetics` `crosscultural` |
| 08 传福音者 | `evangelism` `apologetics` | `discipleship` `listening` `crosscultural` |
| 09 差传者 | `crosscultural` `evangelism` | `worldview` `leadership` `church_history` |
| 10 领袖者 | `leadership` `systems_admin` | `discipleship` `theology_knowledge` `boundaries` |
| 11 建造者 | `systems_admin` `leadership` | `hospitality_service` `worship` `curriculum_design` |
| 12 服事者 | `hospitality_service` `systems_admin` | `care` `worship` `boundaries` |

> `boundaries` 目前 67 门课无覆盖 → 与 V1.0 §17 Phase 2 的"健康界限与自我照顾"微课程对应。在此之前，涉及 `boundaries` 的成长补强只能以**实践任务 + 导师讨论**形式给出，不得指向不存在的课程。

## B.4 67 门课的标签工作量

- 46 门 `available` 必须打标签（Phase 1 必做）
- 21 门 `in_development` 也要打标签（供"稍后探索"匹配），但不进入"现在开始"
- 27 卷新约书卷统一按 `bible_knowledge` + `exegesis` 处理，不逐卷细分，避免路径被书卷淹没

---

# C. 实践任务库 · 初版 12 条（Phase 1 可直接用）

## C.1 完整字段示例（3 条）

### PT-SHEPHERD-01 · 固定陪伴两位肢体

| 字段 | 内容 |
|---|---|
| objective | 操练长期陪伴：从一次性帮助转为持续跟进 |
| context | 你所在的教会或小组，1–2 位你已认识的肢体 |
| action | 每两周约见或通话一次，了解近况与信仰状态，不急于给建议 |
| duration | 8 周，共 4 次 |
| artifact | 每次一段 5 行以内的简短记录（对方近况 / 我做了什么 / 下次要留意的） |
| observer | 小组长或牧者（可选，第 4 次后邀请其看一次记录） |
| reflection | 8 周结束写 200 字：哪一次我说得太多？哪一次我真的听见了？ |
| safety | 若对方出现自伤、严重创伤、婚姻危机或精神健康问题 → **立即转介牧者，停止自行处理** |
| successCriteria | 完成 ≥3 次会面并留下记录 |
| stopCondition | 对方明确拒绝、出现上述安全情形、或你连续两次无法履约 |
| requiresSupervision | false（触发 safety 条件时转为 true） |

### PT-TEACHER-01 · 讲一次 15 分钟经文分享

| 字段 | 内容 |
|---|---|
| objective | 把释经过程转化为别人能听懂的讲解 |
| context | 小组、主日学或家庭聚会 |
| action | 选一段经文，完成观察—解释—应用，讲 15 分钟 |
| duration | 单次（准备 1–2 周） |
| artifact | 一页讲稿（中心思想一句话 + 三个要点 + 一个应用） |
| observer | 一位听众填写 3 个问题：最清楚的是什么 / 最难懂的是什么 / 你会怎么用 |
| reflection | 100 字：我讲的应用，真的是从这段经文来的吗？ |
| safety | 不涉及 |
| successCriteria | 完成讲述并收到 ≥1 份听众反馈 |
| stopCondition | 无 |
| requiresSupervision | false |

### PT-MERCY-01 · 一次有边界的实际帮助

| 字段 | 内容 |
|---|---|
| objective | 在给予帮助的同时练习设定界限 |
| context | 教会内或社区中一位有实际需要的人 |
| action | 提供一次具体、有明确范围的帮助（陪同就医 / 一次探访 / 一份物资），**事先写下"我这次做什么、不做什么"** |
| duration | 1–2 周 |
| artifact | 帮助前的范围说明 + 帮助后的记录 |
| observer | 教会关怀负责人（若有） |
| reflection | 我有没有承诺超出自己能力的事？下次的界限在哪里？ |
| safety | 涉及金钱资助、独处探访异性、未成年人、精神健康 → **必须由教会负责人同行或批准** |
| successCriteria | 完成帮助且未超出事先设定的范围 |
| stopCondition | 出现安全条款情形且无人同行 |
| requiresSupervision | 条件性 true |

## C.2 12 条任务总表（每项倾向至少一条）

| 任务 id | 倾向 | 一句话 | 时长 | 产出 | 需督导 |
|---|---|---|---:|---|---|
| PT-TEACHER-01 | 教导者 | 讲一次 15 分钟经文分享 | 单次 | 一页讲稿 + 听众反馈 | 否 |
| PT-EXPLORER-01 | 研道者 | 把一卷短书信的背景研究整理成一页大众讲义 | 3 周 | 一页讲义 | 否 |
| PT-EQUIPPER-01 | 装备者 | 带一位初信者完成 4 周门训并让他独立带一次 | 6 周 | 门训记录 + 对方的一次实践 | 否 |
| PT-SHEPHERD-01 | 牧养者 | 固定陪伴 1–2 位肢体，每两周一次 | 8 周 | 4 次简短记录 | 条件性 |
| PT-ENCOURAGER-01 | 劝勉者 | 一次"只听不建议"的谈话，事后再约第二次给建议 | 2 周 | 两次谈话对照记录 | 条件性 |
| PT-MERCY-01 | 怜悯者 | 一次有明确边界的实际帮助 | 1–2 周 | 范围说明 + 记录 | 条件性 |
| PT-INTERCESSOR-01 | 代祷者 | 30 天代祷名单，并为其中一项采取一个实际行动 | 30 天 | 代祷记录 + 行动说明 | 否 |
| PT-EVANGELIST-01 | 传福音者 | 一次自然的福音性交谈 + 一份跟进计划 | 3 周 | 交谈记录 + 跟进计划 | 否 |
| PT-MISSIONARY-01 | 差传者 | 认领一个群体，完成了解报告并持续祷告 | 4 周 | 一页群体了解报告 | 否 |
| PT-LEADER-01 | 领袖者 | 带领一次小型活动的筹备到复盘 | 4–6 周 | 分工表 + 复盘记录 + 团队反馈 | 否 |
| PT-BUILDER-01 | 建造者 | 为一项事工建立可复用流程并试运行一轮 | 4 周 | 流程/表格 + 试运行结果 | 否 |
| PT-SERVANT-01 | 服事者 | 稳定承担一个固定岗位 4 周并邀请一次反馈 | 4 周 | 出勤记录 + 一次反馈 | 否 |

> 全部 12 条**只需要现有教会场景**，不依赖任何新课程，Phase 1 可立即启用。

---

# D. Phase 1 的"复盘与反馈"如何落地（解决时序矛盾）

V1.0 Phase 1 要求"1 门课 + 1 项实践 + 1 次反馈"，但导师系统在 Phase 4。

**关键区分：自我复盘不是反馈。** 反馈的定义是"来自他人的观察"，自己写的反思属于复盘，不能冒充外部反馈、也不能据此提升证据等级。因此分为三档：

| 档位 | 名称 | 定义 | Phase 1 | 证据等级 |
|---|---|---|---|---|
| **R1** | 自我复盘 | 用户按任务的 reflection 字段写 100–200 字 | **必做** | E1（自我陈述，**不计为外部反馈**） |
| **F1** | 同工或负责人反馈 | 请一位同工/小组长看过记录后给出意见，用户录入 | **建议** | E2 / E3 |
| **F2** | 导师或牧者正式反馈 | 导师在后台观察并填写评估 | **Phase 4 启用** | E4 |

**Phase 1 的闭环 = 1 门课 + 1 项实践 + R1（必做）+ F1（建议）。**
F2 未上线不得阻塞闭环；UI 中 F2 显示为「导师反馈 · 规划中」。

**硬规则**：
- 只完成 R1 的动作，证据等级停留在 E1，**不得**在界面上表述为"已获得反馈"；
- 需要外部证据才能触发的成长补强（V1.0 §9.2），**R1 不满足触发条件**，至少需要 F1；
- 服事记录的"反思"字段属于 R1，"他人反馈"字段属于 F1，两者分开存储。

---

# E. 路径动作状态机

```
suggested ──接受──→ accepted ──开始──→ active ──提交产出──→ completed
    │                   │                  │
    ├──跳过──→ skipped   ├──放弃──→ skipped ├──放弃──→ skipped
    └──更换──→ 生成替代动作（同标签、同阶段）
```

## E.1 转换触发者

| 转换 | 触发者 | 说明 |
|---|---|---|
| suggested → accepted | 用户点击「开始」 | 唯一入口 |
| accepted → active | 用户首次进入课程 / 首次记录实践 | 自动 |
| active → completed | 课程完成 **且** 产出已提交 | 两者缺一不可 |
| 任意 → skipped | 用户点击「跳过」或「这门课不适合我」 | 需选择原因（已学过 / 不感兴趣 / 现在没时间 / 不适合我） |

## E.2 完成后如何生成下一个 now

```
completed 后：
  1. 写入学习证据 + 实践证据（不改倾向指数）
  2. 从当前 next 队列取第 1 项，提升为 now
  3. 若 next 为空 → 重新运行路径引擎（输入含最新证据）
  4. 若连续 2 个动作 completed → 提示「可以复盘一次画像」（不强制）
```

## E.3 跳过后的冷却规则

| 跳过原因 | 冷却期 | 之后行为 |
|---|---|---|
| 已学过 | 永久 | 记为已完成的学习证据，不再推荐 |
| 不感兴趣 | 180 天 | 期满后可再次出现，但优先级 −30 |
| 现在没时间 | 60 天 | 期满恢复原优先级 |
| 不适合我 | 永久 | 不再推荐，并记录为"用户否决"，供内容团队参考 |

## E.4 90 天复盘的触发

App 无推送/定时机制，因此**不做定时提醒**，改为**进入时判定**：

```
用户进入定制化神学页时：
  若 (今天 − profile.completedAt) ≥ 90 天 且 有新增证据
     → 在路径卡顶部显示一次性提示「距上次评估已 N 天，可以复盘」
     → 用户忽略后 30 天内不再提示
```

---

# F. 优先级公式的变量定义（保证可测试）

V1.0 §11 的公式变量按下式计算，全部为 0–1 之间的确定性数值：

```ts
foundationNeed   = faithFoundation ? clamp01((60 - faithFoundation.overall) / 60) : 0.5
                   // 未评估信仰基础时取 0.5，避免既不前置也不忽略

primaryFit       = 该资产标签 ∩ Primary 核心标签 的匹配数 / Primary 核心标签数
secondaryFit     = 该资产标签 ∩ (Secondary ∪ Supporting) 标签 的匹配数 / 该集合大小

evidenceNeed     = 命中的成长补强条件数 / 该倾向的条件总数   // 见 V1.0 §9.2，无命中为 0
assetAvailability= availability === 'available' ? 1 : 0
prerequisiteReady= 前置资产全部 completed ? 1 : 0

alreadyCompleted = completedAssets.includes(id) ? 1 : 0
duplicatePenalty = activeAssignments.includes(id) ? 1 : 0
unavailablePenalty = availability !== 'available' ? 1 : 0
```

**并列打破**：优先级相同时依次比较 `primaryFit` → `assetAvailability` → 资产在目录中的固定顺序。禁止随机。

**可测试性要求**：`buildPath(input)` 为纯函数，同一 `PathInput` 必须产出字节级相同的 `GrowthPath`（用快照测试断言）。

---

# G. Level 映射（文档 ↔ 实现）

| V1.0 用语 | 实现标识 | 题数 | 入口 | 输出上限 |
|---|---|---:|---|---|
| `level_0` | `quick_faith_exploration_v1` | 10 | 网页 `discover.html` | 5 项初步状态；**不输出任何倾向与路径** |
| `level_1` | `CP_QUICK_V1.0` | 30 | App「事奉倾向画像 · 精简版」 | Top 3 + 12 维；路径**仅 now**（1 学习 + 1 实践 + 1 反馈） |
| `level_2` | `CP_STANDARD_V1.0` | 84 | App「Christian Profile · 完整版」 | 四层完整；路径 now + next + later |

---

# H. 重新评估后的路径处理（防止"我的计划没了"）

```
重新评估完成后：
  · status 为 accepted / active 的动作 → 全部保留，不作废
  · status 为 suggested 的 next / later → 全部丢弃并按新 Profile 重算
  · 若新的 Primary 与旧的不同 → 在路径卡显示一句：
    「你的主要倾向从「X」变为「Y」。已开始的内容保留，后续建议已按新结果更新。」
  · 倾向指数版本 +1，历史版本保留（V1.0 §16.3）
```

---

# I. 敏感边界的强制校验

V1.0 §12.3 列出的 7 类敏感场景，在数据模型中必须可判定，不能只靠自由文本：

```ts
type SafetyFlag =
  | 'severe_trauma' | 'self_harm' | 'marital_crisis'
  | 'minor_protection' | 'medical_mental' | 'financial_aid' | 'church_discipline';

interface PracticeTask {
  // ...
  safetyFlags: SafetyFlag[];
  requiresSupervision: boolean;   // safetyFlags 非空时必须为 true
}
```

**引擎硬规则**：`requiresSupervision === true` 的任务**不得进入自动推荐**，只能由导师/教会负责人在 Phase 4 手动指派。Phase 1 的 12 条任务中，条件性督导的 3 条（陪伴、劝勉、怜悯）以 safety 字段提示用户"出现以下情形立即转介"，而任务本身仍可推荐。

---

# J. 多语言

Phase 1 **只做简体中文**。路径文案、推荐理由、实践任务全部走中文常量。
四语言（英/韩/泰）在路径系统稳定后与官网同批处理，届时所有 `reasonText` 必须改为 i18n key，不得硬编码——因此 Phase 1 实现时**推荐理由必须由 `basis` 结构生成，而不是直接写死句子**，为将来多语言留出接口。

---

# K. 验收测试用例编号（对应 V1.0 §19 / §20 第四阶段）

| 编号 | 场景 | 层级 | 断言 |
|---|---|---|---|
| T-01 | 信仰基础弱但教导者倾向高 | 单元 | now 首项为根基课；倾向排序不受影响 |
| T-02 | Top 3 分数并列 | 单元 | 输出"多元事奉组合"，不指定唯一主倾向 |
| T-03 | level_1 且证据有限 | 单元 | `status === 'exploration'`，无 later |
| T-04 | 主推荐课程已完成 | 单元 | 该课不再出现，取次优先 |
| T-05 | 候选课程未开发 | 单元 | 只出现在 later，无学习入口 |
| T-06 | 用户拒绝当前推荐 | 单元 | 按 E.3 冷却规则处理 |
| T-07 | 存在导师反馈 | 单元 | 证据等级升至 E4，补强条件可触发 |
| T-08 | 潜在盲点但无额外证据 | 单元 | **不生成补强内容** |
| T-09 | 有越责或安全风险证据 | 单元 | `requiresSupervision` 任务不进自动推荐 |
| T-10 | 重新评估后路径变化 | 单元 | accepted/active 保留，suggested 重算 |
| T-11 | 同一输入两次调用 | 快照 | 输出字节级相同 |
| T-12 | 完成课程后 | 单元 | 倾向指数不变，仅学习证据 +1 |
| T-13 | 结果页渲染 | E2E | "现在开始"区域最多 1 个学习内容 |
| T-14 | 措辞检查 | 静态扫描 | 全仓无"诊断/复诊/你就是/神告诉我们" |
| T-15 | 课程计数 | 单元 | 现有课程恒为 67，候选内容不计入 |

---

# L. 建议修订 V1.0 的两处措辞

1. **§14.4**：「空课程页或 totalLessons: 0 的正式课程不得提供入口」→ 改为「`in_development` 的课程不得作为"现在开始"的入口，可在"稍后探索"显示并标注筹备中」。（理由见本文 A）
2. **§17 Phase 1 第 3 项**：「每次只输出 1 门现有课程 + 1 项实践 + 1 次反馈」→ 补充「反馈按本补充规范 D 节分 F1/F2/F3 三档，Phase 1 以 F1 为必需、F2 为建议」。

---

# M. Phase 0 待办（审计已完成，以下为可执行清单）

| # | 事项 | 文件 | 类型 | 状态 |
|---:|---|---|---|---|
| 1 | `learningBoost` 改为学习证据计数，不再加分 | `CustomTheologyView.tsx` | 行为变更 | ⏸ 待确认 |
| 2 | 恩赐题库/匹配算法移入 `legacy/` 目录，保留 `GiftsResult` 类型 | `CustomTheologyView.tsx` | 重构 | ⏸ 待确认（本轮已加 [LEGACY] 注释标记） |
| 3 | 文件头注释与同步服务注释去除"诊断/恩赐辨识" | 5 处 | 措辞 | ✅ 已完成 2026-08-31 |
| 4 | 课程加 `availability` 字段（派生默认值，未接线 UI） | `catalog.ts` | 数据 | ✅ 已完成 2026-08-31 |
| 5 | 课程 id 硬编码收敛到单一映射表 | 4 个文件 | 重构 | ⏸ 待确认 |
| 6 | `GROWTH_SYSTEM.md` 正文移入 Legacy 章节 | docs | 文档 | ✅ 已完成 2026-08-31 |
| 7 | 结果页课程列表改为 now/next/later 分层 | `ChristianProfileView.tsx` | UI | ⏸ 待确认 |

**第 3、4、6 项已于 2026-08-31 完成**（措辞、数据结构、旧文档），当前用户行为未改变。
**第 1、2、5、7 项会改变现有行为或调用方式，等待下一次确认后再动。**

## M.1 learningBoost 后续迁移方案（本轮不执行）

现状：`CustomTheologyView.tsx` 的 `learningBoost()` 为每门已完成的映射课程给对应九维 **+4 分（单维上限 +12）**，
写入 `portrait.entries[].score`，用于九维「信仰基础与装备画像」的条形展示。

问题：完成课程只能证明"接触过内容"，不能证明能力提高，因此会让九维显示分失真。
（**不污染 12 项事奉倾向**——倾向直接读取 `cp.ministryOrientation`。）

迁移方案：
1. 删除 `boost` 对分数的叠加，`score` 恢复为评估原始分；
2. 新增只读派生 `learningEvidence: { dimension, courseIds[] }[]`，在画像条目旁以「已完成 N 门相关课程」的**文字标记**呈现，不改变条形长度；
3. 九维分数只有**重新评估**才更新（对齐 V1.0 §2.3、§13.2）；
4. 档案完成度中的「学习佐证」权重保持不变（它统计的是证据，不是分数）；
5. 回归测试：T-12（完成课程后倾向指数与九维分数均不变，仅学习证据 +1）。
