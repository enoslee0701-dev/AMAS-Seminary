/**
 * DB-13B · 剩余业务域 DAL 切换的验收护栏
 *
 * 「测试通过」在这一轮同样不足以说明问题 —— 如果切换只是让路由读到一张空表，
 * 断言照样会绿。所以每条都要证明**数据真的流经 Postgres 路径**：
 *
 *   1. 经 App 接口写入的数据落在 Postgres 侧
 *   2. **同一时刻 SQLite 对应表仍为空**（迁移域的 SQLite 写路径 = 0）
 *   3. 身份列写的是 Supabase UUID，不是 canonical SQLite id
 *   4. COMMUNITY 四个域**重启后仍能读回** —— 这是唯一能证明
 *      「进程内 Map 不再是真相源」的断言。切换前它必然失败。
 *
 * 复用唯一那套 helpers/supabaseHarness.ts —— 项目禁止第二套假 Supabase。
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  startFakeSupabase, provisionUser, freePort,
  type FakeSupabase, type ProvisionedUser,
} from './helpers/supabaseHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TSX = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const APP_SECRET = 'db13b-cutover-secret';
const DB_PATH = path.join(
  BACKEND_ROOT, '.tmp-test', `db13b-${process.pid}-${Date.now()}.sqlite`,
);

/** live staging 里真实存在的目录 code —— 目录是 canonical 只读的。 */
const COURSE = 'c_matthew';
const SYSTEM_ROOMS = ['prayer_room', 'praise_room', 'bible_reading',
  'preaching_room', 'fellowship_room'];

let sb: FakeSupabase;
let proc: ChildProcess | null = null;
let port = 0;
let baseUrl = '';
let alice: ProvisionedUser;
let bob: ProvisionedUser;
let admin: ProvisionedUser;

function request(
  method: string, pathname: string, body?: unknown, headers: Record<string, string> = {},
): Promise<{ status: number; json: any; text: string }> {
  const url = new URL(pathname, baseUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
      headers: {
        ...(payload
          ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
          : {}),
        ...headers,
      },
    }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => {
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* 非 JSON */ }
        resolve({ status: res.statusCode ?? 0, json, text });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

/** 只读地数一张 SQLite 表的行数 —— 用来证明迁移域没有再往 SQLite 写。 */
function sqliteCount(table: string): number {
  const d = new Database(DB_PATH, { readonly: true });
  try {
    return (d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  } finally {
    d.close();
  }
}

async function startServer(): Promise<void> {
  proc = spawn(process.execPath, [TSX, 'src/server.ts'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      APP_SECRET,
      GEMINI_API_KEY: 'dummy-gemini-key-for-tests',
      LIVEKIT_URL: 'wss://dummy.livekit.cloud',
      LIVEKIT_API_KEY: 'dummy-livekit-api-key',
      LIVEKIT_API_SECRET: 'dummy-livekit-api-secret-must-be-32-chars-long-xxxx',
      AGORA_APP_ID: 'dummy-agora-app-id',
      AGORA_APP_CERTIFICATE: 'dummy-agora-app-certificate',
      CORS_ORIGINS: '*',
      NODE_ENV: 'test',
      DB_PATH,
      SUPABASE_URL: sb.origin,
      SUPABASE_SERVICE_ROLE_KEY: 'db13b-service-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  proc.stderr?.on('data', c => { stderr += c.toString(); });
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 20_000) throw new Error(`server 未就绪：\n${stderr}`);
    try { if ((await request('GET', '/api/health')).status === 200) break; } catch { /* 等 */ }
    await new Promise(r => setTimeout(r, 150));
  }
}

async function stopServer(): Promise<void> {
  if (!proc) return;
  const p = proc;
  proc = null;
  p.kill('SIGTERM');
  await new Promise<void>(resolve => {
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* 已死 */ } resolve(); }, 1500);
    p.on('exit', () => { clearTimeout(t); resolve(); });
  });
}

before(async () => {
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  sb = await startFakeSupabase();
  // 内置公共房间与课程目录都只存在于 Postgres 侧。
  sb.seedTable('app_rooms', SYSTEM_ROOMS.map(id => ({
    id, host_type: 'system', host_user_id: null, host_orphaned_at: null,
    password_hash: null, password_salt: null, created_at: new Date(1000).toISOString(),
  })));
  sb.seedTable('course_catalog', [{
    code: COURSE, title_zh: '马太福音', category: 'nt', level: 'mdiv',
    instructor: 'Dr. Kim Joy', total_lessons: 26, availability: 'available',
    sort_order: 10, credits: null, thumbnail_path: null, thumbnail_image_id: null,
    created_at: new Date(0).toISOString(), created_by_provenance: 'db-6-migration',
  }]);

  port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  await startServer();

  alice = await provisionUser(DB_PATH, sb, {
    email: 'db13b-alice@example.test', name: '爱丽丝', role: 'student',
  });
  bob = await provisionUser(DB_PATH, sb, {
    email: 'db13b-bob@example.test', name: '鲍勃', role: 'student',
  });
  admin = await provisionUser(DB_PATH, sb, {
    email: 'db13b-admin@example.test', name: 'DB13B 管理员', role: 'admin',
  });
});

