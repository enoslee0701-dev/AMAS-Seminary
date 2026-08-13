import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProfileView from '../../components/ProfileView';

// Static render: data-fetch effects don't run, so we assert the role-aware
// shell (header, quick links, admin section gating) renders from props alone.
const baseUser = {
  id: 'u1', name: '张神学生', avatar: '', degree: 'M.Div',
  studentId: '20230045', bio: '愿为主奔跑。',
};
const render = (user: any) =>
  renderToStaticMarkup(<ProfileView user={user} favoriteCourseIds={[]} onLogout={() => {}} onNavigate={() => {}} />);

describe('ProfileView', () => {
  it('renders the user identity + quick links + learning section', () => {
    const html = render({ ...baseUser, role: 'student' });
    expect(html).toContain('张神学生');
    expect(html).toContain('快捷入口');
    expect(html).toContain('我的学习');
    expect(html).toContain('愿为主奔跑'); // bio shown in header
  });

  it('shows 教务管理 for admins/deans only', () => {
    expect(render({ ...baseUser, role: 'admin' })).toContain('教务管理');
    expect(render({ ...baseUser, role: 'dean' })).toContain('教务管理');
    expect(render({ ...baseUser, role: 'student' })).not.toContain('教务管理');
    expect(render({ ...baseUser, role: 'teacher' })).not.toContain('教务管理');
  });

  it('shows the empty-state when there are no favorited courses', () => {
    expect(render({ ...baseUser, role: 'student' })).toContain('还没有收藏课程');
  });
});
