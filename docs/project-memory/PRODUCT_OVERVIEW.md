# Product Overview

**先读这一份，否则容易误判项目范围。**

`docs/project-memory/` 的其余文档目前偏重语音房间（那是最近几个阶段的工作），
但**这个 App 远不止语音房**。只读那些文件会以为这是个聊天室项目。

---

## 这是什么

**AMAS 亚洲宣教神学院** 的移动应用。
React 19 + Vite 6 + TypeScript，Capacitor 8 打包成 iOS / Android 原生壳，
配合一个 Express + better-sqlite3 的轻量后端。

### 两个仓库，分工明确

| | 仓库 | 职责 |
|---|---|---|
| **App**（本仓库） | `enoslee0701-dev/AMAS-Seminary` | 持续装备与成长 |
| **官网** | `enoslee0701-dev/amas-website` | 发现与招生 |

> **网站负责发现与招生，App 负责持续装备与成长。**

⚠️ **`discover.html` 在两个仓库里都有。**
官网版本是 **Source of Truth**，App 里的 `public/discover.html` 只是**集成副本**。
改动必须先在官网仓库完成再同步过来，**两边都要改**（含四语横幅文案），
否则会漂移 —— 2026-08 发生过一次，用户立刻发现了，因为官网是访客看到的东西。

官网仓库在本机 `C:\Users\enosl\Desktop\AMAS-website`（独立 git 仓库，分支是 `master` 不是 `main`）。

---

## 主要模块

| 模块 | 入口组件 | 说明 |
|---|---|---|
| 首页 | `Dashboard.tsx` | 招生信息、快捷入口、精选课程、公告 |
| **定制化神学** | `ChristianProfileView.tsx` | **产品核心之一**，见下 |
| 课程 | `CoursesView.tsx` / `CourseDetailView.tsx` | 列表、详情、收藏、进度 |
| 口袋神学 | `PocketTheology/` | 独立子模块 |
| 神学院 | `College/` | 招生、课程路径、FAQ、学科介绍 |
| 校友圈 | `CommunityView.tsx` / `community/` | 动态流、私聊、通讯录、代祷墙、**语音房入口** |
| 语音房 | `VoiceRoom/` | 五个公共房间，最近几个阶段的主战场 |
| 图书馆 | `LibraryView.tsx` | 资源浏览 |
| 同工 | `CooperationView.tsx` | 奉献同工 |
| 我的 | `ProfileView.tsx` | 个人档案、成长状态 |
| AI 客服 | `AIServiceChat.tsx` | 依赖 Gemini |

其它：`GlobalSearch` · `AnnouncementsView` · `AuthView` · `SplashView` ·
`OfflineNotice` · `ErrorBoundary` · `TrialCoursesView`。

---

## ⚠️ Christian Profile（定制化神学）—— 有独立的铁律

这是产品核心，**改动前必须先读**
[`docs/CHRISTIAN_PROFILE_SPEC.md`](../CHRISTIAN_PROFILE_SPEC.md) 的「§1 产品定位与铁律」。

该规格由 `backend/scripts/gen-profile-spec.ts` **从代码自动导出**，
改题后要重新生成，保证文档与 App 一致。

九条铁律的要点（**不是建议，是硬约束**）：

```
1. 四层分别测量、分别呈现，永远不合成一个总分
   A 信仰基础 / B 门徒生命 / C 事奉倾向 / D 事奉准备度

2. 信仰知识、灵修实践、事奉经验 永远不进入 12 项事奉倾向的计算
   倾向只由 C 类（Likert/频率）+ D 类（情境）决定

3. 12 个「角色」不是 12 种互斥类型，而是 12 项独立维度
   每个人都有全部 12 项，只是强弱组合不同
   永远呈现 Top 3 + 全 12 维，不说「你就是 X」

4. 评分是确定性引擎（同样答案永远同样结果）
   AI 只能解释与推荐，不能打分、不能改分

5. 网页版 10 题（Level 0）只输出 5 项初步状态，不判定任何倾向

6. 措辞只用「评估 / 探索 / 画像 / 呈现倾向 / 建议尝试」
   禁用「诊断」「你就是」「你不适合」「神告诉我们」

7. 每项倾向必须平衡解读：优势 + 贡献 + 盲点 + 成长方向；不用红绿表好坏

8. 进度按阶段显示（Step n of 6），不显示 38/84，不显示时长估计

9. 未经样本验证前标注 Development Edition
   不得宣称「科学验证 / 标准化 / 准确率」
```

