// Generates docs/CHRISTIAN_PROFILE_SPEC.md from the live item bank / archetypes / catalog so the
// document can never drift from what the App actually runs.
// Run from backend/:  node node_modules/tsx/dist/cli.mjs scripts/gen-profile-spec.ts
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ITEM_BANK, buildStages, ORIENTATION_KEYS, FAITH_FACET_LABEL, PRACTICE_LABEL, READINESS_LABEL,
  ASSESSMENT_VERSIONS, SCORING_VERSION,
} from '../../services/christianProfile/items';
import { ARCHETYPES_BASE, ARCH_GROUPS, ARCH_DISCLAIMER } from '../../services/growthArchetypes';
import { OFFICIAL_CATALOG } from '../../services/catalog';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../docs/CHRISTIAN_PROFILE_SPEC.md');

const L: string[] = [];
const p = (s = '') => L.push(s);
const title = (id: string) => OFFICIAL_CATALOG.find(c => c.id === id)?.title ?? id;
const dimLabel: Record<string, string> = { ...FAITH_FACET_LABEL, ...PRACTICE_LABEL, ...READINESS_LABEL };
for (const a of ARCHETYPES_BASE) dimLabel[a.key] = a.label;

p('# AMAS 定制化神学 · Christian Profile 完整规格（内容 + 规则 + 12 项事奉倾向呈现）');
p();
p(`> 版本：题库 ${ASSESSMENT_VERSIONS.standard} / ${ASSESSMENT_VERSIONS.quick} · 评分 ${SCORING_VERSION} · 语言 zh-CN · **Development Edition**（尚未完成心理测量验证）`);
p('> 本文档由 `backend/scripts/gen-profile-spec.ts` 从代码自动导出（题库、角色、目录），保证与 App 一致；改题后重新生成即可。');
p();
p('---');
p('## 1. 产品定位与铁律');
p();
p('**产品名**：AMAS Christian Profile（基督徒成长与事奉画像）。App 内入口叫「定制化神学」。');
p();
p('**铁律（来自《AMAS Christian Profile Assessment System v1.0》规范）**');
p();
p('1. 四层分别测量、分别呈现，**永远不合成一个总分**：A 信仰基础 / B 门徒生命 / C 事奉倾向 / D 事奉准备度。');
p('2. 信仰知识、灵修实践、事奉经验 **永远不进入** 12 项事奉倾向的计算；倾向只由 C 类（Likert/频率）+ D 类（情境）题目决定。');
p('3. 12 个“角色”不是 12 种互斥类型，而是 **12 项独立的事奉倾向维度**：每个人都有全部 12 项，只是强弱组合不同。结果永远呈现 Top 3 + 全 12 维，不说“你就是 X”。');
p('4. 评分是**确定性引擎**（同样答案永远同样结果）；AI 只能做解释与推荐，不能打分、不能改分。');
p('5. 网页版 10 题只做「信仰成长快速探索」（Level 0），只输出 5 项初步状态，**不判定任何倾向**。');
p('6. 措辞：只用“评估 / 探索 / 画像 / 呈现倾向 / 建议尝试”，不用“诊断”“你就是”“你不适合”“神告诉我们”。');
p('7. 每项倾向必须平衡解读：潜在优势 + 典型贡献 + 可能的盲点 + 成长方向；不用红绿表示好坏。');
p('8. 进度按阶段显示（Step n of 6），不显示 38/84，不显示时长估计；每题自动保存、可退出续答、可撤销上一题。');
p('9. 未经样本验证前标注 Development Edition，不得宣称“科学验证 / 标准化 / 准确率”。');
p();
p('---');
p('## 2. 三个层级的测评');
p();
p('| 层级 | 名称（用户可见） | 题数 | 内容 | 输出 |');
p('|---|---|---|---|---|');
p('| Level 0 | 信仰成长快速探索（网页版 discover.html） | 10 | 圣经熟悉度 2 / 基础教义 2 / 灵修实践 2 / 事奉参与 2 / 门训意识 2 | 5 项初步状态（稳定/较稳定/发展中/需要建立）+ 一条下一步建议；不输出倾向 |');
p('| Level 1 | 事奉倾向画像 · 精简版（App） | 30 | C 类 24（每维 2 题）+ D 类情境 6 | 12 项倾向指数、Top 3、组合标签、平衡解读、建议侍奉/课程/计划；标注“精简版” |');
p('| Level 2 | Christian Profile · 完整版（App） | 84 | A 12 / B 12 / C 36 / D 12 / E 12，分 6 个阶段 | 以上 + 信仰基础、门徒生命、事奉准备度、倾向×准备度矩阵解读 |');
p();
p('**完整版 6 个阶段**（阶段标题与引导语原文）：');
p();
for (const [i, s] of buildStages('standard').entries()) p(`${i + 1}. **${s.title}**（${s.items.length} 题）— ${s.intro}`);
p();
p('精简版 2 个阶段：' + buildStages('quick').map(s => `**${s.title}**（${s.items.length} 题）`).join('、'));
p();
p('**答题体验规则**：一题一页；顶部显示“Step n of 6 · 阶段标题”与阶段进度条；每题下方「上一题」可撤销；左上角 ✕ 退出并保存会话，下次进入可「继续上次未完成的评估」或「重新开始」；作答前有知情说明页（这是什么 / 为什么测 / 结果如何使用 / 不是用来做什么）。');
p();
p('---');
p('## 3. 题库全文（84 题）');
p();
p('说明：`[R]` = 反向计分题（1↔5）；`[Q]` = 进入精简版；A 类为知识题（有正确答案，仅用于装备建议，不向用户揭示对错）；D 类四个选项都是合理行为，各映射一项倾向；E 类为事实题。');
p();
type Item = (typeof ITEM_BANK)[number];
const groups: [string, string, (i: Item) => string][] = [
  ['faith_foundation', 'A · 信仰基础（Faith Foundation，12 题，知识题）', i => `维度：${dimLabel[i.dimension!]}`],
  ['discipleship', 'B · 门徒生命（Discipleship Practice，12 题，过去一个月的频率：几乎从不 / 很少 / 有时 / 经常 / 几乎总是）', i => `实践：${dimLabel[i.dimension!]}`],
  ['ministry_orientation', 'C · 事奉倾向（Ministry Orientation，36 题 = 12 维 × 3；频率题选项同上，符合度题：很不符合 / 不太符合 / 一般 / 比较符合 / 非常符合）',
    i => `维度：${dimLabel[i.dimension!]}${i.type === 'frequency' ? '（频率题）' : '（符合度题）'}${i.tag ? ` · 解释标签：${i.tag}` : ''}${i.cross_loading_risk?.length ? ` · 交叉负荷风险：${i.cross_loading_risk.map(k => dimLabel[k]).join('/')}` : ''}`],
  ['scenario', 'D · 情境判断（Situational Scenarios，12 题）', () => ''],
  ['readiness', 'E · 事奉准备度（Ministry Readiness，12 题，事实题）', i => `面向：${dimLabel[i.dimension!]}`],
];
for (const [mod, heading, meta] of groups) {
  p(`### ${heading}`); p();
  for (const it of ITEM_BANK.filter(i => i.module === mod)) {
    const flags = `${it.reverse_scored ? ' [R]' : ''}${it.quick ? ' [Q]' : ''}`;
    p(`**${it.id}**${flags}　${it.text}`);
    const m = meta(it); if (m) p(`　　${m}`);
    if (mod === 'faith_foundation') p('　　选项：' + it.options.map(o => `${o.text}${o.correct ? '（✓）' : ''}`).join(' / '));
    else if (mod === 'scenario') for (const o of it.options) p(`　　- ${o.text} → **${dimLabel[o.dimension!]}**`);
    else if (mod === 'readiness') p('　　选项：' + it.options.map(o => o.text).join(' / '));
    p();
  }
}
p('---');
p('## 4. 评分规则（deterministic · provisional_v1）');
p();
p('### 4.1 通用');
p('- 量表值 v∈1–5 → 内部指数 (v−1)/4×100；反向题先做 v→6−v。');
p('- 0–100 是**内部指数**，不是百分位；84 分不等于超过 84% 的人。');
p('- 缺答的题目不计入均值；不会产生 NaN。');
p();
p('### 4.2 C+D → 12 项事奉倾向（唯一进入倾向评分的模块）');
p('- 每一维：Likert 指数 = 该维 3 题（精简版 2 题）指数的平均。');
p('- 情境指数 = 该维在情境题里“被选中次数 ÷ 被提供次数” × 100。');
p('- 维度指数 = 0.8 × Likert 指数 + 0.2 × 情境指数（该维未在情境中出现时 = Likert 指数）。');
p('- 各维独立计分，**不归一化为总和 100%**。');
p('- **倾向指数与证据可信度是两个独立维度**（V2）：指数回答「这个方向表现得有多明显」，');
p('  可信度回答「系统凭什么这样判断」。两者不可互相换算，也不可合并成一个数字展示。');
p('- 证据可信度四档：较低 / 中等 / 较高 / 高。只有测评 + 情境题时**最高只能到中等**，无论指数多高；');
p('  出现任一外部证据（课程完成 / 实际服侍）→ 较高；出现他人观察（导师 / 同伴反馈）→ 高。');
p('- 整份画像的可信度 = Top 3 的**中位数**（取最低值会被第三位单方面拖垮）；任一 Top 倾向被反证时再降一档；');
p('  作答质量标记 ≥2 时每维与整体各降一档。');
p();
p('### 4.10 证据模型（Evidence Model V2.1）——系统凭什么这样判断，以及何时修正自己');
p();
p('每一条证据必须回答三个问题，否则不进入计算：');
p();
p('| 字段 | 含义 | 约束 |');
p('|---|---|---|');
p('| `targetOrientations` | 这条证据在验证**哪几项**事奉倾向 | **不允许为空**。无目标的证据一律丢弃，杜绝「全局证据池」——完成一门无关课程不会抬高任何倾向的可信度 |');
p('| `polarity` | 支持 support / 中性 neutral / **反证 challenge** | 反证是 V2.1 新增，使系统具备修正自己的能力 |');
p('| `strength` | weak / moderate / strong | 决定支持与反证相抵时谁占上风（权重 1 / 2 / 3） |');
p('| `source` | self / peer / mentor / system | 只有 peer 与 mentor 属于「他人的观察」，才能把可信度推到「高」 |');
p('| `observedAt` / `createdAt` | 事情发生时间 / 记录时间 | 两者分开，便于日后按真实时间线重排 |');
p();
p('**反证如何修正判断**（这是 V2.1 的核心）：');
p();
p('- 反证权重 ≥ 支持权重 → `contradicted`：该维可信度**直接压到「较低」**，结果页顶部显示「这份画像需要重新验证」，并说明系统不会因为分数高就坚持原判断；');
p('- 存在反证但支持更多 → `mixed`：可信度降一档，不允许停留在「高」。');
p('- 无论哪种情况，**倾向指数都不变**。被修正的是「系统有多确信」，不是分数本身。');
p();
p('**证据日志**：只追加，不覆盖、不删除。重新评估只清当前画像，历史快照与证据日志一律保留——');
p('这样后来发生的事才能回过头检验当初的测评结论。');
p();
p('**「我愿意尝试」**写入一条 `verification_intent` 证据（neutral / weak）：只表示打算去验证，**不构成支持证据**，因此不提升任何可信度；');
p('真正的证据要等实际服侍或反馈回来才产生。意向跨评估保留。');
p();
p('**判断依据面板的四态**：支持 / 中性 / 反证 / 暂无（V2 只有 强·有·无，无法表达反证）。红色只表示「与当前判断冲突」，不表示属灵上的好坏。');
p();
p('**画像版本号**：按 `completedAt` 幂等——同一次评估重复保存不会虚增 V 号，也不会重复写入历史。');
p();
p('### 4.11 验证闭环（Validation Loop，P2-A）');
p();
p('**先修正一个概念错误**：「我愿意尝试」曾被写成 `verification_intent` 证据。');
p('虽然用 neutral/weak 保证了它不影响可信度，但概念上仍然错位——Evidence 描述**已经发生并被观察到的事实**，');
p('而「打算去做」属于 Intent / Task / Workflow State。从 P2-A 起它进入独立的 `ValidationExperiment` 实体，');
p('**不再写入 Evidence**；旧的 verification_intent 记录仍可读取（自动显示为「待开始」的实验），只是不再新增。');
p();
p('**闭环**：登记实验 → 实践 → 自我复盘 → 导师／同工观察（可选）→ 生成证据 → 回到画像复核。');
p();
p('| 阶段 | 状态 | 允许迁移到 |');
p('|---|---|---|');
p('| 登记 | `not_started` | active / cancelled |');
p('| 实践中 | `active` | completed / cancelled |');
p('| 待复盘 | `completed` | reviewed（**必须先有复盘**）/ active / cancelled |');
p('| 已复核 | `reviewed` | 终态，不可回退（历史只追加） |');
p('| 已取消 | `cancelled` | 终态，不产出证据 |');
p();
p('**复盘结论 → 证据极性**（这是画像被现实修正的唯一入口）：');
p();
p('| 复盘结论 | 极性 | 效果 |');
p('|---|---|---|');
p('| 验证成立 | support | 该倾向可信度升到「较高」 |');
p('| 部分成立 | neutral | 记录事实，不推高可信度 |');
p('| **未能验证** | **challenge** | 触发 V2.1 冲突逻辑：可信度压到「较低」，结果页提示重新验证 |');
p();
p('措辞铁律：「未能验证」不等于失败，也不等于这个方向不适合你——它只说明当前证据不支持。');
p('页面原文：「这不是失败——它是一条真实证据，会让画像更准确。」');
p();
p('**导师观察的诚实性约束**：由用户本人转述的反馈记为 `verified: false`，生成证据时 `source` 记为 `self`，');
p('因此**不算他人观察**，可信度上限停在「较高」，不能到「高」。只有通过导师端确认的观察才是真正的他人证据。');
p('（完整牧者后台不在本轮范围，此约束保证在后台就绪前不会出现虚高的可信度。）');
p();
p('**不变量**：实验产出的证据仍然只影响证据可信度，**不改动任何倾向指数**。');
p('- 可解释性：用户在该维答“比较符合/经常”以上的题目，其解释标签被记录为“为什么这一维较高”的来源；不展示权重。');
p();
p('### 4.3 A → 信仰基础');
p('- 4 个面向（圣经理解 / 福音理解 / 基础教义 / 教会与门徒生活）各 3 题，按正确率计 0–100；整体 = 四面向平均。仅用于装备建议。');
p();
p('### 4.4 B → 门徒生命');
p('- 8 项实践（读经、祷告、敬拜、团契、顺服实践、服事、奉献、见证）按频率指数平均；状态等级：≥75 稳定 / ≥55 较稳定 / ≥35 发展中 / 其余 需要建立。措辞是“当前实践状态”，不是属灵价值评价。');
p();
p('### 4.5 E → 事奉准备度');
p('- 8 个面向（实际经验、持续性、责任承担、接受装备、导师反馈、团队配搭、带领经验、实践证据）各 1–2 题；整体 = 面向平均；等级：≥70 较充分 / ≥45 发展中 / 其余 起步阶段。');
p();
p('### 4.6 Top 3 与组合标签');
p('- 12 维按指数降序，取 Primary / Secondary / Supporting。');
p('- 若第 1 与第 3 名相差 ≤3 分 → 标记「多元事奉组合」，不强行命名单一主倾向。');
p('- 组合标签 = 次要倾向的修饰形 + 主要倾向名（如「装备型教导者」「劝勉型牧养者」）。**组合标签只是解释用语，不是新类型。**');
p();
p('### 4.7 倾向 × 准备度矩阵（完整版）');
p('| 主倾向指数 | 准备度 | 解读 |');
p('|---|---|---|');
p('| ≥70 | <50 | 倾向明显但训练与实践证据仍在建立——建议进入装备阶段，而不是立即承担更大责任 |');
p('| ≥70 | ≥70 | 倾向明显、准备度充分——可与牧者/导师讨论扩大事奉责任 |');
p('| <50 | ≥70 | 有经验但当前工作未必是最自然的方向——值得与导师深入讨论 |');
p('| 其他 | 其他 | 方向形成中——在实践与群体反馈中继续观察 |');
p();
p('### 4.8 作答质量标记（只降低解释强度，绝不屏蔽用户）');
p('- `too_fast`：≥10 题时中位作答时间 <1.2 秒；`straight_lining`：≥12 道量表题中 ≥90% 选同一选项；`high_inconsistency`：≥3 个维度的反向题与正向题差距 >50；`missing_items`：有题未答。');
p('- 整体证据强度：≥2 个标记 → 有限；精简版或 1 个标记 → 中等；完整版且无标记 → 充分。结果页用一句话说明“本次作答……因此更适合作为探索参考”。');
p();
p('### 4.9 推荐引擎（规则式）');
p('- 推荐验证场景 = 主倾向常见侍奉前 4 + 次要倾向前 2（去重）。措辞固定为“建议尝试 / 验证场景”，不得表述为职位安排。');
p('- 装备重点先于课程：先说明「为什么建议这些内容」，再分三档给课（优先学习 / 推荐学习 / 后续可学习），避免一次给太多。');
p('- 若信仰基础整体 <60，前置「认识圣经」「基督徒生活基础」并把“信仰基础与圣经整体脉络”列为装备重点。');
p('- 完成课程只增加学习证据（提升可信度），**不会提高任何倾向指数**；指数只有重新评估才更新。');
p('- 若准备度整体 <50，前置“寻找一位导师或牧者，约定每月一次服事反馈”；导师反馈面向 <40 再加“邀请牧者观察一次服事并反馈”。');
p('- 成长计划为**成长实验**结构，每阶段含四段：成长目标 / 行动 / 验证指标 / 新增证据。');
p('  30 天验证能力是否成立、90 天进入真实服侍接受检验、6 个月重新生成画像并对比两版差异。');
p();
p('**各倾向的课程映射（按最终 67 门目录）**');
p();
const COURSES_BY: Record<string, string[]> = {
  teacher: ['c_dr_marking', 'c_homiletics', 'c_lay_systematic'], explorer: ['c_dr_marking', 'c_greek', 'c_bible_geography'],
  equipper: ['c_disciple', 'c_sunday_school', 'c_newbeliever'], shepherd: ['c_counseling', 'c_disciple', 'c_smallgroup'],
  encourager: ['c_counseling', 'c_assurance', 'c_disciple'], mercy: ['c_counseling', 'c_healing_inner', 'c_basics'],
  intercessor: ['c_prayer', 'c_warfare', 'c_worship_studies'], evangelist: ['c_evangelism', 'c_romans', 'c_newbeliever'],
  missionary: ['c_contextual', 'c_islam', 'c_comparative_religion'], leader: ['c_church_ops', 'c_smallgroup', 'c_lay_systematic'],
  builder: ['c_church_ops', 'c_worship_order', 'c_smallgroup'], servant: ['c_church_ops', 'c_basics', 'c_worship_order'],
};
p('| 倾向 | 建议课程 |'); p('|---|---|');
for (const k of ORIENTATION_KEYS) p(`| ${dimLabel[k]} | ${COURSES_BY[k].map(title).join('、')} |`);
p();
p('---');
p('## 5. 12 项事奉倾向（完整定义）');
p();
p('四大群组：' + ARCH_GROUPS.map(g => `**${g.en} ${g.cn}**（${g.q}）`).join('；'));
p();
for (const [i, a] of ARCHETYPES_BASE.entries()) {
  const g = ARCH_GROUPS.find(x => x.key === a.group)!;
  p(`### ${String(i + 1).padStart(2, '0')} ${a.label} · ${a.en}`);
  p(`- 群组：${g.en} ${g.cn}　· 组合修饰形：${a.mod}　· 卡图：\`public/images/archetypes/arch_${a.key}.jpg\``);
  p(`- 一句定义：${a.core}`);
  p(`- 潜在优势：${a.strengths.join('、')}`);
  p(`- 典型贡献（常见侍奉）：${a.ministries.join('、')}`);
  p(`- 可能的盲点 / 成长提醒：${a.risks.join('；')}`);
  p(`- 装备方向：${a.equip.join('、')}`);
  p();
}
p('**容易混淆的维度与区分**：教导者 vs 研道者（传递 vs 探索）；教导者 vs 装备者（让人明白 vs 让人会做）；牧养者 vs 怜悯者（长期关系 vs 现实苦难）；牧养者 vs 劝勉者（陪伴 vs 激励）；领袖者 vs 建造者（带人 vs 建系统）；服事者 vs 怜悯者（完成需要 vs 回应苦难）；传福音者 vs 差传者（福音表达 vs 跨文化开拓）；装备者 vs 领袖者（培育人 vs 动员团队）；代祷者 vs 牧养者（属灵守望 vs 关系陪伴）。');
p();
p('---');
p('## 6. 结果呈现（App）');
p();
p('### 6.1 结果页（9 个 Section + 附加）');
p('1. **你的 Christian Profile**：深蓝金字头卡：组合标签（或「多元事奉组合」）、英文倾向名、一句总结（“你目前呈现较明显的「X–Y」倾向：…”）、精简版/完整版标记、结果证据强度。');
p('2. **你最明显的三项事奉倾向**：PRIMARY / SECONDARY / SUPPORTING 三张卡图 + 指数 + 群组 + 该维证据强度；下方主倾向的**平衡解读**（潜在优势 / 典型贡献 / 可能的盲点 / 成长方向）+ “为什么这一维较高：主要来自…”。');
p('3. **12 项事奉倾向**：横向条形图（默认前 6，可展开全部 12），每条带证据强度；注明“每项独立计分，0–100 为内部指数”。');
p('4. **你的信仰基础**（完整版）：4 面向条形 + 整体；注明不参与倾向计算。');
p('5. **你的门徒生命状态**（完整版）：8 项实践状态标签（稳定/较稳定/发展中/需要建立），中性配色。');
p('6. **事奉准备度**（完整版）：倾向（明显/形成中/尚不明显）与准备度（较充分/发展中/起步）并列 + 8 面向条形 + 矩阵解读。');
p('7. **推荐验证场景**（原「建议尝试的侍奉」）：不是职位安排，而是可验证倾向的真实环境；每项带「我愿意尝试」意向记录；涉及教导/牧养/带领的场景提示先与牧者沟通。');
p('8. **建议课程与装备重点**：课程按钮直达课程页。');
p('9. **你的成长计划**：30 天 / 90 天 / 6 个月。');
p('- 附加：作答质量说明、历史演变（V1 → V2 …，注明分数变化可能来自真实成长、理解变化或量表版本变化）、「回到成长档案」/「重新评估」、免责声明、版本号与 Development Edition 标签。');
p();
p('### 6.2 「定制化神学」页内的呈现');
p('- **我的 Christian Profile 卡**：未评估 → 两个入口（事奉倾向画像·精简版 30 题 / Christian Profile·完整版 84 题）；已评估 → 组合标签 + Top 3 卡图与指数 + 矩阵解读一句 + 「查看完整结果」/「完成完整版」按钮 + 右上角「重新评估」「删除结果」+ 评估时间。卡内下半部分是 12 项倾向画廊（横向滑动，点卡进入倾向说明页）。');
p('- **倾向说明页**：卡图 + 一句定义 + 常见优势 + 盲点 + 侍奉 + 装备方向；已评估时显示“你在这一维度的当前指数与排名”；上一个/下一个与 12 缩略图切换。');
p('- **我的成长档案完成度**：背景与处境 15% + 信仰基础与装备画像（九维）35% + Christian Profile 20% + 学习佐证 15% + 服事验证 15%。');
p('- **推荐验证场景**卡：来自 Top 3 倾向的常见侍奉，可记录「我愿意尝试」意向；涉及教导/牧养/带领的场景需先与牧者沟通。');
p('- **服事记录**：每条记录归属某一项倾向，作为 Evidence 层，提升证据强度与档案完成度。');
p('- 首页「定制化神学」板块与「我的」页显示当前组合标签、主要/次要倾向；未评估时显示入口。');
p();
p('### 6.3 网页版（Level 0）');
p('- 着陆页：精简入口条 + 12 项倾向画廊（可看说明，优势可见，盲点/侍奉/装备方向锁定并引导 App）+ 对比卡（网页快速探索 vs App Christian Profile）。');
p('- 结果页：5 项初步状态条形 + 等级 + 一条下一步建议 + “在 App 中你会看到…”清单 + Level 0 免责声明；跳转 App 时携带 `assessment=quick-faith-v1` 与 `areas`（5 项状态），不含任何倾向判定。');
p();
p('---');
p('## 7. 数据、版本与存储');
p();
p(`- 版本标记：assessment_version（${ASSESSMENT_VERSIONS.standard} / ${ASSESSMENT_VERSIONS.quick} / quick_faith_exploration_v1）、scoring_version（${SCORING_VERSION}）、item_version（1）、language_version（zh-CN）。`);
p('- 题目状态：draft → expert_review → pilot → active → retired；当前全部为 pilot。改题必须升版本，历史结果不重算。');
p('- 会话：`amas_cp_session_v1`（每题自动保存：题号、选项、作答时长、时间戳）。');
p('- Profile：嵌入成长档案文档 `amas_ct_state_v2.christianProfile`，通过 `/api/growth/state` 跨设备同步（较新者胜）；`profileHistory` 只追加，最多保留 12 条；旧的九维/恩赐数据保留并标记 legacy。');
p('- Profile JSON：profileVersion, assessmentVersion, scoringVersion, level, completedAt, faithFoundation?, discipleshipPractice?, ministryOrientation{12×{rawScore, normalizedScore, evidenceStrength, itemsAnswered}}, ministryReadiness?, topOrientations[3], multiBlend, combinedLabel, orientationReadiness?, qualityFlags[], evidenceStrength, explanations, recommendations{ministriesToTry, courseIds, practices, equippingFocus, growthPlan}。');
p('- AI 解释层（预留）：只接收上述 JSON，负责解释/个性化表达/推荐，不得改分、不得称神直接启示、不得把指数说成属灵价值、不得把倾向说成永久身份，证据有限时必须表达不确定。');
p();
p('---');
p('## 8. 固定文案');
p();
p('**知情说明（评估前）**：这是什么 / 为什么测 / 结果如何使用 / 不是用来做什么（不衡量属灵价值，不判定教会职分或呼召，不替代圣经、祷告、教会群体与牧者的长期辨识）。');
p();
p('**评估声明（答题页常驻）**：本评估依据 AMAS 神学与门训框架设计，帮助你认识当前的信仰基础、成长状态与装备需要。结果用于成长与装备参考，不作为个人价值、属灵程度或教会任职资格的判断。');
p();
p('**结果页免责声明**：AMAS Christian Profile 旨在帮助基督徒认识自己的信仰基础、成长实践、事奉倾向和装备需要。评估结果属于发展性参考，不用于衡量个人属灵价值，也不替代圣经、祷告、教会群体、牧者或导师的长期辨识。事奉方向应在真实生命、群体关系与持续实践中进一步确认。');
p();
p(`**倾向声明**：${ARCH_DISCLAIMER}`);
p();
p('**Level 0 免责声明**：这是基于少量问题形成的初步探索结果，不代表完整 Christian Profile。完成标准评估后，系统将使用更多行为、情境和实践信息生成更稳定的成长档案。');
p();
p('---');
p('## 9. 自检清单（每次改动评估系统前）');
p();
p('- [ ] 是否有知识题变成了倾向题？→ 拒绝');
p('- [ ] 是否让少量题目直接决定倾向？→ 拒绝');
p('- [ ] AI 是否能改分？→ 拒绝');
p('- [ ] 是否存在“正确答案 = 更属灵”的倾向题？→ 重写');
p('- [ ] 是否把用户固定成一种类型？→ 改为维度组合');
p('- [ ] 倾向与准备度是否混在一起？→ 分离');
p('- [ ] 是否宣称了未验证的科学准确率？→ 删除');
p('- [ ] 测完是否能进入成长路径（课程/实践/证据/反馈/更新）？→ 否则闭环未完成');

writeFileSync(OUT, L.join('\n') + '\n');
console.log('written', OUT, L.length, 'lines');
