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
  functionOids: string[];
  typeOids: string[];
  ownerTypeOid: string;
};

type DeferredColumnDefault = {
  statement: string;
  functionOids: string[];
  typeOids: string[];
  ownerTypeOid?: string;
  label: string;
};

type PullState = {
  deferredColumnDefaults: DeferredColumnDefault[];
  divertedRelations: Set<string>;
  divertedTypes: Set<string>;
  divertedFunctions: Set<string>;
  deferredDomainDefaults: DeferredColumnDefault[];
  deferredDomainConstraints: DeferredDomainConstraint[];
  footerDiverted: string[];
  externalRefs: string[];
};

// Objects excluded from executable output (v1 unsupported); dependents are
// diverted to the footer instead of emitting DDL that would fail (FR-016).
type Exclusion = {
  relations: Map<string, string>; // oid -> qualified name
  rowtypes: Map<string, string>; // excluded relation row-type oid -> qualified name
  functions: Map<string, string>; // oid -> qualified name (aggregates/window, extension-owned)
};

type Ctx = {
  client: Client;
  schemas: string[];
  filterExtensions: boolean;
  ifNotExists: boolean;
  state: PullState;
  exclusion: Exclusion;
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
// key(). Deterministic: among ready nodes the one earliest in the input order
// is emitted first. Items involved in a cycle are appended in input order.
const topoSort = <T>(items: T[], key: (item: T) => string, edges: Array<[string, string]>): T[] => {
  const byKey = new Map(items.map((item) => [key(item), item]));
  const rank = new Map(items.map((item, index) => [key(item), index]));
  const indegree = new Map<string, number>(items.map((item) => [key(item), 0]));
  const dependents = new Map<string, Set<string>>();
  edges.forEach(([from, to]) => {
    if (!byKey.has(from) || !byKey.has(to) || from === to) {
      return;
    }
    const existing = dependents.get(from) ?? new Set<string>();
    if (existing.has(to)) {
      return;
    }
    existing.add(to);
    dependents.set(from, existing);
    indegree.set(to, (indegree.get(to) as number) + 1);
  });
  const ready = items.map(key).filter((k) => indegree.get(k) === 0);
  const ordered: T[] = [];
  const seen = new Set<string>();
  while (ready.length > 0) {
    ready.sort((a, b) => (rank.get(a) as number) - (rank.get(b) as number));
    const k = ready.shift() as string;
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    ordered.push(byKey.get(k) as T);
    (dependents.get(k) ?? new Set<string>()).forEach((dep) => {
      indegree.set(dep, (indegree.get(dep) as number) - 1);
      if (indegree.get(dep) === 0) {
        ready.push(dep);
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

// Identifiers can legally contain newlines; anything interpolated into a SQL
// comment must stay on one line or it would escape the comment.
const commentSafe = (text: string): string => text.replace(/\r?\n|\r/g, ' ');

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

// Default MIN/MAXVALUE of an identity sequence for the column's type; render
// the bound only when it differs (FR-009 non-default options).
const identityDefaultBounds = (
  dataType: string,
  ascending: boolean
): { min: string; max: string } | null => {
  const limits: Record<string, { min: string; max: string }> = {
    smallint: { min: '-32768', max: '32767' },
    integer: { min: '-2147483648', max: '2147483647' },
    bigint: { min: '-9223372036854775808', max: '9223372036854775807' },
  };
  const limit = limits[dataType];
  if (!limit) {
    return null;
  }
  return ascending ? { min: '1', max: limit.max } : { min: limit.min, max: '-1' };
};

// Shared availability check for expression type dependencies: resolves
// arrays (typelem) and domain chains (typbasetype), and maps row types
// (typrelid) onto excluded/diverted relations. Reads the live diversion sets
// so it stays correct while rendering progresses.
const createTypeAvailability = async (
  ctx: Ctx,
  seedOids: Array<string | null | undefined>
): Promise<(oid: string) => boolean> => {
  const map = new Map<string, { elem: string; base: string; relid: string }>();
  let pending = Array.from(new Set(seedOids.filter((oid): oid is string => !!oid && oid !== '0')));
  while (pending.length > 0) {
    const { rows } = await ctx.client.query<{ oid: string; elem: string; base: string; relid: string }>(
      `SELECT t.oid::text AS oid,
              t.typelem::text AS elem,
              t.typbasetype::text AS base,
              t.typrelid::text AS relid
       FROM pg_type t
       WHERE t.oid = ANY($1::oid[])`,
      [pending]
    );
    const next = new Set<string>();
    rows.forEach((row) => {
      map.set(row.oid, row);
      [row.elem, row.base].forEach((oid) => {
        if (oid !== '0' && !map.has(oid)) {
          next.add(oid);
        }
      });
    });
    pending = Array.from(next);
  }
  return (oid: string): boolean => {
    const stack = [oid];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (current === '0' || seen.has(current)) {
        continue;
      }
      seen.add(current);
      if (ctx.state.divertedTypes.has(current)) {
        return true;
      }
      const info = map.get(current);
      if (!info) {
        continue;
      }
      if (
        info.relid !== '0' &&
        (ctx.exclusion.relations.has(info.relid) || ctx.state.divertedRelations.has(info.relid))
      ) {
        return true;
      }
      stack.push(info.elem, info.base);
    }
    return false;
  };
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
    default_function_oids: string[] | null;
    default_type_oids: string[] | null;
  }>(
    `SELECT t.oid::text AS oid,
            quote_ident(n.nspname) AS schema,
            quote_ident(t.typname) AS name,
            format('%I.%I', n.nspname, t.typname) AS qualified_raw,
            format_type(t.typbasetype, t.typtypmod) AS base_type,
            t.typbasetype::text AS base_ref,
            t.typnotnull AS not_null,
            pg_get_expr(t.typdefaultbin, 0) AS default_expr,
            ${USER_FUNCTION_DEP('pg_type', 't.oid')} AS default_uses_function,
            (SELECT array_agg(fdep.refobjid::text)
             FROM pg_depend fdep
             JOIN pg_proc fproc ON fproc.oid = fdep.refobjid
             JOIN pg_namespace fns ON fns.oid = fproc.pronamespace
             WHERE fdep.classid = 'pg_type'::regclass
               AND fdep.objid = t.oid
               AND fdep.refclassid = 'pg_proc'::regclass
               AND fns.nspname NOT IN ('pg_catalog', 'information_schema')) AS default_function_oids,
            (SELECT array_agg(tdep.refobjid::text)
             FROM pg_depend tdep
             JOIN pg_type tt ON tt.oid = tdep.refobjid
             JOIN pg_namespace tns ON tns.oid = tt.typnamespace
             WHERE tdep.classid = 'pg_type'::regclass
               AND tdep.objid = t.oid
               AND tdep.refclassid = 'pg_type'::regclass
               AND tns.nspname NOT IN ('pg_catalog', 'information_schema')) AS default_type_oids
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
    function_oids: string[] | null;
    type_oids: string[] | null;
  }>(
    `SELECT con.contypid::text AS type_oid,
            quote_ident(con.conname) AS name_quoted,
            con.conname AS name_raw,
            pg_get_constraintdef(con.oid) AS definition,
            ${USER_FUNCTION_DEP('pg_constraint', 'con.oid')} AS uses_function,
            (SELECT array_agg(fdep.refobjid::text)
             FROM pg_depend fdep
             JOIN pg_proc fproc ON fproc.oid = fdep.refobjid
             JOIN pg_namespace fns ON fns.oid = fproc.pronamespace
             WHERE fdep.classid = 'pg_constraint'::regclass
               AND fdep.objid = con.oid
               AND fdep.refclassid = 'pg_proc'::regclass
               AND fns.nspname NOT IN ('pg_catalog', 'information_schema')) AS function_oids,
            (SELECT array_agg(tdep.refobjid::text)
             FROM pg_depend tdep
             JOIN pg_type tt ON tt.oid = tdep.refobjid
             JOIN pg_namespace tns ON tns.oid = tt.typnamespace
             WHERE tdep.classid = 'pg_constraint'::regclass
               AND tdep.objid = con.oid
               AND tdep.refclassid = 'pg_type'::regclass
               AND tns.nspname NOT IN ('pg_catalog', 'information_schema')) AS type_oids
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

  type TypeItem = { oid: string; sql: string; qualified: string; refs: string[] };
  const items: TypeItem[] = [];
  const edges: Array<[string, string]> = [];

  enums.forEach((row) => {
    const labels = row.labels.map((label) => `'${escapeLiteral(label)}'`).join(', ');
    items.push({
      oid: row.oid,
      sql: `CREATE TYPE ${row.schema}.${row.name} AS ENUM (${labels});`,
      qualified: `${row.schema}.${row.name}`,
      refs: [],
    });
  });

  const constraintsByType = new Map<string, typeof domainConstraints>();
  domainConstraints.forEach((row) => {
    constraintsByType.set(row.type_oid, [...(constraintsByType.get(row.type_oid) ?? []), row]);
  });

  domains.forEach((row) => {
    if (referencesRelation([row.base_ref])) {
      ctx.state.divertedTypes.add(row.oid);
      ctx.state.footerDiverted.push(
        `domain based on a relation row type (not emitted): ${row.qualified_raw}`
      );
      return;
    }
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
          functionOids: con.function_oids ?? [],
          typeOids: con.type_oids ?? [],
          ownerTypeOid: row.oid,
        });
      } else {
        parts.push(`CONSTRAINT ${con.name_quoted} ${con.definition}`);
      }
    });
    if (row.default_expr && row.default_uses_function) {
      ctx.state.deferredDomainDefaults.push({
        statement: `ALTER DOMAIN ${row.schema}.${row.name} SET DEFAULT ${row.default_expr};`,
        functionOids: row.default_function_oids ?? [],
        typeOids: row.default_type_oids ?? [],
        ownerTypeOid: row.oid,
        label: row.qualified_raw,
      });
    }
    items.push({
      oid: row.oid,
      sql: `${parts.join(' ')};`,
      qualified: row.qualified_raw,
      refs: [row.base_ref],
    });
    edges.push([resolveRef(row.base_ref), row.oid]);
  });

  composites.forEach((row) => {
    if (referencesRelation(row.attr_type_oids)) {
      ctx.state.divertedTypes.add(row.oid);
      ctx.state.footerDiverted.push(
        `composite type referencing a relation row type (not emitted): ${row.qualified_raw}`
      );
      return;
    }
    items.push({
      oid: row.oid,
      sql: `CREATE TYPE ${row.schema}.${row.name} AS (${row.attrs.join(', ')});`,
      qualified: row.qualified_raw,
      refs: row.attr_type_oids,
    });
    row.attr_type_oids.forEach((oid) => edges.push([resolveRef(oid), row.oid]));
  });

  if (items.length === 0) {
    return [];
  }
  // Walk in dependency order so a type depending on a diverted type diverts
  // too (e.g. a domain over a domain over a relation row type).
  const statements: string[] = [];
  topoSort(items, (item) => item.oid, edges).forEach((item) => {
    if (item.refs.some((ref) => ctx.state.divertedTypes.has(resolveRef(ref)))) {
      ctx.state.divertedTypes.add(item.oid);
      ctx.state.footerDiverted.push(`type depending on a diverted type (not emitted): ${item.qualified}`);
      return;
    }
    statements.push(ctx.ifNotExists ? wrapDuplicateGuard(item.sql) : item.sql);
  });
  if (statements.length === 0) {
    return [];
  }
  return ['-- types', ...statements];
};

