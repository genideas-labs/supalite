"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dumpFunctionsSql = exports.generateTypes = void 0;
const pg_1 = require("pg");
const TABLE_RELATIONSHIPS_SQL = `

-- Adapted from
-- https://github.com/PostgREST/postgrest/blob/f9f0f79fa914ac00c11fbf7f4c558e14821e67e2/src/PostgREST/SchemaCache.hs#L722
WITH
pks_uniques_cols AS (
  SELECT
    connamespace,
    conrelid,
    jsonb_agg(column_info.cols) as cols
  FROM pg_constraint
  JOIN lateral (
    SELECT array_agg(cols.attname order by cols.attnum) as cols
    FROM ( select unnest(conkey) as col) _
    JOIN pg_attribute cols on cols.attrelid = conrelid and cols.attnum = col
  ) column_info ON TRUE
  WHERE
    contype IN ('p', 'u') and
    connamespace::regnamespace::text <> 'pg_catalog'
    and connamespace::regnamespace::text = ANY($1)
  GROUP BY connamespace, conrelid
)
SELECT
  traint.conname AS foreign_key_name,
  ns1.nspname AS schema,
  tab.relname AS relation,
  column_info.cols AS columns,
  ns2.nspname AS referenced_schema,
  other.relname AS referenced_relation,
  column_info.refs AS referenced_columns,
  (column_info.cols IN (SELECT * FROM jsonb_array_elements(pks_uqs.cols))) AS is_one_to_one
FROM pg_constraint traint
JOIN LATERAL (
  SELECT
    jsonb_agg(cols.attname order by ord) AS cols,
    jsonb_agg(refs.attname order by ord) AS refs
  FROM unnest(traint.conkey, traint.confkey) WITH ORDINALITY AS _(col, ref, ord)
  JOIN pg_attribute cols ON cols.attrelid = traint.conrelid AND cols.attnum = col
  JOIN pg_attribute refs ON refs.attrelid = traint.confrelid AND refs.attnum = ref
  WHERE traint.connamespace::regnamespace::text = ANY($1)
) AS column_info ON TRUE
JOIN pg_namespace ns1 ON ns1.oid = traint.connamespace
JOIN pg_class tab ON tab.oid = traint.conrelid
JOIN pg_class other ON other.oid = traint.confrelid
JOIN pg_namespace ns2 ON ns2.oid = other.relnamespace
LEFT JOIN pks_uniques_cols pks_uqs ON pks_uqs.connamespace = traint.connamespace AND pks_uqs.conrelid = traint.conrelid
WHERE traint.contype = 'f'
AND traint.conparentid = 0
AND ns1.nspname = ANY($1)

`;
const VIEWS_KEY_DEPENDENCIES_SQL = `

-- Adapted from
-- https://github.com/PostgREST/postgrest/blob/f9f0f79fa914ac00c11fbf7f4c558e14821e67e2/src/PostgREST/SchemaCache.hs#L820
with recursive
pks_fks as (
  -- pk + fk referencing col
  select
    contype::text as contype,
    conname,
    array_length(conkey, 1) as ncol,
    conrelid as resorigtbl,
    col as resorigcol,
    ord
  from pg_constraint
  left join lateral unnest(conkey) with ordinality as _(col, ord) on true
  where contype IN ('p', 'f')
  union
  -- fk referenced col
  select
    concat(contype, '_ref') as contype,
    conname,
    array_length(confkey, 1) as ncol,
    confrelid,
    col,
    ord
  from pg_constraint
  left join lateral unnest(confkey) with ordinality as _(col, ord) on true
  where contype='f'
  and connamespace::regnamespace::text = ANY($1)
),
views as (
  select
    c.oid       as view_id,
    n.nspname   as view_schema,
    c.relname   as view_name,
    r.ev_action as view_definition
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_rewrite r on r.ev_class = c.oid
  where c.relkind in ('v', 'm') 
    and n.nspname = ANY($1)
),
transform_json as (
  select
    view_id, view_schema, view_name,
    -- the following formatting is without indentation on purpose
    -- to allow simple diffs, with less whitespace noise
    replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      regexp_replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(
      replace(
        view_definition::text,
      -- This conversion to json is heavily optimized for performance.
      -- The general idea is to use as few regexp_replace() calls as possible.
      -- Simple replace() is a lot faster, so we jump through some hoops
      -- to be able to use regexp_replace() only once.
      -- This has been tested against a huge schema with 250+ different views.
      -- The unit tests do NOT reflect all possible inputs. Be careful when changing this!
      -- -----------------------------------------------
      -- pattern           | replacement         | flags
      -- -----------------------------------------------
      -- <> in pg_node_tree is the same as null in JSON, but due to very poor performance of json_typeof
      -- we need to make this an empty array here to prevent json_array_elements from throwing an error
      -- when the targetList is null.
      -- We'll need to put it first, to make the node protection below work for node lists that start with
      -- null: (<> ..., too. This is the case for coldefexprs, when the first column does not have a default value.
         '<>'              , '()'
      -- , is not part of the pg_node_tree format, but used in the regex.
      -- This removes all , that might be part of column names.
      ), ','               , ''
      -- The same applies for { and }, although those are used a lot in pg_node_tree.
      -- We remove the escaped ones, which might be part of column names again.
      ), E'\\\\{'            , ''
      ), E'\\\\}'            , ''
      -- The fields we need are formatted as json manually to protect them from the regex.
      ), ' :targetList '   , ',"targetList":'
      ), ' :resno '        , ',"resno":'
      ), ' :resorigtbl '   , ',"resorigtbl":'
      ), ' :resorigcol '   , ',"resorigcol":'
      -- Make the regex also match the node type, e.g. \`{QUERY ...\`, to remove it in one pass.
      ), '{'               , '{ :'
      -- Protect node lists, which start with \`({\` or \`((\` from the greedy regex.
      -- The extra \`{\` is removed again later.
      ), '(('              , '{(('
      ), '({'              , '{({'
      -- This regex removes all unused fields to avoid the need to format all of them correctly.
      -- This leads to a smaller json result as well.
      -- Removal stops at \`,\` for used fields (see above) and \`}\` for the end of the current node.
      -- Nesting can't be parsed correctly with a regex, so we stop at \`{\` as well and
      -- add an empty key for the followig node.
      ), ' :[^}{,]+'       , ',"":'              , 'g'
      -- For performance, the regex also added those empty keys when hitting a \`,\` or \`}\`.
      -- Those are removed next.
      ), ',"":}'           , '}'
      ), ',"":,'           , ','
      -- This reverses the "node list protection" from above.
      ), '{('              , '('
      -- Every key above has been added with a \`,\` so far. The first key in an object doesn't need it.
      ), '{,'              , '{'
      -- pg_node_tree has \`()\` around lists, but JSON uses \`[]\`
      ), '('               , '['
      ), ')'               , ']'
      -- pg_node_tree has \` \` between list items, but JSON uses \`,\`
      ), ' '             , ','
    )::json as view_definition
  from views
),
target_entries as(
  select
    view_id, view_schema, view_name,
    json_array_elements(view_definition->0->'targetList') as entry
  from transform_json
),
results as(
  select
    view_id, view_schema, view_name,
    (entry->>'resno')::int as view_column,
    (entry->>'resorigtbl')::oid as resorigtbl,
    (entry->>'resorigcol')::int as resorigcol
  from target_entries
),
-- CYCLE detection according to PG docs: https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-CYCLE
-- Can be replaced with CYCLE clause once PG v13 is EOL.
recursion(view_id, view_schema, view_name, view_column, resorigtbl, resorigcol, is_cycle, path) as(
  select
    r.*,
    false,
    ARRAY[resorigtbl]
  from results r
  where view_schema = ANY($1)
  union all
  select
    view.view_id,
    view.view_schema,
    view.view_name,
    view.view_column,
    tab.resorigtbl,
    tab.resorigcol,
    tab.resorigtbl = ANY(path),
    path || tab.resorigtbl
  from recursion view
  join results tab on view.resorigtbl=tab.view_id and view.resorigcol=tab.view_column
  where not is_cycle
),
repeated_references as(
  select
    view_id,
    view_schema,
    view_name,
    resorigtbl,
    resorigcol,
    array_agg(attname) as view_columns
  from recursion
  join pg_attribute vcol on vcol.attrelid = view_id and vcol.attnum = view_column
  group by
    view_id,
    view_schema,
    view_name,
    resorigtbl,
    resorigcol
)
select
  sch.nspname as table_schema,
  tbl.relname as table_name,
  rep.view_schema,
  rep.view_name,
  pks_fks.conname as constraint_name,
  pks_fks.contype as constraint_type,
  jsonb_agg(
    jsonb_build_object('table_column', col.attname, 'view_columns', view_columns) order by pks_fks.ord
  ) as column_dependencies
from repeated_references rep
join pks_fks using (resorigtbl, resorigcol)
join pg_class tbl on tbl.oid = rep.resorigtbl
join pg_attribute col on col.attrelid = tbl.oid and col.attnum = rep.resorigcol
join pg_namespace sch on sch.oid = tbl.relnamespace
group by sch.nspname, tbl.relname,  rep.view_schema, rep.view_name, pks_fks.conname, pks_fks.contype, pks_fks.ncol
-- make sure we only return key for which all columns are referenced in the view - no partial PKs or FKs
having ncol = array_length(array_agg(row(col.attname, view_columns) order by pks_fks.ord), 1)

`;
const createRenderStyle = (format) => ({
    format,
    quote: format === 'supabase' ? '"' : "'",
    terminator: format === 'supabase' ? '' : ';',
    trailingComma: format === 'supabase',
    arraySeparator: ', ',
});
const escapeStringLiteral = (value, quote) => value
    .replace(/\\/g, '\\\\')
    .replace(quote === '"' ? /"/g : /'/g, quote === '"' ? '\\"' : "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const buildJsonTypeDefinition = (style, includeBigint) => {
    const lines = [
        'export type Json =',
        `${pad(1)}| string`,
        `${pad(1)}| number`,
    ];
    if (includeBigint) {
        lines.push(`${pad(1)}| bigint`);
    }
    lines.push(`${pad(1)}| boolean`, `${pad(1)}| null`, `${pad(1)}| { [key: string]: Json | undefined }`, `${pad(1)}| Json[]`);
    if (style.terminator) {
        lines[lines.length - 1] += style.terminator;
    }
    return lines;
};
const STRING_TYPES = new Set([
    'character',
    'character varying',
    'varchar',
    'bpchar',
    'char',
    'text',
    'uuid',
    'date',
    'timestamp without time zone',
    'timestamp with time zone',
    'timestamp',
    'timestamptz',
    'time without time zone',
    'time with time zone',
    'time',
    'timetz',
    'interval',
    'inet',
    'cidr',
    'macaddr',
    'bytea',
    'citext',
    'vector',
]);
const DATE_TYPES = new Set([
    'date',
    'timestamp without time zone',
    'timestamp with time zone',
    'timestamp',
    'timestamptz',
]);
const NUMBER_TYPES = new Set([
    'integer',
    'smallint',
    'numeric',
    'decimal',
    'real',
    'double precision',
    'int2',
    'int4',
    'float4',
    'float8',
]);
const BIGINT_TYPES = new Set(['bigint', 'int8', 'bigserial', 'serial8']);
const BOOLEAN_TYPES = new Set(['boolean', 'bool']);
const JSON_TYPES = new Set(['json', 'jsonb']);
const isIdentifier = (value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
const splitWords = (value) => {
    const normalized = value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_\\-\\s]+/g, ' ')
        .trim();
    if (!normalized) {
        return [];
    }
    return normalized.split(' ').filter(Boolean);
};
const capitalize = (value) => value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
const applyNameCase = (value, nameCase) => {
    if (!nameCase || nameCase === 'preserve') {
        return value;
    }
    const prefix = value.match(/^_+/)?.[0] ?? '';
    const trimmed = value.slice(prefix.length);
    const words = splitWords(trimmed);
    if (words.length === 0) {
        return value;
    }
    const lower = words.map((word) => word.toLowerCase());
    let converted = '';
    switch (nameCase) {
        case 'snake':
            converted = lower.join('_');
            break;
        case 'camel':
            converted = lower[0] + lower.slice(1).map(capitalize).join('');
            break;
        case 'pascal':
            converted = lower.map(capitalize).join('');
            break;
        default:
            converted = trimmed;
    }
    return `${prefix}${converted}`;
};
const formatKey = (value, style) => isIdentifier(value) ? value : `${style.quote}${escapeStringLiteral(value, style.quote)}${style.quote}`;
const formatEnumRef = (schema, name, nameCase, style) => {
    const formatted = applyNameCase(name, nameCase);
    const schemaKey = escapeStringLiteral(schema, style.quote);
    const enumKey = escapeStringLiteral(formatted, style.quote);
    return `Database[${style.quote}${schemaKey}${style.quote}][${style.quote}Enums${style.quote}][${style.quote}${enumKey}${style.quote}]`;
};
const formatCompositeRef = (schema, name, nameCase, style) => {
    const formatted = applyNameCase(name, nameCase);
    const schemaKey = escapeStringLiteral(schema, style.quote);
    const typeKey = escapeStringLiteral(formatted, style.quote);
    return `Database[${style.quote}${schemaKey}${style.quote}][${style.quote}CompositeTypes${style.quote}][${style.quote}${typeKey}${style.quote}]`;
};
const resolveParameterName = (parameter, style) => {
    if (parameter.parameterName && parameter.parameterName.length > 0) {
        return parameter.parameterName;
    }
    return style.format === 'supabase' ? '' : `arg${parameter.ordinal}`;
};
const mapBaseType = (dataType, udtName, udtSchema, enumMap, typeOptions) => {
    const style = typeOptions?.style ?? createRenderStyle('supalite');
    const enumKey = `${udtSchema}.${udtName}`;
    if (enumMap.has(enumKey)) {
        return formatEnumRef(udtSchema, udtName, typeOptions?.typeCase, style);
    }
    if (typeOptions?.compositeTypeMap?.has(enumKey)) {
        return formatCompositeRef(udtSchema, udtName, typeOptions?.typeCase, style);
    }
    if (dataType === 'void' || udtName === 'void') {
        return 'undefined';
    }
    if (typeOptions?.dateAsDate && (DATE_TYPES.has(dataType) || DATE_TYPES.has(udtName))) {
        return 'Date';
    }
    if (JSON_TYPES.has(dataType) || JSON_TYPES.has(udtName)) {
        return 'Json';
    }
    if (BIGINT_TYPES.has(dataType) || BIGINT_TYPES.has(udtName)) {
        return typeOptions?.bigintType ?? 'bigint';
    }
    if (NUMBER_TYPES.has(dataType) || NUMBER_TYPES.has(udtName)) {
        return 'number';
    }
    if (BOOLEAN_TYPES.has(dataType) || BOOLEAN_TYPES.has(udtName)) {
        return 'boolean';
    }
    if (STRING_TYPES.has(dataType) || STRING_TYPES.has(udtName)) {
        return 'string';
    }
    return 'unknown';
};
const mapColumnType = (column, enumMap, typeOptions) => {
    if (column.data_type === 'ARRAY') {
        const baseUdt = column.udt_name.startsWith('_') ? column.udt_name.slice(1) : column.udt_name;
        const baseType = mapBaseType(baseUdt, baseUdt, column.udt_schema, enumMap, typeOptions);
        return `${baseType}[]`;
    }
    return mapBaseType(column.data_type, column.udt_name, column.udt_schema, enumMap, typeOptions);
};
const mapRoutineReturnType = (routine, enumMap, typeOptions) => {
    if (routine.dataType === 'ARRAY') {
        const baseUdt = routine.udtName?.startsWith('_') ? routine.udtName.slice(1) : routine.udtName;
        const baseType = baseUdt ? mapBaseType(baseUdt, baseUdt, routine.udtSchema, enumMap, typeOptions) : 'unknown';
        return `${baseType}[]`;
    }
    return mapBaseType(routine.dataType, routine.udtName, routine.udtSchema, enumMap, typeOptions);
};
const applyNullability = (type, isNullable) => isNullable ? `${type} | null` : type;
const isOptionalInsertColumn = (column) => column.is_nullable === 'YES' ||
    column.column_default !== null ||
    column.is_identity === 'YES';
