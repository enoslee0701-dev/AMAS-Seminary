/**
 * 公告列表的**来源**：单一事实源。
 *
 * ## 为什么要有这个文件
 *
 * 第 25 轮给公告页加了来源横幅：拿不到真公告时明说「这不是刚取到的」。
 * 但首页那三条预览读的是**同一份** `newsItems`，却一个字都不说 ——
 * 于是未配数据面（实测 503）时，首页把源码里写死的示例公告
 * 当成学院公告摆在首屏。公告的意义就是「学院发的、大家都看得到的」，
 * 读的人没有任何办法分辨。
 *
 * 两个界面说同一件事，文案就不能各写一份（ARCHITECTURE_RULES §10）。
 * 横幅措辞、能不能重试、空列表该怎么说，全部收在这里。
 *
 * ## 还补了一处更隐蔽的
 *
 * 原来 `useEffect` 无条件把 newsItems 写回 localStorage，于是**示例公告
 * 被写进了缓存**。下次启动它看起来就像「上次取到的」，来源从此不可考。
 * 现在只有服务端那份进缓存，并且缓存自带来源标记。
 *
 * ## 边界
 *
 * 这一层只管**如实转述已经发生的事**：这份列表是谁给的、为什么没拿到新的。
 * 它不判断服务端该回什么，也不替服务端解释。
 */

import { failureMessage, isRetryable, type FailureReason } from './apiResult';
import type { NewsItem } from '../types';

/**
 * 现在屏幕上这份公告是哪来的。
 *
 * ```
 * cache     上次**确实从服务端取到**、存在本机的那份 —— 可能过期，但确实是学院发的
 * sample    源码里写死的示例公告（constants.ts 的 MOCK_NEWS）—— 跟学院没关系
 * unknown   存在本机、但来源不可考 —— 旧版本写下的裸数组、或者认不出的格式
 * ```
 *
 * 三者必须分开。原来都叫「本地那份」，于是横幅只能含糊说
 * 「可能是旧的或示例内容」—— 而这三句话的后果完全不同。
 *
 * `unknown` 不是凑数的第三种。旧版本把示例和真公告往同一个 key 里写，
 * 读出来根本分不清；把它说成 `cache`（「上次从服务器取到的」）是**替
 * 历史数据做了一个没有依据的断言** —— 那正是这一轮要修掉的毛病本身。
 * 未知就写未知。
 */
export type FeedOrigin = 'cache' | 'sample' | 'unknown';

/**
 * 公告的来源状态。
 *
 * ```
 * loading   还在问服务端；origin 是**此刻屏幕上那份**的来源
 * server    服务端给的，是当前真公告
 * local     没问到，显示的是 origin 那份，reason 是没问到的原因
 * ```
 *
 * `origin` 可选：老调用方不传就退回原来那句含糊措辞，不会凭空多出断言。
 */
export type FeedStatus =
  | { source: 'loading'; origin?: FeedOrigin }
  | { source: 'server' }
  | { source: 'local'; reason: FailureReason; origin?: FeedOrigin };

export interface FeedNotice {
  /** info = 还在努力；warn = 这次没拿到 */
  tone: 'info' | 'warn';
  text: string;
  /** 重试有没有意义 —— 501 / 403 重试一百次也一样 */
  canRetry: boolean;
}

/**
 * 该不该说点什么，说什么。返回 null 表示不用声张。
 *
 * 几条自己给自己定的规矩：
 *
 * ```
 * 真从服务端取到    什么都不说    —— 没有可声张的
 * 还在加载且不知来源 什么都不说    —— 老调用方不会凭空多一条横幅
 * 还在加载且是示例   要说          —— 加载那一会儿屏幕上摆的就是示例
 * 示例与缓存分开说   要说          —— 「跟学院没关系」和「可能过期」不是一回事
 * ```
 */
