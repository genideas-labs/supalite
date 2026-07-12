"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateNew = exports.migrationTimestamp = exports.migrateMarkApplied = exports.migrateUp = exports.migrateStatus = exports.parseTableRef = exports.listMigrationFiles = exports.parseMigrationFilename = exports.parseMigrationSql = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const DEFAULT_DIR = path_1.default.join('supabase', 'migrations');
const DEFAULT_TABLE = 'public.schema_migrations';
const LOCK_SQL = `SELECT pg_advisory_lock(hashtext('supalite:migrate'))`;
const UNLOCK_SQL = `SELECT pg_advisory_unlock(hashtext('supalite:migrate'))`;
const MARKER_RE = /^--\s*migrate:(up|down)\b(.*)$/;
const parseMigrationSql = (content) => {
    const lines = content.split(/\r?\n/);
    const buf = { up: [], down: [] };
    const disable = { up: false, down: false };
    const seen = { up: false, down: false };
    let current = null;
    for (const line of lines) {
        const m = line.match(MARKER_RE);
        if (m) {
            current = m[1];
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
    const up = { sql: buf.up.join('\n').trim(), disableTransaction: disable.up };
    const down = seen.down
        ? { sql: buf.down.join('\n').trim(), disableTransaction: disable.down }
        : null;
    return { up, down };
};
exports.parseMigrationSql = parseMigrationSql;
const parseMigrationFilename = (filename) => {
    const base = filename.replace(/\.sql$/i, '');
    const m = base.match(/^(\d+)(?:_(.*))?$/);
    if (!m) {
        throw new Error(`Invalid migration filename (expected <timestamp>_<name>.sql): ${filename}`);
    }
    return { version: m[1], name: m[2] ?? '' };
};
exports.parseMigrationFilename = parseMigrationFilename;
const listMigrationFiles = async (dir) => {
    let entries;
    try {
        entries = await fs_1.promises.readdir(dir);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Migrations directory not found: ${path_1.default.resolve(dir)}`);
        }
        throw error;
    }
    const files = entries
        .filter((name) => name.toLowerCase().endsWith('.sql'))
        .map((filename) => {
        const { version, name } = (0, exports.parseMigrationFilename)(filename);
        return { version, name, filename, path: path_1.default.join(dir, filename) };
    });
    files.sort((a, b) => {
        const av = BigInt(a.version);
        const bv = BigInt(b.version);
        return av < bv ? -1 : av > bv ? 1 : 0;
    });
    return files;
};
exports.listMigrationFiles = listMigrationFiles;
const parseTableRef = (ref) => {
    const parts = ref.split('.');
    if (parts.length === 1 && parts[0]) {
        return { schema: 'public', table: parts[0] };
    }
    if (parts.length === 2 && parts[0] && parts[1]) {
        return { schema: parts[0], table: parts[1] };
    }
    throw new Error(`Invalid --migrations-table (expected 'table' or 'schema.table'): ${ref}`);
};
exports.parseTableRef = parseTableRef;
const quoteIdent = (id) => `"${id.replace(/"/g, '""')}"`;
const quoteLiteral = (v) => `'${v.replace(/'/g, "''")}'`;
const qualifiedTable = (t) => `${quoteIdent(t.schema)}.${quoteIdent(t.table)}`;
// SQL builders shared by the executor and the dry-run preview so the two can
// never drift (issue #14 fidelity requirement).
const createSchemaSql = (t) => `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(t.schema)}`;
const createTableSql = (t) => `CREATE TABLE IF NOT EXISTS ${qualifiedTable(t)} (` +
    `version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
// The mark-applied insert (idempotent), parameterized by the value expression
// so the executor (`$1`, bound) and the dry-run preview (a version literal)
// render from the SAME template — structure/identifiers/ON CONFLICT can't drift.
const markAppliedInsertSqlWith = (t, valueExpr) => `INSERT INTO ${qualifiedTable(t)} (version) VALUES (${valueExpr}) ON CONFLICT (version) DO NOTHING`;
const markAppliedInsertSql = (t) => markAppliedInsertSqlWith(t, '$1');
const previewInsertSql = (t, version) => markAppliedInsertSqlWith(t, quoteLiteral(version));
const ensureMigrationsTable = async (client, t) => {
    await client.query(createSchemaSql(t));
    await client.query(createTableSql(t));
};
// Read-only existence probe — never creates the table (dry-run safety).
const tableExists = async (client, t) => {
    const res = await client.query('SELECT to_regclass($1) AS reg', [
        qualifiedTable(t),
    ]);
    return res.rows[0]?.reg != null;
};
const appliedVersions = async (client, t) => {
    const res = await client.query(`SELECT version FROM ${qualifiedTable(t)}`);
    return new Set(res.rows.map((r) => r.version));
};
// Applied versions without assuming the table exists (returns ∅ when absent).
const appliedVersionsIfExists = async (client, t) => (await tableExists(client, t)) ? appliedVersions(client, t) : new Set();
const migrateStatus = async (opts) => {
    const dir = opts.dir ?? DEFAULT_DIR;
    const table = (0, exports.parseTableRef)(opts.migrationsTable ?? DEFAULT_TABLE);
    const files = await (0, exports.listMigrationFiles)(dir);
    const client = new pg_1.Client({ connectionString: opts.dbUrl });
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
    }
    finally {
        await client.end();
    }
};
exports.migrateStatus = migrateStatus;
const applyMigration = async (client, table, file, up) => {
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
        }
        catch (error) {
            throw new Error(`Migration ${file.filename} failed: ${error.message}`);
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
    }
    catch (error) {
        try {
            await client.query('ROLLBACK');
        }
        catch {
            // preserve the original error; a rollback failure must not mask it
        }
        throw new Error(`Migration ${file.filename} failed: ${error.message}`);
    }
};
const migrateUp = async (opts) => {
    const dir = opts.dir ?? DEFAULT_DIR;
    const table = (0, exports.parseTableRef)(opts.migrationsTable ?? DEFAULT_TABLE);
    const files = await (0, exports.listMigrationFiles)(dir);
    const client = new pg_1.Client({ connectionString: opts.dbUrl });
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
        const done = [];
        try {
            // Re-read applied under the lock: a concurrent deploy may have applied
            // some migrations between our first read and acquiring the lock.
            const appliedLocked = await appliedVersions(client, table);
            for (const file of files) {
                if (appliedLocked.has(file.version)) {
                    continue;
                }
                const parsed = (0, exports.parseMigrationSql)(await fs_1.promises.readFile(file.path, 'utf8'));
                await applyMigration(client, table, file, parsed.up);
                done.push(file.version);
            }
        }
        finally {
            await client.query(UNLOCK_SQL);
        }
        return { applied: done, pending: [] };
    }
    finally {
        await client.end();
    }
};
exports.migrateUp = migrateUp;
const migrateMarkApplied = async (opts) => {
    const dir = opts.dir ?? DEFAULT_DIR;
    const table = (0, exports.parseTableRef)(opts.migrationsTable ?? DEFAULT_TABLE);
    const files = await (0, exports.listMigrationFiles)(dir);
    let targets;
    if (opts.all) {
        targets = files;
    }
    else if (opts.version) {
        const found = files.find((f) => f.version === opts.version);
        if (!found) {
            throw new Error(`No migration with version ${opts.version} found in ${path_1.default.resolve(dir)}`);
        }
        targets = [found];
    }
    else {
        throw new Error('mark-applied requires a <version> argument or --all.');
    }
    const client = new pg_1.Client({ connectionString: opts.dbUrl });
    await client.connect();
    try {
        if (opts.dryRun) {
            // Write-free preview: probe the table read-only (never create it), then
            // report which versions would be recorded and the exact SQL that would
            // run — built from the same helpers the executor uses (fidelity).
            const exists = await tableExists(client, table);
            const applied = exists ? await appliedVersions(client, table) : new Set();
            const marked = [];
            const alreadyApplied = [];
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
        const marked = [];
        const alreadyApplied = [];
        for (const file of targets) {
            if (applied.has(file.version)) {
                alreadyApplied.push(file.version);
                continue;
            }
            await client.query(insert, [file.version]);
            marked.push(file.version);
        }
        return { marked, alreadyApplied };
    }
    finally {
        await client.end();
    }
};
exports.migrateMarkApplied = migrateMarkApplied;
const migrationTimestamp = (date = new Date()) => date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
exports.migrationTimestamp = migrationTimestamp;
const NEW_MIGRATION_TEMPLATE = `-- migrate:up\n\n\n-- migrate:down\n\n`;
const migrateNew = async (opts) => {
    const dir = opts.dir ?? DEFAULT_DIR;
    const name = opts.name.trim().replace(/\s+/g, '_');
    if (!name) {
        throw new Error('migrate new requires a non-empty <name>.');
    }
    const version = opts.timestamp ?? (0, exports.migrationTimestamp)();
    const filename = `${version}_${name}.sql`;
    const filePath = path_1.default.join(dir, filename);
    await fs_1.promises.mkdir(dir, { recursive: true });
    await fs_1.promises.writeFile(filePath, NEW_MIGRATION_TEMPLATE, { flag: 'wx' });
    return { path: filePath, filename, version };
};
exports.migrateNew = migrateNew;
