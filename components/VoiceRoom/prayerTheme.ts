import type React from 'react';

// AMAS 祷告室 · 唯一色彩规范
//
// 所有祷告室相关组件（面板、操作栏、Bottom Sheet、共用弹窗的 prayer 变体）
// 只从这里取色。硬编码色值一律视为回归。
//
// 三层视觉原则：
//   1. 晨光背景（PAGE）
//   2. 重点白卡（CARD）—— 只给「本次祷告主题」和「代祷墙」
//   3. 直接落在背景上的辅助内容 —— 成员、祷告次序、快捷入口，不再用厚卡

export const PT = {
  /** 晨光背景 */
  page: '#FAF7F0',
  /** 重点白卡 */
  card: '#FFFFFF',
  /** 主深蓝：标题与正文强调 */
  navy: '#0D2A52',
  /** 古金：次级强调、序号、可点击的文字动作 */
  gold: '#B78638',
  /** 鼠尾草绿：装饰与柔和图标底 */
  sage: '#6F806B',
  /** 分割线 */
  divider: '#EFE8DB',

  // ---- 由上面派生的层次色，避免各处自行调 alpha ----
  /** 正文 */
  body: '#4A5568',
  /** 次要说明 */
  muted: '#8A93A3',
  /** 最弱：占位、时间戳 */
  faint: '#AEB6C2',

  /** 在线状态点：**刻意保持高饱和**，Sage 在白卡上辨识度不足 */
  online: '#22C55E',

  // ---- 极浅底色（用于图标圆底、tag、按钮静息态）----
  goldWash: '#F7EFE0',
  navyWash: '#EAEFF6',
  sageWash: '#EDF1EC',
  neutralWash: '#F4F2ED',
} as const;

/** 白卡：圆角 18–22，阴影极浅。祷告室只有两处配用它。 */
export const prayerCard: React.CSSProperties = {
  background: PT.card,
  borderRadius: 20,
  boxShadow: '0 1px 2px rgba(13,42,82,.04), 0 6px 18px rgba(13,42,82,.05)',
};

/** 辅助内容：不给卡，只给一条极浅的分隔或完全裸露在背景上。 */
export const prayerSection: React.CSSProperties = {
  borderRadius: 18,
};

/** 共用弹窗的主题变体。default 保持原深色，prayer 走浅色。 */
export type RoomVariant = 'default' | 'prayer';

export interface VariantTokens {
  sheetBg: string;
  pageBg: string;
  text: string;
  subText: string;
  divider: string;
  accent: string;
  inputBg: string;
  itemHover: string;
}

export const VARIANT: Record<RoomVariant, VariantTokens> = {
  default: {
    sheetBg: '#12121e',
    pageBg: '#12121e',
    text: '#FFFFFF',
    subText: 'rgba(255,255,255,.55)',
    divider: 'rgba(255,255,255,.08)',
    accent: '#60A5FA',
    inputBg: 'rgba(255,255,255,.06)',
    itemHover: 'rgba(255,255,255,.05)',
  },
  prayer: {
    sheetBg: PT.card,
    pageBg: PT.page,
    text: PT.navy,
    subText: PT.muted,
    divider: PT.divider,
    accent: PT.gold,
    inputBg: PT.neutralWash,
    itemHover: PT.neutralWash,
  },
};

/** 所有全屏 modal / sheet 的宽度约束。桌面预览也必须居中，不许横铺。 */
export const MODAL_WIDTH = 'max-w-md mx-auto';
