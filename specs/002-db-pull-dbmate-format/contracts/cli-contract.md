# CLI Contract: `db pull --format` (002)

## Flag

```
supalite db pull --db-url <conn> [--format plain|dbmate] [...existing flags]
```

- `--format plain` (default): current behavior, unchanged output.
- `--format dbmate`: wraps the baseline in `-- migrate:up` / `-- migrate:down`.
- Invalid value: `Unknown format for db pull: <value>` on stderr + usage, exit 1.

## Output shape — `--format dbmate`

```
-- migrate:up
-- supalite db pull baseline (schema public) ...   <- existing baseline body, unchanged
...
<last body line>

-- migrate:down
-- baseline: irreversible (no-op)
```

- First line is exactly `-- migrate:up`.
- Exactly one blank line before `-- migrate:down`.
- Down body is exactly `-- baseline: irreversible (no-op)`.
- LF-only, single trailing newline.

## Output shape — `--format plain` (default)

Byte-for-byte identical to v0.10.0 `db pull` (starts with
`-- supalite db pull baseline`, no markers).

## Interaction with other flags

`--format` is orthogonal: it wraps whatever body `--schema`,
`--no-if-not-exists`, `--include-extension-objects`, and `--out` produce.

## Programmatic equivalent

```ts
import { generateBaselineSql } from 'supalite';
const sql = await generateBaselineSql({ dbUrl, schemas: ['public'], format: 'dbmate' });
```