after(async () => {
  await stopServer();
  await sb?.stop();
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
});

const bearer = (u: ProvisionedUser) => ({ authorization: `Bearer ${u.accessToken}` });

// ═══════════════════════ COMMUNITY ═══════════════════════

describe('DB-13B · COMMUNITY', () => {
  let postId = '';

  test('发帖落在 Postgres，主体是 Supabase UUID', async () => {
    const r = await request('POST', '/api/posts',
      { content: '第一条动态', category: 'general' }, bearer(alice));
    assert.equal(r.status, 200, r.text);
    postId = r.json.id;
    assert.equal(r.json.userId, alice.supabaseUserId, '主体必须是 Supabase UUID');
    assert.equal(r.json.userName, '爱丽丝', '显示名来自服务端解析的 canonical user');

    const row = sb.tableRows('app_posts').find(x => x.id === postId);
    assert.ok(row, '动态没有落到 Postgres 路径');
    assert.equal(row!.user_id, alice.supabaseUserId);
  });

  test('点赞 / 评论落 Postgres，且计数由明细表得出', async () => {
    const like = await request('POST', `/api/posts/${postId}/like`, undefined, bearer(bob));
    assert.equal(like.status, 200, like.text);
    assert.equal(like.json.likes, 1);
    assert.equal(like.json.likedByMe, true);
    assert.equal(sb.tableRows('app_post_likes')
      .filter(x => x.post_id === postId && x.user_id === bob.supabaseUserId).length, 1);

    const c = await request('POST', `/api/posts/${postId}/comments`,
      { content: '同心祷告' }, bearer(bob));
    assert.equal(c.status, 200, c.text);
    assert.equal(sb.tableRows('app_post_comments')
      .filter(x => x.post_id === postId).length, 1);

    // 再点一次 = 取消赞（幂等切换，不是累加）
    const unlike = await request('POST', `/api/posts/${postId}/like`, undefined, bearer(bob));
    assert.equal(unlike.json.likes, 0);
    assert.equal(unlike.json.likedByMe, false);
  });

  test('列表把点赞数与评论一起批量带回，likedByMe 按查看者判定', async () => {
    await request('POST', `/api/posts/${postId}/like`, undefined, bearer(bob));
    const asBob = await request('GET', '/api/posts', undefined, bearer(bob));
    const p1 = asBob.json.find((x: any) => x.id === postId);
    assert.equal(p1.likes, 1);
    assert.equal(p1.likedByMe, true);
    assert.equal(p1.commentList.length, 1);

    const asAlice = await request('GET', '/api/posts', undefined, bearer(alice));
    const p2 = asAlice.json.find((x: any) => x.id === postId);
    assert.equal(p2.likes, 1);
    assert.equal(p2.likedByMe, false, '别人赞的不算我赞的');
  });

  test('不存在的关联课程不阻止发帖，但不会写进外键列', async () => {
    // `app_posts.linked_course_id` 外键到 course_catalog.code。
    // 客户端传一个不存在的 code，直接写会被外键拒绝、整条发帖失败。
    const r = await request('POST', '/api/posts',
      { content: '带一个失效课程链接', category: 'general', linkedCourseId: 'c_not_real' },
      bearer(alice));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.linkedCourseId, undefined, '目录里没有的 code 不得写入');

    const ok = await request('POST', '/api/posts',
      { content: '带真实课程链接', category: 'general', linkedCourseId: COURSE },
      bearer(alice));
    assert.equal(ok.json.linkedCourseId, COURSE, '目录里有的 code 应保留');
  });

  test('好友请求 → 接受 → 列表 → 解除，全程落 Postgres 且用 UUID', async () => {
    const send = await request('POST', '/api/friends/requests',
      { targetUserId: bob.supabaseUserId }, bearer(alice));
    assert.equal(send.status, 200, send.text);
    assert.equal(send.json.fromUserId, alice.supabaseUserId);
    assert.equal(sb.tableRows('app_friend_requests').length, 1);

    const accept = await request('POST', `/api/friends/requests/${send.json.id}/accept`,
      undefined, bearer(bob));
    assert.equal(accept.status, 200, accept.text);
    // 关系行是规范化的：同一段关系只有一行，与谁发起无关。
    const rel = sb.tableRows('app_friendships');
    assert.equal(rel.length, 1, '一段好友关系只应有一行');
    const [x, y] = [alice.supabaseUserId, bob.supabaseUserId].sort();
    assert.equal(rel[0]!.user_a, x);
    assert.equal(rel[0]!.user_b, y);
    assert.equal(sb.tableRows('app_friend_requests').length, 0, '接受后请求应被清除');

    // 双向可见，且显示名来自 profiles
    for (const [me, other] of [[alice, bob], [bob, alice]] as const) {
      const list = await request('GET', '/api/friends', undefined, bearer(me));
      assert.equal(list.status, 200, list.text);
      const found = list.json.find((f: any) => f.id === other.supabaseUserId);
      assert.ok(found, `${me.user.name} 的好友列表里应有 ${other.user.name}`);
      assert.equal(found.name, other.user.name, '显示名应来自 profiles');
    }

    const del = await request('DELETE', `/api/friends/${bob.supabaseUserId}`,
      undefined, bearer(alice));
    assert.equal(del.status, 200, del.text);
    assert.equal(sb.tableRows('app_friendships').length, 0);
  });

  test('公告落 Postgres；type 枚举两侧取值一致', async () => {
    const r = await request('POST', '/api/announcements',
      { title: '开学通知', content: '九月一日开学', type: 'important' }, bearer(admin));
    assert.equal(r.status, 200, r.text);
    const row = sb.tableRows('app_announcements').find(x => x.id === r.json.id);
    assert.ok(row);
    assert.equal(row!.type, 'important');
    assert.equal(row!.published_by, admin.supabaseUserId);

    const list = await request('GET', '/api/announcements');
    assert.ok(list.json.some((a: any) => a.id === r.json.id));
  });

  test('★ 重启后动态/评论/好友请求仍然读得回来（Map 不再是真相源）', async () => {
    const before = await request('GET', '/api/posts', undefined, bearer(alice));
    const beforeIds = (before.json as any[]).map(p => p.id).sort();
    assert.ok(beforeIds.length >= 3, '前置条件：应已有若干动态');

    await stopServer();
    await startServer();

    const after = await request('GET', '/api/posts', undefined, bearer(alice));
    assert.equal(after.status, 200, after.text);
    assert.deepEqual((after.json as any[]).map(p => p.id).sort(), beforeIds,
      '重启后动态必须一条不少 —— 切换前它们存在进程内 Map，重启即全丢');
    const p = (after.json as any[]).find(x => x.id === postId);
    assert.equal(p.commentList.length, 1, '评论也必须活过重启');
    assert.equal(p.likes, 1, '点赞也必须活过重启');
  });

  test('COMMUNITY 的 SQLite 表写入为 0', () => {
    for (const t of ['posts', 'post_likes', 'post_comments',
      'friend_requests', 'friendships', 'announcements',
      'image_uploads', 'recordings']) {
      assert.equal(sqliteCount(t), 0, `${t} 出现了 SQLite 写入 —— 迁移域不得双写`);
    }
  });
});