const renderTables = async (ctx: Ctx, generatedFnBlocked: (oid: string) => boolean): Promise<string[]> => {
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
    default_function_oids: string[] | null;
    default_type_oids: string[] | null;
    collation_qualified: string | null;
    collation_differs: boolean;
    identity_start: string | null;
    identity_increment: string | null;
    identity_cache: string | null;
    identity_cycle: boolean | null;
    identity_min: string | null;
    identity_max: string | null;
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
              -- expression deps live under pg_attrdef for plain DEFAULTs but
              -- under pg_class/objsubid=<attnum> for GENERATED columns
              (SELECT array_agg(DISTINCT dep.refobjid::text)
               FROM (
                 SELECT fdep.refobjid FROM pg_depend fdep
                 WHERE ad.oid IS NOT NULL
                   AND fdep.classid = 'pg_attrdef'::regclass
                   AND fdep.objid = ad.oid
                   AND fdep.refclassid = 'pg_proc'::regclass
                 UNION ALL
                 SELECT cdep.refobjid FROM pg_depend cdep
                 WHERE cdep.classid = 'pg_class'::regclass
                   AND cdep.objid = a.attrelid
                   AND cdep.objsubid = a.attnum
                   AND cdep.refclassid = 'pg_proc'::regclass
               ) dep
               JOIN pg_proc fproc ON fproc.oid = dep.refobjid
               JOIN pg_namespace fns ON fns.oid = fproc.pronamespace
               WHERE fns.nspname NOT IN ('pg_catalog', 'information_schema')
              ) AS default_function_oids,
              (SELECT array_agg(DISTINCT dep.refobjid::text)
               FROM (
                 SELECT tdep.refobjid FROM pg_depend tdep
                 WHERE ad.oid IS NOT NULL
                   AND tdep.classid = 'pg_attrdef'::regclass
                   AND tdep.objid = ad.oid
                   AND tdep.refclassid = 'pg_type'::regclass
                 UNION ALL
                 SELECT ctdep.refobjid FROM pg_depend ctdep
                 WHERE ctdep.classid = 'pg_class'::regclass
                   AND ctdep.objid = a.attrelid
                   AND ctdep.objsubid = a.attnum
                   AND ctdep.refclassid = 'pg_type'::regclass
               ) dep
               JOIN pg_type tt ON tt.oid = dep.refobjid
               JOIN pg_namespace tns ON tns.oid = tt.typnamespace
               WHERE tns.nspname NOT IN ('pg_catalog', 'information_schema')
              ) AS default_type_oids,
              CASE WHEN col.oid IS NOT NULL THEN format('%I.%I', coll_ns.nspname, col.collname) END AS collation_qualified,
              (a.attcollation <> 0 AND a.attcollation <> typ.typcollation) AS collation_differs,
              iseq.start AS identity_start,
              iseq.increment AS identity_increment,
              iseq.cache AS identity_cache,
              iseq.cycle AS identity_cycle,
              iseq.min AS identity_min,
              iseq.max AS identity_max
       FROM pg_attribute a
       JOIN pg_type typ ON typ.oid = a.atttypid
       LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
       LEFT JOIN pg_collation col ON col.oid = a.attcollation
       LEFT JOIN pg_namespace coll_ns ON coll_ns.oid = col.collnamespace
       LEFT JOIN LATERAL (
         SELECT s.seqstart::text AS start,
                s.seqincrement::text AS increment,
                s.seqcache::text AS cache,
                s.seqcycle AS cycle,
                s.seqmin::text AS min,
                s.seqmax::text AS max
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
  columnsByTable.forEach((columns) =>
    columns.forEach((col) => {
      columnTypeOids.add(col.type_oid);
      (col.default_type_oids ?? []).forEach((oid) => columnTypeOids.add(oid));
    })
  );
  const { resolveRef } = await createTypeResolver(ctx, Array.from(columnTypeOids));
  const typeUnavailable = await createTypeAvailability(ctx, Array.from(columnTypeOids));
  const tableByRowtype = new Map(tables.map((table) => [table.rowtype_oid, table.oid]));

  // Tables whose columns reference an unavailable type (excluded/diverted
  // relation row type, diverted domain/composite — arrays and domain chains
  // resolved) cannot replay. Divert to a fixed point: typeUnavailable reads
  // the live divertedRelations set, so chains divert too.
  let emittedTables = tables.slice();
  let divertChanged = true;
  while (divertChanged) {
    divertChanged = false;
    emittedTables = emittedTables.filter((table) => {
      const hit = (columnsByTable.get(table.oid) ?? []).some(
        (col) =>
          typeUnavailable(col.type_oid) ||
          // generated expressions are fixed at CREATE TABLE and cannot be
          // deferred: an unavailable type or a function that only exists
          // after tables (table/view-stage, excluded, diverted) sinks the
          // whole table
          (col.generated === 's' &&
            ((col.default_type_oids ?? []).some(typeUnavailable) ||
              (col.default_function_oids ?? []).some(generatedFnBlocked)))
      );
      if (hit) {
        ctx.state.divertedRelations.add(table.oid);
        ctx.state.footerDiverted.push(
          `table with a column of an unavailable type (not emitted): ${table.qualified_raw}`
        );
        divertChanged = true;
        return false;
      }
      return true;
    });
  }

  const edges: Array<[string, string]> = [];
  emittedTables.forEach((table) => {
    (columnsByTable.get(table.oid) ?? []).forEach((col) => {
      const target = tableByRowtype.get(resolveRef(col.type_oid));
      if (target && target !== table.oid) {
        edges.push([target, table.oid]);
      }
    });
  });

  const statements = topoSort(emittedTables, (table) => table.oid, edges).map((table) => {
    const columnLines = (columnsByTable.get(table.oid) ?? []).map((col) => {
      const parts = [`${col.name} ${col.data_type}`];
      if (col.collation_differs && col.collation_qualified) {
        parts.push(`COLLATE ${col.collation_qualified}`);
      }
      if (col.generated === 's') {
        parts.push(`GENERATED ALWAYS AS (${col.default_expr}) STORED`);
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
        const ascending = !(col.identity_increment ?? '1').startsWith('-');
        const bounds = identityDefaultBounds(col.data_type, ascending);
        if (col.identity_min && bounds && col.identity_min !== bounds.min) {
          opts.push(`MINVALUE ${col.identity_min}`);
        }
        if (col.identity_max && bounds && col.identity_max !== bounds.max) {
          opts.push(`MAXVALUE ${col.identity_max}`);
        }
        if (col.identity_cycle) {
          opts.push('CYCLE');
        }
        if (opts.length > 0) {
          identity += ` (${opts.join(' ')})`;
        }
        parts.push(identity);
      } else if (col.default_expr) {
        if ((col.default_type_oids ?? []).some(typeUnavailable)) {
          ctx.state.footerDiverted.push(
            `column default referencing an unavailable type (not emitted): ${table.qualified_raw}.${col.name}`
          );
        } else if ((col.default_function_oids ?? []).length > 0) {
          ctx.state.deferredColumnDefaults.push({
            statement: `ALTER TABLE ${table.schema}.${table.name} ALTER COLUMN ${col.name} SET DEFAULT ${col.default_expr};`,
            functionOids: col.default_function_oids ?? [],
            typeOids: col.default_type_oids ?? [],
            label: `${table.qualified_raw}.${col.name}`,
          });
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
    table_oid: string;
    column_name: string;
    seq_qualified_raw: string;
    table_qualified_raw: string;
    column_raw: string;
  }>(
    `SELECT quote_ident(sn.nspname) AS seq_schema,
            quote_ident(sc.relname) AS seq_name,
            quote_ident(tn.nspname) AS table_schema,
            quote_ident(tc.relname) AS table_name,
            tc.oid::text AS table_oid,
            quote_ident(a.attname) AS column_name,
            format('%I.%I', sn.nspname, sc.relname) AS seq_qualified_raw,
            format('%I.%I', tn.nspname, tc.relname) AS table_qualified_raw,
            a.attname AS column_raw
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
  const emittable = rows.filter(
    (row) =>
      !ctx.state.divertedRelations.has(row.table_oid) && !ctx.exclusion.relations.has(row.table_oid)
  );
  if (emittable.length === 0) {
    return [];
  }
  const statements = emittable.map((row) => {
    const alter = `ALTER SEQUENCE ${row.seq_schema}.${row.seq_name} OWNED BY ${row.table_schema}.${row.table_name}.${row.column_name};`;
    if (!ctx.ifNotExists) {
      return alter;
    }
    // Skip when the ownership link already exists: ALTER SEQUENCE requires
    // being the sequence's owner even for a no-op, which would break
    // re-applying as a different role.
    const inner = `IF NOT EXISTS (\n    SELECT 1 FROM pg_depend dep\n    JOIN pg_attribute a ON a.attrelid = dep.refobjid AND a.attnum = dep.refobjsubid\n    WHERE dep.classid = 'pg_class'::regclass\n      AND dep.objid = '${escapeLiteral(row.seq_qualified_raw)}'::regclass\n      AND dep.refclassid = 'pg_class'::regclass\n      AND dep.refobjid = '${escapeLiteral(row.table_qualified_raw)}'::regclass\n      AND a.attname = '${escapeLiteral(row.column_raw)}'\n      AND dep.deptype = 'a'\n  ) THEN\n    ${alter}\n  END IF;`;
    const tag = dollarTag(inner);
    return `DO ${tag} BEGIN\n  ${inner}\nEND ${tag};`;
  });
  return ['-- sequence ownership', ...statements];
};

const computeExclusion = async (ctx: Ctx): Promise<Exclusion> => {
  const extensionOwned = ctx.filterExtensions
    ? `OR EXISTS (
         SELECT 1 FROM pg_depend ext_dep
         WHERE ext_dep.classid = 'pg_class'::regclass
           AND ext_dep.objid = c.oid
           AND ext_dep.deptype = 'e'
       )`
    : '';
  const { rows: relations } = await ctx.client.query<{ oid: string; rowtype_oid: string; qualified: string }>(
    `SELECT c.oid::text AS oid, c.reltype::text AS rowtype_oid, format('%I.%I', n.nspname, c.relname) AS qualified
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1)
       AND (c.relkind = 'p' OR c.relispartition ${extensionOwned})`,
    [ctx.schemas]
  );
  const extensionOwnedFn = ctx.filterExtensions
    ? `OR EXISTS (
         SELECT 1 FROM pg_depend ext_dep
         WHERE ext_dep.classid = 'pg_proc'::regclass
           AND ext_dep.objid = p.oid
           AND ext_dep.deptype = 'e'
       )`
    : '';
  const { rows: functions } = await ctx.client.query<{ oid: string; qualified: string }>(
    `SELECT p.oid::text AS oid, format('%I.%I', n.nspname, p.proname) AS qualified
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ANY($1)
       AND (p.prokind IN ('a', 'w') ${extensionOwnedFn})`,
    [ctx.schemas]
  );
  return {
    relations: new Map(relations.map((row) => [row.oid, row.qualified])),
    rowtypes: new Map(relations.map((row) => [row.rowtype_oid, row.qualified])),
    functions: new Map(functions.map((row) => [row.oid, row.qualified])),
  };
};

const renderConstraints = async (
  ctx: Ctx,
  functionUnavailable: (oid: string) => boolean
): Promise<{ constraints: string[]; foreignKeys: string[] }> => {
  const { rows } = await ctx.client.query<{
    schema: string;
    table_name: string;
    table_oid: string;
    name: string;
    raw_name: string;
    qualified_raw: string;
    type: string;
    definition: string;
    function_oids: string[] | null;
    type_oids: string[] | null;
    ref_oid: string | null;
    ref_schema_raw: string | null;
    ref_qualified: string | null;
  }>(
    `SELECT quote_ident(n.nspname) AS schema,
            quote_ident(cl.relname) AS table_name,
            cl.oid::text AS table_oid,
            quote_ident(con.conname) AS name,
            con.conname AS raw_name,
            format('%I.%I', n.nspname, cl.relname) AS qualified_raw,
            con.contype AS type,
            pg_get_constraintdef(con.oid) AS definition,
            (SELECT array_agg(fdep.refobjid::text)
             FROM pg_depend fdep
             JOIN pg_proc fproc ON fproc.oid = fdep.refobjid
             JOIN pg_namespace fns ON fns.oid = fproc.pronamespace
             WHERE fdep.classid = 'pg_constraint'::regclass
               AND fdep.objid = con.oid
               AND fdep.refclassid = 'pg_proc'::regclass
               AND fns.nspname NOT IN ('pg_catalog', 'information_schema')) AS function_oids,
            (SELECT array_agg(tdep.refobjid::text)
             FROM pg_depend tdep
             JOIN pg_type tt ON tt.oid = tdep.refobjid
             JOIN pg_namespace tns ON tns.oid = tt.typnamespace
             WHERE tdep.classid = 'pg_constraint'::regclass
               AND tdep.objid = con.oid
               AND tdep.refclassid = 'pg_type'::regclass
               AND tns.nspname NOT IN ('pg_catalog', 'information_schema')) AS type_oids,
            NULLIF(con.confrelid, 0)::text AS ref_oid,
            fn.nspname AS ref_schema_raw,
            CASE WHEN con.confrelid <> 0 THEN format('%I.%I', fn.nspname, fcl.relname) END AS ref_qualified
     FROM pg_constraint con
     JOIN pg_class cl ON cl.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
     LEFT JOIN pg_class fcl ON fcl.oid = con.confrelid
     LEFT JOIN pg_namespace fn ON fn.oid = fcl.relnamespace
     WHERE n.nspname = ANY($1)
       AND con.contype IN ('p', 'u', 'c', 'f', 'x')
       AND con.conparentid = 0
       AND cl.relkind = 'r'
       AND NOT cl.relispartition
       ${extensionFilter(ctx, 'pg_class', 'cl.oid')}
       ${extensionFilter(ctx, 'pg_constraint', 'con.oid')}
     ORDER BY n.nspname, cl.relname, con.conname`,
    [ctx.schemas]
  );

  const typeUnavailable = await createTypeAvailability(ctx, [
    ...rows.flatMap((row) => row.type_oids ?? []),
    ...ctx.state.deferredDomainConstraints.flatMap((domainCon) => domainCon.typeOids),
  ]);

  const guard = (alter: string, innerCheck: string): string => {
    const inner = `IF NOT EXISTS (\n    ${innerCheck}\n  ) THEN\n    ${alter}\n  END IF;`;
    const tag = dollarTag(inner);
    return `DO ${tag} BEGIN\n  ${inner}\nEND ${tag};`;
  };

  const renderOne = (row: (typeof rows)[number]): string => {
    const alter = `ALTER TABLE ${row.schema}.${row.table_name} ADD CONSTRAINT ${row.name} ${row.definition};`;
    if (!ctx.ifNotExists) {
      return alter;
    }
    return guard(
      alter,
      `SELECT 1 FROM pg_constraint\n    WHERE conname = '${escapeLiteral(row.raw_name)}'\n      AND conrelid = '${escapeLiteral(row.qualified_raw)}'::regclass`
    );
  };

  const constraints: string[] = [];
  const foreignKeys: string[] = [];
  rows.forEach((row) => {
    if (ctx.state.divertedRelations.has(row.table_oid)) {
      return;
    }
    if ((row.type_oids ?? []).some(typeUnavailable)) {
      ctx.state.footerDiverted.push(
        `constraint referencing an unavailable type (not emitted): ${row.qualified_raw}.${row.raw_name}`
      );
      return;
    }
    if ((row.function_oids ?? []).some(functionUnavailable)) {
      ctx.state.footerDiverted.push(
        `constraint calling a function unavailable in this baseline (not emitted): ${row.qualified_raw}.${row.raw_name}`
      );
      return;
    }
    if (row.type !== 'f') {
      constraints.push(renderOne(row));
      return;
    }
    if (row.ref_oid && (ctx.exclusion.relations.has(row.ref_oid) || ctx.state.divertedRelations.has(row.ref_oid))) {
      const target = ctx.exclusion.relations.get(row.ref_oid) ?? row.ref_qualified ?? 'a diverted relation';
      ctx.state.footerDiverted.push(
        `foreign key to excluded relation (not emitted): ${row.qualified_raw}.${row.raw_name} -> ${target}`
      );
      return;
    }
    if (row.ref_schema_raw && !ctx.schemas.includes(row.ref_schema_raw) && row.ref_qualified) {
      ctx.state.externalRefs.push(`${row.qualified_raw}.${row.raw_name} -> ${row.ref_qualified}`);
    }
    foreignKeys.push(renderOne(row));
  });

  ctx.state.deferredDomainConstraints.forEach((domainCon) => {
    if (ctx.state.divertedTypes.has(domainCon.ownerTypeOid)) {
      return; // owner domain itself was diverted (already footer-listed)
    }
    if (domainCon.typeOids.some(typeUnavailable)) {
      ctx.state.footerDiverted.push(
        `domain constraint referencing an unavailable type (not emitted): ${domainCon.qualifiedRaw}.${domainCon.nameRaw}`
      );
      return;
    }
    if (domainCon.functionOids.some(functionUnavailable)) {
      ctx.state.footerDiverted.push(
        `domain constraint calling a function unavailable in this baseline (not emitted): ${domainCon.qualifiedRaw}.${domainCon.nameRaw}`
      );
      return;
    }
    const alter = `ALTER DOMAIN ${domainCon.qualifiedRaw} ADD CONSTRAINT ${domainCon.nameQuoted} ${domainCon.definition};`;
    if (!ctx.ifNotExists) {
      constraints.push(alter);
      return;
    }
    constraints.push(
      guard(
        alter,
        `SELECT 1 FROM pg_constraint\n    WHERE conname = '${escapeLiteral(domainCon.nameRaw)}'\n      AND contypid = '${escapeLiteral(domainCon.qualifiedRaw)}'::regtype`
      )
    );
  });

  return {
    constraints: constraints.length > 0 ? ['-- constraints', ...constraints] : [],
    foreignKeys: foreignKeys.length > 0 ? ['-- foreign keys', ...foreignKeys] : [],
  };
};

type FunctionStage = 'type' | 'table' | 'view';

type ClassifiedFunction = {
  oid: string;
  definition: string;
  stage: FunctionStage;
  qualified: string;
  excluded: boolean;
  relationOids: string[];
  typeOids: string[];
  depFunctionOids: string[];
};

// Stage functions by what their SIGNATURES reference (bodies are deferred by
// check_function_bodies = off): no relation row types -> 'type' (before
// tables), table row types -> 'table', any view row type -> 'view'. Arrays
// resolve through typelem; composite attributes are expanded transitively.
const classifyFunctions = async (ctx: Ctx): Promise<ClassifiedFunction[]> => {
  const { rows: fns } = await ctx.client.query<{
    oid: string;
    definition: string;
    qualified: string;
    rettype: string;
    argtypes: string[];
    dep_function_oids: string[] | null;
    dep_type_oids: string[] | null;
  }>(
    `SELECT p.oid::text AS oid,
            pg_get_functiondef(p.oid) AS definition,
            format('%I.%I', n.nspname, p.proname) AS qualified,
            p.prorettype::text AS rettype,
            ARRAY(SELECT unnest(COALESCE(p.proallargtypes, p.proargtypes::oid[]))::text) AS argtypes,
            (SELECT array_agg(fdep.refobjid::text)
             FROM pg_depend fdep
             JOIN pg_proc fproc ON fproc.oid = fdep.refobjid
             JOIN pg_namespace fns ON fns.oid = fproc.pronamespace
             WHERE fdep.classid = 'pg_proc'::regclass
               AND fdep.objid = p.oid
               AND fdep.refclassid = 'pg_proc'::regclass
               AND fdep.refobjid <> p.oid
               AND fns.nspname NOT IN ('pg_catalog', 'information_schema')) AS dep_function_oids,
            (SELECT array_agg(tdep.refobjid::text)
             FROM pg_depend tdep
             JOIN pg_type tt ON tt.oid = tdep.refobjid
             JOIN pg_namespace tns ON tns.oid = tt.typnamespace
             WHERE tdep.classid = 'pg_proc'::regclass
               AND tdep.objid = p.oid
               AND tdep.refclassid = 'pg_type'::regclass
               AND tns.nspname NOT IN ('pg_catalog', 'information_schema')) AS dep_type_oids
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ANY($1)
       AND p.prokind IN ('f', 'p')
       ${extensionFilter(ctx, 'pg_proc', 'p.oid')}
     ORDER BY n.nspname, p.proname, p.oid`,
    [ctx.schemas]
  );
  const info = new Map<string, { elem: string; relkind: string; relid: string; attrs: string[] }>();
  let frontier: string[] = [];
  fns.forEach((fn) => frontier.push(fn.rettype, ...fn.argtypes));
  frontier = Array.from(new Set(frontier.filter((oid) => oid !== '0')));
  while (frontier.length > 0) {
    const { rows } = await ctx.client.query<{
      oid: string;
      elem: string;
      relkind: string;
      relid: string;
      attrs: string[];
    }>(
      `SELECT t.oid::text AS oid,
              t.typelem::text AS elem,
              COALESCE(c.relkind::text, '') AS relkind,
              COALESCE(c.oid::text, '') AS relid,
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
  const classify = (fn: {
    rettype: string;
    argtypes: string[];
  }): { stage: FunctionStage; excluded: boolean; relationOids: string[]; typeOids: string[] } => {
    const seen = new Set<string>();
    const stack = [fn.rettype, ...fn.argtypes];
    const relationOids: string[] = [];
    let hasTable = false;
    let hasView = false;
    let excluded = false;
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
      if (typeInfo.relid !== '') {
        relationOids.push(typeInfo.relid);
        if (ctx.exclusion.relations.has(typeInfo.relid)) {
          excluded = true;
        }
      }
      if (typeInfo.relkind === 'v' || typeInfo.relkind === 'm') {
        hasView = true;
      }
      if (['r', 'p', 'f'].includes(typeInfo.relkind)) {
        hasTable = true;
      }
      if (typeInfo.elem !== '0') {
        stack.push(typeInfo.elem);
      }
      typeInfo.attrs.forEach((attr) => stack.push(attr));
    }
    const stage: FunctionStage = hasView ? 'view' : hasTable ? 'table' : 'type';
    return { stage, excluded, relationOids, typeOids: Array.from(seen) };
  };
  const classified = fns.map((fn) => {
    const { stage, excluded, relationOids, typeOids } = classify(fn);
    return {
      oid: fn.oid,
      definition: fn.definition,
      qualified: fn.qualified,
      stage,
      excluded,
      relationOids,
      typeOids: Array.from(new Set([...typeOids, ...(fn.dep_type_oids ?? [])])),
      depFunctionOids: fn.dep_function_oids ?? [],
    };
  });
  // Argument-default expressions resolve at CREATE FUNCTION time, so a
  // function inherits the stage (and exclusion) of any function its
  // defaults call. Propagate to a fixed point.
  const byOid = new Map(classified.map((fn) => [fn.oid, fn]));
  const stageRank: Record<FunctionStage, number> = { type: 0, table: 1, view: 2 };
  const stages: FunctionStage[] = ['type', 'table', 'view'];
  let stageChanged = true;
  while (stageChanged) {
    stageChanged = false;
    classified.forEach((fn) => {
      fn.depFunctionOids.forEach((depOid) => {
        const dep = byOid.get(depOid);
        if (!dep) {
          return;
        }
        if (dep.excluded && !fn.excluded) {
          fn.excluded = true;
          stageChanged = true;
        }
        if (stageRank[dep.stage] > stageRank[fn.stage]) {
          fn.stage = stages[stageRank[dep.stage]];
          stageChanged = true;
        }
      });
    });
  }
  return classified;
};

const FUNCTION_STAGE_BANNERS: Record<FunctionStage, string> = {
  type: '-- functions',
  table: '-- table-dependent functions',
  view: '-- view-dependent functions',
};

const renderFunctionStage = (ctx: Ctx, functions: ClassifiedFunction[], stage: FunctionStage): string[] => {
  const defs = functions.filter((fn) => fn.stage === stage);
  if (defs.length === 0) {
    return [];
  }
  // Within a stage, order callees before callers (argument-default calls) so
  // dynamic diversion of a callee also diverts its callers in one pass.
  const ordered = topoSort(
    defs,
    (fn) => fn.oid,
    defs.flatMap((fn) => fn.depFunctionOids.map((dep): [string, string] => [dep, fn.oid]))
  );
  const statements: string[] = [];
  ordered.forEach((fn) => {
    const divert = (reason: string): void => {
      ctx.state.divertedFunctions.add(fn.oid);
      ctx.state.footerDiverted.push(`${reason} (not emitted): ${fn.qualified}`);
    };
    if (fn.relationOids.some((oid) => ctx.state.divertedRelations.has(oid))) {
      divert('function whose signature references a diverted relation');
      return;
    }
    if (fn.typeOids.some((oid) => ctx.state.divertedTypes.has(oid))) {
      divert('function whose signature references a diverted type');
      return;
    }
    if (fn.depFunctionOids.some((oid) => ctx.state.divertedFunctions.has(oid))) {
      divert('function whose argument defaults call a diverted function');
      return;
    }
    statements.push(`${normalizeLf(fn.definition.trim())};`);
  });
  if (statements.length === 0) {
    return [];
  }
  return [FUNCTION_STAGE_BANNERS[stage], ...statements];
};

const renderDeferredDefaults = async (
  ctx: Ctx,
  functionUnavailable: (oid: string) => boolean
): Promise<string[]> => {
  const typeUnavailable = await createTypeAvailability(ctx, [
    ...ctx.state.deferredColumnDefaults.flatMap((deferred) => deferred.typeOids),
    ...ctx.state.deferredDomainDefaults.flatMap((deferred) => deferred.typeOids),
  ]);
  const statements: string[] = [];
  const emit = (deferred: DeferredColumnDefault, kind: string): void => {
    if (deferred.ownerTypeOid && ctx.state.divertedTypes.has(deferred.ownerTypeOid)) {
      return; // owner type itself was diverted (already footer-listed)
    }
    if (deferred.typeOids.some(typeUnavailable)) {
      ctx.state.footerDiverted.push(
        `${kind} referencing an unavailable type (not emitted): ${deferred.label}`
      );
      return;
    }
    if (deferred.functionOids.some(functionUnavailable)) {
      ctx.state.footerDiverted.push(
        `${kind} calling a function unavailable in this baseline (not emitted): ${deferred.label}`
      );
      return;
    }
    statements.push(deferred.statement);
  };
  ctx.state.deferredColumnDefaults.forEach((deferred) => emit(deferred, 'column default'));
  ctx.state.deferredDomainDefaults.forEach((deferred) => emit(deferred, 'domain default'));
  if (statements.length === 0) {
    return [];
  }
  return ['-- deferred column defaults', ...statements];
};

const renderViews = async (ctx: Ctx, functionUnavailable: (oid: string) => boolean): Promise<string[]> => {
  const { rows: views } = await ctx.client.query<{
    oid: string;
    schema: string;
    name: string;
    qualified_raw: string;
    relkind: string;
    populated: boolean;
    options: string | null;
    definition: string;
  }>(
    `SELECT c.oid::text AS oid,
            quote_ident(n.nspname) AS schema,
            quote_ident(c.relname) AS name,
            format('%I.%I', n.nspname, c.relname) AS qualified_raw,
            c.relkind::text AS relkind,
            c.relispopulated AS populated,
            array_to_string(c.reloptions, ', ') AS options,
            pg_get_viewdef(c.oid, true) AS definition
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1)
       AND c.relkind IN ('v', 'm')
       ${extensionFilter(ctx, 'pg_class', 'c.oid')}
     ORDER BY n.nspname, c.relname`,
    [ctx.schemas]
  );
  if (views.length === 0) {
    return [];
  }

  const { rows: deps } = await ctx.client.query<{ view_oid: string; ref_oid: string; ref_class: string }>(
    `SELECT DISTINCT r.ev_class::text AS view_oid,
            d.refobjid::text AS ref_oid,
            d.refclassid::regclass::text AS ref_class
     FROM pg_depend d
     JOIN pg_rewrite r ON r.oid = d.objid
     WHERE d.classid = 'pg_rewrite'::regclass
       AND d.refclassid IN ('pg_class'::regclass, 'pg_proc'::regclass, 'pg_type'::regclass)
       AND r.ev_class <> d.refobjid`
  );

  const viewOids = new Set(views.map((view) => view.oid));
  const depsByView = new Map<string, Array<{ ref_oid: string; ref_class: string }>>();
  deps.forEach((dep) => {
    if (viewOids.has(dep.view_oid)) {
      depsByView.set(dep.view_oid, [...(depsByView.get(dep.view_oid) ?? []), dep]);
    }
  });
  const typeUnavailable = await createTypeAvailability(
    ctx,
    deps.filter((dep) => dep.ref_class === 'pg_type').map((dep) => dep.ref_oid)
  );

  // Divert views depending on excluded objects, transitively (FR-016).
  const diverted = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    views.forEach((view) => {
      if (diverted.has(view.oid)) {
        return;
      }
      const hit = (depsByView.get(view.oid) ?? []).some(
        (dep) =>
          (dep.ref_class === 'pg_class' &&
            (ctx.exclusion.relations.has(dep.ref_oid) ||
              ctx.state.divertedRelations.has(dep.ref_oid) ||
              diverted.has(dep.ref_oid))) ||
          (dep.ref_class === 'pg_proc' &&
            (ctx.exclusion.functions.has(dep.ref_oid) || functionUnavailable(dep.ref_oid))) ||
          (dep.ref_class === 'pg_type' && typeUnavailable(dep.ref_oid))
      );
      if (hit) {
        diverted.add(view.oid);
        ctx.state.divertedRelations.add(view.oid);
        ctx.state.footerDiverted.push(
          `view depending on excluded objects (not emitted): ${view.qualified_raw}`
        );
        changed = true;
      }
    });
  }

  const emitted = views.filter((view) => !diverted.has(view.oid));
  const edges: Array<[string, string]> = [];
  emitted.forEach((view) => {
    (depsByView.get(view.oid) ?? []).forEach((dep) => {
      if (dep.ref_class === 'pg_class' && viewOids.has(dep.ref_oid) && !diverted.has(dep.ref_oid)) {
        edges.push([dep.ref_oid, view.oid]);
      }
    });
  });

  const cleanDef = (definition: string): string => {
    const trimmed = normalizeLf(definition).trim();
    return trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
  };

  const statements = topoSort(emitted, (view) => view.oid, edges).map((view) => {
    const withOptions = view.options ? ` WITH (${view.options})` : '';
    if (view.relkind === 'v') {
      return `CREATE OR REPLACE VIEW ${view.schema}.${view.name}${withOptions} AS\n${cleanDef(view.definition)};`;
    }
    const create = ctx.ifNotExists ? 'CREATE MATERIALIZED VIEW IF NOT EXISTS' : 'CREATE MATERIALIZED VIEW';
    const noData = view.populated ? '' : '\nWITH NO DATA';
    return `${create} ${view.schema}.${view.name}${withOptions} AS\n${cleanDef(view.definition)}${noData};`;
  });

  if (statements.length === 0) {
    return [];
  }
  return ['-- views', ...statements];
};

const renderTriggers = async (ctx: Ctx): Promise<string[]> => {
  const { rows } = await ctx.client.query<{
    raw_name: string;
    table_oid: string;
    table_qualified_raw: string;
    is_constraint: boolean;
    definition: string;
  }>(
    `SELECT t.tgname AS raw_name,
            c.oid::text AS table_oid,
            format('%I.%I', n.nspname, c.relname) AS table_qualified_raw,
            (t.tgconstraint <> 0) AS is_constraint,
            pg_get_triggerdef(t.oid) AS definition
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1)
       AND NOT t.tgisinternal
       AND NOT c.relispartition
       AND c.relkind <> 'p'
       ${extensionFilter(ctx, 'pg_trigger', 't.oid')}
       ${extensionFilter(ctx, 'pg_class', 'c.oid')}
     ORDER BY n.nspname, c.relname, t.tgname`,
    [ctx.schemas]
  );
  const emittable = rows.filter((row) => !ctx.state.divertedRelations.has(row.table_oid));
  if (emittable.length === 0) {
    return [];
  }
  const statements = emittable.map((row) => {
    const definition = `${normalizeLf(row.definition.trim())};`;
    if (!ctx.ifNotExists) {
      return definition;
    }
    if (!row.is_constraint) {
      return definition.replace(/^CREATE TRIGGER /, 'CREATE OR REPLACE TRIGGER ');
    }
    // CREATE OR REPLACE is not supported for constraint triggers on any PG
    // version, so guard by existence instead.
    const inner = `IF NOT EXISTS (\n    SELECT 1 FROM pg_trigger\n    WHERE tgname = '${escapeLiteral(row.raw_name)}'\n      AND tgrelid = '${escapeLiteral(row.table_qualified_raw)}'::regclass\n  ) THEN\n    ${definition}\n  END IF;`;
    const tag = dollarTag(inner);
    return `DO ${tag} BEGIN\n  ${inner}\nEND ${tag};`;
  });
  return ['-- triggers', ...statements];
};

const renderIndexes = async (ctx: Ctx): Promise<string[]> => {
  const { rows } = await ctx.client.query<{ definition: string; table_oid: string }>(
    `SELECT pg_get_indexdef(i.indexrelid) AS definition,
            tc.oid::text AS table_oid
     FROM pg_index i
     JOIN pg_class ic ON ic.oid = i.indexrelid
     JOIN pg_class tc ON tc.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = tc.relnamespace
     WHERE n.nspname = ANY($1)
       AND tc.relkind IN ('r', 'm')
       AND NOT tc.relispartition
       AND NOT EXISTS (SELECT 1 FROM pg_constraint bc WHERE bc.conindid = i.indexrelid)
       ${extensionFilter(ctx, 'pg_class', 'ic.oid')}
       ${extensionFilter(ctx, 'pg_class', 'tc.oid')}
     ORDER BY pg_get_indexdef(i.indexrelid)`,
    [ctx.schemas]
  );
  const emittable = rows.filter((row) => !ctx.state.divertedRelations.has(row.table_oid));
  if (emittable.length === 0) {
    return [];
  }
  const statements = emittable.map((row) => {
    let definition = normalizeLf(row.definition.trim());
    if (ctx.ifNotExists) {
      definition = definition
        .replace(/^CREATE UNIQUE INDEX /, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
        .replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ');
    }
    return `${definition};`;
  });
  return ['-- indexes', ...statements];
};

const renderFooter = async (ctx: Ctx): Promise<string[]> => {
  const { rows: partitions } = await ctx.client.query<{ parent: string; leaves: string[] }>(
    `SELECT format('%I.%I', pn.nspname, pc.relname) AS parent,
            COALESCE(array_agg(format('%I.%I', ln.nspname, lc.relname) ORDER BY lc.relname)
              FILTER (WHERE lc.oid IS NOT NULL), ARRAY[]::text[]) AS leaves
     FROM pg_class pc
     JOIN pg_namespace pn ON pn.oid = pc.relnamespace
     LEFT JOIN pg_inherits i ON i.inhparent = pc.oid
     LEFT JOIN pg_class lc ON lc.oid = i.inhrelid
     LEFT JOIN pg_namespace ln ON ln.oid = lc.relnamespace
     WHERE pn.nspname = ANY($1) AND pc.relkind = 'p'
     GROUP BY pn.nspname, pc.relname
     ORDER BY 1`,
    [ctx.schemas]
  );
  const { rows: aggregates } = await ctx.client.query<{ qualified: string }>(
    `SELECT format('%I.%I', n.nspname, p.proname) AS qualified
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = ANY($1) AND p.prokind IN ('a', 'w')
       ${extensionFilter(ctx, 'pg_proc', 'p.oid')}
     ORDER BY 1`,
    [ctx.schemas]
  );
  const { rows: variants } = await ctx.client.query<{ qualified: string; variants: string[] }>(
    `SELECT format('%I.%I', n.nspname, c.relname) AS qualified,
            array_remove(ARRAY[
              CASE WHEN c.reloftype <> 0 THEN 'typed table' END,
              CASE WHEN EXISTS (SELECT 1 FROM pg_inherits inh WHERE inh.inhrelid = c.oid) THEN 'inheritance child' END,
              CASE WHEN c.relam <> 0 AND c.relam <> (SELECT am.oid FROM pg_am am WHERE am.amname = 'heap') THEN 'non-default access method' END,
              CASE WHEN c.reltablespace <> 0 THEN 'non-default tablespace' END,
              CASE WHEN c.reloptions IS NOT NULL AND c.relkind = 'r' THEN 'storage parameters' END,
              CASE WHEN c.relreplident <> 'd' THEN 'non-default replica identity' END
            ], NULL) AS variants
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ANY($1)
       AND c.relkind IN ('r', 'm')
       AND NOT c.relispartition
       ${extensionFilter(ctx, 'pg_class', 'c.oid')}
     ORDER BY 1`,
    [ctx.schemas]
  );
  const lines: string[] = [];
  const unsupported = [
    ...partitions.map(
      (row) =>
        `partitioned table hierarchy: ${row.parent}${row.leaves.length > 0 ? ` (leaves: ${row.leaves.join(', ')})` : ''}`
    ),
    ...aggregates.map((row) => `aggregate/window function: ${row.qualified}`),
    ...variants
      .filter((row) => row.variants.length > 0)
      .map((row) => `table variant not reproduced (${row.variants.join(', ')}): ${row.qualified}`),
    ...ctx.state.footerDiverted,
  ];
  if (unsupported.length > 0) {
    lines.push('-- not included in this baseline (v1 limitations):');
    unsupported.forEach((entry) => lines.push(`--   ${commentSafe(entry)}`));
  }
  if (ctx.state.externalRefs.length > 0) {
    lines.push('-- references outside the selected schemas (must pre-exist before applying):');
    ctx.state.externalRefs.forEach((entry) => lines.push(`--   ${commentSafe(entry)}`));
  }
  return lines;
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
        divertedRelations: new Set(),
        divertedTypes: new Set(),
        divertedFunctions: new Set(),
        deferredDomainDefaults: [],
        deferredDomainConstraints: [],
        footerDiverted: [],
        externalRefs: [],
      },
      exclusion: { relations: new Map(), rowtypes: new Map(), functions: new Map() },
    };
    // Consistent catalog snapshot + fully schema-qualified deparse output
    // (pg_get_*/format_type omit qualification for schemas on search_path).
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL search_path TO ''`);
    ctx.exclusion = await computeExclusion(ctx);
    const header = [
      '-- supalite db pull baseline',
      `-- generated at: ${new Date().toISOString()}`,
      `-- schemas: ${commentSafe(schemas.join(', '))}`,
      '',
      'SET check_function_bodies = off;',
    ];
    if ((await countObjects(ctx)) === 0) {
      console.warn(`Warning: no objects found in schema(s) ${schemas.join(', ')}.`);
      await client.query('COMMIT');
      return normalizeLf(`${header.join('\n')}\n`);
    }
    const functions = await classifyFunctions(ctx);
    const functionStageByOid = new Map(functions.map((fn) => [fn.oid, fn.stage]));
    const activeFunctions = functions.filter((fn) => {
      if (!fn.excluded) {
        return true;
      }
      ctx.state.footerDiverted.push(
        `function whose signature references an excluded relation (not emitted): ${fn.qualified}`
      );
      return false;
    });
    const excludedFunctionOids = new Set(
      functions.filter((fn) => fn.excluded).map((fn) => fn.oid)
    );
    const relationOidsByFn = new Map(functions.map((fn) => [fn.oid, fn.relationOids]));
    const typeOidsByFn = new Map(functions.map((fn) => [fn.oid, fn.typeOids]));
    // Lazy: divertedRelations/divertedTypes keep growing while rendering, so
    // every dependent check sees the complete picture at its own emit time.
    const functionUnavailable = (oid: string): boolean =>
      excludedFunctionOids.has(oid) ||
      functionStageByOid.get(oid) === 'view' ||
      ctx.state.divertedFunctions.has(oid) ||
      (relationOidsByFn.get(oid) ?? []).some((rel) => ctx.state.divertedRelations.has(rel)) ||
      (typeOidsByFn.get(oid) ?? []).some((typeOid) => ctx.state.divertedTypes.has(typeOid));
    const sections: string[][] = [];
    sections.push(await renderSchemas(ctx));
    sections.push(await renderExtensions(ctx));
    sections.push(await renderSequences(ctx));
    sections.push(await renderTypes(ctx));
    sections.push(renderFunctionStage(ctx, activeFunctions, 'type'));
    // Generated expressions are fixed at CREATE TABLE: of the functions WE
    // emit, only already-emitted (type-stage, not diverted) ones are usable
    // there. Functions outside the selection (extension-owned, other
    // schemas) are external prerequisites — same policy as external FKs.
    const generatedFnBlocked = (oid: string): boolean => {
      const stage = functionStageByOid.get(oid);
      if (stage === undefined) {
        return false;
      }
      return stage !== 'type' || excludedFunctionOids.has(oid) || ctx.state.divertedFunctions.has(oid);
    };
    sections.push(await renderTables(ctx, generatedFnBlocked));
    sections.push(await renderSequenceOwnership(ctx));
    sections.push(renderFunctionStage(ctx, activeFunctions, 'table'));
    sections.push(await renderDeferredDefaults(ctx, functionUnavailable));
    const constraintSections = await renderConstraints(ctx, functionUnavailable);
    sections.push(constraintSections.constraints);
    sections.push(constraintSections.foreignKeys);
    sections.push(await renderViews(ctx, functionUnavailable));
    sections.push(renderFunctionStage(ctx, activeFunctions, 'view'));
    sections.push(await renderTriggers(ctx));
    sections.push(await renderIndexes(ctx));
    sections.push(await renderFooter(ctx));
    const body = sections
      .filter((section) => section.length > 0)
      .map((section) => section.join('\n'))
      .join('\n\n');
    await client.query('COMMIT');
    return normalizeLf(`${header.join('\n')}\n${body ? `\n${body}\n` : ''}`);
  } finally {
    await client.end();
  }
};
