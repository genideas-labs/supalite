# Tasks: `db pull --format dbmate` (002)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [contracts/cli-contract.md](contracts/cli-contract.md), [clarify.md](clarify.md)
**Approach**: live-Postgres TDD (repo convention — tests hit `DB_CONNECTION`) + a pure unit test for the wrap. Commit after every task. Keep coverage ≥90%.

Legend: `- [ ]` pending · `- [x]` done.

---

## T001 — `formatBaseline` helper + `format` option in `generateBaselineSql`

**Files**: `src/db-pull.ts`, `src/__tests__/db-pull.test.ts`

- [ ] **T001.1** Write failing unit tests in `src/__tests__/db-pull.test.ts`:

```ts
import { formatBaseline } from '../db-pull';

describe('formatBaseline', () => {
  test('plain returns the baseline unchanged', () => {
    const body = '-- supalite db pull baseline\nCREATE TABLE t(id int);\n';
    expect(formatBaseline(body, 'plain')).toBe(body);
    expect(formatBaseline(body)).toBe(body); // default is plain
  });

  test('dbmate wraps with up/down markers, body unchanged, single trailing newline', () => {
    const body = '-- supalite db pull baseline\nCREATE TABLE t(id int);\n';
    const out = formatBaseline(body, 'dbmate');
    expect(out).toBe(
      '-- migrate:up\n' +
        '-- supalite db pull baseline\nCREATE TABLE t(id int);\n' +
        '\n-- migrate:down\n-- baseline: irreversible (no-op)\n'
    );
    expect(out.startsWith('-- migrate:up\n')).toBe(true);
    expect(out.endsWith('-- baseline: irreversible (no-op)\n')).toBe(true);
    expect(out.split('\n').filter((l) => l === '-- migrate:up')).toHaveLength(1);
    // body between markers equals the input
    const between = out.slice('-- migrate:up\n'.length, out.indexOf('\n-- migrate:down'));
    expect(between).toBe(body);
  });
});
```

- [ ] **T001.2** Run: `npx jest src/__tests__/db-pull.test.ts -t formatBaseline` → FAIL (`formatBaseline` not exported).

- [ ] **T001.3** Implement in `src/db-pull.ts`:
  - Add `format?: 'plain' | 'dbmate';` to `DbPullOptions`.
  - Add the helper:
    ```ts
    export const formatBaseline = (baseline: string, format: 'plain' | 'dbmate' = 'plain'): string =>
      format === 'dbmate'
        ? `-- migrate:up\n${baseline}\n-- migrate:down\n-- baseline: irreversible (no-op)\n`
        : baseline;
    ```
  - In `generateBaselineSql`, capture `const format = options.format ?? 'plain';` and wrap BOTH return sites: `return formatBaseline(normalizeLf(...), format);` (the zero-object early return and the normal return).

- [ ] **T001.4** Run: `npx jest src/__tests__/db-pull.test.ts -t formatBaseline` → PASS.

- [ ] **T001.5** Add an integration test (body equality, SC-003) to `src/__tests__/db-pull.test.ts` using the existing connection helper in that file:

```ts
describe('generateBaselineSql --format dbmate', () => {
  test('dbmate output wraps the plain body exactly', async () => {
    const plain = await generateBaselineSql({ dbUrl: connectionString, schemas: ['public'], format: 'plain' });
    const dbmate = await generateBaselineSql({ dbUrl: connectionString, schemas: ['public'], format: 'dbmate' });
    expect(dbmate.startsWith('-- migrate:up\n')).toBe(true);
    expect(dbmate).toContain('\n-- migrate:down\n-- baseline: irreversible (no-op)\n');
    const between = dbmate.slice('-- migrate:up\n'.length, dbmate.indexOf('\n-- migrate:down'));
    expect(between).toBe(plain);
  });
});
```
(Use the same `connectionString` / import style already present in `db-pull.test.ts`; if `generateBaselineSql` is not yet imported there, add it to the import.)

- [ ] **T001.6** Run: `npx jest src/__tests__/db-pull.test.ts` → PASS (existing + new).

- [ ] **T001.7** Commit:
```bash
git add src/db-pull.ts src/__tests__/db-pull.test.ts
git commit -m "feat(db-pull): --format dbmate wrap (formatBaseline helper + option)"
```

---

## T002 — CLI `--format` flag (parse, validate, usage)

**Files**: `src/cli.ts`, `src/__tests__/db-pull-cli.test.ts`

