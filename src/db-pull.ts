import { Client } from 'pg';

export type DbPullOptions = {
  dbUrl: string;
  schemas?: string[];
  includeExtensionObjects?: boolean;
  ifNotExists?: boolean;
};

type Ctx = {
  client: Client;
  schemas: string[];
  filterExtensions: boolean;
  ifNotExists: boolean;
};

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
    const body = sections
      .filter((section) => section.length > 0)
      .map((section) => section.join('\n'))
      .join('\n\n');
    return normalizeLf(`${header.join('\n')}\n${body ? `\n${body}\n` : ''}`);
  } finally {
    await client.end();
  }
};