// ═══════════════════════ LEARNING ═══════════════════════

describe('DB-13B · LEARNING', () => {
  test('课程目录读自 canonical course_catalog，标签映射不变', async () => {
    const r = await request('GET', '/api/courses');
    assert.equal(r.status, 200, r.text);
    const c = r.json.find((x: any) => x.id === COURSE);
    assert.ok(c, '应读到目录里的课程');
    assert.equal(c.title, '马太福音');
    assert.equal(c.category, '新约书卷');
    assert.equal(c.level, 'M.Div');
    assert.equal(c.totalLessons, 26);
  });

  test('目录 admin 写路径已停用（501 + 明确 code），且不放宽授权', async () => {
    for (const [method, p] of [
      ['POST', '/api/courses'], ['PATCH', `/api/courses/${COURSE}`],
      ['DELETE', `/api/courses/${COURSE}`],
    ] as const) {
      const r = await request(method, p, method === 'DELETE' ? undefined : { title: 'x' },
        bearer(admin));
      assert.equal(r.status, 501, `${method} ${p} 应 501，实际 ${r.status}`);
      assert.equal(r.json.code, 'CATALOG_MUTATION_UNSUPPORTED');
    }
    // 非管理员仍先拿 403 —— 停用不等于放宽授权
    const asStudent = await request('POST', '/api/courses', { title: 'x' }, bearer(alice));
    assert.equal(asStudent.status, 403);
    // canonical 目录一行都没被删
    assert.equal(sb.tableRows('course_catalog').length, 1);
  });

  test('学习进度按 Supabase UUID 落 Postgres，用户之间互不干扰', async () => {
    const w = await request('POST', `/api/courses/${COURSE}/progress`,
      { progress: 40, completedLessons: 10 }, bearer(alice));
    assert.equal(w.status, 200, w.text);
    const row = sb.tableRows('app_course_progress')
      .find(x => x.user_id === alice.supabaseUserId && x.course_code === COURSE);
    assert.ok(row, '进度没有落到 Postgres');
    assert.equal(row!.progress, 40);

    const bobRead = await request('GET', `/api/courses/${COURSE}/progress`,
      undefined, bearer(bob));
    assert.equal(bobRead.json.progress, 0, '不得看到别人的进度');
    assert.equal(sqliteCount('course_progress'), 0);
  });

  test('growth（信仰成长档案）落 app_christian_profile，state 是 jsonb 对象', async () => {
    const put = await request('PUT', '/api/growth/state',
      { state: { version: 2, scores: { mercy: 7 } } }, bearer(alice));
    assert.equal(put.status, 200, put.text);
    const row = sb.tableRows('app_christian_profile')
      .find(x => x.user_id === alice.supabaseUserId) as any;
    assert.ok(row, 'growth 没有落到 Postgres');
    // ★ 必须是结构化对象，不是「一段恰好是 JSON 的字符串」。
    assert.equal(typeof row.state, 'object');
    assert.equal(row.state.scores.mercy, 7);
    // 两列语义指纹刻意不填 —— App 侧没有产出它们的权威定义。
    assert.equal(row.source_raw_hash, undefined);
    assert.equal(row.canonical_semantic_hash, undefined);

    const get = await request('GET', '/api/growth/state', undefined, bearer(alice));
    assert.equal(get.json.state.version, 2);
    assert.equal(sqliteCount('growth_state'), 0);
  });

  test('pt（Pocket Theology）落 app_practice_training_state', async () => {
    const put = await request('PUT', '/api/pt/state',
      { state: { xp: 120, streak: 3 } }, bearer(bob));
    assert.equal(put.status, 200, put.text);
    const row = sb.tableRows('app_practice_training_state')
      .find(x => x.user_id === bob.supabaseUserId) as any;
    assert.ok(row);
    assert.equal(row.state.xp, 120);
    const get = await request('GET', '/api/pt/state', undefined, bearer(bob));
    assert.equal(get.json.state.streak, 3);
    assert.equal(sqliteCount('pt_state'), 0);
  });

  test('图书馆书目与收藏落 Postgres；收藏切换幂等', async () => {
    const created = await request('POST', '/api/library/books',
      { title: '认识神', author: '巴刻', category: '灵修' }, bearer(admin));
    assert.equal(created.status, 200, created.text);
    const bookId = created.json.id;
    assert.equal(created.json.addedBy, 'system', 'added_by 是 uuid，不再当展示名回传');
    assert.equal(sb.tableRows('app_library_books').filter(x => x.id === bookId).length, 1);

    const on = await request('POST', `/api/library/favorites/${bookId}`, undefined, bearer(alice));
    assert.equal(on.json.favorited, true);
    assert.equal(on.json.count, 1);
    assert.equal(sb.tableRows('app_library_favorites')
      .filter(x => x.user_id === alice.supabaseUserId && x.book_id === bookId).length, 1);

    const off = await request('POST', `/api/library/favorites/${bookId}`, undefined, bearer(alice));
    assert.equal(off.json.favorited, false);
    assert.equal(off.json.count, 0);

    // 删书连带清收藏
    await request('POST', `/api/library/favorites/${bookId}`, undefined, bearer(bob));
    const del = await request('DELETE', `/api/library/books/${bookId}`, undefined, bearer(admin));
    assert.equal(del.status, 200, del.text);
    assert.equal(sb.tableRows('app_library_favorites')
      .filter(x => x.book_id === bookId).length, 0, '删书必须连带清掉所有人的收藏');

    assert.equal(sqliteCount('library_books'), 0);
    assert.equal(sqliteCount('library_favorites'), 0);
  });
});

