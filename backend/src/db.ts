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
import { dropObsoleteRoomForeignKeys } from './migrations/db12RoomFkCompat.js';

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

  -- AUTH-M7 · Supabase 身份 → canonical AMAS 用户的映射。
  --
  -- schema owner 是本文件，**不是** backend/scripts/identity-migration-apply.mjs。
  -- 该脚本此前自带一份 DDL，导致「没跑过迁移的库根本没有这张表」——
  -- 运行时一 SELECT 就是 SQLITE_ERROR，每个 Supabase 请求 500。
  -- 现在 fresh install / dev / test fixture / CI / 既有部署拿到的是同一份 schema；
  -- 迁移脚本只负责写数据。
  --
  -- 表空不是错误状态：空表 = 还没有人被 provision，运行时一律
  -- 403 IDENTITY_NOT_PROVISIONED（fail closed），不是 500。
  CREATE TABLE IF NOT EXISTS legacy_user_map (
    legacy_user_id   TEXT PRIMARY KEY,
    supabase_user_id TEXT,
    normalized_email TEXT NOT NULL,
    mapping_status   TEXT NOT NULL,
    mapping_reason   TEXT NOT NULL,
    migration_batch  TEXT NOT NULL,
    created_at       INTEGER NOT NULL
  );
  -- 一个 Supabase 身份只能映射到一个 canonical 用户。部分索引跳过尚未
  -- provision 的行（supabase_user_id 为 NULL），它们本来就不允许通过认证。
  CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_map_supabase
    ON legacy_user_map(supabase_user_id) WHERE supabase_user_id IS NOT NULL;

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

  -- ===== Realtime 事件（Phase 3）=====
  --
  -- **这是 transport 基础设施，不是业务审计日志。**
  -- 业务历史在 prayer_session_events；这张表只用于「告诉客户端有东西变了」，
  -- 因此只保留最小信息，可定期裁剪（见 sweepRealtimeEvents）。
  --
  -- 刻意**不存**：代祷正文、匿名作者、姓名、email、举报人、hidden_by。
  -- 事件只是失效通知，客户端收到后回 REST 拿 canonical state。
  --
  -- 自增 id 作为单调递增 cursor，客户端用 lastEventId 断线续传。
  CREATE TABLE IF NOT EXISTS room_realtime_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('session.changed','prayer.changed','theme.changed','moderation.changed')),
    entity_id TEXT,
    entity_revision INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rt_events_room ON room_realtime_events(room_id, id);

  -- ===== 共享祷告会（Phase 2）=====
  --
  -- 服务器是唯一真相源。客户端的 useState / localStorage 一律不得决定
  -- 共享状态；current_item_id、started_at、facilitator 全部只存在这里。
  CREATE TABLE IF NOT EXISTS prayer_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('scheduled','active','ended')),
    created_by TEXT NOT NULL,
    facilitator_user_id TEXT,
    started_at INTEGER,
    ended_at INTEGER,
    current_item_id TEXT,
    -- 乐观并发控制：每次成功的 manager 命令 +1。
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    -- DB-12：房间已迁到 Postgres（public.app_rooms），SQLite 的 rooms 表不再被写入，
    -- 因此这条外键永远无法满足。房间存在性改由 requireRoomExists 中间件强制
    -- （它读 Postgres），所有 prayer 路由都挂了这个守卫 —— 保护从库级移到了应用层。
    -- rooms 表的 DDL 按 §12 保留作回滚参考，但不再作为本表的引用目标。
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (facilitator_user_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_room ON prayer_sessions(room_id, status);
  -- 同一房间同一时刻只能有一个 active session。**数据库层保证**，
  -- 不依赖「先 SELECT 再 INSERT」那种存在竞态的逻辑。
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_session_per_room
    ON prayer_sessions(room_id) WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS prayer_session_items (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    scripture_ref TEXT,
    scripture_text TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (session_id, position),
    FOREIGN KEY (session_id) REFERENCES prayer_sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_session_items ON prayer_session_items(session_id, position);

  -- 轻量事件日志：调试 / 历史 / 未来审计。**不存代祷正文**。
  CREATE TABLE IF NOT EXISTS prayer_session_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('created','started','item_changed','facilitator_changed','ended')),
    from_item_id TEXT,
    to_item_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES prayer_sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_session_events ON prayer_session_events(session_id, created_at);

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
    -- 作者账号可能已注销：user_id 允许为空，语义由 author_state 表达。
    -- 铁律（D-AUTH-1 / 工程规则 R-10）：**缺失作者 ≠ system author**。
    -- 内容保留，但不得重新赋予任何虚构或替代所有者。
    user_id TEXT,
    author_state TEXT NOT NULL DEFAULT 'active'
      CHECK(author_state IN ('active','deleted_account')),
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

  -- ===== 房间共享阅读位置（P1-2）=====
  --
  -- 只存**位置**，不存经文正文。正文由各客户端用自己的阅读器加载
  -- （public/scripture/cuv.json），避免内容漂移、数据重复与多译本状态混乱。
  --
  -- book 存的是**中文书名**（「约翰福音」），与 cuv.json 的键、
  -- constants.ts 的 BIBLE_STRUCTURE、以及 loadScripture(book, chapter) 完全同一套标识。
  -- 刻意不引入数字 book id —— 那会凭空造出第三套映射需要人工维护。
  --
  -- verse 可为 NULL：当前阅读器按「章」显示，没有按节定位的入口。
  -- 字段留着是因为 API 已支持精确到节，UI 具备该能力时无需再改 schema。
  --
  -- 每个房间至多一行（room_id 为主键）。没有行 = 尚未设置共同阅读位置，
  -- 这是合法状态，接口返回 null，**不伪造成创世记 1:1**。
  --
  -- revision 沿用祷告会那套乐观并发：PUT 必须带 expectedRevision，
  -- 条件更新 changes===0 即冲突 409。不另造一套锁。
  CREATE TABLE IF NOT EXISTS room_reading_state (
    room_id TEXT PRIMARY KEY,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL
    -- DB-12：同上 —— 房间已迁到 Postgres，指向 SQLite rooms 的外键不再可满足。
    -- 房间存在性由 requireRoomExists 在应用层强制。
  );

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
  // Phase 2.5：祷告会主题（可选）
  if (!hasColumn('prayer_sessions', 'title')) {
    db.exec(`ALTER TABLE prayer_sessions ADD COLUMN title TEXT`);
    added.push('prayer_sessions.title');
  }
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
 * DB-12 兼容迁移：拆掉升级安装上指向 SQLite `rooms` 的失效外键。
 *
 * 上面的建表语句已经不再声明这两条外键，但 `CREATE TABLE IF NOT EXISTS`
 * 不会改动既有表。所以**已经存在**的 amas.sqlite 仍然带着
 * `prayer_sessions.room_id → rooms(room_id)` 与
 * `room_reading_state.room_id → rooms(room_id)`，
 * 而房间已由 Postgres 拥有 —— 那两条外键永远无法满足。
 *
 * 放在 SEC-3 增列之后：重建表时要照抄该表**当下**的真实 DDL，
 * 必须先让 ALTER TABLE ADD COLUMN 全部落地（例如 prayer_sessions.title）。
 *
 * 幂等：新库与已升级库都是 NO-OP。失败即抛错，宁可启动失败也不带着
 * 半迁移状态跑 —— 详见 migrations/db12RoomFkCompat.ts。
 */
{
  const rebuilt = dropObsoleteRoomForeignKeys(db);
  if (rebuilt.length) {
    console.log(
      `[amas-backend] DB-12 兼容迁移：已移除 ${rebuilt.join(', ')} 指向 rooms 的失效外键`,
    );
  }
}

/**
 * DB-12：内置公共房间的种子与 host membership 回填**已移除**。
 *
 * 原因：房间与成员制已迁到 Postgres（`public.app_rooms` / `app_room_members`），
 * 那里已经存在 5 个 `host_type='system'` 的内置房间。继续在这里播种 SQLite
 * 会构成迁移域的双写——正是 DB-12 §12 要求归零的东西。
 *
 * 曾经在这里的两段逻辑，现在的归属：
 *   · 内置房间的存在性 —— 由 Postgres 的 app_rooms 保证（DB-3 迁入，已实测 5 行）
 *   · 房主必须是成员 —— 由 routes/rooms.ts 建房时原子地建立 host membership 保证
 *
 * `rooms` / `room_members` / `room_presence` 三张 SQLite 表的 DDL 按 §12 保留，
 * 仅作回滚与参考源，运行时不再写入。
 */

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
    DELETE FROM room_realtime_events;
    DELETE FROM prayer_session_events;
    DELETE FROM prayer_session_items;
    DELETE FROM prayer_sessions;
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
