import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoursePathView } from '../../components/College/CoursePathView';

// Static render only — useLayoutEffect (the scroll-to-top) does not run here,
// so no browser APIs are required. We assert the real catalog content renders.
const render = (props: any) => renderToStaticMarkup(<CoursePathView onBack={() => {}} {...props} />);

describe('CoursePathView', () => {
  it('overview lists all four tiers + the study-mode note', () => {
    const html = render({});
    for (const tier of ['证书课程', '学士课程', '硕士课程', '博士课程']) {
      expect(html).toContain(tier);
    }
    expect(html).toContain('学习方式');
    // a couple of real programs from different tiers show up
    expect(html).toContain('平信徒指导者课程');
    expect(html).toContain('宣教学博士课程');
  });

  it('focused 证书 page shows only certificate programs', () => {
    const html = render({ focusTier: '证书' });
    expect(html).toContain('平信徒指导者课程');
    expect(html).toContain('牧会训练课程');
    // other tiers' programs must NOT appear on a focused page
    expect(html).not.toContain('宣教学博士课程');
    expect(html).not.toContain('神学学士课程');
  });

  it('focused 博士 page shows only doctorate programs', () => {
    const html = render({ focusTier: '博士' });
    expect(html).toContain('教牧学博士课程');
    expect(html).toContain('宣教学博士课程');
    expect(html).not.toContain('平信徒指导者课程');
  });
});