// ═══════════════════════ PUSH ═══════════════════════

describe('DB-13B · PUSH', () => {
  const TOKEN = 'db13b-device-token-aaaa';

  test('register 幂等；refresh 只刷新不重复；unregister 精确删除', async () => {
    const first = await request('POST', '/api/push/register',
      { token: TOKEN, platform: 'ios' }, bearer(alice));
    assert.equal(first.status, 200, first.text);
    assert.equal(first.json.count, 1);

    // 同一 token 再注册一次 = 刷新，不新增行（主键 (user_id, token)）
    const again = await request('POST', '/api/push/register',
      { token: TOKEN, platform: 'web' }, bearer(alice));
    assert.equal(again.json.count, 1, 'register 必须幂等');
    const rows = sb.tableRows('app_push_tokens')
      .filter(x => x.user_id === alice.supabaseUserId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.platform, 'web', 'platform 应被刷新');

    const summary = await request('GET', '/api/push/tokens', undefined, bearer(alice));
    assert.equal(summary.json.count, 1);
    assert.equal(summary.json.platforms.web, 1);
    assert.equal(summary.text.includes(TOKEN), false, '摘要不得回传 token 本身');

    const off = await request('POST', '/api/push/unregister', { token: TOKEN }, bearer(alice));
    assert.equal(off.json.count, 0);
    assert.equal(sb.tableRows('app_push_tokens')
      .filter(x => x.user_id === alice.supabaseUserId).length, 0);
    assert.equal(sqliteCount('push_tokens'), 0);
  });

  test('非法 platform → 400；缺 token → 400', async () => {
    const bad = await request('POST', '/api/push/register',
      { token: 'x', platform: 'symbian' }, bearer(alice));
    assert.equal(bad.status, 400);
    const noToken = await request('POST', '/api/push/register',
      { platform: 'ios' }, bearer(alice));
    assert.equal(noToken.status, 400);
  });
});

