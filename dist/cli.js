"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const gen_types_1 = require("./gen-types");
const db_pull_1 = require("./db-pull");
const migrate_1 = require("./migrate");
const printUsage = () => {
    console.log(`supalite gen types \\
  --db-url <postgres_url> \\
  [--schema public,analytics] \\
  [--out supalite.types.ts] \\
  [--format supabase|supalite] \\
  [--bigint-type bigint|number|string] \\
  [--no-bigint] \\
  [--json-bigint] \\
  [--no-json-bigint] \\
  [--date-as-date] \\
  [--include-relationships] \\
  [--include-constraints] \\
  [--include-indexes] \\
  [--include-composite-types] \\
  [--include-function-signatures] \\
  [--type-case preserve|snake|camel|pascal] \\
  [--function-case preserve|snake|camel|pascal] \\
  [--dump-functions-sql [path]]

Defaults:
- schema: public
- out: supalite.types.ts (use --out - to print to stdout)
- format: supalite
- dateAsDate: false
- includeRelationships: true
- includeConstraints: false (supabase), true (supalite)
- includeIndexes: false (supabase), true (supalite)
- includeCompositeTypes: true
- includeFunctionSignatures: true
- bigintType: number (supabase), bigint (supalite)
- noBigint: false
- jsonBigint: false (supabase), true (supalite)
- typeCase: preserve
- functionCase: preserve
- dumpFunctionsSql: false
`);
};
const parseCase = (value) => {
    if (!value) {
        return undefined;
    }
    if (value === 'preserve' || value === 'snake' || value === 'camel' || value === 'pascal') {
        return value;
    }
    return undefined;
};
const parseFormat = (value) => {
    if (!value) {
        return undefined;
    }
    if (value === 'supabase' || value === 'supalite') {
        return value;
    }
    return undefined;
};
const parseBigintType = (value) => {
    if (!value) {
        return undefined;
    }
    if (value === 'bigint' || value === 'number' || value === 'string') {
        return value;
    }
    return undefined;
};
const parseArgs = (args) => {
    const result = {
        schemas: [],
        out: 'supalite.types.ts',
        format: undefined,
        bigintType: undefined,
        jsonBigint: undefined,
        dateAsDate: false,
        includeRelationships: undefined,
        includeConstraints: undefined,
        includeIndexes: undefined,
        includeCompositeTypes: undefined,
        includeFunctionSignatures: undefined,
        dumpFunctionsSql: false,
        help: false,
    };
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            result.help = true;
            return result;
        }
        if (arg === '--db-url') {
            result.dbUrl = args[i + 1];
            i += 1;
            continue;
        }
        if (arg === '--schema' || arg === '--schemas') {
            const value = args[i + 1] ?? '';
            i += 1;
            value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
                .forEach((schema) => result.schemas.push(schema));
            continue;
        }
        if (arg === '--out') {
            result.out = args[i + 1] ?? result.out;
            i += 1;
            continue;
        }
        if (arg === '--format') {
            result.format = parseFormat(args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--bigint-type') {
            result.bigintType = parseBigintType(args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--no-bigint') {
            result.bigintType = 'number';
            continue;
        }
        if (arg === '--json-bigint') {
            result.jsonBigint = true;
            continue;
        }
        if (arg === '--no-json-bigint') {
            result.jsonBigint = false;
            continue;
        }
        if (arg === '--date-as-date') {
            result.dateAsDate = true;
            continue;
        }
        if (arg === '--include-relationships') {
            result.includeRelationships = true;
            continue;
        }
        if (arg === '--include-constraints') {
            result.includeConstraints = true;
            continue;
        }
        if (arg === '--include-indexes') {
            result.includeIndexes = true;
            continue;
        }
        if (arg === '--include-composite-types') {
            result.includeCompositeTypes = true;
            continue;
        }
        if (arg === '--include-function-signatures') {
            result.includeFunctionSignatures = true;
            continue;
        }
        if (arg === '--type-case') {
            result.typeCase = parseCase(args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--function-case') {
            result.functionCase = parseCase(args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--dump-functions-sql') {
            result.dumpFunctionsSql = true;
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                result.dumpFunctionsSqlOut = next;
                i += 1;
            }
            continue;
        }
    }
    return result;
};
const printDbPullUsage = () => {
    console.log(`supalite db pull \\
  --db-url <postgres_url> \\
  [--schema public] \\
  [--out supabase/migrations/<YYYYMMDDHHMMSS>_baseline.sql] \\
  [--mode baseline] \\
  [--format plain|dbmate] \\
  [--include-extension-objects] \\
  [--no-if-not-exists]

Defaults:
- schema: public (comma-separated or repeated --schema)
- out: supabase/migrations/<UTC timestamp>_baseline.sql (use --out - to print to stdout)
- mode: baseline (diff is planned)
- format: plain (dbmate wraps output in -- migrate:up / -- migrate:down markers, a drop-in for dbmate and supalite migrate)
- extension-owned objects are EXCLUDED (pg_depend deptype 'e'); pass --include-extension-objects to include them
- idempotent DDL is ON (IF NOT EXISTS / CREATE OR REPLACE / constraint guards); pass --no-if-not-exists for plain DDL
- replaying triggers requires PostgreSQL 14+ (CREATE OR REPLACE TRIGGER)
`);
};
const parseDbPullArgs = (args) => {
    const result = {
        schemas: [],
        mode: 'baseline',
        includeExtensionObjects: false,
        noIfNotExists: false,
        format: 'plain',
        help: false,
    };
    const requireValue = (flag, value) => {
        if (value === undefined || value.startsWith('--')) {
            console.error(`Missing value for ${flag}.`);
            printDbPullUsage();
            process.exit(1);
        }
        return value;
    };
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            result.help = true;
            return result;
        }
        if (arg === '--db-url') {
            result.dbUrl = requireValue(arg, args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--schema' || arg === '--schemas') {
            requireValue(arg, args[i + 1])
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
                .forEach((schema) => result.schemas.push(schema));
            i += 1;
            continue;
        }
        if (arg === '--out') {
            result.out = requireValue(arg, args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--mode') {
            result.mode = requireValue(arg, args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--include-extension-objects') {
            result.includeExtensionObjects = true;
            continue;
        }
        if (arg === '--no-if-not-exists') {
            result.noIfNotExists = true;
            continue;
        }
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
        // A typo like --schmea would otherwise silently pull the wrong baseline.
        console.error(`Unknown option for db pull: ${arg}`);
        printDbPullUsage();
        process.exit(1);
    }
    return result;
};
const utcTimestamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const runDbPull = async (rawArgs) => {
    const parsed = parseDbPullArgs(rawArgs);
    if (parsed.help) {
        printDbPullUsage();
        process.exit(0);
    }
    if (parsed.mode !== 'baseline') {
        console.error('Only --mode baseline is supported in this version (diff is planned).');
        process.exit(1);
    }
    const dbUrl = parsed.dbUrl || process.env.DB_CONNECTION;
    if (!dbUrl) {
        console.error('Missing --db-url (or DB_CONNECTION env var).');
        printDbPullUsage();
        process.exit(1);
    }
    const schemas = parsed.schemas.length > 0 ? parsed.schemas : ['public'];
    const sql = await (0, db_pull_1.generateBaselineSql)({
        dbUrl,
        schemas,
        includeExtensionObjects: parsed.includeExtensionObjects,
        ifNotExists: !parsed.noIfNotExists,
        format: parsed.format,
    });
    if (parsed.out === '-' || parsed.out === 'stdout') {
        process.stdout.write(sql);
        return;
    }
    const outPath = path_1.default.resolve(parsed.out !== undefined ? parsed.out : path_1.default.join('supabase', 'migrations', `${utcTimestamp()}_baseline.sql`));
    await fs_1.promises.mkdir(path_1.default.dirname(outPath), { recursive: true });
    await fs_1.promises.writeFile(outPath, sql, 'utf8');
    console.log(`Wrote baseline schema to ${outPath}`);
};
const runGenTypes = async (rawArgs) => {
    const parsed = parseArgs(rawArgs);
    if (parsed.help) {
        printUsage();
        process.exit(0);
    }
    const dbUrl = parsed.dbUrl || process.env.DB_CONNECTION;
    if (!dbUrl) {
        console.error('Missing --db-url (or DB_CONNECTION env var).');
        printUsage();
        process.exit(1);
    }
    const schemas = parsed.schemas.length > 0 ? parsed.schemas : ['public'];
    const output = await (0, gen_types_1.generateTypes)({
        dbUrl,
        schemas,
        format: parsed.format,
        bigintType: parsed.bigintType,
        jsonBigint: parsed.jsonBigint,
        dateAsDate: parsed.dateAsDate,
        includeRelationships: parsed.includeRelationships,
        includeConstraints: parsed.includeConstraints,
        includeIndexes: parsed.includeIndexes,
        includeCompositeTypes: parsed.includeCompositeTypes,
        includeFunctionSignatures: parsed.includeFunctionSignatures,
        typeCase: parsed.typeCase,
        functionCase: parsed.functionCase,
    });
    if (parsed.out === '-' || parsed.out === 'stdout') {
        process.stdout.write(output);
    }
    else {
        const outPath = path_1.default.resolve(parsed.out);
        await fs_1.promises.writeFile(outPath, output, 'utf8');
        console.log(`Wrote types to ${outPath}`);
    }
    if (parsed.dumpFunctionsSql) {
        const functionsSql = await (0, gen_types_1.dumpFunctionsSql)({ dbUrl, schemas });
        const outPath = parsed.dumpFunctionsSqlOut ??
            (parsed.out === '-' || parsed.out === 'stdout'
                ? path_1.default.resolve('supalite.functions.sql')
                : path_1.default.join(path_1.default.resolve(path_1.default.parse(parsed.out).dir || '.'), `${path_1.default.parse(parsed.out).name}.functions.sql`));
        await fs_1.promises.writeFile(outPath, functionsSql, 'utf8');
        console.log(`Wrote function definitions to ${outPath}`);
    }
};
const printMigrateUsage = () => {
    console.log(`supalite migrate <up|status|new|mark-applied|down> [options]

Commands:
  up                 Apply pending migrations in timestamp order
  status             Show applied/pending migrations
  new <name>         Create a new migration file from a template
  mark-applied       Record migrations as applied WITHOUT running them
  down               (not supported in v1 — forward-only)

Options:
  --db-url <conn>            Postgres URL (env: DB_CONNECTION, DATABASE_URL)
  --dir <path>              Migrations directory (default: supabase/migrations)
  --migrations-table <ref>  Tracking table (default: public.schema_migrations)
  --dry-run                 (up) Print pending migrations without applying
  --all                     (mark-applied) Mark every migration file as applied

Examples:
  supalite migrate up --db-url "$DB_CONNECTION"
  supalite migrate status
  supalite migrate new add_orders_table
  supalite migrate mark-applied --all
`);
};
const parseMigrateArgs = (args) => {
    const result = { dryRun: false, all: false, help: false };
    const requireValue = (flag, value) => {
        if (value === undefined || value.startsWith('--')) {
            console.error(`Missing value for ${flag}.`);
            printMigrateUsage();
            process.exit(1);
        }
        return value;
    };
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            result.help = true;
            return result;
        }
        if (arg === '--db-url') {
            result.dbUrl = requireValue(arg, args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--dir') {
            result.dir = requireValue(arg, args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--migrations-table') {
            result.migrationsTable = requireValue(arg, args[i + 1]);
            i += 1;
            continue;
        }
        if (arg === '--dry-run') {
            result.dryRun = true;
            continue;
        }
        if (arg === '--all') {
            result.all = true;
            continue;
        }
        if (arg.startsWith('--')) {
            console.error(`Unknown option for migrate: ${arg}`);
            printMigrateUsage();
            process.exit(1);
        }
        if (result.sub === undefined) {
            result.sub = arg;
            continue;
        }
        if (result.positional === undefined) {
            result.positional = arg;
            continue;
        }
        console.error(`Unexpected argument: ${arg}`);
        printMigrateUsage();
        process.exit(1);
    }
    return result;
};
const resolveMigrateDbUrl = (explicit) => explicit || process.env.DB_CONNECTION || process.env.DATABASE_URL || undefined;
const runMigrate = async (rawArgs) => {
    const parsed = parseMigrateArgs(rawArgs);
    if (parsed.help || !parsed.sub) {
        printMigrateUsage();
        process.exit(parsed.help ? 0 : 1);
    }
    if (parsed.sub === 'new') {
        if (!parsed.positional) {
            console.error('migrate new requires a <name> argument.');
            printMigrateUsage();
            process.exit(1);
        }
        const created = await (0, migrate_1.migrateNew)({ name: parsed.positional, dir: parsed.dir });
        console.log(`Created ${created.path}`);
        return;
    }
    if (parsed.sub === 'down') {
        console.error('migrate down is not supported in this version (forward-only). See issue #7.');
        process.exit(1);
    }
    const dbUrl = resolveMigrateDbUrl(parsed.dbUrl);
    if (!dbUrl) {
        console.error('Missing --db-url (or DB_CONNECTION / DATABASE_URL env var).');
        printMigrateUsage();
        process.exit(1);
    }
    const common = { dbUrl, dir: parsed.dir, migrationsTable: parsed.migrationsTable };
    if (parsed.sub === 'status') {
        const entries = await (0, migrate_1.migrateStatus)(common);
        if (entries.length === 0) {
            console.log('No migration files found.');
            return;
        }
        entries.forEach((e) => console.log(`${e.applied ? '[x]' : '[ ]'} ${e.version} ${e.name}`));
        const pending = entries.filter((e) => !e.applied).length;
        console.log(`\n${entries.length} migration(s), ${pending} pending.`);
        return;
    }
    if (parsed.sub === 'up') {
        const result = await (0, migrate_1.migrateUp)({ ...common, dryRun: parsed.dryRun });
        if (parsed.dryRun) {
            if (result.pending.length === 0) {
                console.log('No pending migrations.');
            }
            else {
                console.log('Pending migrations (dry run):');
                result.pending.forEach((v) => console.log(`  ${v}`));
            }
            return;
        }
        if (result.applied.length === 0) {
            console.log('No pending migrations. Database is up to date.');
        }
        else {
            console.log(`Applied ${result.applied.length} migration(s):`);
            result.applied.forEach((v) => console.log(`  ${v}`));
        }
        return;
    }
    if (parsed.sub === 'mark-applied') {
        const result = await (0, migrate_1.migrateMarkApplied)({
            ...common,
            all: parsed.all,
            version: parsed.positional,
        });
        console.log(`Marked ${result.marked.length} migration(s) as applied.`);
        if (result.alreadyApplied.length > 0) {
            console.log(`(${result.alreadyApplied.length} already recorded.)`);
        }
        return;
    }
    console.error(`Unknown migrate command: ${parsed.sub}`);
    printMigrateUsage();
    process.exit(1);
};
const run = async () => {
    const args = process.argv.slice(2);
    if (args[0] === 'gen' && args[1] === 'types') {
        await runGenTypes(args.slice(2));
        return;
    }
    if (args[0] === 'db' && args[1] === 'pull') {
        await runDbPull(args.slice(2));
        return;
    }
    if (args[0] === 'migrate') {
        await runMigrate(args.slice(1));
        return;
    }
    printUsage();
    printDbPullUsage();
    printMigrateUsage();
    process.exit(1);
};
run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
