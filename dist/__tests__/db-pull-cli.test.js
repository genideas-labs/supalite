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
            env: { ...process.env, DB_CONNECTION: '', ...opts.env },
            maxBuffer: 64 * 1024 * 1024,
        });
        return { code: 0, stdout, stderr };
    }
    catch (error) {
        const err = error;
        return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
    }
};
describe('supalite db pull CLI', () => {
    test('--help and -h exit 0 and document the opt-out defaults', async () => {
        const help = await runCli(['db', 'pull', '--help']);
        expect(help.code).toBe(0);
        expect(help.stdout).toContain('--include-extension-objects');
        expect(help.stdout).toContain('--no-if-not-exists');
        expect(help.stdout).toContain('PostgreSQL 14+');
        const shortHelp = await runCli(['db', 'pull', '-h']);
        expect(shortHelp.code).toBe(0);
        expect(shortHelp.stdout).toContain('--include-extension-objects');
    });
    test('missing --db-url and empty DB_CONNECTION exits 1 with usage', async () => {
        const result = await runCli(['db', 'pull']);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('Missing --db-url (or DB_CONNECTION env var).');
    });
    test('DB_CONNECTION fallback works with --out - (stdout mode)', async () => {
        const result = await runCli(['db', 'pull', '--out', '-'], {
            env: { DB_CONNECTION: connectionString },
        });
        expect(result.code).toBe(0);
        expect(result.stdout.startsWith('-- supalite db pull baseline')).toBe(true);
    });
    test('--out stdout behaves like --out -', async () => {
        const result = await runCli(['db', 'pull', '--db-url', connectionString, '--out', 'stdout']);
        expect(result.code).toBe(0);
        expect(result.stdout.startsWith('-- supalite db pull baseline')).toBe(true);
    });
    test('--mode diff exits 1 with the exact reserved-mode message', async () => {
        const result = await runCli(['db', 'pull', '--db-url', connectionString, '--mode', 'diff']);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('Only --mode baseline is supported in this version (diff is planned).');
        // mode is validated before the URL so the message is exact even without one
        const noUrl = await runCli(['db', 'pull', '--mode', 'diff']);
        expect(noUrl.code).toBe(1);
        expect(noUrl.stderr).toContain('Only --mode baseline is supported in this version (diff is planned).');
    });
    test('default out path creates supabase/migrations/<UTC ts>_baseline.sql in cwd', async () => {
        const tmpDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'db-pull-cli-'));
        try {
            const result = await runCli(['db', 'pull', '--db-url', connectionString], { cwd: tmpDir });
            expect(result.code).toBe(0);
            expect(result.stdout).toContain('Wrote baseline schema to');
            const files = node_fs_1.default.readdirSync(node_path_1.default.join(tmpDir, 'supabase', 'migrations'));
            expect(files).toHaveLength(1);
            expect(files[0]).toMatch(/^\d{14}_baseline\.sql$/);
        }
        finally {
            node_fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    test('explicit --out creates nested directories', async () => {
        const tmpDir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'db-pull-cli-'));
        try {
            const outPath = node_path_1.default.join(tmpDir, 'nested', 'dir', 'base.sql');
            const result = await runCli(['db', 'pull', '--db-url', connectionString, '--out', outPath]);
            expect(result.code).toBe(0);
            expect(node_fs_1.default.existsSync(outPath)).toBe(true);
            expect(node_fs_1.default.readFileSync(outPath, 'utf8')).toContain('-- supalite db pull baseline');
        }
        finally {
            node_fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    test('connection failure exits 1 with an error on stderr', async () => {
        const result = await runCli([
            'db',
            'pull',
            '--db-url',
            'postgresql://nouser:nopass@127.0.0.1:59999/nodb',
            '--out',
            '-',
        ]);
        expect(result.code).toBe(1);
        expect(result.stderr.trim().length).toBeGreaterThan(0);
    });
    test('unknown flags and missing values are rejected', async () => {
        const typo = await runCli(['db', 'pull', '--db-url', connectionString, '--schmea', 'analytics']);
        expect(typo.code).toBe(1);
        expect(typo.stderr).toContain('Unknown option for db pull: --schmea');
        const missing = await runCli(['db', 'pull', '--db-url', connectionString, '--schema', '--out', '-']);
        expect(missing.code).toBe(1);
        expect(missing.stderr).toContain('Missing value for --schema.');
    });
    test('--schema accepts comma-separated values and repeated flags', async () => {
        const comma = await runCli(['db', 'pull', '--db-url', connectionString, '--schema', 'cli_a,cli_b', '--out', '-'], {});
        expect(comma.code).toBe(0);
        expect(comma.stdout).toContain('-- schemas: cli_a, cli_b');
        const repeated = await runCli(['db', 'pull', '--db-url', connectionString, '--schema', 'cli_a', '--schema', 'cli_b', '--out', '-'], {});
        expect(repeated.code).toBe(0);
        expect(repeated.stdout).toContain('-- schemas: cli_a, cli_b');
    });
});
