/**
 * DB-12 兼容迁移：拆掉旧 SQLite 库上指向 `rooms` 的失效外键。
 *
 * ── 为什么需要这个 ──────────────────────────────────────────────────
 * db.ts 的建表语句已经不再声明 `prayer_sessions.room_id → rooms(room_id)`
 * 与 `room_reading_state.room_id → rooms(room_id)`，但 `CREATE TABLE
 * IF NOT EXISTS` **不会改动已经存在的表**。于是升级安装（例如
 * backend/data/amas.sqlite）里这两条外键依然在册，而房间已经由 Postgres
 * （`public.app_rooms`）拥有——SQLite 的 `rooms` 里根本没有那一行。
 * 结果就是：在 Postgres 新建房间 → 开祷告会 / 共享读经位置 →
 * `FOREIGN KEY constraint failed`。
 *
 * 房间存在性的保护并没有消失，只是从库级移到了应用层：所有相关路由都挂了
 * `requireRoomExists`（它读 Postgres）。
 *
 * ── 做法 ────────────────────────────────────────────────────────────
 * SQLite 不能 `ALTER TABLE ... DROP CONSTRAINT`，只能重建表。这里走官方
 * 12 步流程（foreign_keys=OFF → 事务 → 新表 → 搬数据 → DROP → RENAME →
 * 重建索引/触发器 → foreign_key_check → COMMIT → foreign_keys=ON）。
 *
 * 关键取舍：**新表 DDL 不硬编码，而是取该表自己在 `sqlite_master` 里的真实
 * DDL、只切掉那一条外键子句**。这样列名/列序/类型/DEFAULT/CHECK/其余外键
 * 全部逐字保留，不依赖本文件对历史 schema 的猜测（不同安装可能停在不同的
 * ALTER TABLE 阶段，例如有没有 `prayer_sessions.title`）。
 *
 * 安全性质：
 *   · 幂等 —— 没有目标外键就直接返回，新库与已升级库都是 NO-OP；
 *   · fail closed —— 任何一步的等价性校验不通过就抛错，整个事务回滚，
 *     不留半迁移状态；
 *   · 不改业务数据 —— 只搬行，不增删改任何值；
 *   · 不碰 `rooms` / `room_members` / `room_presence`（DB-12 §12 保留作回滚参考）。
 */
import type { Database } from 'better-sqlite3';

/** 只处理这两张**仍在运行时写入**的遗留表。 */
const TARGETS = ['prayer_sessions', 'room_reading_state'] as const;

interface FkRow {
  id: number; seq: number; table: string; from: string; to: string | null;
  on_update: string; on_delete: string;
}
interface ColRow {
  cid: number; name: string; type: string; notnull: number;
  dflt_value: string | null; pk: number;
}
interface MasterRow { type: string; name: string; sql: string | null }

/**
 * 表级 `FOREIGN KEY (room_id) REFERENCES rooms(room_id) [ON ...]` 子句，**含前导逗号**。
 *
 * 吃掉前导逗号而不是后随逗号，是因为两种位置都要覆盖：
 *   `... , FOREIGN KEY (room_id) ... CASCADE,  FOREIGN KEY (created_by) ...`（中间）
 *   `... , FOREIGN KEY (room_id) ... CASCADE\n)`（最后一项，后面没有逗号）
 * 吃前导逗号时，后随的那个逗号自然接上前一项，两种情形都得到合法 DDL。
 *
 * 写成正则**字面量**而不是字符串拼接：字符串里 `\s` 这类转义会被 JS 静默
 * 吞掉一层，产出一个看起来对、实际匹配不到任何东西的正则。
 */
