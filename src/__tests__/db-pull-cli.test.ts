import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from 'dotenv';

config();

const execFileAsync = promisify(execFile);
const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
const repoRoot = path.resolve(__dirname, '../..');
const tsNodeBin = path.join(repoRoot, 'node_modules', 'ts-node', 'dist', 'bin.js');
const tsconfig = path.join(repoRoot, 'tsconfig.json');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');

jest.setTimeout(180000);

type CliResult = { code: number; stdout: string; stderr: string };

const runCli = async (
  args: string[],
  opts: { env?: Record<string, string>; cwd?: string } = {}
): Promise<CliResult> => {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tsNodeBin, '-P', tsconfig, '--transpile-only', cliPath, ...args],
      {
        cwd: opts.cwd ?? repoRoot,
        env: { ...process.env, DB_CONNECTION: '', ...opts.env },
        maxBuffer: 64 * 1024 * 1024,
      }
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
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
  });

  test('default out path creates supabase/migrations/<UTC ts>_baseline.sql in cwd', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-pull-cli-'));
    try {
      const result = await runCli(['db', 'pull', '--db-url', connectionString], { cwd: tmpDir });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Wrote baseline schema to');
      const files = fs.readdirSync(path.join(tmpDir, 'supabase', 'migrations'));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{14}_baseline\.sql$/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('explicit --out creates nested directories', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-pull-cli-'));
    try {
      const outPath = path.join(tmpDir, 'nested', 'dir', 'base.sql');
      const result = await runCli(['db', 'pull', '--db-url', connectionString, '--out', outPath]);
      expect(result.code).toBe(0);
      expect(fs.existsSync(outPath)).toBe(true);
      expect(fs.readFileSync(outPath, 'utf8')).toContain('-- supalite db pull baseline');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
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

  test('--schema accepts comma-separated values and repeated flags', async () => {
    const comma = await runCli(
      ['db', 'pull', '--db-url', connectionString, '--schema', 'cli_a,cli_b', '--out', '-'],
      {}
    );
    expect(comma.code).toBe(0);
    expect(comma.stdout).toContain('-- schemas: cli_a, cli_b');
    const repeated = await runCli(
      ['db', 'pull', '--db-url', connectionString, '--schema', 'cli_a', '--schema', 'cli_b', '--out', '-'],
      {}
    );
    expect(repeated.code).toBe(0);
    expect(repeated.stdout).toContain('-- schemas: cli_a, cli_b');
  });
});
