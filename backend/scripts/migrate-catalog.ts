// One-off migration: align the SQLite course library with services/catalog.ts (67 courses).
// - retitle / recategorise existing courses
// - create new courses (placeholders + split book studies), reattaching lecture files by filename
// - delete retired merged courses (their files are moved first; progress rows dropped)
// Run from backend/:  node node_modules/tsx/dist/cli.mjs scripts/migrate-catalog.ts
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_CATALOG, RETIRED_COURSE_IDS } from '../../services/catalog';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.resolve(here, '../data/amas.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const existing = new Set((db.prepare('select id from courses').all() as { id: string }[]).map(r => r.id));
const now = Date.now();
const insert = db.prepare(`insert into courses (id, title, instructor, category, level, thumbnail, thumbnail_image_id, total_lessons, created_at, created_by)
  values (?, ?, ?, ?, ?, '', null, ?, ?, 'catalog-migration')`);
const update = db.prepare('update courses set title = ?, instructor = ?, category = ?, level = ?, total_lessons = ? where id = ?');
const placeholders = RETIRED_COURSE_IDS.map(() => '?').join(',');
const moveFile = db.prepare(`update course_files set course_id = ? where filename = ? and course_id in (${placeholders})`);

let created = 0, updated = 0, moved = 0;
db.transaction(() => {
  for (const c of OFFICIAL_CATALOG) {
    const instructor = c.instructor ?? 'AMAS 教务组';
    const level = c.level ?? '';
    const lessons = c.totalLessons ?? 0;
    if (existing.has(c.id)) { update.run(c.title, instructor, c.category, level, lessons, c.id); updated++; }
    else { insert.run(c.id, c.title, instructor, c.category, level, lessons, now); created++; }
    for (const f of c.files ?? []) moved += moveFile.run(c.id, f, ...RETIRED_COURSE_IDS).changes;
  }
  for (const id of RETIRED_COURSE_IDS) {
    const left = (db.prepare('select count(*) as n from course_files where course_id = ?').get(id) as { n: number }).n;
    if (left > 0) throw new Error(`retired course ${id} still has ${left} files — aborting`);
    db.prepare('delete from course_progress where course_id = ?').run(id);
    db.prepare('delete from courses where id = ?').run(id);
  }
})();
const total = (db.prepare('select count(*) as n from courses').get() as { n: number }).n;
const byCat = db.prepare('select category, count(*) as n from courses group by category order by n desc').all();
console.log(JSON.stringify({ created, updated, moved, total, byCat }, null, 1));
