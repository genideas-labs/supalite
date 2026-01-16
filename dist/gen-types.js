"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dumpFunctionsSql = exports.generateTypes = void 0;
const pg_1 = require("pg");
const JSON_TYPE_DEFINITION = `export type Json =
  | string
  | number
  | bigint
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];`;
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
const escapeSingleQuotes = (value) => value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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
const formatKey = (value) => (isIdentifier(value) ? value : `'${escapeSingleQuotes(value)}'`);
const formatEnumRef = (schema, name, nameCase) => {
    const formatted = applyNameCase(name, nameCase);
    return `Database['${escapeSingleQuotes(schema)}']['Enums']['${escapeSingleQuotes(formatted)}']`;
};
const mapBaseType = (dataType, udtName, udtSchema, enumMap, typeOptions) => {
    const enumKey = `${udtSchema}.${udtName}`;
    if (enumMap.has(enumKey)) {
        return formatEnumRef(udtSchema, udtName, typeOptions?.typeCase);
    }
    if (typeOptions?.compositeTypeMap?.has(enumKey)) {
        const formatted = applyNameCase(udtName, typeOptions?.typeCase);
        return `Database['${escapeSingleQuotes(udtSchema)}']['CompositeTypes']['${escapeSingleQuotes(formatted)}']`;
    }
    if (typeOptions?.dateAsDate && (DATE_TYPES.has(dataType) || DATE_TYPES.has(udtName))) {
        return 'Date';
    }
    if (JSON_TYPES.has(dataType) || JSON_TYPES.has(udtName)) {
        return 'Json';
    }
    if (BIGINT_TYPES.has(dataType) || BIGINT_TYPES.has(udtName)) {
        return 'bigint';
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
const applyNullability = (type, isNullable) => isNullable ? `${type} | null` : type;
const isOptionalInsertColumn = (column) => column.is_nullable === 'YES' ||
    column.column_default !== null ||
    column.is_identity === 'YES' ||
    column.is_generated !== 'NEVER';
const pad = (level) => '  '.repeat(level);
const renderStringArrayLiteral = (values) => `[${values.map((value) => `'${escapeSingleQuotes(value)}'`).join(', ')}]`;
const renderObjectLiteral = (fields, level, trailingComma = false) => {
    const lines = [`${pad(level)}{`];
    fields.forEach((field) => lines.push(`${pad(level + 1)}${field}`));
    lines.push(`${pad(level)}}${trailingComma ? ',' : ''}`);
    return lines;
};
const renderObjectArrayProperty = (name, items, level) => {
    if (items.length === 0) {
        return [`${pad(level)}${name}: [];`];
    }
    const lines = [`${pad(level)}${name}: [`];
    items.forEach((item) => lines.push(...renderObjectLiteral(item, level + 1, true)));
    lines.push(`${pad(level)}];`);
    return lines;
};
const renderRelationshipsProperty = (relationships, level) => {
    const items = relationships.map((rel) => [
        `foreignKeyName: '${escapeSingleQuotes(rel.foreignKeyName)}';`,
        `columns: ${renderStringArrayLiteral(rel.columns)};`,
        `referencedSchema: '${escapeSingleQuotes(rel.referencedSchema)}';`,
        `referencedRelation: '${escapeSingleQuotes(rel.referencedRelation)}';`,
        `referencedColumns: ${renderStringArrayLiteral(rel.referencedColumns)};`,
        `isOneToOne: ${rel.isOneToOne ? 'true' : 'false'};`,
    ]);
    return renderObjectArrayProperty('Relationships', items, level);
};
const renderConstraintsProperty = (constraints, level) => {
    const lines = [`${pad(level)}Constraints: {`];
    if (!constraints.primaryKey) {
        lines.push(`${pad(level + 1)}primaryKey: null;`);
    }
    else {
        lines.push(`${pad(level + 1)}primaryKey: {`);
        lines.push(`${pad(level + 2)}name: '${escapeSingleQuotes(constraints.primaryKey.name)}';`);
        lines.push(`${pad(level + 2)}columns: ${renderStringArrayLiteral(constraints.primaryKey.columns)};`);
        lines.push(`${pad(level + 1)}};`);
    }
    lines.push(...renderObjectArrayProperty('unique', constraints.unique.map((item) => [
        `name: '${escapeSingleQuotes(item.name)}';`,
        `columns: ${renderStringArrayLiteral(item.columns)};`,
    ]), level + 1));
    lines.push(...renderObjectArrayProperty('foreignKeys', constraints.foreignKeys.map((item) => [
        `name: '${escapeSingleQuotes(item.name)}';`,
        `columns: ${renderStringArrayLiteral(item.columns)};`,
        `referencedSchema: '${escapeSingleQuotes(item.referencedSchema)}';`,
        `referencedRelation: '${escapeSingleQuotes(item.referencedRelation)}';`,
        `referencedColumns: ${renderStringArrayLiteral(item.referencedColumns)};`,
    ]), level + 1));
    lines.push(...renderObjectArrayProperty('checks', constraints.checks.map((item) => [
        `name: '${escapeSingleQuotes(item.name)}';`,
        `definition: '${escapeSingleQuotes(item.definition)}';`,
    ]), level + 1));
    lines.push(`${pad(level)}};`);
    return lines;
};
const renderIndexesProperty = (indexes, level) => {
    const items = indexes.map((index) => [
        `name: '${escapeSingleQuotes(index.name)}';`,
        `isUnique: ${index.isUnique ? 'true' : 'false'};`,
        `definition: '${escapeSingleQuotes(index.definition)}';`,
    ]);
    return renderObjectArrayProperty('Indexes', items, level);
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
    const lines = [];
    compositeTypes.forEach((composite) => {
        const name = applyNameCase(composite.name, typeOptions?.typeCase);
        lines.push(`${pad(3)}${formatKey(name)}: {`);
        composite.attributes.forEach((attribute) => {
            const tsType = mapAttributeType(attribute, enumMap, typeOptions);
            const withNull = applyNullability(tsType, attribute.is_nullable === 'YES');
            lines.push(`${pad(4)}${formatKey(attribute.attribute_name)}: ${withNull};`);
        });
        lines.push(`${pad(3)}};`);
    });
    return lines;
};
const renderInlineObjectType = (fields, emptyType = 'Record<string, never>') => fields.length === 0 ? emptyType : `{ ${fields.join(' ')} }`;
const wrapTypeForUnion = (value) => value.includes('{') || value.includes('|') ? `(${value})` : value;
const buildUnionType = (types, emptyType) => {
    const unique = Array.from(new Set(types));
    if (unique.length === 0) {
        return emptyType;
    }
    if (unique.length === 1) {
        return unique[0];
    }
    return unique.map(wrapTypeForUnion).join(' | ');
};
const wrapArrayType = (value) => `${wrapTypeForUnion(value)}[]`;
const mapParameterType = (parameter, enumMap, typeOptions) => {
    if (parameter.dataType === 'ARRAY') {
        const baseUdt = parameter.udtName.startsWith('_') ? parameter.udtName.slice(1) : parameter.udtName;
        const baseType = mapBaseType(baseUdt, baseUdt, parameter.udtSchema, enumMap, typeOptions);
        return `${baseType}[]`;
    }
    return mapBaseType(parameter.dataType, parameter.udtName, parameter.udtSchema, enumMap, typeOptions);
};
const buildArgsType = (parameters, enumMap, typeOptions) => {
    const fields = parameters.map((param) => {
        const name = param.parameterName ?? `arg${param.ordinal}`;
        const tsType = mapParameterType(param, enumMap, typeOptions);
        const optional = param.hasDefault;
        return `${formatKey(name)}${optional ? '?:' : ':'} ${tsType};`;
    });
    return renderInlineObjectType(fields);
};
const buildReturnsType = (outParams, routine, enumMap, typeOptions) => {
    if (outParams.length > 0) {
        const fields = outParams.map((param) => {
            const name = param.parameterName ?? `arg${param.ordinal}`;
            const tsType = mapParameterType(param, enumMap, typeOptions);
            return `${formatKey(name)}: ${tsType};`;
        });
        const objectType = renderInlineObjectType(fields);
        return routine.returnsSet ? wrapArrayType(objectType) : objectType;
    }
    const baseType = mapBaseType(routine.dataType, routine.udtName, routine.udtSchema, enumMap, typeOptions);
    if (routine.returnsSet) {
        return wrapArrayType(baseType === 'unknown' ? 'unknown' : baseType);
    }
    return baseType;
};
const renderColumns = (columns, enumMap, options) => {
    const lines = [];
    columns.forEach((column) => {
        const tsType = mapColumnType(column, enumMap, options.typeOptions);
        const withNull = options.includeNull ? applyNullability(tsType, column.is_nullable === 'YES') : tsType;
        const isOptional = options.optionalMode === 'always'
            ? true
            : options.optionalMode === 'insert'
                ? isOptionalInsertColumn(column)
                : false;
        const key = formatKey(column.column_name);
        lines.push(`${key}${isOptional ? '?:' : ':'} ${withNull};`);
    });
    return lines;
};
const renderEnum = (enumInfo, typeOptions) => {
    const normalizedValues = normalizeEnumValues(enumInfo.values);
    const values = normalizedValues.map((value) => `'${escapeSingleQuotes(value)}'`).join(' | ') || 'never';
    const name = applyNameCase(enumInfo.name, typeOptions?.typeCase);
    return `${formatKey(name)}: ${values};`;
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
const renderFunctions = (functions, functionSignatureMap, functionCase) => functions.map((fn) => {
    const signature = functionSignatureMap?.get(`${fn.schema}.${fn.name}`);
    const argsType = signature?.argsType ?? 'Record<string, unknown>';
    const returns = signature?.returnsType ?? (fn.returnsSet ? 'unknown[]' : 'unknown');
    const name = applyNameCase(fn.name, functionCase);
    return `${formatKey(name)}: { Args: ${argsType}; Returns: ${returns}; };`;
});
const renderSchemaBlock = (schema, tables, columnsByTable, enumMap, functions, typeOptions, metaOptions) => {
    const lines = [];
    lines.push(`${pad(1)}${formatKey(schema)}: {`);
    const schemaEnums = Array.from(enumMap.values()).filter((item) => item.schema === schema);
    const schemaFunctions = functions.filter((item) => item.schema === schema);
    const tableList = tables.filter((table) => table.type === 'BASE TABLE' && table.schema === schema);
    const viewList = tables.filter((table) => table.type === 'VIEW' && table.schema === schema);
    lines.push(`${pad(2)}Tables: {`);
    tableList.forEach((table) => {
        const key = `${table.schema}.${table.name}`;
        const columns = columnsByTable.get(key) ?? [];
        const tableRelationships = metaOptions?.relationshipsByTable.get(key) ?? [];
        const tableConstraints = metaOptions?.constraintsByTable.get(key) ?? {
            primaryKey: null,
            unique: [],
            foreignKeys: [],
            checks: [],
        };
        const tableIndexes = metaOptions?.indexesByTable.get(key) ?? [];
        lines.push(`${pad(3)}${formatKey(table.name)}: {`);
        lines.push(`${pad(4)}Row: {`);
        renderColumns(columns, enumMap, { optionalMode: 'never', includeNull: true, typeOptions }).forEach((line) => {
            lines.push(`${pad(5)}${line}`);
        });
        lines.push(`${pad(4)}};`);
        lines.push(`${pad(4)}Insert: {`);
        renderColumns(columns, enumMap, { optionalMode: 'insert', includeNull: true, typeOptions }).forEach((line) => {
            lines.push(`${pad(5)}${line}`);
        });
        lines.push(`${pad(4)}};`);
        lines.push(`${pad(4)}Update: {`);
        renderColumns(columns, enumMap, { optionalMode: 'always', includeNull: true, typeOptions }).forEach((line) => {
            lines.push(`${pad(5)}${line}`);
        });
        lines.push(`${pad(4)}};`);
        if (metaOptions?.includeRelationships) {
            lines.push(...renderRelationshipsProperty(tableRelationships, 4));
        }
        else {
            lines.push(`${pad(4)}Relationships: unknown[];`);
        }
        if (metaOptions?.includeConstraints) {
            lines.push(...renderConstraintsProperty(tableConstraints, 4));
        }
        if (metaOptions?.includeIndexes) {
            lines.push(...renderIndexesProperty(tableIndexes, 4));
        }
        lines.push(`${pad(3)}};`);
    });
    lines.push(`${pad(2)}};`);
    lines.push(`${pad(2)}Views: {`);
    viewList.forEach((view) => {
        const key = `${view.schema}.${view.name}`;
        const columns = columnsByTable.get(key) ?? [];
        lines.push(`${pad(3)}${formatKey(view.name)}: {`);
        lines.push(`${pad(4)}Row: {`);
        renderColumns(columns, enumMap, { optionalMode: 'never', includeNull: true, typeOptions }).forEach((line) => {
            lines.push(`${pad(5)}${line}`);
        });
        lines.push(`${pad(4)}};`);
        lines.push(`${pad(3)}};`);
    });
    lines.push(`${pad(2)}};`);
    lines.push(`${pad(2)}Functions: {`);
    renderFunctions(schemaFunctions, metaOptions?.functionSignatureMap, metaOptions?.functionCase).forEach((line) => lines.push(`${pad(3)}${line}`));
    lines.push(`${pad(2)}};`);
    lines.push(`${pad(2)}Enums: {`);
    schemaEnums.forEach((enumInfo) => lines.push(`${pad(3)}${renderEnum(enumInfo, typeOptions)}`));
    lines.push(`${pad(2)}};`);
    lines.push(`${pad(2)}CompositeTypes: {`);
    if (metaOptions?.includeCompositeTypes) {
        const composites = metaOptions.compositeTypesBySchema.get(schema) ?? [];
        renderCompositeTypes(composites, enumMap, typeOptions).forEach((line) => lines.push(line));
    }
    lines.push(`${pad(2)}};`);
    lines.push(`${pad(1)}};`);
    return lines;
};
const generateTypes = async (options) => {
    const schemas = options.schemas && options.schemas.length > 0 ? options.schemas : ['public'];
    const typeOptions = { dateAsDate: options.dateAsDate, typeCase: options.typeCase };
    const includeRelationships = options.includeRelationships ?? false;
    const includeConstraints = options.includeConstraints ?? false;
    const includeIndexes = options.includeIndexes ?? false;
    const includeCompositeTypes = options.includeCompositeTypes ?? false;
    const includeFunctionSignatures = options.includeFunctionSignatures ?? false;
    const client = new pg_1.Client({ connectionString: options.dbUrl });
    await client.connect();
    try {
        const { rows: tables } = await client.query(`SELECT table_schema as schema, table_name as name, table_type as type
       FROM information_schema.tables
       WHERE table_schema = ANY($1)
         AND table_type IN ('BASE TABLE', 'VIEW')
       ORDER BY table_schema, table_name`, [schemas]);
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
       WHERE n.nspname = ANY($1)
         AND p.prokind = 'f'
       ORDER BY n.nspname, p.proname`, [schemas]);
        const columnsByTable = new Map();
        for (const table of tables) {
            const { rows: columns } = await client.query(`SELECT column_name,
                is_nullable,
                data_type,
                udt_name,
                udt_schema,
                column_default,
                is_identity,
                is_generated
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = $2
         ORDER BY ordinal_position`, [table.schema, table.name]);
            columnsByTable.set(`${table.schema}.${table.name}`, columns);
        }
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
        const ensureConstraints = (key) => {
            const existing = constraintsByTable.get(key);
            if (existing) {
                return existing;
            }
            const created = { primaryKey: null, unique: [], foreignKeys: [], checks: [] };
            constraintsByTable.set(key, created);
            return created;
        };
        if (includeRelationships || includeConstraints) {
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
            const uniqueConstraintMap = new Map();
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
                    if (includeConstraints) {
                        ensureConstraints(tableKey).primaryKey = entry;
                    }
                }
                else {
                    if (includeConstraints) {
                        ensureConstraints(tableKey).unique.push(entry);
                    }
                    const existing = uniqueConstraintMap.get(tableKey) ?? [];
                    existing.push(entry);
                    uniqueConstraintMap.set(tableKey, existing);
                }
            });
            const { rows: fkRows } = await client.query(`SELECT tc.table_schema AS schema,
                tc.table_name AS table,
                tc.constraint_name AS name,
                kcu.column_name AS column_name,
                kcu.ordinal_position AS position,
                kcu.position_in_unique_constraint AS foreign_position,
                ccu.table_schema AS foreign_schema,
                ccu.table_name AS foreign_table,
                ccu.column_name AS foreign_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
         WHERE tc.table_schema = ANY($1)
           AND tc.constraint_type = 'FOREIGN KEY'
         ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position`, [schemas]);
            const fkGroup = new Map();
            fkRows.forEach((row) => {
                const key = `${row.schema}.${row.table}.${row.name}`;
                const group = fkGroup.get(key) ?? {
                    schema: row.schema,
                    table: row.table,
                    name: row.name,
                    foreign_schema: row.foreign_schema,
                    foreign_table: row.foreign_table,
                    columns: [],
                    foreignColumns: [],
                };
                group.columns.push({ name: row.column_name, position: row.position });
                group.foreignColumns.push({ name: row.foreign_column, position: row.foreign_position ?? row.position });
                fkGroup.set(key, group);
            });
            fkGroup.forEach((group) => {
                const tableKey = `${group.schema}.${group.table}`;
                const columns = group.columns.sort((a, b) => a.position - b.position).map((col) => col.name);
                const referencedColumns = group.foreignColumns
                    .sort((a, b) => a.position - b.position)
                    .map((col) => col.name);
                const uniqueEntries = uniqueConstraintMap.get(tableKey) ?? [];
                const isOneToOne = uniqueEntries.some((entry) => entry.columns.length === columns.length && entry.columns.every((col, idx) => col === columns[idx]));
                if (includeRelationships) {
                    const existing = relationshipsByTable.get(tableKey) ?? [];
                    existing.push({
                        schema: group.schema,
                        table: group.table,
                        foreignKeyName: group.name,
                        columns,
                        referencedSchema: group.foreign_schema,
                        referencedRelation: group.foreign_table,
                        referencedColumns,
                        isOneToOne,
                    });
                    relationshipsByTable.set(tableKey, existing);
                }
                if (includeConstraints) {
                    ensureConstraints(tableKey).foreignKeys.push({
                        name: group.name,
                        columns,
                        referencedSchema: group.foreign_schema,
                        referencedRelation: group.foreign_table,
                        referencedColumns,
                    });
                }
            });
            if (includeConstraints) {
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
         WHERE r.routine_schema = ANY($1)
           AND r.routine_type = 'FUNCTION'
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
            const paramsBySpecific = new Map();
            parameterRows.forEach((row) => {
                const list = paramsBySpecific.get(row.specificName) ?? [];
                list.push(row);
                paramsBySpecific.set(row.specificName, list);
            });
            const grouped = new Map();
            routineRows.forEach((routine) => {
                const params = (paramsBySpecific.get(routine.specificName) ?? []).sort((a, b) => a.ordinal - b.ordinal);
                const argParams = params.filter((param) => {
                    const mode = (param.mode ?? 'IN').toUpperCase();
                    return mode === 'IN' || mode === 'INOUT' || mode === 'VARIADIC';
                });
                const outParams = params.filter((param) => {
                    const mode = (param.mode ?? 'IN').toUpperCase();
                    return mode === 'OUT' || mode === 'INOUT';
                });
                const argsType = buildArgsType(argParams, enumMap, typeOptions);
                const returnsType = buildReturnsType(outParams, routine, enumMap, typeOptions);
                const key = `${routine.schema}.${routine.name}`;
                const entry = grouped.get(key) ?? { argsTypes: [], returnsTypes: [] };
                entry.argsTypes.push(argsType);
                entry.returnsTypes.push(returnsType);
                grouped.set(key, entry);
            });
            functionSignatureMap = new Map();
            grouped.forEach((entry, key) => {
                functionSignatureMap?.set(key, {
                    argsType: buildUnionType(entry.argsTypes, 'Record<string, unknown>'),
                    returnsType: buildUnionType(entry.returnsTypes, 'unknown'),
                });
            });
        }
        const lines = [];
        lines.push(JSON_TYPE_DEFINITION);
        lines.push('');
        lines.push('export type Database = {');
        schemas.forEach((schema) => {
            lines.push(...renderSchemaBlock(schema, tables, columnsByTable, enumMap, functionRows.rows, typeOptions, {
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
            }));
        });
        lines.push('};');
        lines.push('');
        return lines.join('\n');
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
