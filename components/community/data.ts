/**
 * Seed data for the community feed / contacts / conversations.
 *
 * Extracted from CommunityView.tsx so App.tsx can import the constants
 * eagerly at module scope (they're used to initialize useState) without
 * pulling the heavy CommunityView component graph into the main bundle.
 * CommunityView itself is now route-split via React.lazy.
 *
 * Keep this file dependency-light: only types + tiny helper functions from
 * services/. No React, no large libs.
 */
import { MOCK_USER } from '../../constants';
import { initialAvatar } from '../../services/imageFallback';
import { STOCK_PHOTOS } from '../../services/stockPhotos';
import type { Room } from '../VoiceRoom';

export interface Liker {
  id: string;
  name: string;
  avatar: string;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  userAvatar?: string;
  userRole?: string;
}

export interface CommunityPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userRole: string;
  content: string;
  image?: string; // Legacy support
  images?: string[]; // Support multiple images
  timestamp: string;
  likes: number;
  comments: number;
  likedByMe: boolean;
  likedByUsers: Liker[];
  commentList?: Comment[];
  category: string;
  connectionStatus: 'none' | 'sent' | 'connected';
  sharedRoom?: Room;
  linkedCourseId?: string; // Support linking a course
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  location?: string;
  avatar: string;
  status: 'none' | 'sent' | 'received' | 'connected';
  contactInfo?: {
    phone: string;
    email: string;
  };
}

export interface ChatMessage {
  id: string;
  user: string;
  userAvatar?: string;
  text: string;
  type?: 'text' | 'verse' | 'hymn' | 'gift' | 'system';
  giftData?: { name: string; icon: string; theme?: string };
}

export interface Conversation {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  isOnline: boolean;
  lastMessage: string;
  time: string;
  unread: number;
  role: string;
  isGroup?: boolean;
}

export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    userId: 'u1',
    userName: '教务处通知',
    userAvatar: initialAvatar('u1', '教务处'),
    isOnline: true,
    lastMessage: '请记得提交下学期的选课申请表，截止日期是本周五。',
    time: '09:45',
    unread: 2,
    role: 'Admin'
  },
  {
    id: 'c2',
    userId: 'u2',
    userName: '林恩典',
    userAvatar: initialAvatar('u2', '林恩典'),
    isOnline: true,
    lastMessage: '谢谢你的代祷！事情已经顺利解决了。',
    time: '昨天',
    unread: 0,
    role: 'M.Div 2022'
  },
  {
    id: 'c3',
    userId: 'u3',
    userName: '李保罗 博士',
    userAvatar: initialAvatar('u3', 'Paul Lee'),
    isOnline: false,
    lastMessage: '论文的大纲我已经看过了，有几个地方需要修改。',
    time: '星期一',
    unread: 1,
    role: 'Professor'
  },
  {
    id: 'c4',
    userId: 'u4',
    userName: '张彼得',
    userAvatar: initialAvatar('u4', '张彼得'),
    isOnline: false,
    lastMessage: '明晚的小组聚会你会来吗？',
    time: '星期一',
    unread: 0,
    role: 'B.Th 2024'
  }
];

export const INITIAL_POSTS: CommunityPost[] = [
  {
    id: 'p1',
    userId: 'u2',
    userName: '林恩典',
    userAvatar: initialAvatar('u2', '林恩典'),
    userRole: 'M.DIV',
    content: '今早灵修读到诗篇23篇，“他使我的灵魂苏醒”。在期末考试的压力中，感谢神赐下的平安。求主这也保守正在准备讲道的同学们。',
    images: [STOCK_PHOTOS.prayer],
    timestamp: '2小时前',
    likes: 3,
    comments: 2,
    likedByMe: true,
    likedByUsers: [
        { id: 'me', name: MOCK_USER.name, avatar: MOCK_USER.avatar },
        { id: 'u3', name: '张彼得', avatar: initialAvatar('u3', '张彼得') },
        { id: 'u4', name: 'Sarah Chen', avatar: initialAvatar('u4', 'Sarah Chen') },
    ],
    commentList: [
        {
            id: 'c1',
            userId: 'u3',
            userName: '张彼得',
            content: '阿们！这句经文也常常安慰我任务。',
            userAvatar: initialAvatar('u3', '张彼得'),
            userRole: 'B.Th 2024'
        },
        {
            id: 'c2',
            userId: 'u4',
            userName: 'Sarah Chen',
            content: '加油！为你祷告。',
            userAvatar: initialAvatar('u4', 'Sarah Chen'),
            userRole: 'D.Min 2023'
        }
    ],
    category: 'general',
    connectionStatus: 'connected',
  },
  {
    id: 'p2',
    userId: 'u3',
    userName: '张彼得',
    userAvatar: initialAvatar('u3', '张彼得'),
    userRole: 'B.TH',
    content: '请大家为我在缅甸北部的短宣代祷。这里网络信号不好，但孩子们对福音的渴慕让我很感动。特别为明天的布道会祷告，求圣灵动工！',
    images: [STOCK_PHOTOS.campusCommunity, STOCK_PHOTOS.discipleship],
    timestamp: '4小时前',
    likes: 56,
    comments: 0,
    likedByMe: false,
    likedByUsers: [
        { id: 'u2', name: '林恩典', avatar: initialAvatar('u2', '林恩典') },
        { id: 'u5', name: '王以诺', avatar: initialAvatar('u5', '王以诺') },
    ],
    category: 'mission',
    connectionStatus: 'none',
  },
];

export const INITIAL_CONTACTS: Contact[] = [
  {
    id: 'c1', name: 'Sarah Chen', role: 'D.Min 2023', location: '香港',
    avatar: initialAvatar('c1', 'Sarah Chen'),
    status: 'received',
    contactInfo: { phone: '+852 9876 5432', email: 'sarah.chen@amas.hk' }
  },
  {
    id: 'c2', name: '金大卫', role: 'M.Div 2024', location: '首尔',
    avatar: initialAvatar('c2', '金大卫'),
    status: 'none'
  },
  {
    id: 'c3', name: '王以诺', role: 'B.Th 2023', location: '台北',
    avatar: initialAvatar('c3', '王以诺'),
    status: 'none'
  },
  {
    id: 'c4', name: 'Maria Santos', role: 'M.A 2022', location: 'Manila',
    avatar: initialAvatar('c4', 'Maria Santos'),
    status: 'none'
  },
  {
    id: 'c5', name: '李恩惠', role: 'M.Div 2021', location: '上海',
    avatar: initialAvatar('c5', '李恩惠'),
    status: 'none'
  },
];
