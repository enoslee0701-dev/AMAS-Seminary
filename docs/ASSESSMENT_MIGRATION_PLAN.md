# ASSESSMENT MIGRATION PLAN

> 依据《AMAS Christian Profile Assessment System v1.0 — 产品、心理测量与开发规范》
> 执行日期：2026-08-27　状态：已实施（Development Edition）

---

## 1. 现状检查（规范 §101）

### Current Architecture
- `components/CustomTheologyView.tsx`：单文件承载九维“诊断”（背景 + 阶梯题）、恩赐辨识（12 题 → 8 恩赐）、角色卡、事奉匹配、服事记录、装备路径。
- `services/growthArchetypes.ts`：12 角色数据 + `rankArchetypes()`（恩赐 62% + **九维能力 38%**）。
- `public/discover.html`：10 题九维快照 → **直接输出 12 角色初步判定**。
- 后端：`/api/growth/state` 通用 JSON 文档存储（512KB，用户 JWT 归属）。

### Current Assessment Flow
背景 6 题 → 核心五维阶梯题（知识/应用/教导）→ 单题四维 → 九维分数 → （可选）恩赐 12 题 → 角色融合。

### Current Question Data
- 九维题库：以圣经知识、教义、释经流程、灵修频率、教会观、事奉参与为主 → 属于 **Faith Foundation + Discipleship + 少量 Readiness** 的混合。
- 恩赐 12 题：8 恩赐倾向 + 2 情境行为题。

### Current Scoring Logic
- 九维：加权平均（阶梯第二题 1.4 权重、处境 -5）。
- 角色：`0.62 × 恩赐加权 + 0.38 × 九维加权 + 服事加成`；无恩赐时 **100% 由九维推角色**。

### Current Result Logic
- 角色结果卡：主 × 辅组合命名、“初步判定”、融合分析（恩赐层/能力层/服事层）。
- 网页版：10 题即给出「开拓型代祷者」类结论。

### Affected Files
`components/CustomTheologyView.tsx`、`services/growthArchetypes.ts`、`components/ProfileView.tsx`、
`components/Dashboard.tsx`、`public/discover.html`、`docs/GROWTH_SYSTEM.md`。

### Migration Risks
- 已有用户的本地 `amas_ct_state_v2`（九维 + 恩赐 + 服事记录）必须保留，标记 legacy。
- 角色卡视觉资产（12 张卡图）保留，仅改语义：Type → Orientation Dimension。
- `/api/growth/state` 为整文档同步，新 Profile 需嵌入同一文档以免互相覆盖。

### 违反规范的点（必须修正）
| 违规 | 规范条款 | 处理 |
|---|---|---|
| 九维知识分参与角色评分 | §1、§15、§64 | 角色仅由 Ministry Orientation 题目评分，Faith Foundation 独立管线 |
| 10 题 → 12 角色结论 | §1、§9 Level 0 | 网页版改为「信仰成长快速探索」，只展示 5 项初步状态 |
| “诊断”“AI 诊断”措辞 | §3、§66 | 全部改为“评估 / 探索 / 画像” |
| 角色 = 类型、“你就是 X” | §6、§31–33 | 12 项独立维度；Top 3 + 全 12 维；相近分数提示多元组合 |
| Orientation 与 Readiness 混合 | §17–19 | 分开测量、分开展示、按矩阵解释 |
| 一个综合分 | §4 | 四层分别输出，不做总分 |
| 角色卡全是正面 | §36–37 | 每维含优势 / 典型贡献 / 盲点 / 成长方向 |

---

## 2. 迁移方案（规范 §102）

### 保留
- 12 张角色卡图、角色画廊、角色详情页（语义改为“事奉倾向维度”）。
- 九维题库 → 作为 **Faith Foundation / 装备画像** 的知识与应用测量继续使用（不再喂给角色）。
- 服事记录、事奉申请、学习反哺（作为 Evidence 层）。
- `/api/growth/state` 同步通道。

### 废弃
- `rankArchetypes()` 的九维参与、无恩赐时“按能力初判角色”。
- 恩赐辨识 12 题作为角色来源（数据保留为 `legacy`）。
- 网页版“初步角色判定”结果页。
- “诊断”措辞。

### 新增
- `services/christianProfile/`
  - `items.ts` — Item Bank：`CP_STANDARD_V1.0` 84 题（A12 / B12 / C36 / D12 / E12）+ Level 1 快速版 30 题子集；每题含 id/module/dimension/type/reverse_scored/status/version/cross_loading_risk/social_desirability_risk。
  - `scoring.ts` — deterministic scoring engine：四层独立管线、反向计分、0–100 内部指数、evidence_strength、response quality flags、Top 3 规则、Orientation × Readiness 矩阵、推荐规则、30/90/180 天成长计划。
  - `store.ts` — 会话自动保存/续答、Profile 快照与历史、版本标记（assessment/scoring/item/language）、嵌入 growth 文档同步。
- `components/ChristianProfileView.tsx` — 分阶段测评 UI（Step n of 6 · 预计剩余时间）、一题一页、撤销、自动保存、结果页 9 个 Section。
- 网页版 Level 0：`quick_faith_exploration_v1`，5 项初步状态 + 免责声明 + CTA。

### 数据兼容
- `amas_ct_state_v2` 文档新增字段 `christianProfile`（新 Profile）与 `legacy: true` 标记；旧字段保持可读。
- 旧“恩赐辨识”结果保留但不再用于角色。

### UI 迁移
- 定制化神学页：英雄区文案改为“认识你的信仰基础、成长状态、事奉倾向与下一步装备方向”；
  角色卡改为 Christian Profile 驱动；未完成时显示两个入口（快速事奉画像 30 题 / 标准 Christian Profile 84 题）。
- 个人档案页 / 首页入口：读取新 Profile 的 Primary Orientation。

---

## 3. 实施顺序（规范 §103）
1. Data Model（types）→ 2. Assessment Engine（items + session）→ 3. Scoring Engine → 4. Profile Model（store/versioning）→ 5. UI → 6. AI Interpretation（预留 JSON 接口，未配置 LLM 时不启用）。

## 4. 版本标签
- assessment_version：`CP_STANDARD_V1.0` / `CP_QUICK_V1.0` / `quick_faith_exploration_v1`
- scoring_version：`provisional_v1`
- item_version：1　language_version：`zh-CN`
- 产品标签：**AMAS Christian Profile · Development Edition**（未完成心理测量验证，不得宣称“标准化/科学验证”）。