export function describeFeed(status?: FeedStatus, action = '加载公告'): FeedNotice | null {
  if (!status) return null;
  if (status.source === 'server') return null;

  if (status.source === 'loading') {
    if (!status.origin) return null;
    return {
      tone: 'info',
      canRetry: false,
      text: status.origin === 'sample'
        ? '正在获取学院公告。下面这些是 App 内置的示例内容，不是学院发布的公告。'
        : status.origin === 'cache'
          ? '正在获取学院公告。下面这些是上次从服务器取到的那份，可能已经过期。'
          : '正在获取学院公告。下面这些存在本机，来源无法确认，不一定是学院发布的。',
    };
  }

  const head =
    status.origin === 'sample'
      ? '以下公告不是刚从服务器取到的：这些是 App 内置的示例内容，不是学院发布的公告。'
      : status.origin === 'cache'
        ? '以下公告不是刚从服务器取到的，是上次从服务器取到的那份，可能已经过期。'
        : status.origin === 'unknown'
          ? '以下公告不是刚从服务器取到的：它们存在本机，来源无法确认，不一定是学院发布的。'
          : '以下公告不是刚从服务器取到的，可能是旧的或示例内容。';
  return {
    tone: 'warn',
    text: `${head}${failureMessage(status.reason, action)}`,
    canRetry: isRetryable(status.reason),
  };
}

/**
 * 列表是空的时候该说什么。
 *
 * 「学院当前没有发布公告」是一个**具体断言**，只有服务端真答复了空数组
 * 才说得出口。没问到的时候说这句话，等于替服务端编了一个答复。
 */
export function emptyFeedText(status?: FeedStatus): string {
  if (status && status.source === 'server') return '学院当前没有发布公告';
  if (status && status.source === 'local') return '没有可显示的公告';
  return '暂无最新公告';
}

/* ── 本机缓存 ──────────────────────────────────────────────────────── */

export const NEWS_CACHE_KEY = 'amas_news';

/** 缓存格式版本。v1 是裸数组（来源不可考），v2 带来源标记。 */
const CACHE_VERSION = 2;

export interface LoadedNews {
  items: NewsItem[];
  origin: FeedOrigin;
}

type MinimalStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): MinimalStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;   // Safari 隐私模式下访问 localStorage 会直接抛
  }
}

/** 两份列表是不是同一批条目（只比 id 与标题，日期是 daysAgo() 算出来的，会变）。 */
function sameItems(a: NewsItem[], b: NewsItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x && b[i] && x.id === b[i].id && x.title === b[i].title);
}

/**
 * 读本机那份公告，**连它是哪来的一起返回**。
 *
 * 判据只有一条：**只有本模块自己写下的 v2 服务端标记，才敢说「上次从
 * 服务器取到的」。** 其余一律 `unknown`。
 *
 * ```
 * 没有 / 读不出 / 存坏了        sample    退回内置示例
 * v1 裸数组，逐条等于示例        sample    这一种认得出来
 * v1 裸数组，其它               unknown   旧版本示例和真公告混写同一个 key，分不清
 * v2 且 origin === 'server'     cache     本模块写的，来源有据
 * 其它 object / 认不出的版本     unknown   没有依据就不许替它断言
 * ```
 *
 * 这里**只读不写**：不迁移、不回填、不改写用户本机已有的那份字节。
 * 猜一个来源写回去，就等于把猜测变成了事实。
 */
export function readNewsCache(sample: NewsItem[], store: MinimalStorage | null = defaultStore()): LoadedNews {
  if (!store) return { items: sample, origin: 'sample' };
  let raw: string | null = null;
  try {
    raw = store.getItem(NEWS_CACHE_KEY);
  } catch {
    return { items: sample, origin: 'sample' };
  }
  if (!raw) return { items: sample, origin: 'sample' };

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      // v1：那时候示例和真公告写的是同一个 key，只认得出「它就是示例」这一种
      if (sameItems(parsed as NewsItem[], sample)) return { items: sample, origin: 'sample' };
      return { items: parsed as NewsItem[], origin: 'unknown' };
    }

    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
      const items = parsed.items as NewsItem[];
      const trusted = parsed.v === CACHE_VERSION && parsed.origin === 'server';
      return { items, origin: trusted ? 'cache' : 'unknown' };
    }
  } catch {
    /* 存坏了就当没有 */
  }
  return { items: sample, origin: 'sample' };
}

/**
 * 只把**服务端给的那份**写进缓存。
 *
 * 示例公告不写 —— 写进去它下次就冒充「上次取到的」，
 * 而那正是这一轮要修掉的谎。
 */
export function writeNewsCache(items: NewsItem[], store: MinimalStorage | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(NEWS_CACHE_KEY, JSON.stringify({ v: CACHE_VERSION, origin: 'server', items }));
  } catch {
    /* 配额满 / 隐私模式：缓存写不进去不影响这次显示 */
  }
}
