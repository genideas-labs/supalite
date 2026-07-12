import { promises as fs } from 'fs';
import path from 'path';
import { Client } from 'pg';

const DEFAULT_DIR = path.join('supabase', 'migrations');
const DEFAULT_TABLE = 'public.schema_migrations';
const LOCK_SQL = `SELECT pg_advisory_lock(hashtext('supalite:migrate'))`;
const UNLOCK_SQL = `SELECT pg_advisory_unlock(hashtext('supalite:migrate'))`;

export type MigrationSection = { sql: string; disableTransaction: boolean };
export type ParsedMigration = { up: MigrationSection; down: MigrationSection | null };

const MARKER_RE = /^--\s*migrate:(up|down)\b(.*)$/;

export const parseMigrationSql = (content: string): ParsedMigration => {
  const lines = content.split(/\r?\n/);
  const buf: { up: string[]; down: string[] } = { up: [], down: [] };
  const disable: { up: boolean; down: boolean } = { up: false, down: false };
  const seen: { up: boolean; down: boolean } = { up: false, down: false };
  let current: 'up' | 'down' | null = null;

  for (const line of lines) {
    const m = line.match(MARKER_RE);
    if (m) {
      current = m[1] as 'up' | 'down';
      seen[current] = true;
      disable[current] = /\btransaction:false\b/.test(m[2] ?? '');
      continue;
    }
    if (current) {
      buf[current].push(line);
    }
  }

  if (!seen.up) {
    throw new Error("Missing '-- migrate:up' section in migration file.");
  }

  const up: MigrationSection = { sql: buf.up.join('\n').trim(), disableTransaction: disable.up };
  const down: MigrationSection | null = seen.down
    ? { sql: buf.down.join('\n').trim(), disableTransaction: disable.down }
    : null;
  return { up, down };
};

export const parseMigrationFilename = (filename: string): { version: string; name: string } => {
  const base = filename.replace(/\.sql$/i, '');
  const m = base.match(/^(\d+)(?:_(.*))?$/);
  if (!m) {
    throw new Error(`Invalid migration filename (expected <timestamp>_<name>.sql): ${filename}`);
  }
  return { version: m[1], name: m[2] ?? '' };
};

export type MigrationFile = { version: string; name: string; filename: string; path: string };

export const listMigrationFiles = async (dir: string): Promise<MigrationFile[]> => {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Migrations directory not found: ${path.resolve(dir)}`);
    }
    throw error;
  }
  const files = entries
    .filter((name) => name.toLowerCase().endsWith('.sql'))
    .map((filename) => {
      const { version, name } = parseMigrationFilename(filename);
      return { version, name, filename, path: path.join(dir, filename) };
    });
  files.sort((a, b) => {
    const av = BigInt(a.version);
    const bv = BigInt(b.version);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  return files;
};

type TableRef = { schema: string; table: string };

export const parseTableRef = (ref: string): TableRef => {
  const parts = ref.split('.');
  if (parts.length === 1 && parts[0]) {
    return { schema: 'public', table: parts[0] };
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { schema: parts[0], table: parts[1] };
  }
  throw new Error(`Invalid --migrations-table (expected 'table' or 'schema.table'): ${ref}`);
};

const quoteIdent = (id: string): string => `"${id.replace(/"/g, '""')}"`;
const quoteLiteral = (v: string): string => `'${v.replace(/'/g, "''")}'`;
const qualifiedTable = (t: TableRef): string => `${quoteIdent(t.schema)}.${quoteIdent(t.table)}`;

