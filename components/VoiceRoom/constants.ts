import { HandHeart, Music, BookOpen, Mic2, Coffee } from 'lucide-react';
import type { RoomType, BibleChapter, Song } from './types';

export const THEME_CONFIGS: Record<RoomType, { icon: any, color: string, bg: string, desc: string, label: string, guide: string[] }> = {
  prayer: {
    label: '祷告室',
    icon: HandHeart,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    desc: '同心合意，为国度祷告。',
    guide: [
        "房主可以编辑「本次祷告主题」，房内成员都会看到。",
        "在「祷告分享」写下需要代祷的事，也可以匿名。",
        "点「我为你祷告」为别人的分享代祷，可以使用回应功能表达阿们。"
    ]
  },
  praise: {
    label: '赞美室',
    icon: Music,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    desc: '用诗歌和颂词，将荣耀归给神。',
    // 原文写「点歌」「所有人跟着音乐一起敬拜」——App 内没有任何音频播放能力，
    // 也没有跨设备同步。取得诗歌版权授权、真正能播之前，不要写回这些话。
    guide: [
        "点击顶部可以查看推荐诗歌清单。",
        "App 内暂不提供诗歌播放，可自行使用其他播放设备一同敬拜。",
        "礼物与快捷回应目前只显示在你自己的屏幕上。"
    ]
  },
  bible: {
    label: '读经室',
    icon: BookOpen,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    desc: '每日共读圣经，在话语中得着喂养。',
    // 「经文会自动同步给房间内所有参与者」已删除——currentBibleChapter 是纯本地
    // useState，从不发给任何人。在阅读位置真的进服务端之前，不要写回这句话。
    guide: [
        "点击顶部的经文选择器可切换阅读章节，全本和合本均可离线阅读。",
        "可以使用字体调节按钮修改字体大小。",
        "目前选择的章节只影响你自己的屏幕，尚未与房间内其他人同步。"
    ]
  },
  preaching: {
    label: '讲道室',
    icon: Mic2,
    color: 'text-purple-500',
    bg: 'bg-purple-50',
    desc: '宣讲神的话语，造就听众的生命。',
    guide: [
        "讲员可以使用录音功能记录讲道内容，录的是本机麦克风。",
        "录音结束后支持分享到主页或校友圈。",
        "讲员可在 '讲章' 区域撰写大纲（仅自己可见）。",
        "回应目前只显示在你自己的屏幕上，实时语音尚未开放。"
    ]
  },
  fellowship: {
    label: '交通室',
    icon: Coffee,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50',
    desc: '肢体交通，分享生活点滴与恩典。',
    // 原文承诺「自由分享」「举手上麦」「互相代祷」——三样都没有实现：
    // 没有分享机制，举手送不到任何人，也没有接入代祷墙。
    // 这间房目前只有一个背景色。等真的接上功能，再把承诺写回来。
    guide: [
        "这间房目前还没有专属功能，只是一个安静的角落。",
        "实时语音尚未开放，成员之间还不能互相听见。",
        "需要代祷可以先到祷告室，那里的代祷墙是可用的。"
    ]
  }
};

