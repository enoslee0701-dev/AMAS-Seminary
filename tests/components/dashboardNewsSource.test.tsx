import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import '../../i18n';
import Dashboard from '../../components/Dashboard';
import type { FeedStatus } from '../../services/newsFeed';
import type { NewsItem } from '../../types';

/**
 * 首页「最新公告」那三条预览 —— 组件级验证。
 *
 * ## 缺陷（第 25 轮登记、未做的那条）
 *
 * 公告页早就有来源横幅了，首页没有。两边读的是**同一份** newsItems：
 * 拉取失败时它还是 `MOCK_NEWS`（源码里写死的三条示例），首页照直渲染，
 * 一个字都不说。首页是大多数人唯一会看的一屏，示例公告就这样成了
 * 「学院通知」。
 *
 * ## 钉住
 *
 * ```
 * 说实话     示例 / 上次从服务器取到的 / 来源不明，三种各说各的
 * 不靠藏     内容照常显示，靠说明而不是隐藏来解决
 * 能重试     且只在重试有意义时给按钮
 * 空结果     只有服务端真答复了空数组才敢说「学院当前没有发布公告」
 * 不回归     老调用方不传状态时，一个字都不多说
 * ```
 *
 * 真浏览器那半（实际渲染、点重试真的重新拉、缓存里到底存了什么、
 * 热区 44×44）在 scripts/verify-dashboard-news-source.mjs。
 */

const NEWS: NewsItem[] = [
  { id: 'n1', title: '示例公告一', date: '2026-09-01', type: 'Notice', content: 'a' },
  { id: 'n2', title: '示例公告二', date: '2026-09-02', type: 'Event', content: 'b' },
];

let host: HTMLDivElement;
let root: Root;
let reloads = 0;

