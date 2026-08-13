// VoiceRoomOverlay itself is NOT re-exported here — App.tsx lazy-imports it
// directly from './VoiceRoomOverlay' so its (heavy, ~150KB Gemini SDK) chunk
// can split out. Type-only export is fine since types are erased at build.
export type { VoiceRoomOverlayProps } from './VoiceRoomOverlay';
export { default as UserProfileModal } from './modals/UserProfileModal';
export {
  THEME_CONFIGS,
  PRAISE_SONGS,
  INITIAL_BIBLE_DATA,
  BIBLE_STRUCTURE,
  GIFT_ITEMS,
  QUICK_RESPONSES,
  PRAYER_RESPONSES,
} from './constants';
export type {
  Room,
  RoomType,
  Participant,
  GiftEffect,
  BibleChapter,
  Song,
} from './types';
export {
  SAMPLE_RATE,
  floatTo16BitPCM,
  base64ToUint8Array,
  arrayBufferToBase64,
} from './audioUtils';
// `useGeminiLive` is intentionally NOT re-exported here — it imports
// @google/genai (~150 KB) which would otherwise leak into the main
// bundle through any consumer of this barrel (App.tsx, CommunityView,
// ChatView all pull THEME_CONFIGS / UserProfileModal from here).
// VoiceRoomOverlay.tsx imports it directly from './useGeminiLive', so
// it still ends up in the lazy VoiceRoom chunk where it belongs.