export const BIBLE_STRUCTURE = {
  OT: [
    { name: "创世记", chapters: 50 }, { name: "出埃及记", chapters: 40 }, { name: "利未记", chapters: 27 },
    { name: "民数记", chapters: 36 }, { name: "申命记", chapters: 34 }, { name: "约书亚记", chapters: 24 },
    { name: "士师记", chapters: 21 }, { name: "路得记", chapters: 4 }, { name: "撒母耳记上", chapters: 31 },
    { name: "撒母耳记下", chapters: 24 }, { name: "列王纪上", chapters: 22 }, { name: "列王纪下", chapters: 25 },
    { name: "历代志上", chapters: 29 }, { name: "历代志下", chapters: 36 }, { name: "以斯拉记", chapters: 10 },
    { name: "尼希米记", chapters: 13 }, { name: "以斯帖记", chapters: 10 }, { name: "约伯记", chapters: 42 },
    { name: "诗篇", chapters: 150 }, { name: "箴言", chapters: 31 }, { name: "传道书", chapters: 12 },
    { name: "雅歌", chapters: 8 }, { name: "以赛亚书", chapters: 66 }, { name: "耶利米书", chapters: 52 },
    { name: "耶利米哀歌", chapters: 5 }, { name: "以西结书", chapters: 48 }, { name: "但以理书", chapters: 12 },
    { name: "何西阿书", chapters: 14 }, { name: "约珥书", chapters: 3 }, { name: "阿摩司书", chapters: 9 },
    { name: "俄巴底亚书", chapters: 1 }, { name: "约拿书", chapters: 4 }, { name: "弥迦书", chapters: 7 },
    { name: "那鸿书", chapters: 3 }, { name: "哈巴谷书", chapters: 3 }, { name: "西番雅书", chapters: 3 },
    { name: "哈该书", chapters: 2 }, { name: "撒迦利亚书", chapters: 14 }, { name: "玛拉基书", chapters: 4 }
  ],
  NT: [
    { name: "马太福音", chapters: 28 }, { name: "马可福音", chapters: 16 }, { name: "路加福音", chapters: 24 },
    { name: "约翰福音", chapters: 21 }, { name: "使徒行传", chapters: 28 }, { name: "罗马书", chapters: 16 },
    { name: "哥林多前书", chapters: 16 }, { name: "哥林多后书", chapters: 13 }, { name: "加拉太书", chapters: 6 },
    { name: "以弗所书", chapters: 6 }, { name: "腓立比书", chapters: 4 }, { name: "歌罗西书", chapters: 4 },
    { name: "帖撒罗尼迦前书", chapters: 5 }, { name: "帖撒罗尼迦后书", chapters: 3 }, { name: "提摩太前书", chapters: 6 },
    { name: "提摩太后书", chapters: 4 }, { name: "提多书", chapters: 3 }, { name: "腓利门书", chapters: 1 },
    { name: "希伯来书", chapters: 13 }, { name: "雅各书", chapters: 5 }, { name: "彼得前书", chapters: 5 },
    { name: "彼得后书", chapters: 3 }, { name: "约翰一书", chapters: 5 }, { name: "约翰二书", chapters: 1 },
    { name: "约翰三书", chapters: 1 }, { name: "犹大书", chapters: 1 }, { name: "启示录", chapters: 22 }
  ]
};

export const INITIAL_BIBLE_DATA: BibleChapter[] = [
  {
    book: "创世记",
    chapter: 1,
    content: [
      "1 起初，神创造天地。",
      "2 地是空虚混沌，渊面黑暗；神的灵运行在水面上。",
      "3 神说：“要有光”，就有了光。",
      "4 神看光是好的，就把光暗分开了。",
      "5 神称光为“昼”，称暗为“夜”。有晚上，有早晨，这是头一日。"
    ]
  },
  {
    book: "诗篇",
    chapter: 23,
    content: [
      "1 耶和华是我的牧者，我必不至缺乏。",
      "2 他使我躺卧在青草地上，领我在可安歇的水边。",
      "3 他使我的灵魂苏醒，为自己的名引导我走义路。",
      "4 我虽然行过死荫的幽谷，也不怕遭害，因为你与我同在；你的杖，你的杖，都安慰我。",
      "5 在我敌人面前，你为我摆设筵席；你用油膏了我的头，使我的福杯满溢。",
      "6 我一生一世必有恩惠慈爱随着我；我且要住在耶和华的殿中，直到永远。"
    ]
  }
];

export const PRAISE_SONGS: Song[] = [
  { id: 's1', title: '这一生最美的祝福', artist: '赞美之泉', duration: '04:20' },
  { id: 's2', title: '恩典之路', artist: '赞美之泉', duration: '03:45' },
  { id: 's3', title: '如鹿切慕溪水', artist: '约书亚乐团', duration: '05:10' },
];

export const GIFT_ITEMS = [
  { id: 'g1', name: '阿们', icon: '🙏', cost: 0, theme: 'amber', effect: 'float' },
  { id: 'g2', name: '蜡烛', icon: '🕯️', cost: 10, theme: 'orange', effect: 'glow' },
  { id: 'g3', name: '百合花', icon: '⚜️', cost: 20, theme: 'blue', effect: 'bloom' },
  { id: 'g4', name: '圣经', icon: '📖', cost: 50, theme: 'purple', effect: 'holy' },
  { id: 'g5', name: '鸽子', icon: '🕊️', cost: 100, theme: 'rose', effect: 'fly' },
];

export const QUICK_RESPONSES = [
  { text: '阿们', icon: '🙏' },
  { text: '哈利路亚', icon: '🙌' },
  { text: '我领受', icon: '🤲' },
  { text: '我相信', icon: '❤️' },
  { text: '我悔改', icon: '🙇' },
  { text: '感谢主', icon: '✨' },
  { text: '求主怜悯', icon: '💧' },
];

export const PRAYER_RESPONSES = [
  { text: '阿们', icon: '🙏' },
  { text: '赞美主', icon: '🙌' },
  { text: '感谢主', icon: '✨' },
  { text: '是的,主啊', icon: '🙇' },
  { text: '求主垂听', icon: '👂' },
  { text: '哈利路亚', icon: '🎵' },
];
