import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../i18n'; // initialises i18next synchronously so useTranslation works
import Dashboard from '../../components/Dashboard';

// Static render: effects (status bar, scroll listener) don't run. We assert the
// dashboard renders its key sections, incl. the 课程路径 tiers wired this session.
const render = () =>
  renderToStaticMarkup(
    <Dashboard
      onViewChange={() => {}}
      onOpenCollegeItem={() => {}}
      onOpenCoursePath={() => {}}
      newsItems={[]}
      setNewsItems={() => {}}
    />,
  );

describe('Dashboard', () => {
  it('renders the 课程路径 section with all four tier cards', () => {
    const html = render();
    expect(html).toContain('课程路径');
    for (const tier of ['证书课程', '学士课程', '硕士课程', '博士课程']) {
      expect(html).toContain(tier);
    }
  });

  it('renders translated nav/section labels (i18n wired)', () => {
    const html = render();
    // 了解更多 is the entry into the course-path page
    expect(html).toContain('了解更多');
  });
});
