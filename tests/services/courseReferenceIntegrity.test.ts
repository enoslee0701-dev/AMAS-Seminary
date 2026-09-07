// 课程引用完整性闸门（RB-01 / DB-6.1 TASK 4）
//
// 守住的东西：**生产代码里任何被当作 canonical course ID 使用的字面量，
// 都必须真的存在于 OFFICIAL_CATALOG**。
//
// 为什么需要它：DB-6 发现 `CustomTheologyView.tsx` 的场景推荐里挂着 `c_healing` ——
// 一个已退役、两侧目录都不存在的课程 ID。它被渲染成 `onCourseClick` 按钮，
// 是**可导航目标**；只因 `courseById()` 找不到、被 `.filter(Boolean)` 丢掉，
// 才没有在界面上炸出来。这类错误不会报错、不会崩溃，只会**静默少一张卡片**，
// 靠人眼审查发现不了。
//
// 这个闸门是**通用的**，不是给 `c_healing` 写的一次性特判：
// 以后任何人写下 `courseId: 'abc_that_does_not_exist'`，这里就变红。
//
// 扫描范围只包含 active production source。刻意**排除**：
//   - `RETIRED_COURSE_IDS` 声明本身（它就是用来记录已退役 ID 的，不是 active 引用）
//   - 测试、脚本、后端、文档、迁移产物

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_CATALOG, RETIRED_COURSE_IDS } from '../../services/catalog';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** active production source —— 用户实际运行到的前端代码。 */
const SCAN_DIRS = ['components', 'services', 'hooks', 'contexts', 'i18n'];
const SCAN_FILES = ['App.tsx', 'constants.ts', 'index.tsx', 'types.ts'];

/** 这些目录里的 ID 不是 active product reference（Supervisor 明确要求排除）。 */
const EXCLUDED_DIRS = new Set([
  'node_modules', 'tests', 'backend', 'scripts', 'docs', 'dist', 'dist-voice-demo',
  'android', 'ios', 'public', 'design', 'screenshots', 'migrated_prompt_history',
]);

/** 课程 ID 的字面形态：目录里 67 门全部是 `c_` 前缀的 snake_case。 */
const COURSE_ID_LITERAL = /'(c_[a-z0-9_]+)'/g;

function collectFiles(): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(path.join(dir, entry.name));
      }
    }
  };

  for (const d of SCAN_DIRS) {
    const full = path.join(APP_ROOT, d);
    if (fs.existsSync(full)) walk(full);
  }
  for (const f of SCAN_FILES) {
    const full = path.join(APP_ROOT, f);
    if (fs.existsSync(full)) out.push(full);
  }
  return out;
}

interface Reference { id: string; file: string; line: number; text: string }

/**
 * 抽出所有被当作 canonical course ID 使用的字面量。
 *
 * 唯一的排除项是 `RETIRED_COURSE_IDS` 的声明行 —— 那一行的职责**就是**
 * 列出不再存在的 ID。把它算成 active 引用会让这个闸门永远红着，
 * 反过来诱使人删掉退役登记，那才是真正的信息损失。
 */
function collectReferences(): Reference[] {
  const refs: Reference[] = [];

  for (const file of collectFiles()) {
    const rel = path.relative(APP_ROOT, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, i) => {
      if (line.includes('RETIRED_COURSE_IDS')) return;   // 退役登记，不是 active 引用
      for (const m of line.matchAll(COURSE_ID_LITERAL)) {
        refs.push({ id: m[1], file: rel, line: i + 1, text: line.trim() });
      }
    });
  }
  return refs;
}

const OFFICIAL_IDS = new Set(OFFICIAL_CATALOG.map((c) => c.id));
const REFERENCES = collectReferences();

describe('课程引用完整性', () => {
  it('扫到的生产文件与引用数量是合理的（防止 glob 静默扫空）', () => {
    // 一个扫不到文件的闸门会永远是绿的 —— 那比没有闸门更危险。
    expect(collectFiles().length).toBeGreaterThan(20);
    expect(REFERENCES.length).toBeGreaterThan(50);
  });

  it('生产代码中的每一个 canonical course 引用都存在于 OFFICIAL_CATALOG', () => {
    const dangling = REFERENCES.filter((r) => !OFFICIAL_IDS.has(r.id));

    // 失败时直接给出可定位的行，而不是只报一个数字。
    const detail = dangling
      .map((r) => `${r.file}:${r.line}  ${r.id}\n      ${r.text}`)
      .join('\n    ');

    expect(dangling, dangling.length ? `发现指向不存在课程的引用：\n    ${detail}` : '').toEqual([]);
  });

  it('已退役的课程 ID 在生产代码中零引用', () => {
    const retired = new Set<string>(RETIRED_COURSE_IDS);
    const offenders = REFERENCES.filter((r) => retired.has(r.id));

    const detail = offenders
      .map((r) => `${r.file}:${r.line}  ${r.id}`)
      .join('\n    ');

    expect(offenders, offenders.length ? `退役课程仍被引用：\n    ${detail}` : '').toEqual([]);
  });

  it('退役登记与正式目录不重叠 —— 退役的课不得复活', () => {
    const resurrected = RETIRED_COURSE_IDS.filter((id) => OFFICIAL_IDS.has(id));
    expect(resurrected).toEqual([]);
  });

  it('OFFICIAL_CATALOG 本身没有重复 ID', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const c of OFFICIAL_CATALOG) {
      if (seen.has(c.id)) dupes.push(c.id);
      seen.add(c.id);
    }
    expect(dupes).toEqual([]);
    expect(OFFICIAL_CATALOG.length).toBe(67);
  });

  it('闸门确实能抓到坏引用（反证：不存在的 ID 必须落进 dangling）', () => {
    // 如果这条过不了，说明上面的「全绿」可能只是因为匹配逻辑没在工作。
    const fake = 'c_this_course_does_not_exist';
    expect(OFFICIAL_IDS.has(fake)).toBe(false);
    expect(COURSE_ID_LITERAL.test(`courseId: '${fake}'`)).toBe(true);
    COURSE_ID_LITERAL.lastIndex = 0;   // 全局正则带状态，用完复位
  });
});
