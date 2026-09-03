/**
 * Lazy-opened, singleton SQLite handle.
 *
 * File path comes from env (`DB_PATH`). When unset we default to
 * `<backend>/data/amas.sqlite`. Tests pass `DB_PATH=:memory:` so each
 * spawn gets a fresh in-process database that vanishes on close — no
 * file-system isolation tricks needed.
 *
 * Schema is applied via straightforward `CREATE TABLE IF NOT EXISTS`
 * statements at module load — no migration system yet. A future
 * Postgres swap would warrant one; for the wave-1 stores (users,
 * refresh-token jti, rooms, push tokens) the schema is small and
 * additive enough that ad-hoc DDL is fine.
 *
 * All callers should `import { db } from '../db.js'` (or '../../db.js')
 * and use prepared statements — never construct ad-hoc SQL strings
 * with user input.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the SQLite file path. `:memory:` is a special sentinel
 * supported natively by better-sqlite3 — DO NOT mkdir for it.
 */
function resolveDbPath(): string {
  const envPath = (process.env.DB_PATH ?? '').trim();
  if (envPath) return envPath;
  // src/db.ts → src → backend. Default to backend/data/amas.sqlite.
  const backendRoot = path.resolve(__dirname, '..');
  return path.join(backendRoot, 'data', 'amas.sqlite');
}

const DB_PATH = resolveDbPath();

if (DB_PATH !== ':memory:') {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
}

export const db: Database.Database = new Database(DB_PATH);