// SQL builders shared by the executor and the dry-run preview so the two can
// never drift (issue #14 fidelity requirement).
const createSchemaSql = (t: TableRef): string => `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(t.schema)}`;
const createTableSql = (t: TableRef): string =>
  `CREATE TABLE IF NOT EXISTS ${qualifiedTable(t)} (` +
  `version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
// The mark-applied insert (idempotent), parameterized by the value expression
// so the executor (`$1`, bound) and the dry-run preview (a version literal)
// render from the SAME template — structure/identifiers/ON CONFLICT can't drift.
const markAppliedInsertSqlWith = (t: TableRef, valueExpr: string): string =>
  `INSERT INTO ${qualifiedTable(t)} (version) VALUES (${valueExpr}) ON CONFLICT (version) DO NOTHING`;
const markAppliedInsertSql = (t: TableRef): string => markAppliedInsertSqlWith(t, '$1');
const previewInsertSql = (t: TableRef, version: string): string =>
  markAppliedInsertSqlWith(t, quoteLiteral(version));

const ensureMigrationsTable = async (client: Client, t: TableRef): Promise<void> => {
  await client.query(createSchemaSql(t));
  await client.query(createTableSql(t));
};

// Read-only existence probe — never creates the table (dry-run safety).
const tableExists = async (client: Client, t: TableRef): Promise<boolean> => {
  const res = await client.query<{ reg: string | null }>('SELECT to_regclass($1) AS reg', [
    qualifiedTable(t),
  ]);
  return res.rows[0]?.reg != null;
};

const appliedVersions = async (client: Client, t: TableRef): Promise<Set<string>> => {
  const res = await client.query<{ version: string }>(`SELECT version FROM ${qualifiedTable(t)}`);
  return new Set(res.rows.map((r) => r.version));
};

// Applied versions without assuming the table exists (returns ∅ when absent).
const appliedVersionsIfExists = async (client: Client, t: TableRef): Promise<Set<string>> =>
  (await tableExists(client, t)) ? appliedVersions(client, t) : new Set<string>();

export type MigrateOptions = {
  dbUrl: string;
  dir?: string;
  migrationsTable?: string;
};

export type MigrationStatusEntry = {
  version: string;
  name: string;
  filename: string;
  applied: boolean;
};

export const migrateStatus = async (opts: MigrateOptions): Promise<MigrationStatusEntry[]> => {
  const dir = opts.dir ?? DEFAULT_DIR;
  const table = parseTableRef(opts.migrationsTable ?? DEFAULT_TABLE);
  const files = await listMigrationFiles(dir);
  const client = new Client({ connectionString: opts.dbUrl });
  await client.connect();
  try {
    await ensureMigrationsTable(client, table);
    const applied = await appliedVersions(client, table);
    return files.map((f) => ({
      version: f.version,
      name: f.name,
      filename: f.filename,
      applied: applied.has(f.version),
    }));
  } finally {
    await client.end();
  }
};

export type MigrateUpResult = {
  applied: string[];
  pending: string[];
  // dry-run only: the migration file path for each `pending` version (same order).
  pendingPaths?: string[];
};

const applyMigration = async (
  client: Client,
  table: TableRef,
  file: MigrationFile,
  up: MigrationSection
): Promise<void> => {
  const insert = `INSERT INTO ${qualifiedTable(table)} (version) VALUES ($1)`;
  if (up.disableTransaction) {
    // Non-transactional DDL (e.g. CREATE INDEX CONCURRENTLY). The version is
    // recorded immediately after success — non-atomic by necessity, so such
    // migrations should be a single idempotent (IF NOT EXISTS) statement.
    try {
      if (up.sql) {
        await client.query(up.sql);
      }
      await client.query(insert, [file.version]);
    } catch (error) {
      throw new Error(`Migration ${file.filename} failed: ${(error as Error).message}`);
    }
    return;
  }
  try {
    await client.query('BEGIN');
    if (up.sql) {
      await client.query(up.sql);
    }
    await client.query(insert, [file.version]);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // preserve the original error; a rollback failure must not mask it
    }
    throw new Error(`Migration ${file.filename} failed: ${(error as Error).message}`);
  }
};

export const migrateUp = async (
  opts: MigrateOptions & { dryRun?: boolean }
): Promise<MigrateUpResult> => {
  const dir = opts.dir ?? DEFAULT_DIR;
  const table = parseTableRef(opts.migrationsTable ?? DEFAULT_TABLE);
  const files = await listMigrationFiles(dir);
  const client = new Client({ connectionString: opts.dbUrl });
  await client.connect();
  try {
    if (opts.dryRun) {
      // Write-free: probe the tracking table read-only (do not create it) so a
      // dry-run never mutates the database (issue #14; fixes 003 SC-005).
      const applied = await appliedVersionsIfExists(client, table);
      const pending = files.filter((f) => !applied.has(f.version));
      return {
        applied: [],
        pending: pending.map((f) => f.version),
        pendingPaths: pending.map((f) => f.path),
      };
    }

    await ensureMigrationsTable(client, table);
    await client.query(LOCK_SQL);
    const done: string[] = [];
    try {
      // Re-read applied under the lock: a concurrent deploy may have applied
      // some migrations between our first read and acquiring the lock.
      const appliedLocked = await appliedVersions(client, table);
      for (const file of files) {
        if (appliedLocked.has(file.version)) {
          continue;
        }
        const parsed = parseMigrationSql(await fs.readFile(file.path, 'utf8'));
        await applyMigration(client, table, file, parsed.up);
        done.push(file.version);
      }
    } finally {
      await client.query(UNLOCK_SQL);
    }
    return { applied: done, pending: [] };
  } finally {
    await client.end();
  }
};

export type MarkAppliedDryRun = {
  // Human-readable tracking-table ref, e.g. "public.schema_migrations".
  table: string;
  // Whether the tracking table already exists (read-only probe result).
  tableExists: boolean;
  // The exact statements the real command would execute for these targets.
  sql: string[];
};
export type MarkAppliedResult = {
  // Versions recorded; in a dry-run these are the versions that WOULD be recorded.
  marked: string[];
  alreadyApplied: string[];
  // Present only when `dryRun` was requested; the DB was left untouched.
  dryRun?: MarkAppliedDryRun;
};

export const migrateMarkApplied = async (
  opts: MigrateOptions & { version?: string; all?: boolean; dryRun?: boolean }
): Promise<MarkAppliedResult> => {
  const dir = opts.dir ?? DEFAULT_DIR;
  const table = parseTableRef(opts.migrationsTable ?? DEFAULT_TABLE);
  const files = await listMigrationFiles(dir);

  let targets: MigrationFile[];
  if (opts.all) {
    targets = files;
  } else if (opts.version) {
    const found = files.find((f) => f.version === opts.version);
    if (!found) {
      throw new Error(`No migration with version ${opts.version} found in ${path.resolve(dir)}`);
    }
    targets = [found];
  } else {
    throw new Error('mark-applied requires a <version> argument or --all.');
  }

  const client = new Client({ connectionString: opts.dbUrl });
  await client.connect();
  try {
    if (opts.dryRun) {
      // Write-free preview: probe the table read-only (never create it), then
      // report which versions would be recorded and the exact SQL that would
      // run — built from the same helpers the executor uses (fidelity).
      const exists = await tableExists(client, table);
      const applied = exists ? await appliedVersions(client, table) : new Set<string>();
      const marked: string[] = [];
      const alreadyApplied: string[] = [];
      for (const file of targets) {
        (applied.has(file.version) ? alreadyApplied : marked).push(file.version);
      }
      // The ensure statements always run in reality (IF NOT EXISTS), so they are
      // always part of the preview; one insert per version that would be recorded.
      const sql = [createSchemaSql(table), createTableSql(table)];
      for (const version of marked) {
        sql.push(previewInsertSql(table, version));
      }
      return {
        marked,
        alreadyApplied,
        dryRun: { table: `${table.schema}.${table.table}`, tableExists: exists, sql },
      };
    }

    await ensureMigrationsTable(client, table);
    const applied = await appliedVersions(client, table);
    const insert = markAppliedInsertSql(table);
    const marked: string[] = [];
    const alreadyApplied: string[] = [];
    for (const file of targets) {
      if (applied.has(file.version)) {
        alreadyApplied.push(file.version);
        continue;
      }
      await client.query(insert, [file.version]);
      marked.push(file.version);
    }
    return { marked, alreadyApplied };
  } finally {
    await client.end();
  }
};

export type NewMigrationResult = { path: string; filename: string; version: string };

export const migrationTimestamp = (date: Date = new Date()): string =>
  date.toISOString().replace(/[-:T]/g, '').slice(0, 14);

const NEW_MIGRATION_TEMPLATE = `-- migrate:up\n\n\n-- migrate:down\n\n`;

export const migrateNew = async (opts: {
  name: string;
  dir?: string;
  timestamp?: string;
}): Promise<NewMigrationResult> => {
  const dir = opts.dir ?? DEFAULT_DIR;
  const name = opts.name.trim().replace(/\s+/g, '_');
  if (!name) {
    throw new Error('migrate new requires a non-empty <name>.');
  }
  const version = opts.timestamp ?? migrationTimestamp();
  const filename = `${version}_${name}.sql`;
  const filePath = path.join(dir, filename);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, NEW_MIGRATION_TEMPLATE, { flag: 'wx' });
  return { path: filePath, filename, version };
};
