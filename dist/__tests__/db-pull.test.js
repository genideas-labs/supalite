"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
const db_pull_1 = require("../db-pull");
const index_1 = require("../index");
(0, dotenv_1.config)();
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
const schemaName = 'db_pull_schema';
const seedFile = node_path_1.default.resolve(__dirname, '../../scripts/seed-db-pull.sql');
const cleanupFile = node_path_1.default.resolve(__dirname, '../../scripts/cleanup-db-pull.sql');
const runSqlFile = async (pool, filePath) => {
    const sql = node_fs_1.default.readFileSync(filePath, 'utf8');
    await pool.query(sql);
};
jest.setTimeout(180000);
describe('formatBaseline', () => {
    const body = '-- supalite db pull baseline\nCREATE TABLE t(id int);\n';
    test('plain returns the baseline unchanged', () => {
        expect((0, db_pull_1.formatBaseline)(body, 'plain')).toBe(body);
        expect((0, db_pull_1.formatBaseline)(body)).toBe(body);
    });
    test('dbmate wraps with up/down markers, body unchanged, single trailing newline', () => {
        const out = (0, db_pull_1.formatBaseline)(body, 'dbmate');
        expect(out).toBe('-- migrate:up\n' + body + '\n-- migrate:down\n-- baseline: irreversible (no-op)\n');
        expect(out.startsWith('-- migrate:up\n')).toBe(true);
        expect(out.endsWith('-- baseline: irreversible (no-op)\n')).toBe(true);
        expect(out.split('\n').filter((l) => l === '-- migrate:up')).toHaveLength(1);
        const between = out.slice('-- migrate:up\n'.length, out.indexOf('\n-- migrate:down'));
        expect(between).toBe(body);
    });
});
describe('generateBaselineSql', () => {
    let pool;
    let baseline;
    beforeAll(async () => {
        pool = new pg_1.Pool({ connectionString });
        await runSqlFile(pool, seedFile);
        baseline = await (0, db_pull_1.generateBaselineSql)({ dbUrl: connectionString, schemas: [schemaName] });
    });
    afterAll(async () => {
        await runSqlFile(pool, cleanupFile);
        await pool.end();
    });
    test('is exported from the package root', () => {
        expect(index_1.generateBaselineSql).toBe(db_pull_1.generateBaselineSql);
    });
    test('--format dbmate wraps the plain body exactly (SC-003)', async () => {
        const plain = await (0, db_pull_1.generateBaselineSql)({ dbUrl: connectionString, schemas: [schemaName], format: 'plain' });
        const dbmate = await (0, db_pull_1.generateBaselineSql)({ dbUrl: connectionString, schemas: [schemaName], format: 'dbmate' });
        expect(dbmate.startsWith('-- migrate:up\n')).toBe(true);
        expect(dbmate).toContain('\n-- migrate:down\n-- baseline: irreversible (no-op)\n');
        const between = dbmate.slice('-- migrate:up\n'.length, dbmate.lastIndexOf('\n-- migrate:down'));
        // the header's "generated at" timestamp differs between the two calls; normalize it out
        const stripTs = (s) => s.replace(/-- generated at: [^\n]*/, '-- generated at: <ts>');
        expect(stripTs(between)).toBe(stripTs(plain));
    });
    test('sequences: standalone with options, serial-backing, no identity-internal', () => {
        expect(baseline).toContain('CREATE SEQUENCE IF NOT EXISTS db_pull_schema.invoice_seq');
        expect(baseline).toContain('START WITH 1000');
        expect(baseline).toContain('INCREMENT BY 5');
        expect(baseline).toContain('CACHE 10');
        expect(baseline).toContain('db_pull_schema.legacy_id_seq');
        expect(baseline).toMatch(/cyc_seq[^\n]*MAXVALUE 999[^\n]* CYCLE;/);
        expect(baseline).not.toContain('customers_id_seq');
        expect(baseline).not.toContain('orders_id_seq');
    });
    test('types: enums, domains, composites in unified topo order with safe guards', () => {
        expect(baseline).toContain("AS ENUM ('pending', 'paid', 'cancelled')");
        expect(baseline).toContain("'it''s'");
        expect(baseline).toContain('CREATE DOMAIN db_pull_schema.positive_int AS integer');
        expect(baseline).toContain('CHECK ((VALUE > 0))');
        expect(baseline).toContain('AS (amount numeric, currency text)');
        expect(baseline).toContain('db_pull_schema.money_pair[]');
        expect(baseline.indexOf('CREATE TYPE db_pull_schema.money_pair')).toBeLessThan(baseline.indexOf('CREATE TYPE db_pull_schema.money_bag'));
        expect(baseline).toContain('DO $supalite$');
        expect(baseline).toContain('EXCEPTION WHEN duplicate_object');
    });
    test('tables: identity, defaults, collation, unlogged, quoting, topo, partition-leaf exclusion', () => {
        expect(baseline).toContain('CREATE TABLE IF NOT EXISTS db_pull_schema.customers (');
        expect(baseline).toContain('id bigint GENERATED ALWAYS AS IDENTITY');
        expect(baseline).toContain('id bigint GENERATED BY DEFAULT AS IDENTITY (START WITH 500 INCREMENT BY 2 MAXVALUE 900000)');
        expect(baseline).toContain("DEFAULT nextval('db_pull_schema.legacy_id_seq'::regclass)");
        expect(baseline).toContain('STORED');
        expect(baseline).toContain('qty db_pull_schema.positive_int');
        expect(baseline).toContain('code text COLLATE pg_catalog."C"');
        expect(baseline).toContain('email text NOT NULL');
        expect(baseline).toContain('CREATE UNLOGGED TABLE IF NOT EXISTS db_pull_schema.session_cache');
        expect(baseline).toContain('"CamelTable"');
        expect(baseline).toContain('"order" text');
        expect(baseline).toContain('"weird""col" text');
        const customersStart = baseline.indexOf('CREATE TABLE IF NOT EXISTS db_pull_schema.customers (');
        const customersDdl = baseline.slice(customersStart, baseline.indexOf(');', customersStart));
        expect(customersDdl).toMatch(/\n {2}norm text,?\n/);
        expect(customersDdl).not.toContain('CHECK');
        expect(baseline.indexOf('CREATE TABLE IF NOT EXISTS db_pull_schema.customers')).toBeLessThan(baseline.indexOf('CREATE TABLE IF NOT EXISTS db_pull_schema.snapshots'));
        expect(baseline).not.toContain('CREATE TABLE IF NOT EXISTS db_pull_schema.events_p1');
        expect(baseline).not.toContain('CREATE TABLE IF NOT EXISTS db_pull_schema.events_partitioned');
        expect(baseline).toContain('ALTER SEQUENCE db_pull_schema.legacy_id_seq OWNED BY db_pull_schema.orders.legacy_id;');
    });
    test('functions: staged emission + deferred column defaults', () => {
        const typeStage = baseline.indexOf('-- functions\n');
        expect(typeStage).toBeGreaterThan(-1);
        expect(typeStage).toBeLessThan(baseline.indexOf('-- tables'));
        expect(baseline).toContain('CREATE OR REPLACE FUNCTION db_pull_schema.norm_email');
        expect(baseline).toContain('CREATE OR REPLACE FUNCTION db_pull_schema.crlf_fn');
        expect(baseline).toContain('CREATE OR REPLACE FUNCTION db_pull_schema.order_count');
        expect(baseline).toContain('CREATE OR REPLACE PROCEDURE db_pull_schema.log_noop');
        const tableStage = baseline.indexOf('-- table-dependent functions');
        expect(tableStage).toBeGreaterThan(baseline.indexOf('-- sequence ownership'));
        expect(baseline.slice(tableStage)).toContain('user_rows');
        const deferred = baseline.indexOf('-- deferred column defaults');
        expect(deferred).toBeGreaterThan(tableStage);
        expect(baseline).toContain('ALTER TABLE db_pull_schema.customers ALTER COLUMN norm SET DEFAULT');
    });
    test('constraints: guards with safe tags, EXCLUDE, hostile names, FK diversion + external FK', () => {
        expect(baseline).toContain('ADD CONSTRAINT customers_pkey PRIMARY KEY (id)');
        expect(baseline).toContain('orders_norm_check');
        expect(baseline).toContain('orders_legacy_id_excl');
        expect(baseline).toContain('"Check Me"');
        expect(baseline).toContain("WHERE conname = 'orders_customer_id_fkey'");
        expect(baseline).toContain("conrelid = 'db_pull_schema.orders'::regclass");
        expect(baseline).toContain('ADD CONSTRAINT orders_ext_id_fkey');
        expect(baseline).not.toContain('ADD CONSTRAINT events_ref_event_fkey');
        expect(baseline).not.toContain('DO $$');
        expect(baseline).toContain('DO $supalite$');
        expect(baseline).toContain('$supalite1$');
        expect(baseline.lastIndexOf('CREATE TABLE')).toBeLessThan(baseline.indexOf('FOREIGN KEY'));
        expect(baseline.indexOf('-- constraints')).toBeLessThan(baseline.indexOf('-- foreign keys'));
    });
    test('views: topo order, options, matviews, aggregate/partition diversion, view-stage functions', () => {
        expect(baseline.indexOf('CREATE OR REPLACE VIEW db_pull_schema.paid_orders')).toBeLessThan(baseline.indexOf('CREATE OR REPLACE VIEW db_pull_schema.paid_order_totals'));
        expect(baseline).toContain('security_barrier');
        expect(baseline).toContain('CREATE MATERIALIZED VIEW IF NOT EXISTS db_pull_schema.order_totals_mv');
        expect(baseline).toContain('WITH NO DATA');
        expect(baseline).not.toContain('CREATE OR REPLACE VIEW db_pull_schema.agg_totals');
        expect(baseline).not.toContain('CREATE OR REPLACE VIEW db_pull_schema.events_view');
        const viewFns = baseline.indexOf('-- view-dependent functions');
        expect(viewFns).toBeGreaterThan(baseline.indexOf('-- views'));
        expect(baseline.slice(viewFns)).toContain('paid_orders_all');
        expect(baseline.slice(viewFns)).toContain('get_paid');
    });
    test('triggers: OR REPLACE for plain, existence guard for constraint triggers, after views', () => {
        expect(baseline).toContain('CREATE OR REPLACE TRIGGER orders_touch_status BEFORE UPDATE ON db_pull_schema.orders');
        expect(baseline).toContain('CREATE CONSTRAINT TRIGGER orders_ct');
        expect(baseline).not.toContain('CREATE OR REPLACE CONSTRAINT TRIGGER');
        expect(baseline).toContain("tgname = 'orders_ct'");
        expect(baseline.indexOf('-- triggers')).toBeGreaterThan(baseline.indexOf('-- views'));
    });
    test('indexes: IF NOT EXISTS insertion, unique standalone, matview + expression, no constraint-backing', () => {
        const section = baseline.slice(baseline.indexOf('-- indexes'));
        expect(baseline.indexOf('-- indexes')).toBeGreaterThan(baseline.indexOf('-- views'));
        expect(section).toContain('CREATE INDEX IF NOT EXISTS orders_status_idx ON db_pull_schema.orders USING btree (status)');
        expect(section).toContain('CREATE UNIQUE INDEX IF NOT EXISTS customers_full_name_uidx');
        expect(section).toContain('order_totals_mv_uidx');
        expect(section).toContain('customers_email_norm_idx');
        expect(baseline).not.toMatch(/CREATE (UNIQUE )?INDEX [^\n]*customers_email_key/);
        expect(baseline).not.toMatch(/CREATE (UNIQUE )?INDEX [^\n]*customers_pkey/);
        expect(baseline).not.toMatch(/CREATE (UNIQUE )?INDEX [^\n]*orders_legacy_id_excl/);
    });
    test('domain function-dependent default/CHECK are deferred with contypid guards', () => {
        expect(baseline).toContain('ALTER DOMAIN db_pull_schema.norm_text SET DEFAULT');
        expect(baseline).toContain('ALTER DOMAIN db_pull_schema.norm_text ADD CONSTRAINT norm_text_check');
        expect(baseline).toContain("contypid = 'db_pull_schema.norm_text'::regtype");
        const domainCreate = baseline.indexOf('CREATE DOMAIN db_pull_schema.norm_text AS text;');
        expect(domainCreate).toBeGreaterThan(-1);
        expect(baseline.indexOf('ALTER DOMAIN db_pull_schema.norm_text SET DEFAULT')).toBeGreaterThan(domainCreate);
    });
    test('identity bounds: non-default MINVALUE/CACHE/CYCLE rendered', () => {
        expect(baseline).toMatch(/id integer GENERATED ALWAYS AS IDENTITY \(START WITH 10 CACHE 5 MINVALUE 10 CYCLE\)/);
    });
    test('view-stage function interleavings are footer-diverted', () => {
        expect(baseline).toContain('view depending on excluded objects (not emitted): db_pull_schema.vf_view');
        expect(baseline).not.toContain('CREATE OR REPLACE VIEW db_pull_schema.vf_view');
        expect(baseline).toContain('column default calling a function unavailable in this baseline (not emitted): db_pull_schema.session_cache.vs_col');
        expect(baseline).toContain('constraint calling a function unavailable in this baseline (not emitted): db_pull_schema.session_cache.session_vs_check');
        expect(baseline).toContain('CREATE OR REPLACE FUNCTION db_pull_schema.pv_first');
    });
    test('function dependency inheritance and dynamic diversion', () => {
        const tableFns = baseline.indexOf('-- table-dependent functions');
        const tableSection = baseline.slice(tableFns, baseline.indexOf('-- deferred column defaults'));
        expect(tableSection).toContain('tbl_scalar');
        expect(tableSection).toContain('wrap2'); // inherited table stage via argument default
        expect(tableSection.indexOf('tbl_scalar')).toBeLessThan(tableSection.indexOf('wrap2'));
        expect(baseline).toContain('function whose signature references a diverted relation (not emitted): db_pull_schema.holder_fn');
        expect(baseline).not.toContain('CREATE OR REPLACE FUNCTION db_pull_schema.holder_fn');
        expect(baseline).toContain('table with a column of an unavailable type (not emitted): db_pull_schema.gen_blocked');
        expect(baseline).not.toContain('CREATE TABLE IF NOT EXISTS db_pull_schema.gen_blocked');
        expect(baseline).toMatch(/countdown[\s\S]{0,80}\(START WITH -1 INCREMENT BY -1\)/);
    });
    test('footer: partition hierarchy, aggregates, diverted dependents, external refs', () => {
        expect(baseline).toContain('partitioned table hierarchy: db_pull_schema.events_partitioned');
        expect(baseline).toContain('db_pull_schema.events_p1');
        expect(baseline).toContain('aggregate/window function: db_pull_schema.agg_sum');
        expect(baseline).toContain('view depending on excluded objects (not emitted): db_pull_schema.agg_totals');
        expect(baseline).toContain('view depending on excluded objects (not emitted): db_pull_schema.events_view');
        expect(baseline).toContain('function whose signature references an excluded relation (not emitted): db_pull_schema.evt_rows');
        expect(baseline).not.toContain('CREATE OR REPLACE FUNCTION db_pull_schema.evt_rows');
        expect(baseline).toContain('domain based on a relation row type (not emitted): db_pull_schema.cust_dom');
        expect(baseline).toContain('type depending on a diverted type (not emitted): db_pull_schema.cust_dom2');
        expect(baseline).toContain('table with a column of an unavailable type (not emitted): db_pull_schema.evt_holder');
        expect(baseline).not.toContain('CREATE TABLE IF NOT EXISTS db_pull_schema.evt_holder');
        expect(baseline).not.toContain('CREATE DOMAIN db_pull_schema.cust_dom');
        expect(baseline).toContain('foreign key to excluded relation (not emitted): db_pull_schema.events_ref.events_ref_event_fkey');
        expect(baseline).toContain('-- references outside the selected schemas');
        expect(baseline).toContain('db_pull_ext.ext_ref');
        expect(baseline).toContain('-> type db_pull_ext.ext_status');
        expect(baseline).toContain('db_pull_schema.ext_view -> db_pull_ext.ext_ref');
        expect(baseline).toContain('RLS policy (not emitted): db_pull_schema.customers.customers_self');
    });
    test('full section banner order', () => {
        const banners = [
            '-- schemas',
            '-- sequences',
            '-- types',
            '-- functions\n',
            '-- tables',
            '-- sequence ownership',
            '-- table-dependent functions',
            '-- deferred column defaults',
            '-- constraints',
            '-- foreign keys',
            '-- views',
            '-- view-dependent functions',
            '-- triggers',
            '-- indexes',
        ];
        const positions = banners.map((banner) => {
            const pos = baseline.indexOf(banner);
            expect(pos).toBeGreaterThan(-1);
            return pos;
        });
        for (let i = 1; i < positions.length; i += 1) {
            expect(positions[i]).toBeGreaterThan(positions[i - 1]);
        }
    });
    test('plain mode, empty selection, and RLS/grants exclusion', async () => {
        const plain = await (0, db_pull_1.generateBaselineSql)({
            dbUrl: connectionString,
            schemas: [schemaName],
            ifNotExists: false,
        });
        expect(plain).not.toMatch(/^DO \$/m);
        expect(plain).toContain('CREATE TYPE db_pull_schema.order_status');
        expect(plain).toContain('CREATE DOMAIN db_pull_schema.positive_int');
        expect(plain).toMatch(/^CREATE TRIGGER orders_touch_status/m);
        expect(plain).toContain('CREATE CONSTRAINT TRIGGER orders_ct');
        expect(plain).toContain('CREATE OR REPLACE FUNCTION');
        const offending = plain
            .split('\n')
            .filter((line) => line.includes('IF NOT EXISTS') &&
            !line.startsWith('CREATE SCHEMA IF NOT EXISTS') &&
            !line.startsWith('CREATE EXTENSION IF NOT EXISTS'));
        expect(offending).toEqual([]);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        const empty = await (0, db_pull_1.generateBaselineSql)({
            dbUrl: connectionString,
            schemas: ['db_pull_nonexistent'],
        });
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
        expect(empty).toContain('-- supalite db pull baseline');
        expect(empty).not.toContain('-- schemas\n');
        expect(empty).not.toContain('CREATE');
        expect(baseline).not.toContain('GRANT ');
        expect(baseline).not.toContain('CREATE POLICY');
        expect(baseline).not.toContain('ROW LEVEL SECURITY');
    });
    test('extension filter: pg_trgm objects excluded by default across all sections, included on opt-in', async () => {
        const pre = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'");
        const preExisted = (pre.rowCount ?? 0) > 0;
        let available = true;
        try {
            // Install into the quiet fixture schema: pulling `public` here races
            // with parallel suites dropping/creating tables (catalog cache lookups
            // during deparse fail on concurrently dropped relations — same
            // limitation as pg_dump under a concurrent DDL storm).
            await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA ${schemaName}`);
        }
        catch {
            available = false;
        }
        if (!available) {
            console.warn('pg_trgm unavailable in this Postgres — skipping extension-filter test');
            return;
        }
        try {
            const filtered = await (0, db_pull_1.generateBaselineSql)({ dbUrl: connectionString, schemas: [schemaName] });
            expect(filtered).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm');
            expect(filtered).not.toContain('gtrgm');
            if (!preExisted) {
                const unfiltered = await (0, db_pull_1.generateBaselineSql)({
                    dbUrl: connectionString,
                    schemas: [schemaName],
                    includeExtensionObjects: true,
                });
                expect(unfiltered).toContain('gtrgm');
            }
        }
        finally {
            if (!preExisted) {
                await pool.query('DROP EXTENSION IF EXISTS pg_trgm');
            }
        }
    });
    // The only test that mutates the database: drops and rebuilds the schema
    // from the generated baseline (all other tests assert on the prebuilt
    // string). db_pull_ext intentionally stays in place — the documented
    // pre-existing external prerequisite.
    test('round-trip: identical regeneration after drop + re-apply; idempotent second apply', async () => {
        const contentLines = (sql) => sql
            .split('\n')
            .filter((line) => !line.startsWith('--'))
            .join('\n');
        const first = await (0, db_pull_1.generateBaselineSql)({ dbUrl: connectionString, schemas: [schemaName] });
        await pool.query(`DROP SCHEMA ${schemaName} CASCADE`);
        await pool.query(first);
        const second = await (0, db_pull_1.generateBaselineSql)({ dbUrl: connectionString, schemas: [schemaName] });
        expect(contentLines(second)).toBe(contentLines(first));
        await expect(pool.query(first)).resolves.toBeDefined();
    });
    test('header, schema creation, and normalization', () => {
        expect(baseline).toContain('-- supalite db pull baseline');
        expect(baseline).toContain('SET check_function_bodies = off;');
        expect(baseline).toContain('CREATE SCHEMA IF NOT EXISTS db_pull_schema;');
        expect(baseline).not.toContain('\r');
        expect(baseline.endsWith('\n')).toBe(true);
        expect(baseline.endsWith('\n\n')).toBe(false);
    });
});