- [ ] **T002.1** Write failing CLI tests in `src/__tests__/db-pull-cli.test.ts` (reuse the file's `runCli`/`connectionString`):

```ts
test('--format dbmate wraps stdout in up/down markers', async () => {
  const result = await runCli(['db', 'pull', '--db-url', connectionString, '--format', 'dbmate', '--out', '-']);
  expect(result.code).toBe(0);
  expect(result.stdout.startsWith('-- migrate:up\n')).toBe(true);
  expect(result.stdout).toContain('\n-- migrate:down\n-- baseline: irreversible (no-op)\n');
});

test('--format plain (and default) keep the current unmarked output', async () => {
  const explicit = await runCli(['db', 'pull', '--db-url', connectionString, '--format', 'plain', '--out', '-']);
  expect(explicit.stdout.startsWith('-- supalite db pull baseline')).toBe(true);
  const def = await runCli(['db', 'pull', '--db-url', connectionString, '--out', '-']);
  expect(def.stdout.startsWith('-- supalite db pull baseline')).toBe(true);
});

test('invalid --format exits 1 with the exact message', async () => {
  const result = await runCli(['db', 'pull', '--db-url', connectionString, '--format', 'xml', '--out', '-']);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('Unknown format for db pull: xml');
});

test('--help documents --format', async () => {
  const help = await runCli(['db', 'pull', '--help']);
  expect(help.stdout).toContain('--format');
});
```

- [ ] **T002.2** Run: `npx jest src/__tests__/db-pull-cli.test.ts -t "format"` → FAIL (`--format` treated as unknown option → exit 1 with wrong message; markers absent).

- [ ] **T002.3** Implement in `src/cli.ts`:
  - Add `format: 'plain' | 'dbmate';` to the `parseDbPullArgs` result type, default `'plain'`.
  - Add the parse branch (before the unknown-option fallthrough):
    ```ts
    if (arg === '--format') {
      const value = requireValue(arg, args[i + 1]);
      if (value !== 'plain' && value !== 'dbmate') {
        console.error(`Unknown format for db pull: ${value}`);
        printDbPullUsage();
        process.exit(1);
      }
      result.format = value;
      i += 1;
      continue;
    }
    ```
  - In `runDbPull`, pass `format: parsed.format` into the `generateBaselineSql({...})` call.
  - In `printDbPullUsage`, add `[--format plain|dbmate]` to the synopsis and a Defaults line: `- format: plain (dbmate wraps output in -- migrate:up / -- migrate:down markers for dbmate & supalite migrate)`.

- [ ] **T002.4** Run: `npx jest src/__tests__/db-pull-cli.test.ts` → PASS (existing + new).

- [ ] **T002.5** Commit:
```bash
git add src/cli.ts src/__tests__/db-pull-cli.test.ts
git commit -m "feat(db-pull): CLI --format plain|dbmate flag + usage"
```

---

## T003 — Docs (README, README.ko, changelog)

**Files**: `README.md`, `README.ko.md`, `docs/changelog/2026-07-12-db-pull-dbmate-format.md`

- [ ] **T003.1** In `README.md`, under the `supalite db pull` section, document `--format`:
  - Add `[--format plain|dbmate]` to the usage synopsis.
  - Add a bullet: `--format dbmate` wraps the baseline in `-- migrate:up` / `-- migrate:down` so it is a drop-in for dbmate **and** `supalite migrate` (#7). Default `plain` is unchanged.
  - Add the transaction note: db pull emits only transaction-safe DDL, so the default transactional `-- migrate:up` is correct; if it ever emits non-transactional DDL, that file must switch to `-- migrate:up transaction:false`.

- [ ] **T003.2** Mirror the same into `README.ko.md` (translate prose; keep code identical).

- [ ] **T003.3** Create `docs/changelog/2026-07-12-db-pull-dbmate-format.md` describing the new `--format dbmate` option and its convergence with #7.

- [ ] **T003.4** Commit:
```bash
git add README.md README.ko.md docs/changelog/2026-07-12-db-pull-dbmate-format.md
git commit -m "docs(db-pull): document --format dbmate"
```

---

## T004 — Full regression gate

**Files**: (verification only) + `specs/002-db-pull-dbmate-format/spec.md` status bump

- [ ] **T004.1** `npm test` → all suites PASS (existing db pull tests unchanged = backward-compat proof, SC-001).
- [ ] **T004.2** `npm run lint` → 0 errors.
- [ ] **T004.3** `npm run build` → tsc clean.
- [ ] **T004.4** `npm test -- --coverage` → statements ≥90%.
- [ ] **T004.5** Bump `spec.md` **Status** to `Ready for implementation → Implemented`; commit:
```bash
git add specs/002-db-pull-dbmate-format/spec.md
git commit -m "docs(002): regression gate green — mark implemented"
```
