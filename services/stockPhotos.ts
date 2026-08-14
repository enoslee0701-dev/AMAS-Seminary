/**
 * stockPhotos — locally bundled realistic photos (public/images/stock/).
 *
 * These are the app's hero/banner/thumbnail photographs, downloaded from
 * Unsplash at build time and shipped with the bundle so they render at
 * full fidelity with zero runtime network dependency (the reason the
 * original hotlinked URLs were removed — three of them had already 404'd).
 *
 * The SVG generators in imageFallback.ts remain the fallback for avatars
 * and for any slot without a suitable photo.
 */

export const STOCK_PHOTOS = {
  /** 阶梯教室 — campus / lectures */
  lectureHall: '/images/stock/architecture.jpg',
  /** 光照圣经 — scripture / biblical theology */
  bibleLight: '/images/stock/bible-light.jpg',
  /** 摊开的圣经 — bible intro */
  bibleOpen: '/images/stock/bible-open.jpg',
  /** 圣经与地图 — journeys / Acts */
  bibleMap: '/images/stock/bible-map.jpg',
  /** 旧书桌案 — scholarship / systematic theology */
  books: '/images/stock/books.jpg',
  /** 满墙藏书 — library / historical theology */
  libraryBooks: '/images/stock/library-books.jpg',
  /** 山峰 — Sermon on the Mount */
  mountain: '/images/stock/mountain.jpg',
  /** 云海日出 — glory / vision */
  worship: '/images/stock/worship.jpg',
  /** 壮丽天空 — Revelation */
  dramaticSky: '/images/stock/dramatic-sky.jpg',
  /** 基督徒生活 */
  christianLife: '/images/stock/christian-life.jpg',
  /** 门徒同行 */
  discipleship: '/images/stock/discipleship.jpg',
  /** 祷告 */
  prayer: '/images/stock/prayer.jpg',
  /** 实践服事 */
  practical: '/images/stock/practical.jpg',
  /** 宣教全球 */
  missionGlobe: '/images/stock/mission-globe.jpg',
  /** 毕业礼 */
  graduation: '/images/stock/graduation.jpg',
  /** 研读学习 */
  study: '/images/stock/study.jpg',
  /** 校园团契 */
  campusCommunity: '/images/stock/campus-community.jpg',
} as const;

export type StockPhotoKey = keyof typeof STOCK_PHOTOS;
