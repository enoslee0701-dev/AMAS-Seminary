// AMAS · 网页版「信仰成长快速探索」(discover.html) → App 的交接
//
// discover.html（官网一份、App public/ 一份，官网是 SOURCE OF TRUTH）做完 10 题后
// 跳回 App，URL 上带着：
//   /?source=app-discover&assessment=quick-faith-v1&src=unlock&areas=bible:72,doctrine:55,…
// 本模块只做三件事：解析、校验、存下来，供成长档案入口显示「你从网页带过来的起点」。
//
// 规范要点（AMAS Christian Profile Assessment System v1.0）：
// Level 0 的 5 项初步状态**不参与** Christian Profile 评分，也不推导任何事奉倾向。
// 它是一条来源记录 / 对话起点，不是证据，因此刻意不写进 amas_ct_state_v2 的证据日志。

const STORE_KEY = 'amas_discover_handoff_v1';
/** discover.html 在同源 localStorage 留下的入口面包屑（点了哪个按钮） */
const SRC_BREADCRUMB_KEY = 'amas_discover_src';
/** 只接受这一个版本；discover.html 改题库/计分时会同时改版本号，旧参数直接丢弃 */
export const SUPPORTED_ASSESSMENT = 'quick-faith-v1';

export const AREA_KEYS = ['bible', 'doctrine', 'devotion', 'service', 'disciple'] as const;
export type DiscoverAreaKey = (typeof AREA_KEYS)[number];

/** 与 discover.html 的 AREAS 保持一致 */
export const AREA_LABEL: Record<DiscoverAreaKey, string> = {
  bible: '圣经熟悉度',
  doctrine: '基础教义',
  devotion: '灵修实践',
  service: '事奉参与',
  disciple: '门训意识',
};

export type DiscoverLevel = '稳定' | '较稳定' | '发展中' | '需要建立';

/** 与 discover.html 的 LEVEL() 同阈值——两边显示同一个词，用户才不会觉得对不上 */
export function discoverLevel(value: number): DiscoverLevel {
  if (value >= 80) return '稳定';
  if (value >= 60) return '较稳定';
  if (value >= 40) return '发展中';
  return '需要建立';
}

export interface DiscoverArea {
  key: DiscoverAreaKey;
  /** 0–100，来自 10 道题的领域均值 */
  value: number;
  level: DiscoverLevel;
}

export interface DiscoverHandoff {
  /** website-discover（官网那份）/ app-discover（App 内那份） */
  source: string;
  assessment: string;
  /** 用户点的是哪个按钮：strip / unlock / bottom / detail / … */
  entry: string;
  areas: DiscoverArea[];
  capturedAt: string;
  /** 用户已经看过并关掉了横幅 */
  dismissedAt?: string;
}

/** 解析 "bible:72,doctrine:55" —— 未知 key、超范围、重复项一律丢弃 */
export function parseAreas(raw: string): DiscoverArea[] {
  const seen = new Set<string>();
  const out: DiscoverArea[] = [];
  for (const part of raw.split(',')) {
    const [k, v] = part.split(':');
    const key = (k || '').trim() as DiscoverAreaKey;
    if (!AREA_KEYS.includes(key) || seen.has(key)) continue;
    const value = Number((v || '').trim());
    if (!Number.isFinite(value) || value < 0 || value > 100) continue;
    seen.add(key);
    out.push({ key, value: Math.round(value), level: discoverLevel(value) });
  }
  return out;
}

/** 5 项里最弱的一项——discover.html 的「下一步建议」就是照这个给的 */
export function weakestArea(areas: DiscoverArea[]): DiscoverArea | null {
  return areas.reduce<DiscoverArea | null>((min, a) => (!min || a.value < min.value ? a : min), null);
}

export function readDiscoverHandoff(): DiscoverHandoff | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as DiscoverHandoff;
    if (!h || !Array.isArray(h.areas) || !h.areas.length) return null;
    return h;
  } catch {
    return null;
  }
}

/** 有交接记录、且用户还没关掉横幅 */
export function hasPendingDiscoverHandoff(): boolean {
  const h = readDiscoverHandoff();
  return !!h && !h.dismissedAt;
}

export function dismissDiscoverHandoff(): void {
  const h = readDiscoverHandoff();
  if (!h) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...h, dismissedAt: new Date().toISOString() }));
  } catch {}
}

export function clearDiscoverHandoff(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}
}

/**
 * 冷启动时读一次 URL 参数并落盘，然后把这几个参数从地址栏抹掉
 * （否则用户刷新一次就会把同一份结果重新"带回来"一遍）。
 * 在 index.tsx 里 render 之前调用；无参数或参数不合法时返回 null 且不动已有记录。
 */
export function captureDiscoverHandoff(): DiscoverHandoff | null {
  if (typeof window === 'undefined') return null;

  let breadcrumb = '';
  try {
    breadcrumb = localStorage.getItem(SRC_BREADCRUMB_KEY) || '';
    if (breadcrumb) localStorage.removeItem(SRC_BREADCRUMB_KEY);
  } catch {}

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
  const assessment = params.get('assessment') || '';
  const areasRaw = params.get('areas') || '';
  if (assessment !== SUPPORTED_ASSESSMENT || !areasRaw) return null;

  const areas = parseAreas(areasRaw);
  const source = params.get('source') || 'discover';
  const entry = params.get('src') || breadcrumb;

  // 参数已消费，从地址栏移除（含 profile —— 目前恒为空，占位给以后用）
  try {
    ['source', 'assessment', 'areas', 'src', 'profile'].forEach((k) => params.delete(k));
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  } catch {}

  if (!areas.length) return null;

  const handoff: DiscoverHandoff = {
    source,
    assessment,
    entry,
    areas,
    capturedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(handoff));
  } catch {}
  return handoff;
}