const ROOM_FK_RE =
  /,\s*FOREIGN\s+KEY\s*\(\s*["'`[]?room_id["'`\]]?\s*\)\s*REFERENCES\s+["'`[]?rooms["'`\]]?\s*\(\s*["'`[]?room_id["'`\]]?\s*\)(?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:NO\s+ACTION|RESTRICT|SET\s+NULL|SET\s+DEFAULT|CASCADE))*(?:\s+MATCH\s+\w+)?(?:\s+(?:NOT\s+)?DEFERRABLE(?:\s+INITIALLY\s+(?:DEFERRED|IMMEDIATE))?)?/i;


/** `CREATE TABLE [IF NOT EXISTS] <ident>` 表头，第 1 组是（可能被引起来的）表名。 */
const TABLE_HEADER_RE =
  /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)/i;

/** 去掉标识符外层的 `"` / `` ` `` / `[]` 引号。 */
function unquoteIdent(raw: string): string {
  if (raw.startsWith('"')) return raw.slice(1, -1).replace(/""/g, '"');
  if (raw.startsWith('`')) return raw.slice(1, -1);
  if (raw.startsWith('[')) return raw.slice(1, -1);
  return raw;
}

const quote = (id: string): string => `"${id.replace(/"/g, '""')}"`;

function tableExists(db: Database, name: string): boolean {
  return Boolean(db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`,
  ).get(name));
}

const fkList = (db: Database, t: string): FkRow[] =>
  db.prepare(`PRAGMA foreign_key_list(${quote(t)})`).all() as FkRow[];

const colList = (db: Database, t: string): ColRow[] =>
  db.prepare(`PRAGMA table_info(${quote(t)})`).all() as ColRow[];

/** 指向 `rooms` 的外键（可能不止一条）。 */
const roomFks = (db: Database, t: string): FkRow[] =>
  fkList(db, t).filter(f => f.table.toLowerCase() === 'rooms');

/** 列结构指纹：列序、名、类型、NOT NULL、默认值、主键序，逐项参与比较。 */
const colSig = (cols: ColRow[]): string =>
  cols.map(c => `${c.cid}:${c.name}:${c.type}:${c.notnull}:${c.dflt_value ?? ''}:${c.pk}`)
    .join('|');

/** 外键指纹：与 PRAGMA 返回顺序无关。 */
const fkSig = (fks: FkRow[]): string =>
  fks.map(f => `${f.from}->${f.table}.${f.to}:${f.on_delete}:${f.on_update}`).sort().join('|');

/**
 * 重建一张表，去掉指向 `rooms` 的外键。**必须在 foreign_keys=OFF 且事务内调用。**
 * 任何等价性校验失败都抛错，交由外层事务回滚。
 */
function rebuildWithoutRoomFk(db: Database, table: string): void {
  const master = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
  ).get(table) as { sql: string } | undefined;
  if (!master?.sql) throw new Error(`取不到 ${table} 的建表 DDL`);

  const beforeCols = colList(db, table);
  const beforeFks = fkList(db, table);
  const keptFks = beforeFks.filter(f => f.table.toLowerCase() !== 'rooms');
  const beforeRows = (db.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`)
    .get() as { n: number }).n;

  // 视图引用了本表的话，DROP + RENAME 会把它悄悄弄坏 —— 宁可停下来。
  const views = db.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type='view'`,
  ).all() as MasterRow[];
  const brokenViews = views.filter(
    v => (v.sql ?? '').toLowerCase().includes(table.toLowerCase()),
  );
  if (brokenViews.length) {
    throw new Error(
      `视图 ${brokenViews.map(v => v.name).join(', ')} 引用了 ${table}，` +
      '重建会破坏它们 —— 拒绝自动迁移',
    );
  }

  // 显式索引与触发器要在重建后按原样恢复（隐式 autoindex 由 SQLite 自己重建）。
  const aux = db.prepare(
    `SELECT type, name, sql FROM sqlite_master
      WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL`,
  ).all(table) as MasterRow[];

  if (!ROOM_FK_RE.test(master.sql)) {
    throw new Error(
      `在 ${table} 的 DDL 里定位不到指向 rooms 的表级外键子句` +
      '（可能写成了列内联形式），拒绝改写',
    );
  }
  // 表头改名：**不把表名插进正则**（拼字符串会丢一层转义），
  // 而是用字面量正则抓出表头、再校验抓到的名字确实是本表。
  const header = TABLE_HEADER_RE.exec(master.sql);
  if (!header || unquoteIdent(header[1]!).toLowerCase() !== table.toLowerCase()) {
    throw new Error(`${table} 的建表 DDL 表头无法解析，拒绝改写`);
  }
  const tmp = `${table}__db12_compat`;
  const newSql = master.sql
    .replace(new RegExp(ROOM_FK_RE.source, 'gi'), '')
    .replace(header[0]!, `CREATE TABLE ${quote(tmp)}`);
  if (!newSql.includes(tmp)) throw new Error(`改写 ${table} 的 DDL 表名失败`);

  db.exec(newSql);

  // ── 等价性校验：结构必须只少了那条外键，别的都不许变 ──
  if (colSig(beforeCols) !== colSig(colList(db, tmp))) {
    throw new Error(`${table} 重建后列结构发生变化`);
  }
  if (fkSig(keptFks) !== fkSig(fkList(db, tmp))) {
    throw new Error(`${table} 重建后其余外键与原表不一致`);
  }
  if (roomFks(db, tmp).length) {
    throw new Error(`${table} 重建后仍带有指向 rooms 的外键`);
  }

  const cols = beforeCols.map(c => quote(c.name)).join(', ');
  db.exec(`INSERT INTO ${quote(tmp)} (${cols}) SELECT ${cols} FROM ${quote(table)}`);
  const afterRows = (db.prepare(`SELECT COUNT(*) AS n FROM ${quote(tmp)}`)
    .get() as { n: number }).n;
  if (beforeRows !== afterRows) {
    throw new Error(`${table} 行数 ${beforeRows} → ${afterRows} 不一致`);
  }

  db.exec(`DROP TABLE ${quote(table)}`);
  db.exec(`ALTER TABLE ${quote(tmp)} RENAME TO ${quote(table)}`);
  for (const a of aux) db.exec(a.sql!);
}

/**
 * 若存在指向 `rooms` 的失效外键则拆除之。返回被重建的表名（空数组 = NO-OP）。
 * 抛错即表示已完整回滚，调用方应视为启动失败。
 */
export function dropObsoleteRoomForeignKeys(db: Database): string[] {
  const pending = TARGETS.filter(t => tableExists(db, t) && roomFks(db, t).length > 0);
  if (!pending.length) return [];

  // PRAGMA foreign_keys 在事务内会被 SQLite 忽略，必须在 BEGIN 之前设置。
  // 这是官方重建流程的一部分（DROP 时不触发级联删除），
  // **不是**「运行时关闭外键强制」—— finally 一定会恢复。
  const wasOn = db.pragma('foreign_keys', { simple: true }) === 1;
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const t of pending) rebuildWithoutRoomFk(db, t);
      // 整库校验：任何一处引用完整性问题都让事务回滚。
      const violations = db.prepare('PRAGMA foreign_key_check').all() as unknown[];
      if (violations.length) {
        throw new Error(`foreign_key_check 报告 ${violations.length} 处违规`);
      }
    })();
  } finally {
    if (wasOn) db.pragma('foreign_keys = ON');
  }

  // 提交后再独立确认一次最终状态。
  for (const t of pending) {
    if (roomFks(db, t).length) {
      throw new Error(`${t} 迁移后仍带有指向 rooms 的外键`);
    }
  }
  return pending;
}
