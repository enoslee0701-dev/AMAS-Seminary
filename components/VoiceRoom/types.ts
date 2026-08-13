// --- VoiceRoom Types ---

export type RoomType = 'prayer' | 'praise' | 'bible' | 'preaching' | 'fellowship';

export interface Room {
  id: string;
  type: RoomType;
  label: string;
  icon: any;
  color: string;
  bg: string;
  desc: string;
  announcement?: string;
  action: 'voice' | 'filter';
  participants?: number;
  isCustom?: boolean;
  hostId?: string;
  password?: string; // Room password
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  duration: string;
}

export interface BibleChapter {
  book: string;
  chapter: number;
  content: string[];
}

export interface Participant {
  id: string;
  name: string;
  avatar: string;
  isSpeaking: boolean;
  role: 'host' | 'admin' | 'speaker' | 'listener' | 'member';
  degree?: string; // 学位信息
  isMutedByHost?: boolean;
}

export interface GiftEffect {
  id: number;
  icon: string;
  type: 'float' | 'burst' | 'fly' | 'holy';
  color: string;
  x: number;
  y: number;
  scale?: number;
}