// WAL gives much better concurrency for our read-heavy workload, and is
// no-op for `:memory:` (better-sqlite3 silently ignores it there).
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Schema. Each block is independent — running them on a pre-existing
 * file is a no-op thanks to `IF NOT EXISTS`. Adding columns later will
 * require either a migration tool or an ALTER TABLE here; for now
 * wave-1 only.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student','admin')) DEFAULT 'student',
    degree TEXT,
    avatar TEXT,
    bio TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS refresh_jti (
    user_id TEXT NOT NULL,
    jti TEXT NOT NULL,
    PRIMARY KEY (user_id, jti)
  );

  CREATE TABLE IF NOT EXISTS rooms (
    room_id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    password_hash TEXT,
    salt TEXT,
    created_at INTEGER NOT NULL
  );

  -- ===== 代祷举报（SEC-3）=====
  -- 最小可用设计，不做大型审核平台。
  -- UNIQUE(share_id, reporter_user_id) 防止同一用户对同一条反复举报。
  CREATE TABLE IF NOT EXISTS prayer_share_reports (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL,
    reporter_user_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK(reason IN ('privacy','harassment','spam','unsafe','other')),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),
    created_at INTEGER NOT NULL,
    UNIQUE (share_id, reporter_user_id),
    FOREIGN KEY (share_id) REFERENCES prayer_shares(id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_reports_share ON prayer_share_reports(share_id);

  -- ===== 房间成员（SEC-2 授权模型）=====
  --
  -- room_members 是**授权**的唯一依据；room_presence 只是**在线状态**。
  -- 两者严格分离：断网 / 切后台 / 心跳超时只影响 presence，绝不影响 membership；
  -- 只有用户显式 Leave 才解除成员关系。
  --
  -- 房主权限的唯一真相源仍是 rooms.host_id——这里刻意不放 role 字段，
  -- 避免出现两个 host source of truth。
  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);

  -- ===== 祷告室（Prayer Room）=====
  -- 本次祷告主题：取代原先只存在 localStorage 的「祷告墙」纯文本，
  -- 让房主编辑的内容对全房可见。只有房主/管理员可写。
  CREATE TABLE IF NOT EXISTS room_prayer_topics (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_prayer_topics_room ON room_prayer_topics(room_id, seq);

  -- 祷告分享。内容常涉及第三方的敏感信息（家人的病情等），因此：
  -- 仅房内可见、支持匿名、发布者可随时软删除（deleted_at）。
  CREATE TABLE IF NOT EXISTS prayer_shares (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_prayer_shares_room ON prayer_shares(room_id, created_at);

  -- 代祷登记。这不是「点赞」——给「求主医治我母亲」点赞在语义上是错的。
  -- 一人对一条只能登记一次，可取消。
  CREATE TABLE IF NOT EXISTS prayer_intercessions (
    share_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (share_id, user_id)
  );

  -- 在线成员：心跳 + 超时判离线（轮询档，不需要 WebSocket）。
  CREATE TABLE IF NOT EXISTS room_presence (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT,
    role TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_room_presence_seen ON room_presence(room_id, last_seen_at);

  CREATE TABLE IF NOT EXISTS push_tokens (
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('ios','android','web')),
    registered_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, token)
  );
  CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

  -- ---------------------------------------------------------------------
  -- Wave-2 schemas. These mirror the in-memory stores they replace; the
  -- public function/route signatures are unchanged. Where the previous
  -- shape used a Set (e.g. post likes) or a Map of Maps (course
  -- progress, favorites) we use a junction/PK pair instead. Where the
  -- shape was an opaque JS object (sharedRoom on a post) we serialise
  -- to JSON in a TEXT column and parse on read.
  -- ---------------------------------------------------------------------

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    user_role TEXT,
    content TEXT NOT NULL,
    images_json TEXT NOT NULL DEFAULT '[]',
    category TEXT,
    shared_room_json TEXT,
    linked_course_id TEXT,
    timestamp INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

  CREATE TABLE IF NOT EXISTS post_likes (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);

  CREATE TABLE IF NOT EXISTS post_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    user_role TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at);

  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('important','normal')) DEFAULT 'normal',
    published_at INTEGER NOT NULL,
    published_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON announcements(published_at DESC);

  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    instructor TEXT,
    category TEXT,
    level TEXT,
    thumbnail TEXT,
    thumbnail_image_id TEXT,
    total_lessons INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    created_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_courses_created_at ON courses(created_at DESC);

  CREATE TABLE IF NOT EXISTS course_progress (
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    completed_lessons INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON friend_requests(from_user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_requests_pair ON friend_requests(from_user_id, to_user_id);

  CREATE TABLE IF NOT EXISTS friendships (
    user_a TEXT NOT NULL,
    user_b TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_a, user_b)
  );

  CREATE TABLE IF NOT EXISTS library_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    category TEXT,
    cover_image_id TEXT,
    cover_url TEXT,
    publisher TEXT,
    year INTEGER,
    description TEXT,
    added_at INTEGER NOT NULL,
    added_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_library_books_added_at ON library_books(added_at DESC);

  CREATE TABLE IF NOT EXISTS library_favorites (
    user_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    favorited_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, book_id)
  );

  CREATE TABLE IF NOT EXISTS cooperation_submissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    organization TEXT,
    message TEXT,
    type TEXT,
    received_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cooperation_received_at ON cooperation_submissions(received_at DESC);

  CREATE TABLE IF NOT EXISTS image_uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    purpose TEXT,
    uploaded_by TEXT,
    uploaded_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    room_id TEXT,
    user_id TEXT,
    uploaded_at INTEGER NOT NULL
  );

  -- Course material files. Binary lives on disk (uploads/course-files);
  -- this table is the metadata index so uploads survive restarts.
  CREATE TABLE IF NOT EXISTS course_files (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploader_id TEXT,
    uploaded_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_course_files_course ON course_files(course_id, uploaded_at);

  -- Christian growth profile (定制化神学/恩赐/事奉 modules) — one JSON doc
  -- per user, same pattern as pt_state. The assessment engines live in the
  -- client today; this is the shared, headless profile store both the App
  -- and a future Web Discover entry read/write.
  CREATE TABLE IF NOT EXISTS growth_state (
    user_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Pocket Theology per-user state (XP / streak / lesson progress /
  -- journal / favorites). Stored as one JSON blob per user: the frontend
  -- owns the merge semantics and the whole state is read & written
  -- together, so a normalized schema would only add joins.
  CREATE TABLE IF NOT EXISTS pt_state (
    user_id TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

/**
 * SEC-3 迁移：为既有表增列。
 *
 * SQLite 的 ALTER TABLE ADD COLUMN 无法附加 CHECK，因此 role 的取值
 * 由服务端强制（见 roomAuth.ts）。所有语句幂等，重复启动无副作用。
 *
 * §21 安全升级保证：
 *   - role 默认 'member'，现有 membership 一条不丢；
 *   - **不把任何现有普通成员自动提升为 moderator**；
 *   - rooms.host_id='system' 保持不变。
 */
function hasColumn(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some(c => c.name === column);
}
{
  const added: string[] = [];
  if (!hasColumn('room_members', 'role')) {
    db.exec(`ALTER TABLE room_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member'`);
    added.push('room_members.role');
  }
  // 内容隐藏（moderation hide）——**不物理删除**，正文保留供治理与申诉
  for (const [col, ddl] of [
    ['hidden_at', 'ALTER TABLE prayer_shares ADD COLUMN hidden_at INTEGER'],
    ['hidden_by', 'ALTER TABLE prayer_shares ADD COLUMN hidden_by TEXT'],
    ['hidden_reason', 'ALTER TABLE prayer_shares ADD COLUMN hidden_reason TEXT'],
    ['client_request_id', 'ALTER TABLE prayer_shares ADD COLUMN client_request_id TEXT'],
  ] as [string, string][]) {
    if (!hasColumn('prayer_shares', col)) { db.exec(ddl); added.push(`prayer_shares.${col}`); }
  }
  // 幂等唯一键：同一 user 在同一 room 用同一 clientRequestId 只能产生一条。
  // 部分索引跳过 NULL，因此历史数据与不带 id 的请求不受影响。
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_share_idem
           ON prayer_shares(room_id, user_id, client_request_id)
           WHERE client_request_id IS NOT NULL`);
  if (added.length) console.log(`[amas-backend] SEC-3 migration: +${added.join(', ')}`);
}

/**
 * SEC-2 种子：App 内置的 5 个公共房间。
 *
 * 这些房间定义在前端 CommunityView 里，从来没有登记进 rooms 表。
 * SEC-2 给 prayer API 加上 requireRoomExists 之后，真实用户进入内置祷告室
 * 会直接 404——因此必须把它们登记为**无密码的公共房间**。
 *
 * host_id 记为 'system'：'system' 不是真实用户，所以
 *   - 不会创建 room_members 行（addMember 的存在性守卫会跳过）；
 *   - 任何真实用户在这些房间里都不是房主，无法编辑祷告主题。
 * 这是刻意的保守选择——内置公共房间目前没有归属人，
 * 由谁担任房主是产品决策，不应由本轮的安全改动顺手决定。
 */
const PUBLIC_ROOMS = ['prayer_room', 'praise_room', 'bible_reading', 'preaching_room', 'fellowship_room'];
const seedRoom = db.prepare(
  `INSERT OR IGNORE INTO rooms (room_id, host_id, password_hash, salt, created_at) VALUES (?, 'system', NULL, NULL, ?)`,
);
{
  const t = Date.now();
  let seeded = 0;
  for (const id of PUBLIC_ROOMS) seeded += seedRoom.run(id, t).changes;
  if (seeded > 0) console.log(`[amas-backend] seeded ${seeded} built-in public room(s)`);
}

/**
 * SEC-2 迁移回填：房主必须是成员。
 *
 * 现有数据库里已经存在房间，新增 room_members 后若不回填，
 * 这些房间的房主会立刻失去访问权。这里按 rooms.host_id 补齐。
 *
 * **刻意不从 room_presence 回填其他历史参与者**——presence 是在线状态，
 * 不是成员关系的真相源；用它回填会把"曾经路过"永久变成"成员"。
 * 没有可靠历史成员数据时，只保证 host membership，其余用户重新 join 即可。
 *
 * 幂等：INSERT OR IGNORE + 只回填 users 表中确实存在的 host。
 */
const backfilled = db.prepare(`
  INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at, updated_at)
  SELECT r.room_id, r.host_id, r.created_at, ?
  FROM rooms r
  WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = r.host_id)
`).run(Date.now());
if (backfilled.changes > 0) {
  console.log(`[amas-backend] room_members backfill: +${backfilled.changes} host membership(s)`);
}


/**
 * TEST-ONLY: wipe all rows in every wave-1 table. Guarded by
 * `NODE_ENV === 'test'` so production code can't blow itself up.
 *
 * Most tests rely on `DB_PATH=:memory:` for isolation; this helper is
 * useful for the rare in-process suite that wants to reset state
 * without restarting the server.
 */
export function resetDb(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetDb() is only available in NODE_ENV=test.');
  }
  db.exec(`
    DELETE FROM users;
    DELETE FROM refresh_jti;
    DELETE FROM prayer_share_reports;
    DELETE FROM room_members;
    DELETE FROM room_presence;
    DELETE FROM prayer_intercessions;
    DELETE FROM prayer_shares;
    DELETE FROM room_prayer_topics;
    DELETE FROM rooms;
    DELETE FROM push_tokens;
    DELETE FROM posts;
    DELETE FROM post_likes;
    DELETE FROM post_comments;
    DELETE FROM announcements;
    DELETE FROM courses;
    DELETE FROM course_progress;
    DELETE FROM friend_requests;
    DELETE FROM friendships;
    DELETE FROM library_books;
    DELETE FROM library_favorites;
    DELETE FROM cooperation_submissions;
    DELETE FROM image_uploads;
    DELETE FROM recordings;
    DELETE FROM course_files;
    DELETE FROM pt_state;
    DELETE FROM growth_state;
  `);
}