// ═══════════════════════ PRAYER（整域） ═══════════════════════

describe('DB-13B · PRAYER 整域', () => {
  const ROOM = 'prayer_room';
  let shareId = '';
  let sessionId = '';

  before(async () => {
    // 祷告室要成员身份；moderator 只能服务端授予，直接在 Postgres 侧预置。
    sb.seedTable('app_room_members', [
      {
        room_id: ROOM, user_id: alice.supabaseUserId, role: 'moderator',
        joined_at: new Date(1000).toISOString(), updated_at: new Date(1000).toISOString(),
      },
      {
        room_id: ROOM, user_id: bob.supabaseUserId, role: 'member',
        joined_at: new Date(1000).toISOString(), updated_at: new Date(1000).toISOString(),
      },
    ]);
  });

  test('祷告主题整体替换，落 app_room_prayer_topics 且 seq 由服务端重排', async () => {
    const r = await request('PUT', `/api/rooms/${ROOM}/prayer/topics`,
      { topics: ['为学院', '为教会', ''] }, bearer(alice));
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.topics.map((t: any) => t.text), ['为学院', '为教会']);
    assert.deepEqual(r.json.topics.map((t: any) => t.seq), [1, 2], 'seq 必须是 1..n');
    const rows = sb.tableRows('app_room_prayer_topics').filter(x => x.room_id === ROOM);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.created_by, alice.supabaseUserId);
    assert.equal(sqliteCount('room_prayer_topics'), 0);
  });

  test('祷告分享落 Postgres；clientRequestId 幂等；author_state 只读不写', async () => {
    const r = await request('POST', `/api/rooms/${ROOM}/prayer/shares`,
      { text: '求主医治我母亲', clientRequestId: 'req-1' }, bearer(bob));
    assert.equal(r.status, 201, r.text);
    shareId = r.json.id;
    const row = sb.tableRows('app_prayer_shares').find(x => x.id === shareId) as any;
    assert.ok(row, '分享没有落到 Postgres');
    assert.equal(row.user_id, bob.supabaseUserId);
    assert.equal(row.is_anonymous, false);
    // author_state 是派生列 —— 我们绝不写它
    assert.equal(row.author_state, undefined);

    // 同一 clientRequestId 重放 → 200 + 同一条
    const replay = await request('POST', `/api/rooms/${ROOM}/prayer/shares`,
      { text: '重复提交', clientRequestId: 'req-1' }, bearer(bob));
    assert.equal(replay.status, 200);
    assert.equal(replay.json.id, shareId);
    assert.equal(replay.json.idempotentReplay, true);
    assert.equal(sb.tableRows('app_prayer_shares').length, 1, '幂等键不得产生第二条');
    assert.equal(sqliteCount('prayer_shares'), 0);
  });

  test('代祷登记幂等，计数由明细表得出', async () => {
    const on = await request('POST', `/api/rooms/${ROOM}/prayer/shares/${shareId}/intercede`,
      undefined, bearer(alice));
    assert.equal(on.status, 200, on.text);
    assert.equal(on.json.intercessions, 1);
    // 重复登记不该累加
    const again = await request('POST', `/api/rooms/${ROOM}/prayer/shares/${shareId}/intercede`,
      undefined, bearer(alice));
    assert.equal(again.json.intercessions, 1, '重复代祷必须幂等');
    assert.equal(sb.tableRows('app_prayer_intercessions').length, 1);
    assert.equal(sqliteCount('prayer_intercessions'), 0);
  });

  test('举报落 Postgres，同一人重复举报不产生新行', async () => {
    const first = await request('POST', `/api/rooms/${ROOM}/prayer/shares/${shareId}/report`,
      { reason: 'privacy' }, bearer(alice));
    assert.equal(first.status, 200, first.text);
    assert.equal(first.json.created, true);
    const again = await request('POST', `/api/rooms/${ROOM}/prayer/shares/${shareId}/report`,
      { reason: 'spam' }, bearer(alice));
    assert.equal(again.json.created, false, '同一人重复举报不得产生新行');
    assert.equal(sb.tableRows('app_prayer_share_reports').length, 1);

    // manager 能看举报，但看不到举报人身份
    const list = await request('GET', `/api/rooms/${ROOM}/prayer/reports`,
      undefined, bearer(alice));
    assert.equal(list.status, 200, list.text);
    assert.equal(list.json.reports.length, 1);
    assert.equal(list.text.includes(alice.supabaseUserId), false, '举报列表不得含举报人身份');
    assert.equal(sqliteCount('prayer_share_reports'), 0);
  });

  test('非法举报原因 → 400（枚举两侧取值一致）', async () => {
    const r = await request('POST', `/api/rooms/${ROOM}/prayer/shares/${shareId}/report`,
      { reason: 'not_a_reason' }, bearer(bob));
    assert.equal(r.status, 400);
  });

  test('祷告会 create → start → advance → end，全程落 Postgres 且 revision 递增', async () => {
    const c = await request('POST', `/api/rooms/${ROOM}/prayer-sessions`,
      { title: '晨祷', items: [{ title: '为学院' }, { title: '为同学' }] }, bearer(alice));
    assert.equal(c.status, 201, c.text);
    sessionId = c.json.session.id;
    assert.equal(c.json.session.revision, 1);
    assert.equal(c.json.session.items.length, 2);
    assert.deepEqual(c.json.session.items.map((i: any) => i.position), [1, 2]);
    const srow = sb.tableRows('app_prayer_sessions').find(x => x.id === sessionId) as any;
    assert.ok(srow);
    assert.equal(srow.created_by, alice.supabaseUserId);
    assert.equal(srow.status, 'scheduled');
    assert.equal(srow.current_item_id, null, '建会话时 current_item_id 必须为 null（外键）');

    const s = await request('POST', `/api/rooms/${ROOM}/prayer-sessions/${sessionId}/start`,
      { expectedRevision: 1 }, bearer(alice));
    assert.equal(s.status, 200, s.text);
    assert.equal(s.json.session.status, 'active');
    assert.equal(s.json.session.revision, 2);
    assert.equal(s.json.session.currentItemId, c.json.session.items[0].id);

    const adv = await request('POST', `/api/rooms/${ROOM}/prayer-sessions/${sessionId}/advance`,
      { expectedRevision: 2 }, bearer(alice));
    assert.equal(adv.status, 200, adv.text);
    assert.equal(adv.json.session.currentItemId, c.json.session.items[1].id);

    // 事件日志：created / started / item_changed
    const events = sb.tableRows('app_prayer_session_events')
      .filter(x => x.session_id === sessionId).map(x => x.event_type);
    assert.deepEqual(events, ['created', 'started', 'item_changed']);

    const end = await request('POST', `/api/rooms/${ROOM}/prayer-sessions/${sessionId}/end`,
      { expectedRevision: adv.json.session.revision }, bearer(alice));
    assert.equal(end.status, 200, end.text);
    assert.equal(end.json.session.status, 'ended');

    assert.equal(sqliteCount('prayer_sessions'), 0);
    assert.equal(sqliteCount('prayer_session_items'), 0);
    assert.equal(sqliteCount('prayer_session_events'), 0);
  });

  test('revision 不匹配 → 409（乐观并发在条件更新里，不在应用层判断）', async () => {
    const c = await request('POST', `/api/rooms/${ROOM}/prayer-sessions`,
      { title: '冲突验证', items: [{ title: '为世界' }] }, bearer(alice));
    const id = c.json.session.id;
    const stale = await request('POST', `/api/rooms/${ROOM}/prayer-sessions/${id}/start`,
      { expectedRevision: 999 }, bearer(alice));
    assert.equal(stale.status, 409, stale.text);
    assert.equal(stale.json.code, 'SESSION_STATE_CONFLICT');
    // 冲突响应必须带最新状态，供客户端刷新
    assert.equal(stale.json.session.revision, 1);
    assert.equal(stale.json.session.status, 'scheduled', '冲突时不得发生任何状态变化');
  });

  test('active 会话的结构被冻结（条件更新里带 status，不靠应用层拦）', async () => {
    const c = await request('POST', `/api/rooms/${ROOM}/prayer-sessions`,
      { title: '冻结验证', items: [{ title: 'A' }] }, bearer(alice));
    const id = c.json.session.id;
    // 先把上一场 active 的结束掉，避免撞「一房一 active」
    await request('POST', `/api/rooms/${ROOM}/prayer-sessions/${id}/start`,
      { expectedRevision: 1 }, bearer(alice));
    const edit = await request('PUT', `/api/rooms/${ROOM}/prayer-sessions/${id}`,
      { title: '想改结构', items: [{ title: 'B' }, { title: 'C' }], expectedRevision: 2 },
      bearer(alice));
    assert.equal(edit.status, 409, edit.text);
    assert.equal(edit.json.code, 'SESSION_STRUCTURE_FROZEN');
    // 事项一个都没变
    const items = sb.tableRows('app_prayer_session_items').filter(x => x.session_id === id);
    assert.deepEqual(items.map(i => i.title), ['A']);
    await request('POST', `/api/rooms/${ROOM}/prayer-sessions/${id}/end`,
      { expectedRevision: 2 }, bearer(alice));
  });

  test('共享阅读位置落 Postgres；expectedRevision 冲突 → 409', async () => {
    sb.seedTable('app_room_members', [
      ...sb.tableRows('app_room_members'),
      {
        room_id: 'bible_reading', user_id: alice.supabaseUserId, role: 'moderator',
        joined_at: new Date(1000).toISOString(), updated_at: new Date(1000).toISOString(),
      },
    ]);
    const put = await request('PUT', '/api/rooms/bible_reading/reading-position',
      { book: '创世记', chapter: 1, verse: 1 }, bearer(alice));
    assert.equal(put.status, 200, put.text);
    assert.equal(put.json.position.revision, 1);
    assert.equal(put.json.position.updatedByName, '爱丽丝', '显示名应来自 profiles');
    const row = sb.tableRows('app_room_reading_state')
      .find(x => x.room_id === 'bible_reading') as any;
    assert.ok(row);
    assert.equal(row.updated_by, alice.supabaseUserId);

    const stale = await request('PUT', '/api/rooms/bible_reading/reading-position',
      { book: '出埃及记', chapter: 2, expectedRevision: 99 }, bearer(alice));
    assert.equal(stale.status, 409, stale.text);
    assert.equal(stale.json.code, 'READING_STATE_CONFLICT');
    // 冲突时数据不得被改动
    assert.equal((sb.tableRows('app_room_reading_state')
      .find(x => x.room_id === 'bible_reading') as any).book, '创世记');
    assert.equal(sqliteCount('room_reading_state'), 0);
  });

  test('★ 祷告历史不跨存储：六张表全部读 Postgres，纪要能拿到会中分享', async () => {
    const hist = await request('GET', `/api/rooms/${ROOM}/prayer-sessions/history`,
      undefined, bearer(alice));
    assert.equal(hist.status, 200, hist.text);
    const ended = hist.json.sessions.find((s: any) => s.id === sessionId);
    assert.ok(ended, '已结束的会话应出现在历史里');
    assert.equal(ended.visitedItemCount, 2, '实际进行过 2 项');

    const sum = await request('GET',
      `/api/rooms/${ROOM}/prayer-sessions/${sessionId}/summary`, undefined, bearer(alice));
    assert.equal(sum.status, 200, sum.text);
    assert.equal(sum.json.journey.length, 2);
    assert.equal(sum.json.notVisited.length, 0);
    // 会中时间窗内的分享要出现在纪要里 —— 这条同时证明
    // prayerHistory 读的 shares 与 sessions 在同一个存储里。
    assert.ok(Array.isArray(sum.json.shares));
    // 纪要不得出现任何人数类字段（Phase 5 硬规矩）
    for (const k of ['participantCount', 'attendees', 'totalMinutes']) {
      assert.equal(sum.text.includes(k), false, `纪要不得包含字段 ${k}`);
    }
  });

  test('那 15 行被裁定 SKIP 的 legacy fixture 数据不得被复制进 Postgres', () => {
    // STAGING-1A11 永久裁定：13 行源自 D-34 测试装置，2 行是父房间不存在的孤儿。
    // 本轮切换只提供运行时写路径，**不提供**任何把 SQLite 历史行搬过去的路径。
    // 因此 Postgres 侧的每一行都必须是本测试自己刚写进去的。
    const shares = sb.tableRows('app_prayer_shares');
    for (const r of shares) {
      assert.equal(r.user_id, bob.supabaseUserId,
        '出现了非本测试写入的分享行 —— 疑似复制了 legacy fixture');
    }
    const topics = sb.tableRows('app_room_prayer_topics');
    for (const r of topics) {
      assert.equal(r.created_by, alice.supabaseUserId);
      assert.equal(String(r.room_id).startsWith('sec2_'), false,
        '出现了 sec2_* 装置房间的主题行');
    }
  });
});

