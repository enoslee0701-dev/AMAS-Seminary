/**
 * DB-12 · DAL 切换的验收护栏
 *
 * 「测试通过」在这一轮里不足以说明问题——如果切换只是让路由读到一张空表，
 * 断言同样会绿。所以这里每一条都要证明**数据真的流经 Postgres 路径**：
 *
 *   1. 预置在 Postgres 侧的数据，能从 App 接口读出来（读路径确实切了）
 *   2. 经 App 接口写入的数据，落在 Postgres 侧
 *   3. **同一时刻 SQLite 对应表仍为空**（迁移域的 SQLite 写路径 = 0）
 *
 * 第 3 条是关键：只有它能区分「切换成功」与「双写」。
 *
 * 复用唯一那套 helpers/supabaseHarness.ts —— 项目禁止第二套假 Supabase。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  startFakeSupabase, provisionUser, freePort,
  type FakeSupabase, type ProvisionedUser,
} from './helpers/supabaseHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const APP_SECRET = 'db12-staging-dal-secret';
const DB_PATH = path.join(
  BACKEND_ROOT, '.tmp-test', `db12-dal-${process.pid}-${Date.now()}.sqlite`,
);

let sb: FakeSupabase;
let proc: ChildProcess | null = null;
let baseUrl = '';
let admin: ProvisionedUser;

function request(
  method: string, pathname: string, body?: unknown, headers: Record<string, string> = {},
): Promise<{ status: number; json: any; text: string }> {
  const url = new URL(pathname, baseUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
        headers: {
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      res => {
        let text = '';
        res.on('data', c => { text += c; });
        res.on('end', () => {
          let json: any = null;
          try { json = JSON.parse(text); } catch { /* 非 JSON */ }
          resolve({ status: res.statusCode ?? 0, json, text });
        });
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

/** 只读地数一张 SQLite 表的行数——用来证明迁移域没有再往 SQLite 写。 */
function sqliteCount(table: string): number {
  const d = new Database(DB_PATH, { readonly: true });
  try {
    return (d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  } finally {
    d.close();
  }
}

before(async () => {
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  sb = await startFakeSupabase();

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  proc = spawn(process.execPath, [tsxCli, 'src/server.ts'], {
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
      SUPABASE_SERVICE_ROLE_KEY: 'db12-dal-service-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  proc.stderr?.on('data', d => { stderr += d.toString(); });

  const start = Date.now();
  for (;;) {
    if (Date.now() - start > 20_000) throw new Error(`server 未就绪：\n${stderr}`);
    try {
      const r = await request('GET', '/api/health');
      if (r.status === 200) break;
    } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 150));
  }

  admin = await provisionUser(DB_PATH, sb, {
    email: 'db12-admin@example.test', name: 'DB12 Admin', role: 'admin',
  });
});

after(async () => {
  proc?.kill();
  await sb?.stop();
  for (const s of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + s, { force: true }); } catch { /* 尽力而为 */ }
  }
});

const bearer = (u: ProvisionedUser) => ({ authorization: `Bearer ${u.accessToken}` });

// ───────────────── COOPERATION ─────────────────

test('cooperation：Postgres 侧预置的历史行，能从 App 接口读出来', async () => {
  const id = crypto.randomUUID();
  sb.seedTable('app_cooperation_submissions', [{
    id, name: '管理员', email: 'admin@amas.hk', organization: 'AMAS',
    message: '历史迁移行', type: '事奉申请',
    received_at: new Date(1_700_000_000_000).toISOString(),
  }]);

  const r = await request('GET', '/api/cooperation', undefined, bearer(admin));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.length, 1);
  assert.equal(r.json[0].id, id);
  assert.equal(r.json[0].name, '管理员');
  // 线格式仍是 epoch 毫秒——切库不能改变对外契约
  assert.equal(r.json[0].receivedAt, 1_700_000_000_000);
});

test('cooperation：经 App 写入的新投稿落在 Postgres，且 SQLite 表保持为空', async () => {
  const before = sqliteCount('cooperation_submissions');
  assert.equal(before, 0, 'SQLite 起点应为空');

  const r = await request('POST', '/api/cooperation', {
    name: 'DB12 测试机构', email: 'db12@example.test',
    organization: '测试', message: '切换验收', type: '合作',
  });
  assert.equal(r.status, 200, r.text);

  const rows = sb.tableRows('app_cooperation_submissions');
  const written = rows.find(x => x.id === r.json.id);
  assert.ok(written, '新投稿没有落到 Postgres 路径');
  assert.equal(written!.email, 'db12@example.test');

  // ★ 关键断言：迁移域不得再写 SQLite
  assert.equal(sqliteCount('cooperation_submissions'), 0,
    'cooperation 已切换，但仍有写入落到 SQLite —— 存在双写路径');
});

test('cooperation：历史迁移行不因新写入而被改动', async () => {
  const rows = sb.tableRows('app_cooperation_submissions');
  const historical = rows.find(x => x.message === '历史迁移行');
  assert.ok(historical, '历史行不见了');
  assert.equal(historical!.email, 'admin@amas.hk');
  assert.equal(historical!.type, '事奉申请');
});

// ───────────────── COURSE FILES ─────────────────

test('course files：Postgres 侧的元数据能读出来，且字段映射正确', async () => {
  const id = crypto.randomUUID();
  sb.seedTable('app_course_files', [{
    id, course_code: 'c_greek', filename: '希腊语书写练习一.pdf',
    stored_name: `c_greek__${id}`, mime: 'application/pdf',
    size_bytes: 13599, uploader_id: null,
    uploaded_at: new Date(1_700_000_111_000).toISOString(),
  }]);

  const r = await request('GET', '/api/courses/c_greek/files', undefined, bearer(admin));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.length, 1);
  const f = r.json[0];
  // PG 的 course_code 必须映射回线格式的 courseId
  assert.equal(f.courseId, 'c_greek');
  assert.equal(f.filename, '希腊语书写练习一.pdf');
  assert.equal(f.sizeBytes, 13599);
  assert.equal(f.uploadedAt, 1_700_000_111_000);
  assert.equal(f.url, `/api/courses/c_greek/files/${id}`);
});

test('course files：查另一门课看不到别课的文件（course_code 过滤真的生效）', async () => {
  const r = await request('GET', '/api/courses/c_other/files', undefined, bearer(admin));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.length, 0);
});

test('course files：SQLite course_files 表全程保持为空', () => {
  assert.equal(sqliteCount('course_files'), 0,
    'course files 已切换，但仍有写入落到 SQLite —— 存在双写路径');
});

// ───────────────── 迁移域的 SQLite 写路径总闸 ─────────────────

test('★ 迁移域 SQLite 写路径 = 0（cooperation + course_files）', () => {
  assert.equal(sqliteCount('cooperation_submissions'), 0);
  assert.equal(sqliteCount('course_files'), 0);
});
