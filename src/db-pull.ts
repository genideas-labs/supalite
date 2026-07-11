import { Client } from 'pg';

export type DbPullOptions = {
  dbUrl: string;
  schemas?: string[];
  includeExtensionObjects?: boolean;
  ifNotExists?: boolean;
};

type DeferredDomainConstraint = {
  qualifiedRaw: string;
  nameQuoted: string;
  nameRaw: string;
  definition: string;
};

type PullState = {
  deferredColumnDefaults: string[];
  deferredDomainDefaults: string[];
  deferredDomainConstraints: DeferredDomainConstraint[];
  generatedColumnFunctionDeps: Array<{ qualifiedRaw: string; column: string; functionOids: string[] }>;
  footerDiverted: string[];
};

type Ctx = {
  client: Client;
  schemas: string[];
  filterExtensions: boolean;
  ifNotExists: boolean;
  state: PullState;
};

const escapeLiteral = (value: string): string => value.replace(/'/g, "''");

const normalizeLf = (text: string): string => text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const dollarTag = (content: string): string => {
  let tag = '$supalite$';
  for (let i = 1; content.includes(tag); i += 1) {
    tag = `$supalite${i}$`;
  }
  return tag;
};

const extensionFilter = (ctx: Ctx, classCatalog: string, oidExpr: string): string =>
  ctx.filterExtensions
    ? `AND NOT EXISTS (
         SELECT 1 FROM pg_depend ext_dep
         WHERE ext_dep.classid = '${classCatalog}'::regclass
           AND ext_dep.objid = ${oidExpr}
           AND ext_dep.deptype = 'e'
       )`
    : '';

// Kahn topological sort; edges are [prerequisite, dependent] pairs keyed by
// key(). Items involved in a cycle are appended in input order (never lost).
const topoSort = <T>(items: T[], key: (item: T) => string, edges: Array<[string, string]>): T[] => {
  const byKey = new Map(items.map((item) => [key(item), item]));
  const indegree = new Map<string, number>(items.map((item) => [key(item), 0]));
  const dependents = new Map<string, string[]>();
  edges.forEach(([from, to]) => {
    if (!byKey.has(from) || !byKey.has(to) || from === to) {
      return;
    }
    indegree.set(to, (indegree.get(to) as number) + 1);
    dependents.set(from, [...(dependents.get(from) ?? []), to]);
  });
  const queue = items.map(key).filter((k) => indegree.get(k) === 0);
  const ordered: T[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const k = queue.shift() as string;
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    ordered.push(byKey.get(k) as T);
    (dependents.get(k) ?? []).forEach((dep) => {
      indegree.set(dep, (indegree.get(dep) as number) - 1);
      if (indegree.get(dep) === 0) {
        queue.push(dep);
      }
    });
  }
  items.forEach((item) => {
    if (!seen.has(key(item))) {
      ordered.push(item);
    }
  });
  return ordered;
};

const countObjects = async (ctx: Ctx): Promise<number> => {
  const { rows } = await ctx.client.query<{ total: string }>(
    `SELECT (
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ANY($1))
       + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = ANY($1))
       + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = ANY($1) AND t.typtype IN ('e', 'd'))
     )::text AS total`,
    [ctx.schemas]
  );
  return Number(rows[0].total);
};

const renderSchemas = async (ctx: Ctx): Promise<string[]> => {
  const { rows } = await ctx.client.query<{ name: string }>(
    `SELECT quote_ident(n.nspname) AS name
     FROM pg_namespace n
     WHERE n.nspname = ANY($1) AND n.nspname <> 'public'
     UNION
     SELECT quote_ident(en.nspname) AS name
     FROM pg_extension e
     JOIN pg_namespace en ON en.oid = e.extnamespace
     WHERE e.extname <> 'plpgsql' AND en.nspname NOT IN ('public', 'pg_catalog')
     ORDER BY name`,
    [ctx.schemas]
  );
  if (rows.length === 0) {
    return [];
  }
  return ['-- schemas', ...rows.map((row) => `CREATE SCHEMA IF NOT EXISTS ${row.name};`)];
};

const renderExtensions = async (ctx: Ctx): Promise<string[]> => {
  const { rows } = await ctx.client.query<{ oid: string; name: string; schema: string }>(
    `SELECT e.oid::text AS oid, quote_ident(e.extname) AS name, quote_ident(n.nspname) AS schema
     FROM pg_extension e
     JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname <> 'plpgsql'
     ORDER BY e.oid`
  );
  if (rows.length === 0) {
    return [];
  }
  const { rows: deps } = await ctx.client.query<{ dependent: string; prerequisite: string }>(
    `SELECT d.objid::text AS dependent, d.refobjid::text AS prerequisite
     FROM pg_depend d
     WHERE d.classid = 'pg_extension'::regclass
       AND d.refclassid = 'pg_extension'::regclass`
  );
  const ordered = topoSort(
    rows,
    (row) => row.oid,
    deps.map((dep): [string, string] => [dep.prerequisite, dep.dependent])
  );
  return [
    '-- extensions',
    ...ordered.map((row) => `CREATE EXTENSION IF NOT EXISTS ${row.name} WITH SCHEMA ${row.schema};`),
  ];
};

const renderSequences = async (ctx: Ctx): Promise<string[]> => {
  const { rows } = await ctx.client.query<{
    schema: string;
    name: string;
    data_type: string;
    start: string;
    increment: string;
    min: string;
    max: string;
    cache: string;
    cycle: boolean;
  }>(
    `SELECT quote_ident(n.nspname) AS schema,
            quote_ident(c.relname) AS name,
            format_type(s.seqtypid, NULL) AS data_type,
            s.seqstart::text AS start,
            s.seqincrement::text AS increment,
            s.seqmin::text AS min,
            s.seqmax::text AS max,
            s.seqcache::text AS cache,
            s.seqcycle AS cycle
     FROM pg_sequence s
     JOIN pg_class c ON c.oid = s.seqrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1)
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend idep
         WHERE idep.classid = 'pg_class'::regclass
           AND idep.objid = c.oid
           AND idep.deptype = 'i'
       )
       ${extensionFilter(ctx, 'pg_class', 'c.oid')}
     ORDER BY n.nspname, c.relname`,
    [ctx.schemas]
  );
  if (rows.length === 0) {
    return [];
  }
  const create = ctx.ifNotExists ? 'CREATE SEQUENCE IF NOT EXISTS' : 'CREATE SEQUENCE';
  return [
    '-- sequences',
    ...rows.map(
      (row) =>
        `${create} ${row.schema}.${row.name} AS ${row.data_type} START WITH ${row.start} ` +
        `INCREMENT BY ${row.increment} MINVALUE ${row.min} MAXVALUE ${row.max} CACHE ${row.cache}${row.cycle ? ' CYCLE' : ''};`
    ),
  ];
};

// Follows typelem chains (arrays -> element type) and reports the relkind of
// the relation backing a row type ('' when the type is not a row type).
const createTypeResolver = async (
  ctx: Ctx,
  seedOids: string[]
): Promise<{ resolveRef: (oid: string) => string; relkindOf: (oid: string) => string }> => {
  const resolveMap = new Map<string, { elem: string; relkind: string }>();
  let pending = seedOids.filter((oid) => oid !== '0');
  while (pending.length > 0) {
    const { rows } = await ctx.client.query<{ oid: string; elem: string; relkind: string }>(
      `SELECT t.oid::text AS oid, t.typelem::text AS elem, COALESCE(c.relkind::text, '') AS relkind
       FROM pg_type t
       LEFT JOIN pg_class c ON c.oid = t.typrelid
       WHERE t.oid = ANY($1::oid[])`,
      [pending]
    );
    rows.forEach((row) => resolveMap.set(row.oid, { elem: row.elem, relkind: row.relkind }));
    pending = rows.filter((row) => row.elem !== '0' && !resolveMap.has(row.elem)).map((row) => row.elem);
  }
  const resolveRef = (oid: string): string => {
    let current = oid;
    for (let info = resolveMap.get(current); info && info.elem !== '0'; info = resolveMap.get(current)) {
      current = info.elem;
    }
    return current;
  };
  const relkindOf = (oid: string): string => resolveMap.get(oid)?.relkind ?? '';
  return { resolveRef, relkindOf };
};

const wrapDuplicateGuard = (statement: string): string => {
  const tag = dollarTag(statement);
  return `DO ${tag} BEGIN\n  ${statement}\nEXCEPTION WHEN duplicate_object THEN NULL; END ${tag};`;
};

const USER_FUNCTION_DEP = (classCatalog: string, oidExpr: string): string => `EXISTS (
  SELECT 1 FROM pg_depend fdep
  JOIN pg_proc fproc ON fproc.oid = fdep.refobjid
  JOIN pg_namespace fns ON fns.oid = fproc.pronamespace
  WHERE fdep.classid = '${classCatalog}'::regclass
    AND fdep.objid = ${oidExpr}
    AND fdep.refclassid = 'pg_proc'::regclass
    AND fns.nspname NOT IN ('pg_catalog', 'information_schema')
)`;

const renderTypes = async (ctx: Ctx): Promise<string[]> => {
  const { rows: enums } = await ctx.client.query<{
    oid: string;
    schema: string;
    name: string;
    labels: string[];
  }>(
    `SELECT t.oid::text AS oid,
            quote_ident(n.nspname) AS schema,
            quote_ident(t.typname) AS name,
            array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = ANY($1)
       ${extensionFilter(ctx, 'pg_type', 't.oid')}
     GROUP BY t.oid, n.nspname, t.typname
     ORDER BY n.nspname, t.typname`,
    [ctx.schemas]
  );

  const { rows: domains } = await ctx.client.query<{
    oid: string;
    schema: string;
    name: string;
    qualified_raw: string;
    base_type: string;
    base_ref: string;
    not_null: boolean;
    default_expr: string | null;
    default_uses_function: boolean;
  }>(
    `SELECT t.oid::text AS oid,
            quote_ident(n.nspname) AS schema,
            quote_ident(t.typname) AS name,
            format('%I.%I', n.nspname, t.typname) AS qualified_raw,
            format_type(t.typbasetype, t.typtypmod) AS base_type,
            t.typbasetype::text AS base_ref,
            t.typnotnull AS not_null,
            pg_get_expr(t.typdefaultbin, 0) AS default_expr,
            ${USER_FUNCTION_DEP('pg_type', 't.oid')} AS default_uses_function
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typtype = 'd'
       AND n.nspname = ANY($1)
       ${extensionFilter(ctx, 'pg_type', 't.oid')}
     ORDER BY n.nspname, t.typname`,
    [ctx.schemas]
  );

  const { rows: domainConstraints } = await ctx.client.query<{
    type_oid: string;
    name_quoted: string;
    name_raw: string;
    definition: string;
    uses_function: boolean;
  }>(
    `SELECT con.contypid::text AS type_oid,
            quote_ident(con.conname) AS name_quoted,
            con.conname AS name_raw,
            pg_get_constraintdef(con.oid) AS definition,
            ${USER_FUNCTION_DEP('pg_constraint', 'con.oid')} AS uses_function
     FROM pg_constraint con
     JOIN pg_type t ON t.oid = con.contypid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE con.contypid <> 0
       AND n.nspname = ANY($1)
     ORDER BY con.conname`,
    [ctx.schemas]
  );

  const { rows: composites } = await ctx.client.query<{
    oid: string;
    schema: string;
    name: string;
    qualified_raw: string;
    attrs: string[];
    attr_type_oids: string[];
  }>(
    `SELECT t.oid::text AS oid,
            quote_ident(n.nspname) AS schema,
            quote_ident(t.typname) AS name,
            format('%I.%I', n.nspname, t.typname) AS qualified_raw,
            array_agg(quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum) AS attrs,
            array_agg(a.atttypid::text ORDER BY a.attnum) AS attr_type_oids
     FROM pg_type t
     JOIN pg_class c ON c.oid = t.typrelid AND c.relkind = 'c'
     JOIN pg_namespace n ON n.oid = t.typnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = ANY($1)
       ${extensionFilter(ctx, 'pg_type', 't.oid')}
     GROUP BY t.oid, n.nspname, t.typname
     ORDER BY n.nspname, t.typname`,
    [ctx.schemas]
  );

  // Resolve referenced type oids (arrays via typelem) and detect relation row
  // types so composites referencing relations can be diverted (v1 limitation).
  const refOids = new Set<string>();
  domains.forEach((row) => refOids.add(row.base_ref));
  composites.forEach((row) => row.attr_type_oids.forEach((oid) => refOids.add(oid)));
  const { resolveRef, relkindOf } = await createTypeResolver(ctx, Array.from(refOids));
  const referencesRelation = (oids: string[]): boolean =>
    oids.some((oid) => ['r', 'p', 'v', 'm', 'f'].includes(relkindOf(resolveRef(oid))));

  type TypeItem = { oid: string; sql: string };
  const items: TypeItem[] = [];
  const edges: Array<[string, string]> = [];

  enums.forEach((row) => {
    const labels = row.labels.map((label) => `'${escapeLiteral(label)}'`).join(', ');
    items.push({ oid: row.oid, sql: `CREATE TYPE ${row.schema}.${row.name} AS ENUM (${labels});` });
  });

  const constraintsByType = new Map<string, typeof domainConstraints>();
  domainConstraints.forEach((row) => {
    constraintsByType.set(row.type_oid, [...(constraintsByType.get(row.type_oid) ?? []), row]);
  });

  domains.forEach((row) => {
    const parts = [`CREATE DOMAIN ${row.schema}.${row.name} AS ${row.base_type}`];
    if (row.default_expr && !row.default_uses_function) {
      parts.push(`DEFAULT ${row.default_expr}`);
    }
    if (row.not_null) {
      parts.push('NOT NULL');
    }
    (constraintsByType.get(row.oid) ?? []).forEach((con) => {
      if (con.uses_function) {
        ctx.state.deferredDomainConstraints.push({
          qualifiedRaw: row.qualified_raw,
          nameQuoted: con.name_quoted,
          nameRaw: con.name_raw,
          definition: con.definition,
        });
      } else {
        parts.push(`CONSTRAINT ${con.name_quoted} ${con.definition}`);
      }
    });
    if (row.default_expr && row.default_uses_function) {
      ctx.state.deferredDomainDefaults.push(
        `ALTER DOMAIN ${row.schema}.${row.name} SET DEFAULT ${row.default_expr};`
      );
    }
    items.push({ oid: row.oid, sql: `${parts.join(' ')};` });
    edges.push([resolveRef(row.base_ref), row.oid]);
  });

  composites.forEach((row) => {
    if (referencesRelation(row.attr_type_oids)) {
      ctx.state.footerDiverted.push(
        `composite type referencing a relation row type (not emitted): ${row.qualified_raw}`
      );
      return;
    }
    items.push({ oid: row.oid, sql: `CREATE TYPE ${row.schema}.${row.name} AS (${row.attrs.join(', ')});` });
    row.attr_type_oids.forEach((oid) => edges.push([resolveRef(oid), row.oid]));
  });

  if (items.length === 0) {
    return [];
  }
  const ordered = topoSort(items, (item) => item.oid, edges);
  return [
    '-- types',
    ...ordered.map((item) => (ctx.ifNotExists ? wrapDuplicateGuard(item.sql) : item.sql)),
  ];
};

const renderTables = async (ctx: Ctx): Promise<string[]> => {
  const { rows: tables } = await ctx.client.query<{
    oid: string;
    rowtype_oid: string;
    schema: string;
    name: string;
    qualified_raw: string;
    unlogged: boolean;
  }>(
    `SELECT c.oid::text AS oid,
            c.reltype::text AS rowtype_oid,
            quote_ident(n.nspname) AS schema,
            quote_ident(c.relname) AS name,
            format('%I.%I', n.nspname, c.relname) AS qualified_raw,
            c.relpersistence = 'u' AS unlogged
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1)
       AND c.relkind = 'r'
       AND NOT c.relispartition
       ${extensionFilter(ctx, 'pg_class', 'c.oid')}
     ORDER BY n.nspname, c.relname`,
    [ctx.schemas]
  );
  if (tables.length === 0) {
    return [];
  }

  type ColumnRow = {
    name: string;
    data_type: string;
    type_oid: string;
    not_null: boolean;
    identity: string;
    generated: string;
    default_expr: string | null;
    default_uses_function: boolean;
    default_function_oids: string[] | null;
    collation_quoted: string | null;
    collation_differs: boolean;
    identity_start: string | null;
    identity_increment: string | null;
    identity_cache: string | null;
    identity_cycle: boolean | null;
  };

  const columnsByTable = new Map<string, ColumnRow[]>();
  for (const table of tables) {
    const { rows: columns } = await ctx.client.query<ColumnRow>(
      `SELECT quote_ident(a.attname) AS name,
              format_type(a.atttypid, a.atttypmod) AS data_type,
              a.atttypid::text AS type_oid,
              a.attnotnull AS not_null,
              a.attidentity AS identity,
              a.attgenerated AS generated,
              pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
              CASE WHEN ad.oid IS NULL THEN false ELSE ${USER_FUNCTION_DEP('pg_attrdef', 'ad.oid')} END AS default_uses_function,
              CASE WHEN ad.oid IS NULL THEN NULL ELSE (
                SELECT array_agg(fdep.refobjid::text)
                FROM pg_depend fdep
                JOIN pg_proc fproc ON fproc.oid = fdep.refobjid
                JOIN pg_namespace fns ON fns.oid = fproc.pronamespace
                WHERE fdep.classid = 'pg_attrdef'::regclass
                  AND fdep.objid = ad.oid
                  AND fdep.refclassid = 'pg_proc'::regclass
                  AND fns.nspname NOT IN ('pg_catalog', 'information_schema')
              ) END AS default_function_oids,
              quote_ident(col.collname) AS collation_quoted,
              (a.attcollation <> 0 AND a.attcollation <> typ.typcollation) AS collation_differs,
              iseq.start AS identity_start,
              iseq.increment AS identity_increment,
              iseq.cache AS identity_cache,
              iseq.cycle AS identity_cycle
       FROM pg_attribute a
       JOIN pg_type typ ON typ.oid = a.atttypid
       LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
       LEFT JOIN pg_collation col ON col.oid = a.attcollation
       LEFT JOIN LATERAL (
         SELECT s.seqstart::text AS start,
                s.seqincrement::text AS increment,
                s.seqcache::text AS cache,
                s.seqcycle AS cycle
         FROM pg_depend idep
         JOIN pg_sequence s ON s.seqrelid = idep.objid
         WHERE idep.classid = 'pg_class'::regclass
           AND idep.refclassid = 'pg_class'::regclass
           AND idep.refobjid = a.attrelid
           AND idep.refobjsubid = a.attnum
           AND idep.deptype = 'i'
       ) iseq ON a.attidentity IN ('a', 'd')
       WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum`,
      [table.oid]
    );
    columnsByTable.set(table.oid, columns);
  }

  const columnTypeOids = new Set<string>();
  columnsByTable.forEach((columns) => columns.forEach((col) => columnTypeOids.add(col.type_oid)));
  const { resolveRef } = await createTypeResolver(ctx, Array.from(columnTypeOids));
  const tableByRowtype = new Map(tables.map((table) => [table.rowtype_oid, table.oid]));
  const edges: Array<[string, string]> = [];
  tables.forEach((table) => {
    (columnsByTable.get(table.oid) ?? []).forEach((col) => {
      const target = tableByRowtype.get(resolveRef(col.type_oid));
      if (target && target !== table.oid) {
        edges.push([target, table.oid]);
      }
    });
  });

  const statements = topoSort(tables, (table) => table.oid, edges).map((table) => {
    const columnLines = (columnsByTable.get(table.oid) ?? []).map((col) => {
      const parts = [`${col.name} ${col.data_type}`];
      if (col.collation_differs && col.collation_quoted) {
        parts.push(`COLLATE ${col.collation_quoted}`);
      }
      if (col.generated === 's') {
        parts.push(`GENERATED ALWAYS AS (${col.default_expr}) STORED`);
        if (col.default_uses_function && col.default_function_oids) {
          ctx.state.generatedColumnFunctionDeps.push({
            qualifiedRaw: table.qualified_raw,
            column: col.name,
            functionOids: col.default_function_oids,
          });
        }
      } else if (col.identity === 'a' || col.identity === 'd') {
        let identity = col.identity === 'a' ? 'GENERATED ALWAYS AS IDENTITY' : 'GENERATED BY DEFAULT AS IDENTITY';
        const opts: string[] = [];
        if (col.identity_start && col.identity_start !== '1') {
          opts.push(`START WITH ${col.identity_start}`);
        }
        if (col.identity_increment && col.identity_increment !== '1') {
          opts.push(`INCREMENT BY ${col.identity_increment}`);
        }
        if (col.identity_cache && col.identity_cache !== '1') {
          opts.push(`CACHE ${col.identity_cache}`);
        }
        if (col.identity_cycle) {
          opts.push('CYCLE');
        }
        if (opts.length > 0) {
          identity += ` (${opts.join(' ')})`;
        }
        parts.push(identity);
      } else if (col.default_expr) {
        if (col.default_uses_function) {
          ctx.state.deferredColumnDefaults.push(
            `ALTER TABLE ${table.schema}.${table.name} ALTER COLUMN ${col.name} SET DEFAULT ${col.default_expr};`
          );
        } else {
          parts.push(`DEFAULT ${col.default_expr}`);
        }
      }
      if (col.not_null && col.identity !== 'a' && col.identity !== 'd') {
        parts.push('NOT NULL');
      }
      return `  ${parts.join(' ')}`;
    });
    const create = table.unlogged
      ? ctx.ifNotExists
        ? 'CREATE UNLOGGED TABLE IF NOT EXISTS'
        : 'CREATE UNLOGGED TABLE'
      : ctx.ifNotExists
        ? 'CREATE TABLE IF NOT EXISTS'
        : 'CREATE TABLE';
    return `${create} ${table.schema}.${table.name} (\n${columnLines.join(',\n')}\n);`;
  });

  return ['-- tables', ...statements];
};

const renderSequenceOwnership = async (ctx: Ctx): Promise<string[]> => {
  const { rows } = await ctx.client.query<{
    seq_schema: string;
    seq_name: string;
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(
    `SELECT quote_ident(sn.nspname) AS seq_schema,
            quote_ident(sc.relname) AS seq_name,
            quote_ident(tn.nspname) AS table_schema,
            quote_ident(tc.relname) AS table_name,
            quote_ident(a.attname) AS column_name
     FROM pg_depend dep
     JOIN pg_class sc ON sc.oid = dep.objid AND sc.relkind = 'S'
     JOIN pg_namespace sn ON sn.oid = sc.relnamespace
     JOIN pg_class tc ON tc.oid = dep.refobjid
     JOIN pg_namespace tn ON tn.oid = tc.relnamespace
     JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = dep.refobjsubid
     WHERE dep.classid = 'pg_class'::regclass
       AND dep.refclassid = 'pg_class'::regclass
       AND dep.deptype = 'a'
       AND sn.nspname = ANY($1)
       ${extensionFilter(ctx, 'pg_class', 'sc.oid')}
       ${extensionFilter(ctx, 'pg_class', 'tc.oid')}
     ORDER BY sn.nspname, sc.relname`,
    [ctx.schemas]
  );
  if (rows.length === 0) {
    return [];
  }
  return [
    '-- sequence ownership',
    ...rows.map(
      (row) =>
        `ALTER SEQUENCE ${row.seq_schema}.${row.seq_name} OWNED BY ${row.table_schema}.${row.table_name}.${row.column_name};`
    ),
  ];
};

type FunctionStage = 'type' | 'table' | 'view';

type ClassifiedFunction = { oid: string; definition: string; stage: FunctionStage };

// Stage functions by what their SIGNATURES reference (bodies are deferred by
// check_function_bodies = off): no relation row types -> 'type' (before
// tables), table row types -> 'table', any view row type -> 'view'. Arrays
// resolve through typelem; composite attributes are expanded transitively.
const classifyFunctions = async (ctx: Ctx): Promise<ClassifiedFunction[]> => {
  const { rows: fns } = await ctx.client.query<{
    oid: string;
    definition: string;
    rettype: string;
    argtypes: string[];
  }>(
    `SELECT p.oid::text AS oid,
            pg_get_functiondef(p.oid) AS definition,
            p.prorettype::text AS rettype,
            ARRAY(SELECT unnest(COALESCE(p.proallargtypes, p.proargtypes::oid[]))::text) AS argtypes
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ANY($1)
       AND p.prokind IN ('f', 'p')
       ${extensionFilter(ctx, 'pg_proc', 'p.oid')}
     ORDER BY n.nspname, p.proname, p.oid`,
    [ctx.schemas]
  );
  const info = new Map<string, { elem: string; relkind: string; attrs: string[] }>();
  let frontier: string[] = [];
  fns.forEach((fn) => frontier.push(fn.rettype, ...fn.argtypes));
  frontier = Array.from(new Set(frontier.filter((oid) => oid !== '0')));
  while (frontier.length > 0) {
    const { rows } = await ctx.client.query<{ oid: string; elem: string; relkind: string; attrs: string[] }>(
      `SELECT t.oid::text AS oid,
              t.typelem::text AS elem,
              COALESCE(c.relkind::text, '') AS relkind,
              CASE WHEN c.relkind = 'c' THEN ARRAY(
                SELECT a.atttypid::text FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)
              ELSE ARRAY[]::text[] END AS attrs
       FROM pg_type t
       LEFT JOIN pg_class c ON c.oid = t.typrelid
       WHERE t.oid = ANY($1::oid[])`,
      [frontier]
    );
    const next = new Set<string>();
    rows.forEach((row) => {
      info.set(row.oid, row);
      [row.elem, ...row.attrs].forEach((oid) => {
        if (oid !== '0' && !info.has(oid)) {
          next.add(oid);
        }
      });
    });
    frontier = Array.from(next);
  }
  const stageOf = (fn: { rettype: string; argtypes: string[] }): FunctionStage => {
    const seen = new Set<string>();
    const stack = [fn.rettype, ...fn.argtypes];
    let hasTable = false;
    while (stack.length > 0) {
      const oid = stack.pop() as string;
      if (oid === '0' || seen.has(oid)) {
        continue;
      }
      seen.add(oid);
      const typeInfo = info.get(oid);
      if (!typeInfo) {
        continue;
      }
      if (typeInfo.relkind === 'v' || typeInfo.relkind === 'm') {
        return 'view';
      }
      if (['r', 'p', 'f'].includes(typeInfo.relkind)) {
        hasTable = true;
      }
      if (typeInfo.elem !== '0') {
        stack.push(typeInfo.elem);
      }
      typeInfo.attrs.forEach((attr) => stack.push(attr));
    }
    return hasTable ? 'table' : 'type';
  };
  return fns.map((fn) => ({ oid: fn.oid, definition: fn.definition, stage: stageOf(fn) }));
};

const FUNCTION_STAGE_BANNERS: Record<FunctionStage, string> = {
  type: '-- functions',
  table: '-- table-dependent functions',
  view: '-- view-dependent functions',
};

const renderFunctionStage = (functions: ClassifiedFunction[], stage: FunctionStage): string[] => {
  const defs = functions.filter((fn) => fn.stage === stage);
  if (defs.length === 0) {
    return [];
  }
  return [FUNCTION_STAGE_BANNERS[stage], ...defs.map((fn) => `${normalizeLf(fn.definition.trim())};`)];
};

const renderDeferredDefaults = (ctx: Ctx): string[] => {
  const statements = [...ctx.state.deferredColumnDefaults, ...ctx.state.deferredDomainDefaults];
  if (statements.length === 0) {
    return [];
  }
  return ['-- deferred column defaults', ...statements];
};

export const generateBaselineSql = async (options: DbPullOptions): Promise<string> => {
  const schemas = options.schemas && options.schemas.length > 0 ? options.schemas : ['public'];
  const client = new Client({ connectionString: options.dbUrl });
  await client.connect();
  try {
    const ctx: Ctx = {
      client,
      schemas,
      filterExtensions: !(options.includeExtensionObjects ?? false),
      ifNotExists: options.ifNotExists ?? true,
      state: {
        deferredColumnDefaults: [],
        deferredDomainDefaults: [],
        deferredDomainConstraints: [],
        generatedColumnFunctionDeps: [],
        footerDiverted: [],
      },
    };
    const header = [
      '-- supalite db pull baseline',
      `-- generated at: ${new Date().toISOString()}`,
      `-- schemas: ${schemas.join(', ')}`,
      '',
      'SET check_function_bodies = off;',
    ];
    if ((await countObjects(ctx)) === 0) {
      console.warn(`Warning: no objects found in schema(s) ${schemas.join(', ')}.`);
      return normalizeLf(`${header.join('\n')}\n`);
    }
    const functions = await classifyFunctions(ctx);
    const functionStageByOid = new Map(functions.map((fn) => [fn.oid, fn.stage]));
    const sections: string[][] = [];
    sections.push(await renderSchemas(ctx));
    sections.push(await renderExtensions(ctx));
    sections.push(await renderSequences(ctx));
    sections.push(await renderTypes(ctx));
    sections.push(renderFunctionStage(functions, 'type'));
    sections.push(await renderTables(ctx));
    sections.push(await renderSequenceOwnership(ctx));
    sections.push(renderFunctionStage(functions, 'table'));
    sections.push(renderDeferredDefaults(ctx));
    ctx.state.generatedColumnFunctionDeps.forEach((dep) => {
      const worstStage = dep.functionOids
        .map((oid) => functionStageByOid.get(oid) ?? 'type')
        .find((stage) => stage !== 'type');
      if (worstStage) {
        ctx.state.footerDiverted.push(
          `generated column calling a ${worstStage}-stage function (cannot replay on an empty target): ${dep.qualifiedRaw}.${dep.column}`
        );
      }
    });
    const body = sections
      .filter((section) => section.length > 0)
      .map((section) => section.join('\n'))
      .join('\n\n');
    return normalizeLf(`${header.join('\n')}\n${body ? `\n${body}\n` : ''}`);
  } finally {
    await client.end();
  }
};