// ═══════════════════════ 通用安全边界 ═══════════════════════

describe('DB-13B · 通用边界', () => {
  test('客户端不能声称任意 UUID —— 身份只来自 principal.authId', async () => {
    // 发帖时塞一个别人的 userId：必须被忽略，落库的仍是认证身份。
    const r = await request('POST', '/api/posts',
      { content: '冒充尝试', category: 'general', userId: bob.supabaseUserId },
      bearer(alice));
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.userId, alice.supabaseUserId, '请求体里的 userId 不得决定归属');

    // 好友请求指向一个不存在的 profile → 404，而不是凭空建关系
    const bogus = await request('POST', '/api/friends/requests',
      { targetUserId: '00000000-0000-4000-8000-000000000000' }, bearer(alice));
    assert.equal(bogus.status, 404);
  });

  test('legacy SQLite id 不能当作 Supabase 身份使用', async () => {
    // 用 canonical SQLite id 当好友目标：它不是 UUID，也不在 profiles 里。
    const r = await request('POST', '/api/friends/requests',
      { targetUserId: bob.user.id }, bearer(alice));
    assert.equal(r.status, 404, 'canonical SQLite id 不得被当成 Supabase 身份');
  });

  test('service principal 没有人类身份 → 用户域接口 401', async () => {
    const h = { authorization: `Bearer ${APP_SECRET}` };
    for (const [method, p, body] of [
      ['GET', '/api/growth/state', undefined],
      ['GET', '/api/pt/state', undefined],
      ['POST', '/api/push/register', { token: 't', platform: 'ios' }],
      ['GET', '/api/friends', undefined],
      ['GET', '/api/library/favorites', undefined],
    ] as const) {
      const r = await request(method, p, body, h);
      assert.equal(r.status, 401, `${method} ${p} 对 service token 应 401，实际 ${r.status}`);
    }
  });

  test('响应里绝不出现 service-role key', async () => {
    for (const p of ['/api/courses', '/api/posts', '/api/announcements']) {
      const r = await request('GET', p);
      assert.equal(r.text.includes('db13b-service-key'), false, `${p} 泄漏了 service key`);
    }
  });

  test('全部已切域的 SQLite 表写入合计为 0', () => {
    const cut = [
      'posts', 'post_likes', 'post_comments', 'friend_requests', 'friendships',
      'announcements', 'image_uploads', 'recordings',
      'course_progress', 'growth_state', 'pt_state', 'library_books', 'library_favorites',
      'push_tokens',
      'prayer_shares', 'prayer_intercessions', 'prayer_share_reports', 'room_prayer_topics',
      'prayer_sessions', 'prayer_session_items', 'prayer_session_events', 'room_reading_state',
      // DB-12 已切的三个，一并复核
      'rooms', 'room_members', 'room_presence', 'course_files', 'cooperation_submissions',
    ];
    for (const t of cut) {
      assert.equal(sqliteCount(t), 0, `${t} 出现了 SQLite 写入 —— 迁移域不得双写`);
    }
  });

  test('刻意保留在 SQLite 的表仍然可用', () => {
    // users 是身份域（DB-4 未做），provisionUser 往里写了 3 个人。
    assert.ok(sqliteCount('users') >= 3, 'users 应仍在 SQLite 且有数据');
    assert.ok(sqliteCount('legacy_user_map') >= 3, 'legacy_user_map 应仍在 SQLite');
  });
});