const mount = async (props: { newsItems?: NewsItem[]; newsStatus?: FeedStatus; onReloadNews?: () => void }) => {
  await act(async () => {
    root.render(
      <Dashboard
        onViewChange={() => {}}
        onOpenCollegeItem={() => {}}
        onOpenCoursePath={() => {}}
        newsItems={props.newsItems ?? NEWS}
        setNewsItems={() => {}}
        newsStatus={props.newsStatus}
        onReloadNews={props.onReloadNews}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
};

const notice = () => host.querySelector('[data-testid="dashboard-news-source"]');
const noticeText = () => notice()?.textContent ?? '';
const retryBtn = () =>
  [...host.querySelectorAll('[data-testid="dashboard-news-source"] button')]
    .find(b => (b.textContent || '').includes('重新加载')) as HTMLButtonElement | undefined;
const click = (el: Element | null | undefined) => {
  act(() => { el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

beforeEach(() => {
  reloads = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('首页公告预览 · 来源', () => {
  it('★ 503 + 示例：当场说明这是内置示例，不是学院公告', async () => {
    await mount({ newsStatus: { source: 'local', reason: 'unavailable', origin: 'sample' } });
    const t = noticeText();
    expect(t).toContain('内置的示例内容');
    expect(t).toContain('不是学院发布的公告');
    expect(t).toContain('数据服务暂时不可用');
    expect(t).not.toContain('连不上');
  });

  it('★ 说明归说明，公告照常显示 —— 不是靠藏起来解决', async () => {
    await mount({ newsStatus: { source: 'local', reason: 'unavailable', origin: 'sample' } });
    expect(host.textContent).toContain('示例公告一');
  });

  it('★ 上次从服务器取到的那份：不许说成示例', async () => {
    await mount({ newsStatus: { source: 'local', reason: 'network', origin: 'cache' } });
    const t = noticeText();
    expect(t).toContain('上次从服务器取到的那份');
    expect(t).not.toContain('示例');
    expect(t).toContain('连不上服务器');
  });

  it('★ 来源不可考的本机数据：说不确认，不冒充服务端缓存', async () => {
    await mount({ newsStatus: { source: 'local', reason: 'unavailable', origin: 'unknown' } });
    const t = noticeText();
    expect(t).toContain('来源无法确认');
    expect(t).not.toContain('从服务器取到的那份');
  });

  it('★ 加载中且屏幕上摆的是示例：也要说', async () => {
    await mount({ newsStatus: { source: 'loading', origin: 'sample' } });
    expect(noticeText()).toContain('内置的示例内容');
    expect(retryBtn()).toBeUndefined();   // 还在加载，没有重试的道理
  });

  it('★ 真从服务端取到了就一个字都不说', async () => {
    await mount({ newsStatus: { source: 'server' } });
    expect(notice()).toBeNull();
  });

  it('老调用方不传 newsStatus：不凭空多一条提示', async () => {
    await mount({});
    expect(notice()).toBeNull();
  });
});

describe('首页公告预览 · 重试', () => {
  it('★ 503 给重试，点了真的回调', async () => {
    await mount({
      newsStatus: { source: 'local', reason: 'unavailable', origin: 'sample' },
      onReloadNews: () => { reloads += 1; },
    });
    const btn = retryBtn();
    expect(btn).not.toBeUndefined();
    click(btn);
    expect(reloads).toBe(1);
  });

  it('★ 没配后端地址不给重试 —— 点一百次也一样', async () => {
    await mount({
      newsStatus: { source: 'local', reason: 'not-configured', origin: 'sample' },
      onReloadNews: () => { reloads += 1; },
    });
    expect(retryBtn()).toBeUndefined();
  });

  it('★ 403 不给重试', async () => {
    await mount({
      newsStatus: { source: 'local', reason: 'forbidden', origin: 'cache' },
      onReloadNews: () => { reloads += 1; },
    });
    expect(retryBtn()).toBeUndefined();
  });

  it('宿主没给 onReloadNews 就不画按钮', async () => {
    await mount({ newsStatus: { source: 'local', reason: 'unavailable', origin: 'sample' } });
    expect(retryBtn()).toBeUndefined();
  });

  it('★ 重试按钮声明了 44×44 触控下限', async () => {
    /* happy-dom 不做布局，量不出真实热区 —— 这里只拦「声明被改小」这一种回归；
       实际热区由 scripts/verify-dashboard-news-source.mjs 在真浏览器里
       用 getBoundingClientRect 量。两件事不要混为一谈。 */
    await mount({
      newsStatus: { source: 'local', reason: 'unavailable', origin: 'sample' },
      onReloadNews: () => {},
    });
    const btn = retryBtn()!;
    expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
  });
});

describe('首页公告预览 · 空列表', () => {
  it('★ 服务端真答复了空：才敢说学院当前没有发布公告', async () => {
    await mount({ newsItems: [], newsStatus: { source: 'server' } });
    expect(host.textContent).toContain('学院当前没有发布公告');
  });

  it('★ 没问到 + 列表空：不许替服务端编一个「没有公告」的答复', async () => {
    await mount({ newsItems: [], newsStatus: { source: 'local', reason: 'unavailable', origin: 'cache' } });
    expect(host.textContent).not.toContain('学院当前没有发布公告');
    expect(noticeText()).toContain('上次从服务器取到的那份');
  });

  it('老调用方维持原文案', async () => {
    await mount({ newsItems: [] });
    expect(host.textContent).toContain('暂无最新公告');
  });
});

describe('★ 源码级：App.tsx 真的把来源传给了首页', () => {
  /* 上面用的是测试自己传进去的 newsStatus，挡不住 App.tsx 忘了传。
     这条读源码补上 —— 拦得住回归，拦不住运行时，如实标注。
     运行时那半在 scripts/verify-dashboard-news-source.mjs。 */
  it('Dashboard 拿得到 newsStatus 与重新加载入口', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('App.tsx', 'utf8');
    expect(src).toContain('newsStatus={newsStatus}');
    expect(src).toContain('onReloadNews={() => { void loadAnnouncements(); }}');
  });

  it('★ 首页与公告页读的是同一个来源状态', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('App.tsx', 'utf8');
    expect(src).toContain('feedStatus={newsStatus}');     // 公告页
    expect(src).toContain('newsStatus={newsStatus}');     // 首页
  });
});
