import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { Client } from 'pg';
import { config } from 'dotenv';
import {
  parseMigrationSql,
  parseMigrationFilename,
  listMigrationFiles,
  migrateStatus,
  migrateUp,
  migrateMarkApplied,
  migrateNew,
  migrationTimestamp,
} from '../migrate';
import { generateBaselineSql } from '../db-pull';

config();

const connectionString =
  process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';

jest.setTimeout(60000);

let envCounter = 0;
type TestEnv = { schema: string; dir: string; table: string };

const makeEnv = async (): Promise<TestEnv> => {
  envCounter += 1;
  const schema = `mig_test_${process.pid}_${envCounter}`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'supalite-migrate-'));
  return { schema, dir, table: `${schema}.schema_migrations` };
};

const dropSchema = async (schema: string): Promise<void> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
};

const cleanupEnv = async (env: TestEnv): Promise<void> => {
  await dropSchema(env.schema);
  await fs.rm(env.dir, { recursive: true, force: true });
};

const writeMigration = (dir: string, filename: string, body: string): Promise<void> =>
  fs.writeFile(path.join(dir, filename), body, 'utf8');

const tableExists = async (schema: string, table: string): Promise<boolean> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query<{ exists: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS exists`, [
      `"${schema}"."${table}"`,
    ]);
    return res.rows[0].exists === true;
  } finally {
    await client.end();
  }
};

describe('parseMigrationSql', () => {
  test('splits up and down sections', () => {
    const parsed = parseMigrationSql(
      '-- migrate:up\nCREATE TABLE t(id int);\n-- migrate:down\nDROP TABLE t;\n'
    );
    expect(parsed.up.sql).toBe('CREATE TABLE t(id int);');
    expect(parsed.up.disableTransaction).toBe(false);
    expect(parsed.down?.sql).toBe('DROP TABLE t;');
  });

  test('detects transaction:false on the up marker', () => {
    const parsed = parseMigrationSql(
      '-- migrate:up transaction:false\nCREATE INDEX CONCURRENTLY i ON t(id);\n'
    );
    expect(parsed.up.disableTransaction).toBe(true);
    expect(parsed.down).toBeNull();
  });

  test('throws when the up section is missing', () => {
    expect(() => parseMigrationSql('CREATE TABLE t(id int);')).toThrow("Missing '-- migrate:up'");
  });
});

describe('parseMigrationFilename', () => {
  test('extracts version and name', () => {
    expect(parseMigrationFilename('20260712093000_add_users.sql')).toEqual({
      version: '20260712093000',
      name: 'add_users',
    });
  });
  test('throws on a filename without a numeric prefix', () => {
    expect(() => parseMigrationFilename('add_users.sql')).toThrow('Invalid migration filename');
  });
});

describe('migrationTimestamp', () => {
  test('formats a date as YYYYMMDDHHMMSS', () => {
    expect(migrationTimestamp(new Date('2026-07-12T09:30:00.000Z'))).toBe('20260712093000');
  });
});

describe('migrateNew', () => {
  test('creates a timestamped file with up/down markers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'supalite-new-'));
    try {
      const result = await migrateNew({ name: 'add orders', dir, timestamp: '20260712093000' });
      expect(result.filename).toBe('20260712093000_add_orders.sql');
      const content = await fs.readFile(result.path, 'utf8');
      expect(content).toContain('-- migrate:up');
      expect(content).toContain('-- migrate:down');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('listMigrationFiles', () => {
  test('returns .sql files sorted by version ascending', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'supalite-list-'));
    try {
      await writeMigration(dir, '20260101000000_b.sql', '-- migrate:up\n');
      await writeMigration(dir, '20250101000000_a.sql', '-- migrate:up\n');
      await writeMigration(dir, 'notes.txt', 'ignored');
      const files = await listMigrationFiles(dir);
      expect(files.map((f) => f.version)).toEqual(['20250101000000', '20260101000000']);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('throws a clear error when the directory is missing', async () => {
    await expect(
      listMigrationFiles(path.join(os.tmpdir(), 'supalite-does-not-exist-xyz'))
    ).rejects.toThrow('Migrations directory not found');
  });
});

describe('migrateStatus (integration)', () => {
  test('reports each migration as applied or pending', async () => {
    const env = await makeEnv();
    try {
      await writeMigration(
        env.dir,
        '20260101000001_create.sql',
        `-- migrate:up\nCREATE TABLE "${env.schema}".widgets (id int primary key);\n`
      );
      const before = await migrateStatus({
        dbUrl: connectionString,
        dir: env.dir,
        migrationsTable: env.table,
      });
      expect(before).toEqual([
        { version: '20260101000001', name: 'create', filename: '20260101000001_create.sql', applied: false },
      ]);
    } finally {
      await cleanupEnv(env);
    }
  });
});

describe('migrateUp (integration)', () => {
  test('applies pending migrations, records versions, and is idempotent', async () => {
    const env = await makeEnv();
    try {
      await writeMigration(
        env.dir,
        '20260101000001_create.sql',
        `-- migrate:up\nCREATE TABLE "${env.schema}".widgets (id int primary key);\n` +
          `-- migrate:down\nDROP TABLE "${env.schema}".widgets;\n`
      );
      const result = await migrateUp({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
      expect(result.applied).toEqual(['20260101000001']);
      expect(await tableExists(env.schema, 'widgets')).toBe(true);

      const again = await migrateUp({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
      expect(again.applied).toEqual([]);
    } finally {
      await cleanupEnv(env);
    }
  });

  test('dry-run reports pending without applying', async () => {
    const env = await makeEnv();
    try {
      await writeMigration(
        env.dir,
        '20260101000002_create.sql',
        `-- migrate:up\nCREATE TABLE "${env.schema}".gadgets (id int);\n`
      );
      const result = await migrateUp({
        dbUrl: connectionString,
        dir: env.dir,
        migrationsTable: env.table,
        dryRun: true,
      });
      expect(result.pending).toEqual(['20260101000002']);
      expect(await tableExists(env.schema, 'gadgets')).toBe(false);
    } finally {
      await cleanupEnv(env);
    }
  });

  test('a failing migration rolls back, is not recorded, and stops the run', async () => {
    const env = await makeEnv();
    try {
      await writeMigration(env.dir, '20260101000003_ok.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".t1 (id int);\n`);
      await writeMigration(
        env.dir,
        '20260101000004_bad.sql',
        `-- migrate:up\nCREATE TABLE "${env.schema}".t2 (id int);\nSELECT 1/0;\n`
      );
      await writeMigration(env.dir, '20260101000005_never.sql', `-- migrate:up\nCREATE TABLE "${env.schema}".t3 (id int);\n`);

      await expect(
        migrateUp({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table })
      ).rejects.toThrow('20260101000004_bad.sql');

      expect(await tableExists(env.schema, 't1')).toBe(true);
      expect(await tableExists(env.schema, 't2')).toBe(false);
      expect(await tableExists(env.schema, 't3')).toBe(false);

      const status = await migrateStatus({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
      expect(status.find((s) => s.version === '20260101000003')?.applied).toBe(true);
      expect(status.find((s) => s.version === '20260101000004')?.applied).toBe(false);
      expect(status.find((s) => s.version === '20260101000005')?.applied).toBe(false);
    } finally {
      await cleanupEnv(env);
    }
  });
});

