"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
const migrate_1 = require("../migrate");
const db_pull_1 = require("../db-pull");
(0, dotenv_1.config)();
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
jest.setTimeout(60000);
let envCounter = 0;
const makeEnv = async () => {
    envCounter += 1;
    const schema = `mig_test_${process.pid}_${envCounter}`;
    const dir = await fs_1.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'supalite-migrate-'));
    return { schema, dir, table: `${schema}.schema_migrations` };
};
const dropSchema = async (schema) => {
    const client = new pg_1.Client({ connectionString });
    await client.connect();
    try {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    finally {
        await client.end();
    }
};
const cleanupEnv = async (env) => {
    await dropSchema(env.schema);
    await fs_1.promises.rm(env.dir, { recursive: true, force: true });
};
const writeMigration = (dir, filename, body) => fs_1.promises.writeFile(path_1.default.join(dir, filename), body, 'utf8');
const tableExists = async (schema, table) => {
    const client = new pg_1.Client({ connectionString });
    await client.connect();
    try {
        const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [
            `"${schema}"."${table}"`,
        ]);
        return res.rows[0].exists === true;
    }
    finally {
        await client.end();
    }
};
describe('parseMigrationSql', () => {
    test('splits up and down sections', () => {
        const parsed = (0, migrate_1.parseMigrationSql)('-- migrate:up\nCREATE TABLE t(id int);\n-- migrate:down\nDROP TABLE t;\n');
        expect(parsed.up.sql).toBe('CREATE TABLE t(id int);');
        expect(parsed.up.disableTransaction).toBe(false);
        expect(parsed.down?.sql).toBe('DROP TABLE t;');
    });
    test('detects transaction:false on the up marker', () => {
        const parsed = (0, migrate_1.parseMigrationSql)('-- migrate:up transaction:false\nCREATE INDEX CONCURRENTLY i ON t(id);\n');
        expect(parsed.up.disableTransaction).toBe(true);
        expect(parsed.down).toBeNull();
    });
    test('throws when the up section is missing', () => {
        expect(() => (0, migrate_1.parseMigrationSql)('CREATE TABLE t(id int);')).toThrow("Missing '-- migrate:up'");
    });
});
describe('parseMigrationFilename', () => {
    test('extracts version and name', () => {
        expect((0, migrate_1.parseMigrationFilename)('20260712093000_add_users.sql')).toEqual({
            version: '20260712093000',
            name: 'add_users',
        });
    });
    test('throws on a filename without a numeric prefix', () => {
        expect(() => (0, migrate_1.parseMigrationFilename)('add_users.sql')).toThrow('Invalid migration filename');
    });
});
describe('migrationTimestamp', () => {
    test('formats a date as YYYYMMDDHHMMSS', () => {
        expect((0, migrate_1.migrationTimestamp)(new Date('2026-07-12T09:30:00.000Z'))).toBe('20260712093000');
    });
});
describe('parseTableRef', () => {
    test('accepts table-only (defaults schema to public) and schema.table', () => {
        expect((0, migrate_1.parseTableRef)('sm')).toEqual({ schema: 'public', table: 'sm' });
        expect((0, migrate_1.parseTableRef)('audit.sm')).toEqual({ schema: 'audit', table: 'sm' });
    });
    test('rejects an invalid ref', () => {
        expect(() => (0, migrate_1.parseTableRef)('a.b.c')).toThrow('Invalid --migrations-table');
        expect(() => (0, migrate_1.parseTableRef)('')).toThrow('Invalid --migrations-table');
    });
});
describe('migrateNew validation', () => {
    test('throws on an empty name', async () => {
        const dir = await fs_1.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'supalite-new-empty-'));
        try {
            await expect((0, migrate_1.migrateNew)({ name: '   ', dir })).rejects.toThrow('non-empty');
        }
        finally {
            await fs_1.promises.rm(dir, { recursive: true, force: true });
        }
    });
});
describe('migrateNew', () => {
    test('creates a timestamped file with up/down markers', async () => {
        const dir = await fs_1.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'supalite-new-'));
        try {
            const result = await (0, migrate_1.migrateNew)({ name: 'add orders', dir, timestamp: '20260712093000' });
            expect(result.filename).toBe('20260712093000_add_orders.sql');
            const content = await fs_1.promises.readFile(result.path, 'utf8');
            expect(content).toContain('-- migrate:up');
            expect(content).toContain('-- migrate:down');
        }
        finally {
            await fs_1.promises.rm(dir, { recursive: true, force: true });
        }
    });
});
describe('listMigrationFiles', () => {
    test('returns .sql files sorted by version ascending', async () => {
        const dir = await fs_1.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'supalite-list-'));
        try {
            await writeMigration(dir, '20260101000000_b.sql', '-- migrate:up\n');
            await writeMigration(dir, '20250101000000_a.sql', '-- migrate:up\n');
            await writeMigration(dir, 'notes.txt', 'ignored');
            const files = await (0, migrate_1.listMigrationFiles)(dir);
            expect(files.map((f) => f.version)).toEqual(['20250101000000', '20260101000000']);
        }
        finally {
            await fs_1.promises.rm(dir, { recursive: true, force: true });
        }
    });
    test('throws a clear error when the directory is missing', async () => {
        await expect((0, migrate_1.listMigrationFiles)(path_1.default.join(os_1.default.tmpdir(), 'supalite-does-not-exist-xyz'))).rejects.toThrow('Migrations directory not found');
    });
});
describe('migrateStatus (integration)', () => {
    test('reports each migration as applied or pending', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260101000001_create.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".widgets (id int primary key);\n`);
            const before = await (0, migrate_1.migrateStatus)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
            });
            expect(before).toEqual([
                { version: '20260101000001', name: 'create', filename: '20260101000001_create.sql', applied: false },
            ]);
        }
        finally {
            await cleanupEnv(env);
        }
    });
});
describe('migrateUp (integration)', () => {
    test('applies pending migrations, records versions, and is idempotent', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260101000001_create.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".widgets (id int primary key);\n` +
                `-- migrate:down\nDROP TABLE "${env.schema}".widgets;\n`);
            const result = await (0, migrate_1.migrateUp)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
            expect(result.applied).toEqual(['20260101000001']);
            expect(await tableExists(env.schema, 'widgets')).toBe(true);
            const again = await (0, migrate_1.migrateUp)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
            expect(again.applied).toEqual([]);
        }
        finally {
            await cleanupEnv(env);
        }
    });
    test('dry-run reports pending without applying', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260101000002_create.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".gadgets (id int);\n`);
            const result = await (0, migrate_1.migrateUp)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                dryRun: true,
            });
            expect(result.pending).toEqual(['20260101000002']);
            expect(await tableExists(env.schema, 'gadgets')).toBe(false);
        }
        finally {
            await cleanupEnv(env);
        }
    });
    test('a failing migration rolls back, is not recorded, and stops the run', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260101000003_ok.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".t1 (id int);\n`);
            await writeMigration(env.dir, '20260101000004_bad.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".t2 (id int);\nSELECT 1/0;\n`);
            await writeMigration(env.dir, '20260101000005_never.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".t3 (id int);\n`);
            await expect((0, migrate_1.migrateUp)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table })).rejects.toThrow('20260101000004_bad.sql');
            expect(await tableExists(env.schema, 't1')).toBe(true);
            expect(await tableExists(env.schema, 't2')).toBe(false);
            expect(await tableExists(env.schema, 't3')).toBe(false);
            const status = await (0, migrate_1.migrateStatus)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
            expect(status.find((s) => s.version === '20260101000003')?.applied).toBe(true);
            expect(status.find((s) => s.version === '20260101000004')?.applied).toBe(false);
            expect(status.find((s) => s.version === '20260101000005')?.applied).toBe(false);
        }
        finally {
            await cleanupEnv(env);
        }
    });
});
describe('migrateUp transaction:false (integration)', () => {
    test('runs CREATE INDEX CONCURRENTLY outside a transaction and records it', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260201000001_table.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".items (id int);\n`);
            await writeMigration(env.dir, '20260201000002_index.sql', `-- migrate:up transaction:false\n` +
                `CREATE INDEX CONCURRENTLY IF NOT EXISTS items_id_idx ON "${env.schema}".items (id);\n`);
            const result = await (0, migrate_1.migrateUp)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
            expect(result.applied).toEqual(['20260201000001', '20260201000002']);
            const client = new pg_1.Client({ connectionString });
            await client.connect();
            try {
                const res = await client.query(`SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'items_id_idx'`, [env.schema]);
                expect(res.rowCount).toBe(1);
            }
            finally {
                await client.end();
            }
        }
        finally {
            await cleanupEnv(env);
        }
    });
});
describe('migrateMarkApplied (integration)', () => {
    test('--all records versions without executing SQL', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260301000001_create.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".should_not_exist (id int);\n`);
            const result = await (0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                all: true,
            });
            expect(result.marked).toEqual(['20260301000001']);
            expect(await tableExists(env.schema, 'should_not_exist')).toBe(false);
            const up = await (0, migrate_1.migrateUp)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
            expect(up.applied).toEqual([]);
            expect(await tableExists(env.schema, 'should_not_exist')).toBe(false);
        }
        finally {
            await cleanupEnv(env);
        }
    });
    test('mark-applied <version> records a single migration', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260301000002_a.sql', `-- migrate:up\nSELECT 1;\n`);
            await writeMigration(env.dir, '20260301000003_b.sql', `-- migrate:up\nSELECT 1;\n`);
            const result = await (0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                version: '20260301000002',
            });
            expect(result.marked).toEqual(['20260301000002']);
            const status = await (0, migrate_1.migrateStatus)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
            expect(status.find((s) => s.version === '20260301000002')?.applied).toBe(true);
            expect(status.find((s) => s.version === '20260301000003')?.applied).toBe(false);
        }
        finally {
            await cleanupEnv(env);
        }
    });
    test('throws when neither --all nor a version is given', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260301000004_a.sql', `-- migrate:up\nSELECT 1;\n`);
            await expect((0, migrate_1.migrateMarkApplied)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table })).rejects.toThrow('requires a <version> argument or --all');
        }
        finally {
            await cleanupEnv(env);
        }
    });
    test('throws for an unknown version and reports already-applied on repeat', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260301000005_a.sql', `-- migrate:up\nSELECT 1;\n`);
            await expect((0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                version: '99999999999999',
            })).rejects.toThrow('No migration with version 99999999999999');
            const first = await (0, migrate_1.migrateMarkApplied)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table, all: true });
            expect(first.marked).toEqual(['20260301000005']);
            const second = await (0, migrate_1.migrateMarkApplied)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table, all: true });
            expect(second.marked).toEqual([]);
            expect(second.alreadyApplied).toEqual(['20260301000005']);
        }
        finally {
            await cleanupEnv(env);
        }
    });
});
const rowCount = async (schema, table) => {
    const client = new pg_1.Client({ connectionString });
    await client.connect();
    try {
        const res = await client.query(`SELECT count(*)::text AS n FROM "${schema}"."${table}"`);
        return Number(res.rows[0].n);
    }
    finally {
        await client.end();
    }
};
describe('migrateMarkApplied --dry-run (#14)', () => {
    test('table absent: previews would-record + SQL and writes nothing', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260401000001_a.sql', `-- migrate:up\nSELECT 1;\n`);
            await writeMigration(env.dir, '20260401000002_b.sql', `-- migrate:up\nSELECT 1;\n`);
            const result = await (0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                all: true,
                dryRun: true,
            });
            expect(result.marked).toEqual(['20260401000001', '20260401000002']);
            expect(result.alreadyApplied).toEqual([]);
            expect(result.dryRun?.tableExists).toBe(false);
            expect(result.dryRun?.table).toBe(env.table);
            // SQL preview: two ensure statements + one insert per would-record version.
            const sql = result.dryRun?.sql ?? [];
            expect(sql[0]).toContain('CREATE SCHEMA IF NOT EXISTS');
            expect(sql[1]).toContain('CREATE TABLE IF NOT EXISTS');
            expect(sql.filter((s) => s.startsWith('INSERT INTO'))).toHaveLength(2);
            expect(sql.some((s) => s.includes("VALUES ('20260401000001')"))).toBe(true);
            // write-free: the tracking table was NOT created.
            expect(await tableExists(env.schema, 'schema_migrations')).toBe(false);
        }
        finally {
            await cleanupEnv(env);
        }
    });
    test('subset already recorded: skips them, no INSERT, rows unchanged; fidelity holds', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260402000001_a.sql', `-- migrate:up\nSELECT 1;\n`);
            await writeMigration(env.dir, '20260402000002_b.sql', `-- migrate:up\nSELECT 1;\n`);
            // pre-record the first version for real
            await (0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                version: '20260402000001',
            });
            const before = await rowCount(env.schema, 'schema_migrations');
            const dry = await (0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                all: true,
                dryRun: true,
            });
            expect(dry.marked).toEqual(['20260402000002']);
            expect(dry.alreadyApplied).toEqual(['20260402000001']);
            expect(dry.dryRun?.tableExists).toBe(true);
            const inserts = (dry.dryRun?.sql ?? []).filter((s) => s.startsWith('INSERT INTO'));
            expect(inserts).toHaveLength(1);
            expect(inserts[0]).toContain("VALUES ('20260402000002')");
            // no INSERT for the skipped version
            expect(inserts.some((s) => s.includes("'20260402000001'"))).toBe(false);
            // dry-run wrote nothing
            expect(await rowCount(env.schema, 'schema_migrations')).toBe(before);
            // fidelity: the real run records exactly what the dry-run predicted...
            const real = await (0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                all: true,
            });
            expect(real.marked).toEqual(dry.marked);
            // ...and a subsequent dry-run reports everything already recorded.
            const dry2 = await (0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                all: true,
                dryRun: true,
            });
            expect(dry2.marked).toEqual([]);
            expect(dry2.alreadyApplied).toEqual(['20260402000001', '20260402000002']);
            expect((dry2.dryRun?.sql ?? []).some((s) => s.startsWith('INSERT INTO'))).toBe(false);
        }
        finally {
            await cleanupEnv(env);
        }
    });
    test('single version dry-run previews exactly that version', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260403000001_a.sql', `-- migrate:up\nSELECT 1;\n`);
            await writeMigration(env.dir, '20260403000002_b.sql', `-- migrate:up\nSELECT 1;\n`);
            const dry = await (0, migrate_1.migrateMarkApplied)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                version: '20260403000002',
                dryRun: true,
            });
            expect(dry.marked).toEqual(['20260403000002']);
            expect((dry.dryRun?.sql ?? []).filter((s) => s.startsWith('INSERT INTO'))).toHaveLength(1);
            expect(await tableExists(env.schema, 'schema_migrations')).toBe(false);
        }
        finally {
            await cleanupEnv(env);
        }
    });
});
describe('migrateUp --dry-run is write-free (#14, 003 SC-005)', () => {
    test('returns pending versions with paths and does not create the tracking table', async () => {
        const env = await makeEnv();
        try {
            await writeMigration(env.dir, '20260404000001_a.sql', `-- migrate:up\nSELECT 1;\n`);
            const result = await (0, migrate_1.migrateUp)({
                dbUrl: connectionString,
                dir: env.dir,
                migrationsTable: env.table,
                dryRun: true,
            });
            expect(result.pending).toEqual(['20260404000001']);
            expect(result.pendingPaths).toHaveLength(1);
            expect(result.pendingPaths?.[0]).toContain('20260404000001_a.sql');
            // the tracking table must NOT have been created by the dry-run
            expect(await tableExists(env.schema, 'schema_migrations')).toBe(false);
        }
        finally {
            await cleanupEnv(env);
        }
    });
});
describe('dbmate round-trip (SC-006, closes #8 SC-004)', () => {
    test('a db pull --format dbmate baseline applies via migrateUp', async () => {
        const env = await makeEnv();
        const srcSchema = `${env.schema}_src`;
        try {
            // build a small source schema and pull a dbmate-format baseline
            const seed = new pg_1.Client({ connectionString });
            await seed.connect();
            try {
                await seed.query(`CREATE SCHEMA "${srcSchema}"`);
                await seed.query(`CREATE TABLE "${srcSchema}".orders (id bigint primary key, note text)`);
            }
            finally {
                await seed.end();
            }
            const baseline = await (0, db_pull_1.generateBaselineSql)({
                dbUrl: connectionString,
                schemas: [srcSchema],
                format: 'dbmate',
            });
            expect(baseline.startsWith('-- migrate:up\n')).toBe(true);
            // parser accepts it as a single up section
            const parsed = (0, migrate_1.parseMigrationSql)(baseline);
            expect(parsed.up.sql.length).toBeGreaterThan(0);
            // drop the source objects so migrateUp actually recreates them
            await dropSchema(srcSchema);
            await writeMigration(env.dir, '20260701000001_baseline.sql', baseline);
            const result = await (0, migrate_1.migrateUp)({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
            expect(result.applied).toEqual(['20260701000001']);
            expect(await tableExists(srcSchema, 'orders')).toBe(true);
        }
        finally {
            await dropSchema(srcSchema);
            await cleanupEnv(env);
        }
    });
});
describe('public API surface', () => {
    test('migrate functions are re-exported from the package root', async () => {
        const pkg = await Promise.resolve().then(() => __importStar(require('../index')));
        expect(typeof pkg.migrateUp).toBe('function');
        expect(typeof pkg.migrateStatus).toBe('function');
        expect(typeof pkg.migrateMarkApplied).toBe('function');
        expect(typeof pkg.migrateNew).toBe('function');
    });
});
