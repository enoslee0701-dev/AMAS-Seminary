import fs from 'node:fs';
import path from 'node:path';

/**
 * 圣经位置校验（P1-2）。
 *
 * ## 只有一份 Bible metadata
 *
 * 校验数据**直接从阅读器用的那份数据集派生**：`public/scripture/cuv.json`
 * （和合本，66 卷 / 31,103 节）。刻意不在后端手抄一份
 * `{ 创世记: 50, 出埃及记: 40, ... }` —— 那会立刻变成第二份需要人工维护、
 * 迟早与真实数据漂移的表。
 *
 * canonical 标识就是**中文书名**。cuv.json 的键、前端 constants.ts 的
 * BIBLE_STRUCTURE、loadScripture(book, chapter) 用的都是它，
 * 所以这里不引入数字 book id —— 引入了就等于凭空造出第三套映射。
 *
 * ## 只读取章节数与每章节数
 *
 * 派生出来的索引只有 `书名 -> [每章的节数]`，不保留任何经文正文：
 * 校验用不到正文，后端也不该持有第二份经文副本。
 *
 * ## 数据集缺失时 fail closed
 *
 * 找不到 cuv.json 就让所有写入校验失败并明确报错，而不是放行任意输入。
 * 宁可拒绝写入，也不让 `book=hahaha` 进数据库。
 */

/** 书名 -> 每章的节数（下标 0 = 第 1 章）。 */
type Canon = Map<string, number[]>;

let canon: Canon | null = null;
let loadError: string | null = null;

/** 允许部署时显式指定数据集位置；默认在仓库内向上找 public/scripture。 */
function candidatePaths(): string[] {
  const explicit = (process.env.SCRIPTURE_DATA_PATH ?? '').trim();
  const rel = path.join('public', 'scripture', 'cuv.json');
  return [
    ...(explicit ? [explicit] : []),
    // backend/ 运行时：仓库根在上一级
    path.resolve(process.cwd(), '..', rel),
    // 仓库根运行时
    path.resolve(process.cwd(), rel),
    // 打包后 dist 更深一层的兜底
    path.resolve(process.cwd(), '..', '..', rel),
  ];
}

function loadCanon(): Canon | null {
  if (canon) return canon;
  if (loadError) return null;
  for (const p of candidatePaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, Record<string, string[]>>;
      const m: Canon = new Map();
      for (const [book, chapters] of Object.entries(raw)) {
        // 章号是字符串键，按数字排序后取每章节数；正文本身丢弃。
        const nums = Object.keys(chapters).map(Number).filter(n => Number.isInteger(n) && n > 0);
        if (nums.length === 0) continue;
        const max = Math.max(...nums);
        const counts = new Array<number>(max).fill(0);
        for (const n of nums) counts[n - 1] = chapters[String(n)]?.length ?? 0;
        m.set(book, counts);
      }
      if (m.size > 0) { canon = m; return canon; }
    } catch (e) {
      loadError = `解析失败 ${p}: ${(e as Error).message}`;
    }
  }
  loadError = loadError ?? `未找到经文数据集，已尝试：${candidatePaths().join(' | ')}`;
  return null;
}

export interface CanonStatus {
  available: boolean;
  bookCount: number;
  /** 仅用于启动日志与诊断，不下发客户端。 */
  detail?: string;
}

export function canonStatus(): CanonStatus {
  const c = loadCanon();
  return c
    ? { available: true, bookCount: c.size }
    : { available: false, bookCount: 0, detail: loadError ?? '未知原因' };
}

export type LocationError =
  | 'SCRIPTURE_DATA_UNAVAILABLE'
  | 'INVALID_BOOK'
  | 'INVALID_CHAPTER'
  | 'INVALID_VERSE';

export interface ValidLocation {
  book: string;
  chapter: number;
  /** 未指定按节定位时为 null。 */
  verse: number | null;
}

/**
 * 严格校验一个阅读位置。
 *
 * 不做任何「猜测性修正」：book 拼错就是错，chapter 越界就是错，
 * 不会静默 clamp 成合法值 —— 静默修正会让客户端以为自己发对了。
 */
/**
 * 返回类型刻意写成「单一形状 + 可选字段」，而不是判别联合。
 * 仓库根的 tsconfig 没有开 strict（因此没有 strictNullChecks），
 * 判别联合在那份配置下无法收窄，会让调用点报错。
 */
export interface LocationCheck {
  ok: boolean;
  value?: ValidLocation;
  code?: LocationError;
}

export function validateLocation(
  bookRaw: unknown, chapterRaw: unknown, verseRaw: unknown,
): LocationCheck {
  const c = loadCanon();
  if (!c) return { ok: false, code: 'SCRIPTURE_DATA_UNAVAILABLE' };

  if (typeof bookRaw !== 'string') return { ok: false, code: 'INVALID_BOOK' };
  const book = bookRaw.trim();
  const chapters = c.get(book);
  if (!chapters) return { ok: false, code: 'INVALID_BOOK' };

  // 只接受整数。'3'、3.5、NaN、Infinity 一律拒绝。
  const chapter = typeof chapterRaw === 'number' ? chapterRaw : Number.NaN;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > chapters.length) {
    return { ok: false, code: 'INVALID_CHAPTER' };
  }

  if (verseRaw === undefined || verseRaw === null) {
    return { ok: true, value: { book, chapter, verse: null } };
  }
  const verse = typeof verseRaw === 'number' ? verseRaw : Number.NaN;
  const verseCount = chapters[chapter - 1] ?? 0;
  if (!Number.isInteger(verse) || verse < 1 || verse > verseCount) {
    return { ok: false, code: 'INVALID_VERSE' };
  }
  return { ok: true, value: { book, chapter, verse } };
}
