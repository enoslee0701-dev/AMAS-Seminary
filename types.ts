
export enum ViewState {
  HOME = 'HOME',
  COURSES = 'COURSES',
  COMMUNITY = 'COMMUNITY', // Restored Community
  LIBRARY = 'LIBRARY',
  PROFILE = 'PROFILE',
  CHAT = 'CHAT',
  AI_TUTOR = 'AI_TUTOR',
  COLLEGE_OVERVIEW = 'COLLEGE_OVERVIEW',
  ALL_ANNOUNCEMENTS = 'ALL_ANNOUNCEMENTS',
  COOPERATION = 'COOPERATION',
  POCKET_THEOLOGY = 'POCKET_THEOLOGY',
  COURSE_PATH = 'COURSE_PATH',
  COURSE_TRIAL = 'COURSE_TRIAL',
  CUSTOM_THEOLOGY = 'CUSTOM_THEOLOGY'
}

export enum TheologyCategory {
  NT = '新约书卷',
  OT = '旧约书卷',
  BIBLE_BASICS = '圣经基础与研经',
  THEOLOGY = '神学与思想',
  PRACTICAL = '实践神学与牧养',
  HISTORY = '历史与文化',
  LANGUAGE = '语言与工具'
}

export enum AcademicLevel {
  BTH = 'B.Th',
  MDIV = 'M.Div',
  MPTH = 'M.P.Th',
  DMIN = 'D.Min',
  PHD = 'Ph.D.'
}

export interface Course {
  id: string;
  title: string;
  instructor: string;
  category: TheologyCategory;
  level?: AcademicLevel; // Added level field
  thumbnail: string;
  thumbnailImageId?: string; // IndexedDB key for user-uploaded thumbnails (preferred over inline data URIs in `thumbnail`).
  progress: number; // 0-100
  totalLessons: number;
  completedLessons: number;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  image?: string;
  timestamp: string;
  likes: number;
  comments: number;
  likedByMe: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  backgroundImage?: string;
  degree: string;
  studentId: string;
  streakDays: number;
  totalHours: number;
  coursesCompleted: number;
  bio?: string;
  email?: string;
  phone?: string;
  role?: 'student' | 'teacher' | 'dean' | 'admin';
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'peer';
  text: string;
  timestamp: Date;
}

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  type: 'Notice' | 'Event' | 'Urgent';
  content?: string;
}