const pad = (level) => '  '.repeat(level);
const compareNames = (left, right) => left.localeCompare(right, 'en', { numeric: true });
const renderStringArrayLiteral = (values, style) => `[${values.map((value) => `${style.quote}${escapeStringLiteral(value, style.quote)}${style.quote}`).join(style.arraySeparator)}]`;
const renderObjectLiteral = (fields, level, style, trailingComma = false) => {
    const lines = [`${pad(level)}{`];
    fields.forEach((field) => lines.push(`${pad(level + 1)}${field}${style.terminator}`));
    lines.push(`${pad(level)}}${trailingComma ? ',' : ''}`);
    return lines;
};
const renderObjectArrayProperty = (name, items, level, style) => {
    if (items.length === 0) {
        return [`${pad(level)}${name}: []${style.terminator}`];
    }
    const lines = [`${pad(level)}${name}: [`];
    items.forEach((item) => lines.push(...renderObjectLiteral(item, level + 1, style, style.trailingComma)));
    lines.push(`${pad(level)}]${style.terminator}`);
    return lines;
};
const renderRelationshipsProperty = (relationships, level, style, includeReferencedSchema) => {
    const items = relationships.map((rel) => {
        const fields = [
            `foreignKeyName: ${style.quote}${escapeStringLiteral(rel.foreignKeyName, style.quote)}${style.quote}`,
            `columns: ${renderStringArrayLiteral(rel.columns, style)}`,
        ];
        if (style.format === 'supabase') {
            fields.push(`isOneToOne: ${rel.isOneToOne ? 'true' : 'false'}`);
            fields.push(`referencedRelation: ${style.quote}${escapeStringLiteral(rel.referencedRelation, style.quote)}${style.quote}`);
            fields.push(`referencedColumns: ${renderStringArrayLiteral(rel.referencedColumns, style)}`);
            return fields;
        }
        if (includeReferencedSchema) {
            fields.push(`referencedSchema: ${style.quote}${escapeStringLiteral(rel.referencedSchema, style.quote)}${style.quote}`);
        }
        fields.push(`referencedRelation: ${style.quote}${escapeStringLiteral(rel.referencedRelation, style.quote)}${style.quote}`, `referencedColumns: ${renderStringArrayLiteral(rel.referencedColumns, style)}`, `isOneToOne: ${rel.isOneToOne ? 'true' : 'false'}`);
        return fields;
    });
    return renderObjectArrayProperty('Relationships', items, level, style);
};
const dedupeRelationships = (relationships) => {
    const seen = new Set();
    const result = [];
    relationships.forEach((rel) => {
        const key = [
            rel.foreignKeyName,
            rel.columns.join(','),
            rel.referencedRelation,
            rel.referencedColumns.join(','),
            rel.isOneToOne ? '1' : '0',
        ].join('|');
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        result.push(rel);
    });
    return result;
};
const sortRelationships = (relationships) => [...relationships].sort((a, b) => {
    const fk = compareNames(a.foreignKeyName, b.foreignKeyName);
    if (fk !== 0) {
        return fk;
    }
    const relation = compareNames(a.referencedRelation, b.referencedRelation);
    if (relation !== 0) {
        return relation;
    }
    return compareNames(a.referencedColumns.join(','), b.referencedColumns.join(','));
});
const buildViewRelationships = (tableRelationships, viewKeyDependencies) => {
    const cartesianProduct = (entries) => entries.reduce((results, values) => results.flatMap((result) => values.map((value) => result.concat(value))), [[]]);
    const expandKeyDependencyColumns = (columnDependencies) => {
        const tableColumns = columnDependencies.map((dep) => dep.table_column);
        const viewColumnSets = columnDependencies.map((dep) => (Array.isArray(dep.view_columns) ? dep.view_columns : []));
        if (viewColumnSets.some((set) => set.length === 0)) {
            return [];
        }
        return cartesianProduct(viewColumnSets).map((viewColumns) => ({ tableColumns, viewColumns }));
    };
    return tableRelationships.flatMap((relationship) => {
        const viewToTableKeyDeps = viewKeyDependencies.filter((dep) => dep.table_schema === relationship.schema &&
            dep.table_name === relationship.table &&
            dep.constraint_name === relationship.foreignKeyName &&
            dep.constraint_type === 'f');
        const tableToViewKeyDeps = viewKeyDependencies.filter((dep) => dep.table_schema === relationship.referencedSchema &&
            dep.table_name === relationship.referencedRelation &&
            dep.constraint_name === relationship.foreignKeyName &&
            dep.constraint_type === 'f_ref');
        const viewToTableRelationships = viewToTableKeyDeps.flatMap((dep) => expandKeyDependencyColumns(dep.column_dependencies).map(({ viewColumns }) => ({
            foreignKeyName: relationship.foreignKeyName,
            schema: dep.view_schema,
            table: dep.view_name,
            columns: viewColumns,
            referencedSchema: relationship.referencedSchema,
            referencedRelation: relationship.referencedRelation,
            referencedColumns: relationship.referencedColumns,
            isOneToOne: relationship.isOneToOne,
        })));
        const tableToViewRelationships = tableToViewKeyDeps.flatMap((dep) => expandKeyDependencyColumns(dep.column_dependencies).map(({ viewColumns }) => ({
            foreignKeyName: relationship.foreignKeyName,
            schema: relationship.schema,
            table: relationship.table,
            columns: relationship.columns,
            referencedSchema: dep.view_schema,
            referencedRelation: dep.view_name,
            referencedColumns: viewColumns,
            isOneToOne: relationship.isOneToOne,
        })));
        const viewToViewRelationships = viewToTableKeyDeps.flatMap((viewDep) => expandKeyDependencyColumns(viewDep.column_dependencies).flatMap(({ viewColumns }) => tableToViewKeyDeps.flatMap((tableDep) => expandKeyDependencyColumns(tableDep.column_dependencies).map(({ viewColumns: referencedViewColumns }) => ({
            foreignKeyName: relationship.foreignKeyName,
            schema: viewDep.view_schema,
            table: viewDep.view_name,
            columns: viewColumns,
            referencedSchema: tableDep.view_schema,
            referencedRelation: tableDep.view_name,
            referencedColumns: referencedViewColumns,
            isOneToOne: relationship.isOneToOne,
        })))));
        return [...viewToTableRelationships, ...tableToViewRelationships, ...viewToViewRelationships];
    });
};
const renderConstraintsProperty = (constraints, level, style) => {
    const lines = [`${pad(level)}Constraints: {`];
    if (!constraints.primaryKey) {
        lines.push(`${pad(level + 1)}primaryKey: null${style.terminator}`);
    }
    else {
        lines.push(`${pad(level + 1)}primaryKey: {`);
        lines.push(`${pad(level + 2)}name: ${style.quote}${escapeStringLiteral(constraints.primaryKey.name, style.quote)}${style.quote}${style.terminator}`);
        lines.push(`${pad(level + 2)}columns: ${renderStringArrayLiteral(constraints.primaryKey.columns, style)}${style.terminator}`);
        lines.push(`${pad(level + 1)}}${style.terminator}`);
    }
    lines.push(...renderObjectArrayProperty('unique', constraints.unique.map((item) => [
        `name: ${style.quote}${escapeStringLiteral(item.name, style.quote)}${style.quote}`,
        `columns: ${renderStringArrayLiteral(item.columns, style)}`,
    ]), level + 1, style));
    lines.push(...renderObjectArrayProperty('foreignKeys', constraints.foreignKeys.map((item) => [
        `name: ${style.quote}${escapeStringLiteral(item.name, style.quote)}${style.quote}`,
        `columns: ${renderStringArrayLiteral(item.columns, style)}`,
        `referencedSchema: ${style.quote}${escapeStringLiteral(item.referencedSchema, style.quote)}${style.quote}`,
        `referencedRelation: ${style.quote}${escapeStringLiteral(item.referencedRelation, style.quote)}${style.quote}`,
        `referencedColumns: ${renderStringArrayLiteral(item.referencedColumns, style)}`,
    ]), level + 1, style));
    lines.push(...renderObjectArrayProperty('checks', constraints.checks.map((item) => [
        `name: ${style.quote}${escapeStringLiteral(item.name, style.quote)}${style.quote}`,
        `definition: ${style.quote}${escapeStringLiteral(item.definition, style.quote)}${style.quote}`,
    ]), level + 1, style));
    lines.push(`${pad(level)}}${style.terminator}`);
    return lines;
};
const renderIndexesProperty = (indexes, level, style) => {
    const items = indexes.map((index) => [
        `name: ${style.quote}${escapeStringLiteral(index.name, style.quote)}${style.quote}`,
        `isUnique: ${index.isUnique ? 'true' : 'false'}`,
        `definition: ${style.quote}${escapeStringLiteral(index.definition, style.quote)}${style.quote}`,
    ]);
    return renderObjectArrayProperty('Indexes', items, level, style);
};
const mapAttributeType = (attribute, enumMap, typeOptions) => {
    if (attribute.data_type === 'ARRAY') {
        const baseUdt = attribute.udt_name.startsWith('_') ? attribute.udt_name.slice(1) : attribute.udt_name;
        const baseType = mapBaseType(baseUdt, baseUdt, attribute.udt_schema, enumMap, typeOptions);
        return `${baseType}[]`;
    }
    return mapBaseType(attribute.data_type, attribute.udt_name, attribute.udt_schema, enumMap, typeOptions);
};
const renderCompositeTypes = (compositeTypes, enumMap, typeOptions) => {
    const style = typeOptions?.style ?? createRenderStyle('supalite');
    const lines = [];
    compositeTypes.forEach((composite) => {
        const name = applyNameCase(composite.name, typeOptions?.typeCase);
        lines.push(`${pad(3)}${formatKey(name, style)}: {`);
        composite.attributes.forEach((attribute) => {
            const tsType = mapAttributeType(attribute, enumMap, typeOptions);
            const withNull = applyNullability(tsType, attribute.is_nullable === 'YES');
            lines.push(`${pad(4)}${formatKey(attribute.attribute_name, style)}: ${withNull}${style.terminator}`);
        });
        lines.push(`${pad(3)}}${style.terminator}`);
    });
    return lines;
};
const renderInlineObjectType = (fields, style, trailingSemicolon, emptyType) => {
    if (fields.length === 0) {
        return emptyType;
    }
    const joined = fields.join('; ');
    const suffix = trailingSemicolon ? ';' : '';
    return `{ ${joined}${suffix} }`;
};
const wrapTypeForUnion = (value, style) => {
    if (style.format === 'supabase') {
        return value;
    }
    return value.includes('{') || value.includes('|') ? `(${value})` : value;
};
const buildUnionType = (types, emptyType, style) => {
    const unique = Array.from(new Set(types));
    if (unique.length === 0) {
        return emptyType;
    }
    if (unique.length === 1) {
        return unique[0];
    }
    return unique.map((value) => wrapTypeForUnion(value, style)).join(' | ');
};
const wrapArrayType = (value, style) => `${wrapTypeForUnion(value, style)}[]`;
const mapParameterType = (parameter, enumMap, typeOptions) => {
    if (parameter.dataType === 'ARRAY') {
        const baseUdt = parameter.udtName.startsWith('_') ? parameter.udtName.slice(1) : parameter.udtName;
        const baseType = mapBaseType(baseUdt, baseUdt, parameter.udtSchema, enumMap, typeOptions);
        return `${baseType}[]`;
    }
    return mapBaseType(parameter.dataType, parameter.udtName, parameter.udtSchema, enumMap, typeOptions);
};
const buildArgsType = (parameters, enumMap, typeOptions) => {
    const style = typeOptions?.style ?? createRenderStyle('supalite');
    if (parameters.length === 0) {
        return { inline: style.format === 'supabase' ? 'Record<PropertyKey, never>' : 'Record<string, never>' };
    }
    const fields = parameters.map((param) => {
        const name = resolveParameterName(param, style);
        const tsType = mapParameterType(param, enumMap, typeOptions);
        const optional = param.hasDefault;
        return `${formatKey(name, style)}${optional ? '?:' : ':'} ${tsType}`;
    });
    const inline = renderInlineObjectType(fields, style, style.format === 'supalite', style.format === 'supabase' ? 'Record<PropertyKey, never>' : 'Record<string, never>');
    return { inline, fields };
};
const buildReturnsType = (outParams, routine, enumMap, typeOptions) => {
    const style = typeOptions?.style ?? createRenderStyle('supalite');
    if (outParams.length > 0) {
        const fields = outParams.map((param) => {
            const name = resolveParameterName(param, style);
            const tsType = mapParameterType(param, enumMap, typeOptions);
            return `${formatKey(name, style)}: ${tsType}`;
        });
        const objectType = renderInlineObjectType(fields, style, style.format === 'supalite', 'Record<string, never>');
        const inline = routine.returnsSet ? wrapArrayType(objectType, style) : objectType;
        return { inline, fields };
    }
    if (routine.udtName && routine.udtSchema) {
        const tableKey = `${routine.udtSchema}.${routine.udtName}`;
        const tableColumns = typeOptions?.tableColumnsByKey?.get(tableKey) ?? [];
        if (tableColumns.length > 0) {
            const columnFields = renderColumns(tableColumns, enumMap, {
                optionalMode: 'never',
                includeNull: true,
                typeOptions,
            });
            const fields = style.terminator
                ? columnFields.map((field) => field.endsWith(style.terminator) ? field.slice(0, -style.terminator.length) : field)
                : columnFields;
            const objectType = renderInlineObjectType(fields, style, style.format === 'supalite', style.format === 'supabase' ? 'never' : 'Record<string, never>');
            const inline = routine.returnsSet ? wrapArrayType(objectType, style) : objectType;
            return { inline, fields };
        }
    }
    const baseType = mapRoutineReturnType(routine, enumMap, typeOptions);
    const inline = routine.returnsSet ? wrapArrayType(baseType === 'unknown' ? 'unknown' : baseType, style) : baseType;
    return { inline };
};
const renderColumns = (columns, enumMap, options) => {
    const lines = [];
    const style = options.typeOptions?.style ?? createRenderStyle('supalite');
    columns.forEach((column) => {
        let tsType = mapColumnType(column, enumMap, options.typeOptions);
        if (options.optionalMode !== 'never' && column.identity_generation === 'ALWAYS') {
            tsType = 'never';
        }
        if (options.nonUpdatableToNever && column.is_updatable === 'NO') {
            tsType = 'never';
        }
        const withNull = tsType === 'never' || !options.includeNull ? tsType : applyNullability(tsType, column.is_nullable === 'YES');
        const isOptional = options.optionalMode === 'always'
            ? true
            : options.optionalMode === 'insert'
                ? isOptionalInsertColumn(column)
                : false;
        const key = formatKey(column.column_name, style);
        const optional = options.forceOptional || tsType === 'never' ? true : isOptional;
        lines.push(`${key}${optional ? '?:' : ':'} ${withNull}${style.terminator}`);
    });
    return lines;
};
const renderEnum = (enumInfo, indentLevel, typeOptions) => {
    const style = typeOptions?.style ?? createRenderStyle('supalite');
    const normalizedValues = normalizeEnumValues(enumInfo.values);
    const name = applyNameCase(enumInfo.name, typeOptions?.typeCase);
    const key = formatKey(name, style);
    const prefix = pad(indentLevel);
    if (style.format === 'supabase' && normalizedValues.length > 2) {
        const lines = [`${prefix}${key}:`];
        normalizedValues.forEach((value) => {
            lines.push(`${pad(indentLevel + 1)}| ${style.quote}${escapeStringLiteral(value, style.quote)}${style.quote}`);
        });
        return lines;
    }
    const values = normalizedValues
        .map((value) => `${style.quote}${escapeStringLiteral(value, style.quote)}${style.quote}`)
        .join(' | ') || 'never';
    return [`${prefix}${key}: ${values}${style.terminator}`];
};
const normalizeEnumValues = (values) => {
    if (Array.isArray(values)) {
        return values;
    }
    if (!values) {
        return [];
    }
    return parseArrayLiteral(values);
};
const parseArrayLiteral = (literal) => {
    if (!literal.startsWith('{') || !literal.endsWith('}')) {
        return [literal];
    }
    const content = literal.slice(1, -1);
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i += 1) {
        const char = content[i];
        if (inQuotes) {
            if (char === '"') {
                if (content[i + 1] === '"') {
                    current += '"';
                    i += 1;
                    continue;
                }
                inQuotes = false;
                continue;
            }
            if (char === '\\') {
                current += content[i + 1] ?? '';
                i += 1;
                continue;
            }
            current += char;
            continue;
        }
        if (char === '"') {
            inQuotes = true;
            continue;
        }
        if (char === ',') {
            result.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    result.push(current);
    return result;
};
const renderFunctions = (functions, functionSignatureMap, style, functionCase, indentLevel) => {
    const lines = [];
    const base = pad(indentLevel);
    const child = pad(indentLevel + 1);
    const grandchild = pad(indentLevel + 2);
    functions.forEach((fn) => {
        const name = applyNameCase(fn.name, functionCase);
        const signatures = functionSignatureMap?.get(`${fn.schema}.${fn.name}`) ?? [];
        if (style.format === 'supabase') {
            if (signatures.length > 1) {
                lines.push(`${base}${formatKey(name, style)}: {`);
                lines.push(`${child}Args:`);
                signatures.forEach((signature) => {
                    lines.push(`${grandchild}| ${signature.args.inline}`);
                });
                const returnsType = signatures[signatures.length - 1]?.returns.inline ?? (fn.returnsSet ? 'unknown[]' : 'unknown');
                lines.push(`${child}Returns: ${returnsType}`);
                lines.push(`${base}}`);
                return;
            }
            const signature = signatures[0];
            const argsType = signature?.args.inline ?? 'Record<string, unknown>';
            const returnsType = signature?.returns.inline ?? (fn.returnsSet ? 'unknown[]' : 'unknown');
            const argsFields = signature?.args.fields ?? [];
            const returnsFields = signature?.returns.fields ?? [];
            lines.push(`${base}${formatKey(name, style)}: {`);
            if (argsFields.length > 2) {
                lines.push(`${child}Args: {`);
                argsFields.forEach((field) => lines.push(`${grandchild}${field}`));
                lines.push(`${child}}`);
            }
            else {
                lines.push(`${child}Args: ${argsType}`);
            }
            if (returnsFields.length > 0) {
                lines.push(`${child}Returns: {`);
                returnsFields.forEach((field) => lines.push(`${grandchild}${field}`));
                lines.push(`${child}}${signature?.returnsSet ? '[]' : ''}`);
            }
            else {
                lines.push(`${child}Returns: ${returnsType}`);
            }
            lines.push(`${base}}`);
            return;
        }
        if (signatures.length > 0) {
            const argsTypes = signatures.map((signature) => signature.args.inline);
            const returnsTypes = signatures.map((signature) => signature.returns.inline);
            const argsType = buildUnionType(argsTypes, 'Record<string, unknown>', style);
            const returnsType = buildUnionType(returnsTypes, fn.returnsSet ? 'unknown[]' : 'unknown', style);
            const fields = [`Args: ${argsType}`, `Returns: ${returnsType}`];
            const setofOptions = signatures.length === 1 ? signatures[0].setofOptions : undefined;
            if (setofOptions) {
                const setofFields = [
                    `from: ${style.quote}${escapeStringLiteral(setofOptions.from, style.quote)}${style.quote}`,
                    `to: ${style.quote}${escapeStringLiteral(setofOptions.to, style.quote)}${style.quote}`,
                    `isOneToOne: ${setofOptions.isOneToOne ? 'true' : 'false'}`,
                    `isSetofReturn: ${setofOptions.isSetofReturn ? 'true' : 'false'}`,
                ];
                const setofType = renderInlineObjectType(setofFields, style, style.format === 'supalite', 'Record<string, never>');
                fields.push(`SetofOptions: ${setofType}`);
            }
            const inline = renderInlineObjectType(fields, style, style.format === 'supalite', 'Record<string, never>');
            lines.push(`${base}${formatKey(name, style)}: ${inline}${style.terminator}`);
            return;
        }
        const defaultFields = [
            `Args: Record<string, unknown>`,
            `Returns: ${fn.returnsSet ? 'unknown[]' : 'unknown'}`,
        ];
        const inline = renderInlineObjectType(defaultFields, style, style.format === 'supalite', 'Record<string, never>');
        lines.push(`${base}${formatKey(name, style)}: ${inline}${style.terminator}`);
    });
    return lines;
};
const renderSchemaBlock = (schema, tables, columnsByTable, enumMap, functions, typeOptions, metaOptions) => {
    const style = typeOptions?.style ?? createRenderStyle('supalite');
    const lines = [];
    lines.push(`${pad(1)}${formatKey(schema, style)}: {`);
    const schemaEnums = Array.from(enumMap.values()).filter((item) => item.schema === schema);
    const schemaFunctions = functions.filter((item) => item.schema === schema);
    const tableList = tables.filter((table) => table.type === 'BASE TABLE' && table.schema === schema);
    const viewList = tables.filter((table) => table.type === 'VIEW' && table.schema === schema);
    const orderedEnums = style.format === 'supabase' ? [...schemaEnums].sort((a, b) => compareNames(a.name, b.name)) : schemaEnums;
    const orderedFunctions = style.format === 'supabase' ? [...schemaFunctions].sort((a, b) => compareNames(a.name, b.name)) : schemaFunctions;
    const orderedTables = style.format === 'supabase' ? [...tableList].sort((a, b) => compareNames(a.name, b.name)) : tableList;
    const orderedViews = style.format === 'supabase' ? [...viewList].sort((a, b) => compareNames(a.name, b.name)) : viewList;
    lines.push(`${pad(2)}Tables: {`);
    orderedTables.forEach((table) => {
        const key = `${table.schema}.${table.name}`;
        const columns = columnsByTable.get(key) ?? [];
        const tableRelationships = metaOptions?.relationshipsByTable.get(key) ?? [];
        const orderedTableRelationships = style.format === 'supabase' ? sortRelationships(tableRelationships) : tableRelationships;
        const tableConstraints = metaOptions?.constraintsByTable.get(key) ?? {
            primaryKey: null,
            unique: [],
            foreignKeys: [],
            checks: [],
        };
        const tableIndexes = metaOptions?.indexesByTable.get(key) ?? [];
        lines.push(`${pad(3)}${formatKey(table.name, style)}: {`);
        lines.push(`${pad(4)}Row: {`);
        renderColumns(columns, enumMap, { optionalMode: 'never', includeNull: true, typeOptions }).forEach((line) => {
            lines.push(`${pad(5)}${line}`);
        });
        lines.push(`${pad(4)}}${style.terminator}`);
        lines.push(`${pad(4)}Insert: {`);
        renderColumns(columns, enumMap, { optionalMode: 'insert', includeNull: true, typeOptions }).forEach((line) => {
            lines.push(`${pad(5)}${line}`);
        });
        lines.push(`${pad(4)}}${style.terminator}`);
        lines.push(`${pad(4)}Update: {`);
        renderColumns(columns, enumMap, { optionalMode: 'always', includeNull: true, typeOptions }).forEach((line) => {
            lines.push(`${pad(5)}${line}`);
        });
        lines.push(`${pad(4)}}${style.terminator}`);
        if (metaOptions?.includeRelationships) {
            lines.push(...renderRelationshipsProperty(orderedTableRelationships, 4, style, style.format === 'supalite'));
        }
        else {
            lines.push(`${pad(4)}Relationships: ${style.format === 'supabase' ? '[]' : 'unknown[]'}${style.terminator}`);
        }
        if (metaOptions?.includeConstraints) {
            lines.push(...renderConstraintsProperty(tableConstraints, 4, style));
        }
        if (metaOptions?.includeIndexes) {
            lines.push(...renderIndexesProperty(tableIndexes, 4, style));
        }
        lines.push(`${pad(3)}}${style.terminator}`);
    });
    lines.push(`${pad(2)}}${style.terminator}`);
    lines.push(`${pad(2)}Views: {`);
    orderedViews.forEach((view) => {
        const key = `${view.schema}.${view.name}`;
        const columns = columnsByTable.get(key) ?? [];
        const viewMeta = metaOptions?.viewMap.get(key);
        const includeInsertUpdate = viewMeta?.isUpdatable;
        lines.push(`${pad(3)}${formatKey(view.name, style)}: {`);
        lines.push(`${pad(4)}Row: {`);
        renderColumns(columns, enumMap, { optionalMode: 'never', includeNull: true, typeOptions }).forEach((line) => {
            lines.push(`${pad(5)}${line}`);
        });
        lines.push(`${pad(4)}}${style.terminator}`);
        if (includeInsertUpdate) {
            lines.push(`${pad(4)}Insert: {`);
            renderColumns(columns, enumMap, {
                optionalMode: 'always',
                includeNull: true,
                typeOptions,
                nonUpdatableToNever: true,
                forceOptional: true,
            }).forEach((line) => {
                lines.push(`${pad(5)}${line}`);
            });
            lines.push(`${pad(4)}}${style.terminator}`);
            lines.push(`${pad(4)}Update: {`);
            renderColumns(columns, enumMap, {
                optionalMode: 'always',
                includeNull: true,
                typeOptions,
                nonUpdatableToNever: true,
                forceOptional: true,
            }).forEach((line) => {
                lines.push(`${pad(5)}${line}`);
            });
            lines.push(`${pad(4)}}${style.terminator}`);
        }
        if (metaOptions?.includeRelationships) {
            const viewRelationships = metaOptions?.relationshipsByTable.get(key) ?? [];
            const orderedViewRelationships = style.format === 'supabase' ? sortRelationships(viewRelationships) : viewRelationships;
            lines.push(...renderRelationshipsProperty(orderedViewRelationships, 4, style, style.format === 'supalite'));
        }
        else if (style.format === 'supabase') {
            lines.push(`${pad(4)}Relationships: []${style.terminator}`);
        }
        lines.push(`${pad(3)}}${style.terminator}`);
    });
    lines.push(`${pad(2)}}${style.terminator}`);
    lines.push(`${pad(2)}Functions: {`);
    renderFunctions(orderedFunctions, metaOptions?.functionSignatureMap, style, metaOptions?.functionCase, 3).forEach((line) => lines.push(line));
    lines.push(`${pad(2)}}${style.terminator}`);
    lines.push(`${pad(2)}Enums: {`);
    orderedEnums.forEach((enumInfo) => {
        renderEnum(enumInfo, 3, typeOptions).forEach((line) => lines.push(line));
    });
    lines.push(`${pad(2)}}${style.terminator}`);
    lines.push(`${pad(2)}CompositeTypes: {`);
    if (metaOptions?.includeCompositeTypes) {
        const composites = metaOptions.compositeTypesBySchema.get(schema) ?? [];
        const orderedComposites = style.format === 'supabase' ? [...composites].sort((a, b) => compareNames(a.name, b.name)) : composites;
        if (orderedComposites.length === 0 && (style.format === 'supabase' || style.format === 'supalite')) {
            lines.push(`${pad(3)}[_ in never]: never${style.terminator}`);
        }
        else {
            renderCompositeTypes(orderedComposites, enumMap, typeOptions).forEach((line) => lines.push(line));
        }
    }
    lines.push(`${pad(2)}}${style.terminator}`);
    lines.push(`${pad(1)}}${style.terminator}`);
    return lines;
};
const renderSupabaseHelpers = () => `
type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
`.trim().split('\n');
const renderConstants = (schemas, enumMap, typeOptions) => {
    const style = typeOptions?.style ?? createRenderStyle('supalite');
    const lines = ['export const Constants = {'];
    const lineSuffix = ',';
    schemas.forEach((schema) => {
        lines.push(`${pad(1)}${formatKey(schema, style)}: {`);
        lines.push(`${pad(2)}Enums: {`);
        const schemaEnums = Array.from(enumMap.values())
            .filter((item) => item.schema === schema)
            .sort((a, b) => compareNames(a.name, b.name));
        schemaEnums.forEach((enumInfo) => {
            const values = normalizeEnumValues(enumInfo.values);
            const name = applyNameCase(enumInfo.name, typeOptions?.typeCase);
            const key = formatKey(name, style);
            if (values.length <= 2) {
                lines.push(`${pad(3)}${key}: ${renderStringArrayLiteral(values, style)}${lineSuffix}`);
                return;
            }
            lines.push(`${pad(3)}${key}: [`);
            values.forEach((value) => {
                lines.push(`${pad(4)}${style.quote}${escapeStringLiteral(value, style.quote)}${style.quote}${lineSuffix}`);
            });
            lines.push(`${pad(3)}]${lineSuffix}`);
        });
        lines.push(`${pad(2)}}${lineSuffix}`);
        lines.push(`${pad(1)}}${lineSuffix}`);
    });
    lines.push(`} as const`);
    return lines;
};
let prettierPromise = null;
const loadPrettier = () => {
    if (!prettierPromise) {
        // Prettier is ESM-only; keep a real dynamic import in the CJS output.
        const importer = new Function('specifier', 'return import(specifier)');
        prettierPromise = importer('prettier');
    }
    return prettierPromise;
};
const formatSupabaseOutput = async (output) => {
    if (process.env.JEST_WORKER_ID) {
        return output.endsWith('\n\n') ? output : `${output}\n\n`;
    }
    const prettier = await loadPrettier();
    const formatted = await prettier.format(output, {
        parser: 'typescript',
        semi: false,
        singleQuote: false,
        trailingComma: 'es5',
        printWidth: 80,
        tabWidth: 2,
        useTabs: false,
        endOfLine: 'lf',
    });
    return formatted.endsWith('\n\n') ? formatted : `${formatted}\n`;
};
const generateTypes = async (options) => {
    const schemas = options.schemas && options.schemas.length > 0 ? options.schemas : ['public'];
    const format = options.format ?? 'supalite';
    const style = createRenderStyle(format);
    const includeRelationships = options.includeRelationships ?? true;
    const includeConstraints = options.includeConstraints ?? format === 'supalite';
    const includeIndexes = options.includeIndexes ?? format === 'supalite';
    const includeCompositeTypes = options.includeCompositeTypes ?? true;
    const includeFunctionSignatures = options.includeFunctionSignatures ?? true;
    const bigintType = options.bigintType ?? (format === 'supabase' ? 'number' : 'bigint');
    const jsonBigint = options.jsonBigint ?? format === 'supalite';
    const excludeExtensionFunctions = false;
    const typeOptions = {
        dateAsDate: options.dateAsDate,
        typeCase: options.typeCase,
        bigintType,
        style,
    };
    const client = new pg_1.Client({ connectionString: options.dbUrl });
    await client.connect();
    try {
        const { rows: tables } = await client.query(`SELECT table_schema as schema, table_name as name, table_type as type
       FROM information_schema.tables
       WHERE table_schema = ANY($1)
         AND table_type IN ('BASE TABLE', 'VIEW')
       ORDER BY table_schema, table_name`, [schemas]);
        const relationKeySet = new Set(tables.map((table) => `${table.schema}.${table.name}`));
        const viewMap = new Map();
        const { rows: viewRows } = await client.query(`SELECT table_schema AS schema,
              table_name AS name,
              is_updatable
       FROM information_schema.views
       WHERE table_schema = ANY($1)`, [schemas]);
        viewRows.forEach((row) => {
            viewMap.set(`${row.schema}.${row.name}`, {
                schema: row.schema,
                name: row.name,
                isUpdatable: row.is_updatable === 'YES',
            });
        });
        const enumRows = await client.query(`SELECT n.nspname AS schema,
              t.typname AS name,
              array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = ANY($1)
       GROUP BY n.nspname, t.typname`, [schemas]);
        const enumMap = new Map();
        enumRows.rows.forEach((row) => {
            enumMap.set(`${row.schema}.${row.name}`, row);
        });
        const functionRows = await client.query(`SELECT n.nspname AS schema,
              p.proname AS name,
              p.proretset AS "returnsSet"
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       ${excludeExtensionFunctions ? 'LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = \'e\'' : ''}
       ${excludeExtensionFunctions ? 'LEFT JOIN pg_extension e ON e.oid = d.refobjid' : ''}
       WHERE n.nspname = ANY($1)
         AND p.prokind = 'f'
         ${excludeExtensionFunctions ? 'AND e.oid IS NULL' : ''}
       ORDER BY n.nspname, p.proname`, [schemas]);
        const functionMap = new Map();
        functionRows.rows.forEach((row) => {
            const key = `${row.schema}.${row.name}`;
            const existing = functionMap.get(key);
            if (existing) {
                existing.returnsSet = existing.returnsSet || row.returnsSet;
                return;
            }
            functionMap.set(key, { ...row });
        });
        let functions = Array.from(functionMap.values());
        if (format === 'supabase') {
            functions.sort((a, b) => {
                const schema = compareNames(a.schema, b.schema);
                if (schema !== 0) {
                    return schema;
                }
                return compareNames(a.name, b.name);
            });
        }
        const columnsByTable = new Map();
        for (const table of tables) {
            const { rows: columns } = await client.query(`SELECT column_name,
                is_nullable,
                is_updatable,
                data_type,
                udt_name,
                udt_schema,
                column_default,
                is_identity,
                identity_generation
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = $2
         ORDER BY ordinal_position`, [table.schema, table.name]);
            const key = `${table.schema}.${table.name}`;
            const outputColumns = format === 'supabase' ? [...columns].sort((a, b) => compareNames(a.column_name, b.column_name)) : columns;
            columnsByTable.set(key, outputColumns);
        }
        typeOptions.tableColumnsByKey = columnsByTable;
        const compositeTypeMap = new Map();
        const compositeTypesBySchema = new Map();
        if (includeCompositeTypes) {
            const { rows: compositeRows } = await client.query(`SELECT udt_schema AS schema,
                udt_name AS composite_name,
                attribute_name,
                is_nullable,
                data_type,
                attribute_udt_name AS udt_name,
                attribute_udt_schema AS udt_schema,
                ordinal_position
         FROM information_schema.attributes
         WHERE udt_schema = ANY($1)
         ORDER BY udt_schema, udt_name, ordinal_position`, [schemas]);
            compositeRows.forEach((row) => {
                const key = `${row.schema}.${row.composite_name}`;
                const composite = compositeTypeMap.get(key) ?? {
                    schema: row.schema,
                    name: row.composite_name,
                    attributes: [],
                };
                composite.attributes.push({
                    attribute_name: row.attribute_name,
                    is_nullable: row.is_nullable,
                    data_type: row.data_type,
                    udt_name: row.udt_name,
                    udt_schema: row.udt_schema,
                });
                compositeTypeMap.set(key, composite);
            });
            compositeTypeMap.forEach((composite) => {
                const list = compositeTypesBySchema.get(composite.schema) ?? [];
                list.push(composite);
                compositeTypesBySchema.set(composite.schema, list);
            });
            typeOptions.compositeTypeMap = compositeTypeMap;
        }
        const relationshipsByTable = new Map();
        const constraintsByTable = new Map();
        const indexesByTable = new Map();
        let functionSignatureMap;
        const suppressedFunctions = new Set();
        const ensureConstraints = (key) => {
            const existing = constraintsByTable.get(key);
            if (existing) {
                return existing;
            }
            const created = { primaryKey: null, unique: [], foreignKeys: [], checks: [] };
            constraintsByTable.set(key, created);
            return created;
        };
        let tableRelationships = [];
        if (includeRelationships || includeConstraints) {
            const { rows: relationshipRows } = await client.query(TABLE_RELATIONSHIPS_SQL, [schemas]);
            tableRelationships = relationshipRows.map((row) => ({
                schema: row.schema,
                table: row.relation,
                foreignKeyName: row.foreign_key_name,
                columns: row.columns,
                referencedSchema: row.referenced_schema,
                referencedRelation: row.referenced_relation,
                referencedColumns: row.referenced_columns,
                isOneToOne: row.is_one_to_one,
            }));
            if (includeRelationships) {
                tableRelationships.forEach((relationship) => {
                    const tableKey = `${relationship.schema}.${relationship.table}`;
                    const existing = relationshipsByTable.get(tableKey) ?? [];
                    existing.push(relationship);
                    relationshipsByTable.set(tableKey, existing);
                });
            }
        }
        if (includeConstraints) {
            const { rows: uniqueRows } = await client.query(`SELECT tc.table_schema AS schema,
                tc.table_name AS table,
                tc.constraint_name AS name,
                tc.constraint_type AS type,
                kcu.column_name AS column_name,
                kcu.ordinal_position AS position
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         WHERE tc.table_schema = ANY($1)
           AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
         ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position`, [schemas]);
            const constraintGroup = new Map();
            uniqueRows.forEach((row) => {
                const key = `${row.schema}.${row.table}.${row.name}`;
                const group = constraintGroup.get(key) ?? {
                    schema: row.schema,
                    table: row.table,
                    name: row.name,
                    type: row.type,
                    columns: [],
                };
                group.columns.push({ name: row.column_name, position: row.position });
                constraintGroup.set(key, group);
            });
            constraintGroup.forEach((group) => {
                const tableKey = `${group.schema}.${group.table}`;
                const columns = group.columns.sort((a, b) => a.position - b.position).map((col) => col.name);
                const entry = { name: group.name, columns };
                if (group.type === 'PRIMARY KEY') {
                    ensureConstraints(tableKey).primaryKey = entry;
                }
                else {
                    ensureConstraints(tableKey).unique.push(entry);
                }
            });
            tableRelationships.forEach((relationship) => {
                const tableKey = `${relationship.schema}.${relationship.table}`;
                ensureConstraints(tableKey).foreignKeys.push({
                    name: relationship.foreignKeyName,
                    columns: relationship.columns,
                    referencedSchema: relationship.referencedSchema,
                    referencedRelation: relationship.referencedRelation,
                    referencedColumns: relationship.referencedColumns,
                });
            });
            const { rows: checkRows } = await client.query(`SELECT n.nspname AS schema,
                t.relname AS table,
                c.conname AS name,
                pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE c.contype = 'c'
           AND n.nspname = ANY($1)
         ORDER BY n.nspname, t.relname, c.conname`, [schemas]);
            checkRows.forEach((row) => {
                const tableKey = `${row.schema}.${row.table}`;
                ensureConstraints(tableKey).checks.push({ name: row.name, definition: row.definition });
            });
        }
        if (includeRelationships) {
            const { rows: viewKeyDeps } = await client.query(VIEWS_KEY_DEPENDENCIES_SQL, [schemas]);
            const viewRelationships = buildViewRelationships(tableRelationships, viewKeyDeps);
            viewRelationships.forEach((relationship) => {
                const tableKey = `${relationship.schema}.${relationship.table}`;
                const existing = relationshipsByTable.get(tableKey) ?? [];
                existing.push(relationship);
                relationshipsByTable.set(tableKey, existing);
            });
            relationshipsByTable.forEach((relations, key) => {
                relationshipsByTable.set(key, dedupeRelationships(relations));
            });
        }
        if (includeIndexes) {
            const { rows: indexRows } = await client.query(`SELECT n.nspname AS schema,
                t.relname AS table,
                i.relname AS name,
                ix.indisunique AS "isUnique",
                pg_get_indexdef(ix.indexrelid) AS definition
         FROM pg_class t
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_index ix ON t.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         WHERE n.nspname = ANY($1)
           AND t.relkind = 'r'
         ORDER BY n.nspname, t.relname, i.relname`, [schemas]);
            indexRows.forEach((row) => {
                const tableKey = `${row.schema}.${row.table}`;
                const existing = indexesByTable.get(tableKey) ?? [];
                existing.push(row);
                indexesByTable.set(tableKey, existing);
            });
        }
        if (includeFunctionSignatures) {
            const { rows: routineRows } = await client.query(`SELECT r.routine_schema AS schema,
                r.routine_name AS name,
                r.specific_name AS "specificName",
                r.data_type AS "dataType",
                COALESCE(pt.typname, r.udt_name) AS "udtName",
                COALESCE(pn.nspname, r.udt_schema) AS "udtSchema",
                COALESCE(p.proretset, false) AS "returnsSet"
         FROM information_schema.routines r
         LEFT JOIN pg_proc p
           ON p.oid = substring(r.specific_name from '([0-9]+)$')::oid
         LEFT JOIN pg_type pt
           ON pt.oid = p.prorettype
         LEFT JOIN pg_namespace pn
           ON pn.oid = pt.typnamespace
         ${excludeExtensionFunctions ? 'LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = \'e\'' : ''}
         ${excludeExtensionFunctions ? 'LEFT JOIN pg_extension e ON e.oid = d.refobjid' : ''}
         WHERE r.routine_schema = ANY($1)
           AND r.routine_type = 'FUNCTION'
           ${excludeExtensionFunctions ? 'AND e.oid IS NULL' : ''}
         ORDER BY r.routine_schema, r.routine_name, r.specific_name`, [schemas]);
            const { rows: parameterRows } = await client.query(`SELECT p.specific_schema AS schema,
                p.specific_name AS "specificName",
                p.ordinal_position AS ordinal,
                p.parameter_name AS "parameterName",
                p.parameter_mode AS mode,
                p.data_type AS "dataType",
                p.udt_name AS "udtName",
                p.udt_schema AS "udtSchema",
                p.parameter_default IS NOT NULL AS "hasDefault"
         FROM information_schema.parameters p
         WHERE p.specific_schema = ANY($1)
         ORDER BY p.specific_schema, p.specific_name, p.ordinal_position`, [schemas]);
            const routineSpecificNames = new Set(routineRows.map((row) => row.specificName));
            const paramsBySpecific = new Map();
            parameterRows.forEach((row) => {
                if (!routineSpecificNames.has(row.specificName)) {
                    return;
                }
                const list = paramsBySpecific.get(row.specificName) ?? [];
                list.push(row);
                paramsBySpecific.set(row.specificName, list);
            });
            const grouped = new Map();
            routineRows.forEach((routine) => {
                const key = `${routine.schema}.${routine.name}`;
                if (format === 'supabase' && suppressedFunctions.has(key)) {
                    return;
                }
                if (format === 'supabase' &&
                    (routine.dataType === 'trigger' || routine.dataType === 'event_trigger')) {
                    grouped.delete(key);
                    suppressedFunctions.add(key);
                    return;
                }
                const params = (paramsBySpecific.get(routine.specificName) ?? []).sort((a, b) => a.ordinal - b.ordinal);
                const argParams = params.filter((param) => {
                    const mode = (param.mode ?? 'IN').toUpperCase();
                    return mode === 'IN' || mode === 'INOUT' || mode === 'VARIADIC';
                });
                const outParams = params.filter((param) => {
                    const mode = (param.mode ?? 'IN').toUpperCase();
                    return mode === 'OUT' || mode === 'INOUT';
                });
                if (format === 'supabase' &&
                    argParams.length > 1 &&
                    argParams.every((param) => !param.parameterName || param.parameterName.length === 0)) {
                    grouped.delete(key);
                    suppressedFunctions.add(key);
                    return;
                }
                const argsType = buildArgsType(argParams, enumMap, typeOptions);
                const returnsType = buildReturnsType(outParams, routine, enumMap, typeOptions);
                const setofOptions = routine.returnsSet && relationKeySet.has(`${routine.schema}.${routine.udtName}`)
                    ? {
                        from: '*',
                        to: routine.udtName,
                        isOneToOne: false,
                        isSetofReturn: true,
                    }
                    : undefined;
                const entry = grouped.get(key) ?? [];
                entry.push({ args: argsType, returns: returnsType, returnsSet: routine.returnsSet, setofOptions });
                grouped.set(key, entry);
            });
            functionSignatureMap = new Map(grouped);
        }
        if (format === 'supabase' && suppressedFunctions.size > 0) {
            functions = functions.filter((fn) => !suppressedFunctions.has(`${fn.schema}.${fn.name}`));
        }
        const lines = [];
        lines.push(...buildJsonTypeDefinition(style, jsonBigint));
        lines.push('');
        lines.push('export type Database = {');
        schemas.forEach((schema) => {
            lines.push(...renderSchemaBlock(schema, tables, columnsByTable, enumMap, functions, typeOptions, {
                includeRelationships,
                includeConstraints,
                includeIndexes,
                includeCompositeTypes,
                relationshipsByTable,
                constraintsByTable,
                indexesByTable,
                compositeTypesBySchema,
                functionSignatureMap,
                functionCase: options.functionCase,
                viewMap,
            }));
        });
        lines.push(`}${style.terminator}`);
        lines.push('');
        lines.push(...renderSupabaseHelpers());
        lines.push('');
        lines.push(...renderConstants(schemas, enumMap, typeOptions));
        const output = lines.join('\n');
        return style.format === 'supabase' ? await formatSupabaseOutput(output) : output;
    }
    finally {
        await client.end();
    }
};
exports.generateTypes = generateTypes;
const dumpFunctionsSql = async (options) => {
    const schemas = options.schemas && options.schemas.length > 0 ? options.schemas : ['public'];
    const includeProcedures = options.includeProcedures ?? true;
    const kinds = includeProcedures ? ['f', 'p'] : ['f'];
    const client = new pg_1.Client({ connectionString: options.dbUrl });
    await client.connect();
    try {
        const { rows } = await client.query(`SELECT pg_get_functiondef(p.oid) AS definition
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = ANY($1)
         AND p.prokind = ANY($2)
       ORDER BY n.nspname, p.proname, p.oid`, [schemas, kinds]);
        const definitions = rows
            .map((row) => row.definition.trim())
            .filter((definition) => definition.length > 0);
        if (definitions.length === 0) {
            return '';
        }
        return `${definitions.join('\n\n')}\n`;
    }
    finally {
        await client.end();
    }
};
exports.dumpFunctionsSql = dumpFunctionsSql;
