"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const gen_types_1 = require("./gen-types");
const printUsage = () => {
    console.log(`supalite gen types \\
  --db-url <postgres_url> \\
  [--schema public,analytics] \\
  [--out supalite.types.ts] \\
  [--format supabase|supalite] \\
  [--bigint-type bigint|number|string] \\
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
- format: supabase
- dateAsDate: false
- includeRelationships: true (supabase), false (supalite)
- includeConstraints: false
- includeIndexes: false
- includeCompositeTypes: true (supabase), false (supalite)
- includeFunctionSignatures: true (supabase), false (supalite)
- bigintType: number (supabase), bigint (supalite)
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
        includeConstraints: false,
        includeIndexes: false,
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
const run = async () => {
    const args = process.argv.slice(2);
    if (args.length < 2 || args[0] !== 'gen' || args[1] !== 'types') {
        printUsage();
        process.exit(1);
    }
    const parsed = parseArgs(args.slice(2));
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
run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
