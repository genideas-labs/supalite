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
  deferredDomainDefaults: string[];
  deferredDomainConstraints: DeferredDomainConstraint[];
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
  const resolveMap = new Map<string, { elem: string; relkind: string }>();
  let pending = Array.from(refOids);
  while (pending.length > 0) {
    const { rows: typeInfo } = await ctx.client.query<{ oid: string; elem: string; relkind: string }>(
      `SELECT t.oid::text AS oid, t.typelem::text AS elem, COALESCE(c.relkind::text, '') AS relkind
       FROM pg_type t
       LEFT JOIN pg_class c ON c.oid = t.typrelid
       WHERE t.oid = ANY($1::oid[])`,
      [pending]
    );
    typeInfo.forEach((row) => resolveMap.set(row.oid, { elem: row.elem, relkind: row.relkind }));
    pending = typeInfo
      .filter((row) => row.elem !== '0' && !resolveMap.has(row.elem))
      .map((row) => row.elem);
  }
  const resolveRef = (oid: string): string => {
    let current = oid;
    for (let info = resolveMap.get(current); info && info.elem !== '0'; info = resolveMap.get(current)) {
      current = info.elem;
    }
    return current;
  };
  const referencesRelation = (oids: string[]): boolean =>
    oids.some((oid) => {
      const info = resolveMap.get(resolveRef(oid));
      return info !== undefined && ['r', 'p', 'v', 'm', 'f'].includes(info.relkind);
    });

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
        deferredDomainDefaults: [],
        deferredDomainConstraints: [],
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
    const sections: string[][] = [];
    sections.push(await renderSchemas(ctx));
    sections.push(await renderExtensions(ctx));
    sections.push(await renderSequences(ctx));
    sections.push(await renderTypes(ctx));
    const body = sections
      .filter((section) => section.length > 0)
      .map((section) => section.join('\n'))
      .join('\n\n');
    return normalizeLf(`${header.join('\n')}\n${body ? `\n${body}\n` : ''}`);
  } finally {
    await client.end();
  }
};
