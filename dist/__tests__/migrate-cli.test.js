"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const pg_1 = require("pg");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
const repoRoot = node_path_1.default.resolve(__dirname, '../..');
const tsNodeBin = node_path_1.default.join(repoRoot, 'node_modules', 'ts-node', 'dist', 'bin.js');
const tsconfig = node_path_1.default.join(repoRoot, 'tsconfig.json');
const cliPath = node_path_1.default.join(repoRoot, 'src', 'cli.ts');
jest.setTimeout(180000);
const runCli = async (args, opts = {}) => {
    try {
        const { stdout, stderr } = await execFileAsync(process.execPath, [tsNodeBin, '-P', tsconfig, '--transpile-only', cliPath, ...args], {
            cwd: opts.cwd ?? repoRoot,
            env: { ...process.env, DB_CONNECTION: '', DATABASE_URL: '', ...opts.env },
            maxBuffer: 64 * 1024 * 1024,
        });
        return { code: 0, stdout, stderr };
    }
    catch (error) {
        const err = error;
        return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
    }
};
describe('supalite migrate CLI', () => {
    test('--help exits 0 and documents subcommands', async () => {
        const help = await runCli(['migrate', '--help']);
        expect(help.code).toBe(0);
        expect(help.stdout).toContain('supalite migrate');
        expect(help.stdout).toContain('mark-applied');
    });
    test('missing db-url on up exits 1 with usage', async () => {
        const result = await runCli(['migrate', 'up']);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('Missing --db-url (or DB_CONNECTION / DATABASE_URL env var).');
    });
    test('down is reported as unsupported', async () => {
        const result = await runCli(['migrate', 'down', '--db-url', connectionString]);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('not supported');
    });
    test('unknown option is rejected', async () => {
        const result = await runCli(['migrate', 'up', '--db-url', connectionString, '--nope']);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('Unknown option for migrate: --nope');
    });
    test('new creates a file without a DB connection', async () => {
        const tmpDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'migrate-cli-new-'));
        try {
            const result = await runCli(['migrate', 'new', 'add_orders', '--dir', node_path_1.default.join(tmpDir, 'm')]);
            expect(result.code).toBe(0);
            const files = node_fs_1.default.readdirSync(node_path_1.default.join(tmpDir, 'm'));
            expect(files).toHaveLength(1);
            expect(files[0]).toMatch(/^\d{14}_add_orders\.sql$/);
        }
        finally {
            node_fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    test('mark-applied --all --dry-run prints the preview block and writes nothing', async () => {
        const tmpDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'migrate-cli-dry-'));
        const schema = `mig_cli_dry_${process.pid}`;
        const table = `${schema}.schema_migrations`;
        try {
            const mdir = node_path_1.default.join(tmpDir, 'm');
            node_fs_1.default.mkdirSync(mdir, { recursive: true });
            node_fs_1.default.writeFileSync(node_path_1.default.join(mdir, '20260405000001_noop.sql'), '-- migrate:up\nSELECT 1;\n');
            const dry = await runCli(['migrate', 'mark-applied', '--all', '--dir', mdir, '--migrations-table', table, '--dry-run'], { env: { DB_CONNECTION: connectionString } });
            expect(dry.code).toBe(0);
            expect(dry.stdout).toContain('[dry-run] would ensure table:');
            expect(dry.stdout).toContain('[dry-run] would record 1 version(s):');
            expect(dry.stdout).toContain('- 20260405000001');
            expect(dry.stdout).toContain('[dry-run] SQL:');
            expect(dry.stdout).toContain('INSERT INTO');
            expect(dry.stdout).toContain('[dry-run] no migration DDL is executed by mark-applied.');
            // write-free: the tracking table must not exist afterwards
            const client = new pg_1.Client({ connectionString });
            await client.connect();
            try {
                const res = await client.query('SELECT to_regclass($1) AS reg', [
                    `"${schema}"."schema_migrations"`,
                ]);
                expect(res.rows[0].reg).toBeNull();
            }
            finally {
                await client.end();
            }
        }
        finally {
            const client = new pg_1.Client({ connectionString });
            await client.connect();
            try {
                await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            }
            finally {
                await client.end();
            }
            node_fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    test('mark-applied --dry-run without --all or a version still errors (arg parity)', async () => {
        const tmpDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'migrate-cli-argparity-'));
        try {
            const mdir = node_path_1.default.join(tmpDir, 'm');
            node_fs_1.default.mkdirSync(mdir, { recursive: true });
            node_fs_1.default.writeFileSync(node_path_1.default.join(mdir, '20260407000001_noop.sql'), '-- migrate:up\nSELECT 1;\n');
            const result = await runCli(['migrate', 'mark-applied', '--dry-run', '--dir', mdir, '--db-url', connectionString]);
            expect(result.code).toBe(1);
            expect(result.stderr).toContain('mark-applied requires a <version> argument or --all.');
        }
        finally {
            node_fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    test('up --dry-run prints the file path and the write-free note', async () => {
        const tmpDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'migrate-cli-updry-'));
        const schema = `mig_cli_updry_${process.pid}`;
        const table = `${schema}.schema_migrations`;
        try {
            const mdir = node_path_1.default.join(tmpDir, 'm');
            node_fs_1.default.mkdirSync(mdir, { recursive: true });
            node_fs_1.default.writeFileSync(node_path_1.default.join(mdir, '20260406000001_noop.sql'), '-- migrate:up\nSELECT 1;\n');
            const dry = await runCli(['migrate', 'up', '--dir', mdir, '--migrations-table', table, '--dry-run'], { env: { DB_CONNECTION: connectionString } });
            expect(dry.code).toBe(0);
            expect(dry.stdout).toContain('20260406000001_noop.sql');
            expect(dry.stdout).toContain('(table not created; nothing applied)');
            const client = new pg_1.Client({ connectionString });
            await client.connect();
            try {
                const res = await client.query('SELECT to_regclass($1) AS reg', [
                    `"${schema}"."schema_migrations"`,
                ]);
                expect(res.rows[0].reg).toBeNull();
            }
            finally {
                await client.end();
            }
        }
        finally {
            const client = new pg_1.Client({ connectionString });
            await client.connect();
            try {
                await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            }
            finally {
                await client.end();
            }
            node_fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    test('up --dry-run and status run end-to-end via DB_CONNECTION', async () => {
        const tmpDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'migrate-cli-'));
        const schema = `mig_cli_${process.pid}`;
        const table = `${schema}.schema_migrations`;
        try {
            const mdir = node_path_1.default.join(tmpDir, 'm');
            node_fs_1.default.mkdirSync(mdir, { recursive: true });
            node_fs_1.default.writeFileSync(node_path_1.default.join(mdir, '20260401000001_noop.sql'), '-- migrate:up\nSELECT 1;\n');
            const dry = await runCli(['migrate', 'up', '--dir', mdir, '--migrations-table', table, '--dry-run'], { env: { DB_CONNECTION: connectionString } });
            expect(dry.code).toBe(0);
            expect(dry.stdout).toContain('20260401000001');
            const status = await runCli(['migrate', 'status', '--dir', mdir, '--migrations-table', table], {
                env: { DB_CONNECTION: connectionString },
            });
            expect(status.code).toBe(0);
            expect(status.stdout).toContain('[ ] 20260401000001');
        }
        finally {
            const client = new pg_1.Client({ connectionString });
            await client.connect();
            try {
                await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            }
            finally {
                await client.end();
            }
            node_fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