describe('migrateUp transaction:false (integration)', () => {
  test('runs CREATE INDEX CONCURRENTLY outside a transaction and records it', async () => {
    const env = await makeEnv();
    try {
      await writeMigration(
        env.dir,
        '20260201000001_table.sql',
        `-- migrate:up\nCREATE TABLE "${env.schema}".items (id int);\n`
      );
      await writeMigration(
        env.dir,
        '20260201000002_index.sql',
        `-- migrate:up transaction:false\n` +
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS items_id_idx ON "${env.schema}".items (id);\n`
      );

      const result = await migrateUp({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
      expect(result.applied).toEqual(['20260201000001', '20260201000002']);

      const client = new Client({ connectionString });
      await client.connect();
      try {
        const res = await client.query(
          `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'items_id_idx'`,
          [env.schema]
        );
        expect(res.rowCount).toBe(1);
      } finally {
        await client.end();
      }
    } finally {
      await cleanupEnv(env);
    }
  });
});

describe('migrateMarkApplied (integration)', () => {
  test('--all records versions without executing SQL', async () => {
    const env = await makeEnv();
    try {
      await writeMigration(
        env.dir,
        '20260301000001_create.sql',
        `-- migrate:up\nCREATE TABLE "${env.schema}".should_not_exist (id int);\n`
      );
      const result = await migrateMarkApplied({
        dbUrl: connectionString,
        dir: env.dir,
        migrationsTable: env.table,
        all: true,
      });
      expect(result.marked).toEqual(['20260301000001']);
      expect(await tableExists(env.schema, 'should_not_exist')).toBe(false);

      const up = await migrateUp({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
      expect(up.applied).toEqual([]);
      expect(await tableExists(env.schema, 'should_not_exist')).toBe(false);
    } finally {
      await cleanupEnv(env);
    }
  });

  test('mark-applied <version> records a single migration', async () => {
    const env = await makeEnv();
    try {
      await writeMigration(env.dir, '20260301000002_a.sql', `-- migrate:up\nSELECT 1;\n`);
      await writeMigration(env.dir, '20260301000003_b.sql', `-- migrate:up\nSELECT 1;\n`);
      const result = await migrateMarkApplied({
        dbUrl: connectionString,
        dir: env.dir,
        migrationsTable: env.table,
        version: '20260301000002',
      });
      expect(result.marked).toEqual(['20260301000002']);
      const status = await migrateStatus({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
      expect(status.find((s) => s.version === '20260301000002')?.applied).toBe(true);
      expect(status.find((s) => s.version === '20260301000003')?.applied).toBe(false);
    } finally {
      await cleanupEnv(env);
    }
  });

  test('throws when neither --all nor a version is given', async () => {
    const env = await makeEnv();
    try {
      await writeMigration(env.dir, '20260301000004_a.sql', `-- migrate:up\nSELECT 1;\n`);
      await expect(
        migrateMarkApplied({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table })
      ).rejects.toThrow('requires a <version> argument or --all');
    } finally {
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
      const seed = new Client({ connectionString });
      await seed.connect();
      try {
        await seed.query(`CREATE SCHEMA "${srcSchema}"`);
        await seed.query(`CREATE TABLE "${srcSchema}".orders (id bigint primary key, note text)`);
      } finally {
        await seed.end();
      }
      const baseline = await generateBaselineSql({
        dbUrl: connectionString,
        schemas: [srcSchema],
        format: 'dbmate',
      });
      expect(baseline.startsWith('-- migrate:up\n')).toBe(true);
      // parser accepts it as a single up section
      const parsed = parseMigrationSql(baseline);
      expect(parsed.up.sql.length).toBeGreaterThan(0);

      // drop the source objects so migrateUp actually recreates them
      await dropSchema(srcSchema);
      await writeMigration(env.dir, '20260701000001_baseline.sql', baseline);

      const result = await migrateUp({ dbUrl: connectionString, dir: env.dir, migrationsTable: env.table });
      expect(result.applied).toEqual(['20260701000001']);
      expect(await tableExists(srcSchema, 'orders')).toBe(true);
    } finally {
      await dropSchema(srcSchema);
      await cleanupEnv(env);
    }
  });
});

describe('public API surface', () => {
  test('migrate functions are re-exported from the package root', async () => {
    const pkg = await import('../index');
    expect(typeof pkg.migrateUp).toBe('function');
    expect(typeof pkg.migrateStatus).toBe('function');
    expect(typeof pkg.migrateMarkApplied).toBe('function');
    expect(typeof pkg.migrateNew).toBe('function');
  });
});
