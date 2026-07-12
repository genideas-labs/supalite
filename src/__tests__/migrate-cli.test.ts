import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { config } from 'dotenv';

config();

const execFileAsync = promisify(execFile);
const connectionString =
  process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';
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
        env: { ...process.env, DB_CONNECTION: '', DATABASE_URL: '', ...opts.env },
        maxBuffer: 64 * 1024 * 1024,
      }
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-cli-new-'));
    try {
      const result = await runCli(['migrate', 'new', 'add_orders', '--dir', path.join(tmpDir, 'm')]);
      expect(result.code).toBe(0);
      const files = fs.readdirSync(path.join(tmpDir, 'm'));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{14}_add_orders\.sql$/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('mark-applied --all --dry-run prints the preview block and writes nothing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-cli-dry-'));
    const schema = `mig_cli_dry_${process.pid}`;
    const table = `${schema}.schema_migrations`;
    try {
      const mdir = path.join(tmpDir, 'm');
      fs.mkdirSync(mdir, { recursive: true });
      fs.writeFileSync(path.join(mdir, '20260405000001_noop.sql'), '-- migrate:up\nSELECT 1;\n');

      const dry = await runCli(
        ['migrate', 'mark-applied', '--all', '--dir', mdir, '--migrations-table', table, '--dry-run'],
        { env: { DB_CONNECTION: connectionString } }
      );
      expect(dry.code).toBe(0);
      expect(dry.stdout).toContain('[dry-run] would ensure table:');
      expect(dry.stdout).toContain('[dry-run] would record 1 version(s):');
      expect(dry.stdout).toContain('- 20260405000001');
      expect(dry.stdout).toContain('[dry-run] SQL:');
      expect(dry.stdout).toContain('INSERT INTO');
      expect(dry.stdout).toContain('[dry-run] no migration DDL is executed by mark-applied.');

      // write-free: the tracking table must not exist afterwards
      const client = new Client({ connectionString });
      await client.connect();
      try {
        const res = await client.query<{ reg: string | null }>('SELECT to_regclass($1) AS reg', [
          `"${schema}"."schema_migrations"`,
        ]);
        expect(res.rows[0].reg).toBeNull();
      } finally {
        await client.end();
      }
    } finally {
      const client = new Client({ connectionString });
      await client.connect();
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await client.end();
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('mark-applied --dry-run without --all or a version still errors (arg parity)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-cli-argparity-'));
    try {
      const mdir = path.join(tmpDir, 'm');
      fs.mkdirSync(mdir, { recursive: true });
      fs.writeFileSync(path.join(mdir, '20260407000001_noop.sql'), '-- migrate:up\nSELECT 1;\n');
      const result = await runCli(
        ['migrate', 'mark-applied', '--dry-run', '--dir', mdir, '--db-url', connectionString]
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('mark-applied requires a <version> argument or --all.');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('up --dry-run prints the file path and the write-free note', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-cli-updry-'));
    const schema = `mig_cli_updry_${process.pid}`;
    const table = `${schema}.schema_migrations`;
    try {
      const mdir = path.join(tmpDir, 'm');
      fs.mkdirSync(mdir, { recursive: true });
      fs.writeFileSync(path.join(mdir, '20260406000001_noop.sql'), '-- migrate:up\nSELECT 1;\n');

      const dry = await runCli(
        ['migrate', 'up', '--dir', mdir, '--migrations-table', table, '--dry-run'],
        { env: { DB_CONNECTION: connectionString } }
      );
      expect(dry.code).toBe(0);
      expect(dry.stdout).toContain('20260406000001_noop.sql');
      expect(dry.stdout).toContain('(table not created; nothing applied)');

      const client = new Client({ connectionString });
      await client.connect();
      try {
        const res = await client.query<{ reg: string | null }>('SELECT to_regclass($1) AS reg', [
          `"${schema}"."schema_migrations"`,
        ]);
        expect(res.rows[0].reg).toBeNull();
      } finally {
        await client.end();
      }
    } finally {
      const client = new Client({ connectionString });
      await client.connect();
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await client.end();
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('up --dry-run and status run end-to-end via DB_CONNECTION', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-cli-'));
    const schema = `mig_cli_${process.pid}`;
    const table = `${schema}.schema_migrations`;
    try {
      const mdir = path.join(tmpDir, 'm');
      fs.mkdirSync(mdir, { recursive: true });
      fs.writeFileSync(path.join(mdir, '20260401000001_noop.sql'), '-- migrate:up\nSELECT 1;\n');

      const dry = await runCli(
        ['migrate', 'up', '--dir', mdir, '--migrations-table', table, '--dry-run'],
        { env: { DB_CONNECTION: connectionString } }
      );
      expect(dry.code).toBe(0);
      expect(dry.stdout).toContain('20260401000001');

      const status = await runCli(['migrate', 'status', '--dir', mdir, '--migrations-table', table], {
        env: { DB_CONNECTION: connectionString },
      });
      expect(status.code).toBe(0);
      expect(status.stdout).toContain('[ ] 20260401000001');
    } finally {
      const client = new Client({ connectionString });
      await client.connect();
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await client.end();
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