**为什么这些是硬约束**：用户明确否决过早期的「10 题 → 12 角色」与
「九维 38% 进角色」设计，理由是那不构成有效测量。

三个层级：

| 层级 | 名称 | 题数 | 输出 |
|---|---|---|---|
| Level 0 | 信仰成长快速探索（官网 discover.html） | 10 | 5 项初步状态，**不输出倾向** |
| Level 1 | 事奉倾向画像 · 精简版（App） | 30 | 12 项倾向指数 + Top 3 + 平衡解读 |
| Level 2 | Christian Profile · 完整版（App） | 84 | 以上 + 信仰基础/门徒生命/准备度矩阵 |

12 项事奉倾向：
`教导者 · 研道者 · 装备者 · 牧养者 · 劝勉者 · 怜悯者 · 代祷者 · 传福音者 · 差传者 · 领袖者 · 建造者 · 服事者`

实现在 `services/christianProfile/`（`items` `scoring` `evidence` `experiments` `store`）
与 `components/ChristianProfileView.tsx`。相关文档：
[ASSESSMENT_MIGRATION_PLAN.md](../ASSESSMENT_MIGRATION_PLAN.md) ·
[GROWTH_SYSTEM.md](../GROWTH_SYSTEM.md) ·
[PATH_SYSTEM_SUPPLEMENT_V1.1.md](../PATH_SYSTEM_SUPPLEMENT_V1.1.md) ·
[ROLE_COURSE_DESIGN.md](../ROLE_COURSE_DESIGN.md)

**卡图素材**：12 张 1024×1536 PNG 原图在桌面 `AMAS开发资料/`（中文命名），
仓库里 `public/images/archetypes/` 是 800×1200 的 JPG 压缩派生版。
要高清版本（印刷、改设计）必须回到原图，仓库里的回不去。

---

## 语音房（最近几个阶段的主战场）

五个内置公共房间，`host_id = 'system'`，永远没有真人房主：

```
prayer_room      祷告室    功能最完整：主题 / 分享墙 / 祷告会 / 历史沉淀
bible_reading    读经室    全本和合本离线阅读 + 共享阅读位置（P1-2）
preaching_room   讲道室    真实录音（MediaRecorder → 后端落库）
praise_room      赞美室    目前只有推荐诗歌清单，无音频（P2 待版权）
fellowship_room  交通室    目前只有背景色，无专属功能（P1-3 NEXT）
```

祷告室的完整演进见 `docs/PRAYER_*` 系列（Redesign → SEC-1/2/3 →
Phase 2/2.5/3/4/4B/4B-R → Phase 5），共 13 份报告。

---

## 关键外部依赖

| 依赖 | 用途 | 当前状态 |
|---|---|---|
| `GEMINI_API_KEY` | AI 牧者、AI 客服 | **未配置** —— WebSocket 握手必然失败，验证脚本会把它列为已知无关报错 |
| LiveKit（`LIVEKIT_URL/API_KEY/API_SECRET`） | 实时语音 | **未配置** —— token 端点返回 503，无 fallback |
| `public/scripture/cuv.json` | 和合本全书（66 卷 31,103 节，3.3 MB） | 已就位，离线可用 |
| APNs / 推送 | 通知 | 未配置时相关接口仍正常返回 |

**所有 secret 只存在 backend。** 禁止 `VITE_*` 暴露任何 API secret。
本目录只记录「某能力依赖哪一类 secret」，不记录 secret 本身。
