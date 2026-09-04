// discoverHandoff tests —— 网页版快速探索 → App 的交接。
//
// 这一层的合同：
//   1. 只接受 SUPPORTED_ASSESSMENT 版本的参数（题库换版本 = 旧链接自动失效）
//   2. 脏数据一律丢弃，绝不半信半疑地存进去
//   3. 参数消费掉就从地址栏抹掉 —— 否则刷新一次就重复带入一次
//   4. 关掉横幅后不再弹（记录仍在，只是不打扰）

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseAreas, discoverLevel, weakestArea, captureDiscoverHandoff,
  readDiscoverHandoff, hasPendingDiscoverHandoff, dismissDiscoverHandoff, clearDiscoverHandoff,
  SUPPORTED_ASSESSMENT,
} from '../../services/christianProfile/discoverHandoff';

const setUrl = (search: string) => window.history.replaceState(null, '', `/${search}`);

beforeEach(() => {
  localStorage.clear();
  setUrl('');
});

describe('discoverLevel', () => {
  it('与 discover.html 的 LEVEL() 同阈值', () => {
    expect(discoverLevel(100)).toBe('稳定');
    expect(discoverLevel(80)).toBe('稳定');
    expect(discoverLevel(79)).toBe('较稳定');
    expect(discoverLevel(60)).toBe('较稳定');
    expect(discoverLevel(59)).toBe('发展中');
    expect(discoverLevel(40)).toBe('发展中');
    expect(discoverLevel(39)).toBe('需要建立');
    expect(discoverLevel(0)).toBe('需要建立');
  });
});

describe('parseAreas', () => {
  it('解析 5 项并附上等级', () => {
    const areas = parseAreas('bible:72,doctrine:55,devotion:88,service:30,disciple:61');
    expect(areas.map((a) => a.key)).toEqual(['bible', 'doctrine', 'devotion', 'service', 'disciple']);
    expect(areas[0]).toEqual({ key: 'bible', value: 72, level: '较稳定' });
    expect(areas[3].level).toBe('需要建立');
  });

  it('丢弃未知领域、超范围与非数字', () => {
    expect(parseAreas('bible:72,ministry:90,doctrine:120,devotion:-1,service:abc').map((a) => a.key))
      .toEqual(['bible']);
  });

  it('重复项只取第一次', () => {
    expect(parseAreas('bible:72,bible:10')).toEqual([{ key: 'bible', value: 72, level: '较稳定' }]);
  });

  it('空串与垃圾串返回空数组', () => {
    expect(parseAreas('')).toEqual([]);
    expect(parseAreas('???')).toEqual([]);
  });
});

describe('weakestArea', () => {
  it('取分数最低的一项', () => {
    const areas = parseAreas('bible:72,service:30,disciple:61');
    expect(weakestArea(areas)?.key).toBe('service');
  });
  it('空数组返回 null', () => {
    expect(weakestArea([])).toBeNull();
  });
});

describe('captureDiscoverHandoff', () => {
  it('存下交接结果并把参数从地址栏抹掉', () => {
    setUrl(`?source=app-discover&assessment=${SUPPORTED_ASSESSMENT}&src=unlock&areas=bible:72,service:30&keep=1`);
    const h = captureDiscoverHandoff();

    expect(h).not.toBeNull();
    expect(h!.source).toBe('app-discover');
    expect(h!.entry).toBe('unlock');
    expect(h!.areas).toHaveLength(2);
    expect(readDiscoverHandoff()?.areas[0].key).toBe('bible');

    // 自己的参数清掉，别人的参数留着
    expect(window.location.search).toBe('?keep=1');
  });

  it('题库版本对不上就整个忽略', () => {
    setUrl('?assessment=quick-faith-v0&areas=bible:72');
    expect(captureDiscoverHandoff()).toBeNull();
    expect(readDiscoverHandoff()).toBeNull();
  });

  it('没有参数时不动已有记录', () => {
    setUrl(`?assessment=${SUPPORTED_ASSESSMENT}&areas=bible:72`);
    captureDiscoverHandoff();
    setUrl('');
    expect(captureDiscoverHandoff()).toBeNull();
    expect(readDiscoverHandoff()?.areas[0].value).toBe(72);
  });

  it('areas 全是脏数据时不落盘', () => {
    setUrl(`?assessment=${SUPPORTED_ASSESSMENT}&areas=ministry:90`);
    expect(captureDiscoverHandoff()).toBeNull();
    expect(readDiscoverHandoff()).toBeNull();
  });

  it('src 缺失时回退到 discover.html 留下的面包屑', () => {
    localStorage.setItem('amas_discover_src', 'sticky');
    setUrl(`?assessment=${SUPPORTED_ASSESSMENT}&areas=bible:72`);
    expect(captureDiscoverHandoff()!.entry).toBe('sticky');
    // 面包屑用过即清
    expect(localStorage.getItem('amas_discover_src')).toBeNull();
  });
});

describe('横幅的显示与关闭', () => {
  beforeEach(() => {
    setUrl(`?assessment=${SUPPORTED_ASSESSMENT}&areas=bible:72,service:30`);
    captureDiscoverHandoff();
  });

  it('刚带进来时应该显示', () => {
    expect(hasPendingDiscoverHandoff()).toBe(true);
  });

  it('关掉之后不再显示，但记录还在', () => {
    dismissDiscoverHandoff();
    expect(hasPendingDiscoverHandoff()).toBe(false);
    expect(readDiscoverHandoff()?.dismissedAt).toBeTruthy();
  });

  it('清除后什么都不剩', () => {
    clearDiscoverHandoff();
    expect(readDiscoverHandoff()).toBeNull();
    expect(hasPendingDiscoverHandoff()).toBe(false);
  });
});
