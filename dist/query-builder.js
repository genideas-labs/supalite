"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryBuilder = void 0;
const errors_1 = require("./errors");
class QueryBuilder {
    constructor(pool, client, // Accept SupaLitePG instance
    table, schema = 'public', verbose = false // Accept verbose setting
    ) {
        this.pool = pool;
        this[_a] = 'QueryBuilder';
        this.selectColumns = null;
        this.selectSelection = null;
        this.whereConditions = [];
        this.joinWhereConditions = new Map();
        this.orConditions = [];
        this.orderByColumns = [];
        this.whereValues = [];
        this.singleMode = null;
        this.queryType = 'SELECT';
        this.verbose = false;
        this.client = client;
        this.table = table;
        this.schema = schema;
        this.verbose = verbose;
    }
    splitColumn(column) {
        const parts = column.split('.');
        if (parts.length > 1) {
            return { path: parts.slice(0, -1).join('.'), column: parts[parts.length - 1] };
        }
        return { column };
    }
    splitTopLevel(input) {
        const result = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < input.length; i += 1) {
            const char = input[i];
            if (char === '(') {
                depth += 1;
            }
            else if (char === ')' && depth > 0) {
                depth -= 1;
            }
            else if (char === ',' && depth === 0) {
                result.push(input.slice(start, i));
                start = i + 1;
            }
        }
        result.push(input.slice(start));
        return result.map((value) => value.trim()).filter(Boolean);
    }
    splitOrConditions(input) {
        const parts = [];
        let current = '';
        let inQuotes = false;
        let escaped = false;
        for (let i = 0; i < input.length; i += 1) {
            const char = input[i];
            if (escaped) {
                current += char;
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                current += char;
                continue;
            }
            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
                continue;
            }
            if (char === ',' && !inQuotes) {
                if (current.trim()) {
                    parts.push(current.trim());
                }
                current = '';
                continue;
            }
            current += char;
        }
        if (current.trim()) {
            parts.push(current.trim());
        }
        return parts;
    }
    splitOrCondition(condition) {
        let inQuotes = false;
        let escaped = false;
        let firstDot = -1;
        let secondDot = -1;
        for (let i = 0; i < condition.length; i += 1) {
            const char = condition[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') {
                inQuotes = !inQuotes;
                continue;
            }
            if (char === '.' && !inQuotes) {
                if (firstDot === -1) {
                    firstDot = i;
                }
                else {
                    secondDot = i;
                    break;
                }
            }
        }
        if (firstDot === -1 || secondDot === -1) {
            return null;
        }
        const field = condition.slice(0, firstDot).trim();
        const op = condition.slice(firstDot + 1, secondDot).trim();
        const value = condition.slice(secondDot + 1).trim();
        return { field, op, value };
    }
    unescapeOrValue(value) {
        return value.replace(/\\([\\\".,])/g, '$1');
    }
    parseSelection(input) {
        const tokens = this.splitTopLevel(input);
        const items = [];
        for (const token of tokens) {
            const trimmed = token.trim();
            if (!trimmed) {
                continue;
            }
            const openIndex = trimmed.indexOf('(');
            if (openIndex === -1 || !trimmed.endsWith(')')) {
                items.push({ kind: 'column', value: trimmed });
                continue;
            }
            const prefix = trimmed.slice(0, openIndex).trim();
            const inner = trimmed.slice(openIndex + 1, -1).trim();
            if (!prefix) {
                items.push({ kind: 'column', value: trimmed });
                continue;
            }
            const [tableRaw, joinTypeRaw] = prefix.split('!');
            const foreignTable = (tableRaw || '').trim();
            if (!foreignTable) {
                items.push({ kind: 'column', value: trimmed });
                continue;
            }
            const joinType = joinTypeRaw?.trim().toLowerCase() === 'inner' ? 'inner' : undefined;
            const selection = inner
                ? this.parseSelection(inner)
                : { items: [{ kind: 'column', value: '*' }] };
            const join = {
                foreignTable,
                joinType,
                selection,
            };
            items.push({ kind: 'join', join });
        }
        return { items };
    }
    quoteIdentifier(identifier) {
        if (identifier === '*')
            return '*';
        if (identifier.startsWith('"') && identifier.endsWith('"'))
            return identifier;
        return `"${identifier}"`;
    }
    quoteColumn(column) {
        if (column === '*')
            return '*';
        if (column.endsWith('.*')) {
            const table = column.slice(0, -2);
            return `${this.quoteIdentifier(table)}.*`;
        }
        return column
            .split('.')
            .map((part) => this.quoteIdentifier(part))
            .join('.');
    }
    getJoinConditions(path) {
        if (!this.joinWhereConditions.has(path)) {
            this.joinWhereConditions.set(path, []);
        }
        return this.joinWhereConditions.get(path);
    }
    collectJoinPaths(selection, prefix, target) {
        for (const item of selection.items) {
            if (item.kind !== 'join') {
                continue;
            }
            const joinPath = prefix ? `${prefix}.${item.join.foreignTable}` : item.join.foreignTable;
            target.add(joinPath);
            this.collectJoinPaths(item.join.selection, joinPath, target);
        }
    }
    async buildSelectList(schema, table, selection, pathPrefix = '') {
        const schemaTable = `"${schema}"."${table}"`;
        const joinExistenceConditions = [];
        const parts = [];
        let hasJoin = false;
        let hasColumn = false;
        for (const item of selection.items) {
            if (item.kind === 'column') {
                hasColumn = true;
                parts.push(this.quoteColumn(item.value));
                continue;
            }
            hasJoin = true;
            const join = item.join;
            const joinPath = pathPrefix ? `${pathPrefix}.${join.foreignTable}` : join.foreignTable;
            const fk = await this.client.getForeignKey(schema, table, join.foreignTable);
            if (!fk) {
                console.warn(`[SupaLite WARNING] No foreign key found from ${join.foreignTable} to ${table}`);
                continue;
            }
            const foreignSchemaTable = `"${schema}"."${join.foreignTable}"`;
            const nested = await this.buildSelectList(schema, join.foreignTable, join.selection, joinPath);
            const joinFilters = this.joinWhereConditions.get(joinPath) || [];
            const joinWhereParts = [`"${fk.foreignColumn}" = ${schemaTable}."${fk.column}"`, ...joinFilters, ...nested.joinExistenceConditions];
            const joinWhereSql = joinWhereParts.length > 0 ? ` WHERE ${joinWhereParts.join(' AND ')}` : '';
            if (join.joinType === 'inner') {
                joinExistenceConditions.push(`EXISTS (SELECT 1 FROM ${foreignSchemaTable} WHERE ${joinWhereParts.join(' AND ')})`);
            }
            if (fk.isArray) {
                parts.push(`(
          SELECT COALESCE(json_agg(j), '[]'::json)
          FROM (
            SELECT ${nested.selectClause}
            FROM ${foreignSchemaTable}${joinWhereSql}
          ) as j
        ) as "${join.foreignTable}"`);
            }
            else {
                parts.push(`(
          SELECT row_to_json(j)
          FROM (
            SELECT ${nested.selectClause}
            FROM ${foreignSchemaTable}${joinWhereSql}
            LIMIT 1
          ) as j
        ) as "${join.foreignTable}"`);
            }
        }
        if (!hasColumn && hasJoin) {
            parts.unshift(`${schemaTable}.*`);
        }
        if (hasJoin) {
            for (let i = 0; i < parts.length; i += 1) {
                if (parts[i] === '*') {
                    parts[i] = `${schemaTable}.*`;
                }
            }
        }
        if (parts.length === 0) {
            parts.push('*');
        }
        return { selectClause: parts.join(', '), joinExistenceConditions };
    }
    then(onfulfilled, onrejected) {
        return this.execute().then(onfulfilled, onrejected);
    }
    catch(onrejected) {
        return this.execute().catch(onrejected);
    }
    finally(onfinally) {
        return this.execute().finally(onfinally);
    }
    select(columns = '*', options) {
        this.countOption = options?.count;
        this.headOption = options?.head;
        if (!columns || columns === '*') {
            this.selectColumns = '*';
            this.selectSelection = { items: [{ kind: 'column', value: '*' }] };
            return this;
        }
        const selection = this.parseSelection(columns);
        this.selectSelection = selection;
        const processedColumns = selection.items
            .filter((item) => item.kind === 'column')
            .map((item) => item.value)
            .map((col) => col.trim())
            .filter(Boolean)
            .map((col) => (col === '*' ? '*' : this.quoteColumn(col)));
        this.selectColumns = processedColumns.length > 0 ? processedColumns.join(', ') : '*';
        return this;
    }
    match(conditions) {
        for (const key in conditions) {
            const { path, column } = this.splitColumn(key);
            const target = path ? this.getJoinConditions(path) : this.whereConditions;
            const quoted = path ? this.quoteIdentifier(column) : this.quoteColumn(key);
            target.push(`${quoted} = $${this.whereValues.length + 1}`);
            this.whereValues.push(conditions[key]);
        }
        return this;
    }
    eq(column, value) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} = $${this.whereValues.length + 1}`);
        this.whereValues.push(value);
        return this;
    }
    neq(column, value) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} != $${this.whereValues.length + 1}`);
        this.whereValues.push(value);
        return this;
    }
    is(column, value) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        if (value === null) {
            target.push(`${quoted} IS NULL`);
        }
        else {
            target.push(`${quoted} IS $${this.whereValues.length + 1}`);
            this.whereValues.push(value);
        }
        return this;
    }
    not(column, operator, value) {
        if (operator === 'is' && value === null) {
            const { path, column: col } = this.splitColumn(column);
            const target = path ? this.getJoinConditions(path) : this.whereConditions;
            const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
            target.push(`${quoted} IS NOT NULL`);
        }
        else {
            // 추후 다른 not 연산자들을 위해 남겨둠
            throw new Error(`Operator "${operator}" is not supported for "not" operation.`);
        }
        return this;
    }
    contains(column, value) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} @> $${this.whereValues.length + 1}`);
        this.whereValues.push(value);
        return this;
    }
    in(column, values) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        if (values.length === 0) {
            target.push('FALSE');
            return this;
        }
        const nonNullValues = values.filter((value) => value != null);
        const hasNull = nonNullValues.length !== values.length;
        if (nonNullValues.length === 0) {
            target.push(`${quoted} IS NULL`);
            return this;
        }
        const placeholders = nonNullValues
            .map((_, i) => `$${this.whereValues.length + i + 1}`)
            .join(',');
        const inClause = `${quoted} IN (${placeholders})`;
        target.push(hasNull ? `(${inClause} OR ${quoted} IS NULL)` : inClause);
        this.whereValues.push(...nonNullValues);
        return this;
    }
    gt(column, value) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} > $${this.whereValues.length + 1}`);
        this.whereValues.push(value);
        return this;
    }
    gte(column, value) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} >= $${this.whereValues.length + 1}`);
        this.whereValues.push(value);
        return this;
    }
    lt(column, value) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} < $${this.whereValues.length + 1}`);
        this.whereValues.push(value);
        return this;
    }
    lte(column, value) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} <= $${this.whereValues.length + 1}`);
        this.whereValues.push(value);
        return this;
    }
    like(column, pattern) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} LIKE $${this.whereValues.length + 1}`);
        this.whereValues.push(pattern);
        return this;
    }
    order(column, options) {
        const ascending = options?.ascending !== false; // undefined나 true면 오름차순, false만 내림차순
        let clause = `${this.quoteColumn(column)} ${ascending ? 'ASC' : 'DESC'}`;
        if (options && Object.prototype.hasOwnProperty.call(options, 'nullsFirst')) {
            clause += options.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
        }
        this.orderByColumns.push(clause);
        return this;
    }
    limit(value) {
        this.limitValue = value;
        return this;
    }
    offset(value) {
        this.offsetValue = value;
        return this;
    }
    maybeSingle() {
        this.singleMode = 'maybe';
        return this.execute();
    }
    single() {
        this.singleMode = 'strict';
        return this.execute();
    }
    ilike(column, pattern) {
        const { path, column: col } = this.splitColumn(column);
        const target = path ? this.getJoinConditions(path) : this.whereConditions;
        const quoted = path ? this.quoteIdentifier(col) : this.quoteColumn(column);
        target.push(`${quoted} ILIKE $${this.whereValues.length + 1}`);
        this.whereValues.push(pattern);
        return this;
    }
    or(conditions) {
        const orParts = this.splitOrConditions(conditions).map(condition => {
            const parsed = this.splitOrCondition(condition);
            if (!parsed) {
                return '';
            }
            const { field, op, value } = parsed;
            if (!field || !op) {
                return '';
            }
            if (field.includes('.')) {
                throw new Error('or() does not support related table filters.');
            }
            const validOperators = ['eq', 'neq', 'ilike', 'like', 'gt', 'gte', 'lt', 'lte', 'is'];
            if (!validOperators.includes(op)) {
                throw new Error(`Invalid operator: ${op}`);
            }
            let normalizedValue = value;
            if (normalizedValue.startsWith('"') && normalizedValue.endsWith('"')) {
                normalizedValue = normalizedValue.slice(1, -1);
            }
            normalizedValue = this.unescapeOrValue(normalizedValue);
            const isNullValue = normalizedValue === 'null';
            const isNowValue = typeof normalizedValue === 'string' && normalizedValue.toLowerCase() === 'now()';
            const quotedField = this.quoteColumn(field);
            const buildPlaceholderClause = (sqlOp) => {
                let processedValue = normalizedValue;
                if (isNullValue) {
                    processedValue = null;
                }
                else if (typeof normalizedValue === 'string' && !isNaN(Number(normalizedValue))) {
                    processedValue = normalizedValue;
                }
                else if (typeof normalizedValue === 'string' && normalizedValue.match(/^\d{4}-\d{2}-\d{2}/)) {
                    processedValue = normalizedValue;
                }
                this.whereValues.push(processedValue);
                const paramIndex = this.whereValues.length;
                return `${quotedField} ${sqlOp} $${paramIndex}`;
            };
            const buildClause = (sqlOp) => {
                if (isNowValue) {
                    return `${quotedField} ${sqlOp} NOW()`;
                }
                return buildPlaceholderClause(sqlOp);
            };
            switch (op) {
                case 'eq':
                    return buildClause('=');
                case 'neq':
                    return buildClause('!=');
                case 'ilike':
                    return buildClause('ILIKE');
                case 'like':
                    return buildClause('LIKE');
                case 'gt':
                    return buildClause('>');
                case 'gte':
                    return buildClause('>=');
                case 'lt':
                    return buildClause('<');
                case 'lte':
                    return buildClause('<=');
                case 'is':
                    if (isNullValue) {
                        return `${quotedField} IS NULL`;
                    }
                    return buildPlaceholderClause('IS');
                default:
                    return '';
            }
        }).filter(Boolean);
        if (orParts.length > 0) {
            this.whereConditions.push(`(${orParts.join(' OR ')})`);
        }
        return this;
    }
    returns() {
        return this;
    }
    range(from, to) {
        this.limitValue = to - from + 1;
        this.offsetValue = from;
        return this;
    }
    upsert(values, options) {
        this.queryType = 'UPSERT';
        this.insertData = values;
        this.conflictTarget = options?.onConflict;
        this.ignoreDuplicates = options?.ignoreDuplicates;
        return this;
    }
    formatConflictTarget(target) {
        if (Array.isArray(target)) {
            return target
                .map((column) => this.quoteConflictTargetColumn(column))
                .filter(Boolean)
                .join(', ');
        }
        const trimmedTarget = target.trim();
        if (!trimmedTarget) {
            return trimmedTarget;
        }
        if (trimmedTarget.includes('"') || trimmedTarget.includes('(') || trimmedTarget.includes(')')) {
            return trimmedTarget;
        }
        if (trimmedTarget.includes(',')) {
            return trimmedTarget
                .split(',')
                .map((column) => this.quoteConflictTargetColumn(column))
                .filter(Boolean)
                .join(', ');
        }
        return this.quoteConflictTargetColumn(trimmedTarget);
    }
    quoteConflictTargetColumn(column) {
        const trimmedColumn = column.trim();
        if (!trimmedColumn) {
            return trimmedColumn;
        }
        if (trimmedColumn.startsWith('"') && trimmedColumn.endsWith('"')) {
            return trimmedColumn;
        }
        return `"${trimmedColumn}"`;
    }
    shouldReturnData() {
        return this.selectColumns !== null;
    }
    stringifyJsonValue(value) {
        return JSON.stringify(value, (_key, val) => {
            if (typeof val === 'bigint') {
                return val.toString();
            }
            return val;
        });
    }
    buildWhereClause(updateValues, conditionsOverride) {
        const baseConditions = conditionsOverride ? [...conditionsOverride] : [...this.whereConditions];
        if (baseConditions.length === 0 && this.orConditions.length === 0) {
            return '';
        }
        const conditions = [...baseConditions];
        if (this.orConditions.length > 0) {
            conditions.push(this.orConditions.map(group => `(${group.join(' OR ')})`).join(' AND '));
        }
        if (updateValues) {
            return ' WHERE ' + conditions
                .map(cond => cond.replace(/\$(\d+)/g, (match, num) => `$${parseInt(num) + updateValues.length}`))
                .join(' AND ');
        }
        return ' WHERE ' + conditions.join(' AND ');
    }
    async buildQuery() {
        let query = '';
        let values = [];
        let baseQuery;
        let baseValues;
        let insertColumns = [];
        const returning = this.shouldReturnData() ? ` RETURNING ${this.selectColumns || '*'}` : '';
        const schemaTable = `"${String(this.schema)}"."${String(this.table)}"`;
        switch (this.queryType) {
            case 'SELECT': {
                const needsEstimate = this.countOption === 'planned' || this.countOption === 'estimated';
                if (this.headOption && !needsEstimate) {
                    query = `SELECT COUNT(*) FROM ${schemaTable}`;
                    query += this.buildWhereClause();
                    values = [...this.whereValues];
                    break;
                }
                const selection = this.selectSelection || { items: [{ kind: 'column', value: '*' }] };
                const joinPaths = new Set();
                this.collectJoinPaths(selection, '', joinPaths);
                for (const path of this.joinWhereConditions.keys()) {
                    if (!joinPaths.has(path)) {
                        throw new Error(`Filter on related table "${path}" requires select() to include ${path}().`);
                    }
                }
                const { selectClause, joinExistenceConditions } = await this.buildSelectList(String(this.schema), String(this.table), selection);
                baseQuery = `SELECT ${selectClause} FROM ${schemaTable}`;
                const baseConditions = [...this.whereConditions, ...joinExistenceConditions];
                baseQuery += this.buildWhereClause(undefined, baseConditions);
                baseValues = [...this.whereValues];
                values = [...this.whereValues];
                if (this.countOption === 'exact') {
                    query = `SELECT *, COUNT(*) OVER() as exact_count FROM (${baseQuery}) subquery`;
                }
                else {
                    query = baseQuery;
                }
                break;
            }
            case 'INSERT':
            case 'UPSERT': {
                if (!this.insertData)
                    throw new Error('No data provided for insert/upsert');
                if (Array.isArray(this.insertData)) {
                    const rows = this.insertData;
                    if (rows.length === 0)
                        throw new Error('Empty array provided for insert');
                    insertColumns = Object.keys(rows[0]);
                    const processedRowsValuesPromises = rows.map(async (row) => {
                        const rowValues = [];
                        for (const colName of insertColumns) { // Ensure order of values matches order of columns
                            const val = row[colName];
                            const pgType = await this.client.getColumnPgType(String(this.schema), String(this.table), colName);
                            if (typeof val === 'bigint') {
                                rowValues.push(val.toString());
                            }
                            else if ((pgType === 'json' || pgType === 'jsonb') &&
                                (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date)))) {
                                rowValues.push(this.stringifyJsonValue(val));
                            }
                            else {
                                rowValues.push(val);
                            }
                        }
                        return rowValues;
                    });
                    const processedRowsValuesArrays = await Promise.all(processedRowsValuesPromises);
                    values = processedRowsValuesArrays.flat();
                    const placeholders = rows.map((_, i) => `(${insertColumns.map((_, j) => `$${i * insertColumns.length + j + 1}`).join(',')})`).join(',');
                    query = `INSERT INTO ${schemaTable} ("${insertColumns.join('","')}") VALUES ${placeholders}`;
                }
                else {
                    const insertData = this.insertData;
                    insertColumns = Object.keys(insertData);
                    const valuePromises = insertColumns.map(async (colName) => {
                        const val = insertData[colName];
                        const pgType = await this.client.getColumnPgType(String(this.schema), String(this.table), colName);
                        if (typeof val === 'bigint') {
                            return val.toString();
                        }
                        if ((pgType === 'json' || pgType === 'jsonb') &&
                            (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date)))) {
                            return this.stringifyJsonValue(val);
                        }
                        return val;
                    });
                    values = await Promise.all(valuePromises);
                    const insertPlaceholders = values.map((_, i) => `$${i + 1}`).join(',');
                    query = `INSERT INTO ${schemaTable} ("${insertColumns.join('","')}") VALUES (${insertPlaceholders})`;
                }
                if ((this.queryType === 'UPSERT' || this.queryType === 'INSERT') && (this.conflictTarget || this.ignoreDuplicates)) {
                    const conflictTargetSQL = this.conflictTarget
                        ? this.formatConflictTarget(this.conflictTarget)
                        : '';
                    const hasTarget = Boolean(conflictTargetSQL);
                    const isUpsert = this.queryType === 'UPSERT';
                    if (!isUpsert && this.conflictTarget && !this.ignoreDuplicates) {
                        throw new Error('insert() only supports onConflict with ignoreDuplicates: true; use upsert() for updates.');
                    }
                    query += ' ON CONFLICT';
                    if (hasTarget) {
                        query += ` (${conflictTargetSQL})`;
                    }
                    if (this.ignoreDuplicates || !isUpsert) {
                        query += ' DO NOTHING';
                    }
                    else if (hasTarget) {
                        query += ' DO UPDATE SET ';
                        query += insertColumns
                            .map((col) => `"${col}" = EXCLUDED."${col}"`)
                            .join(', ');
                    }
                }
                query += returning;
                break;
            }
            case 'UPDATE': {
                if (!this.updateData)
                    throw new Error('No data provided for update');
                const updateData = { ...this.updateData };
                const now = new Date().toISOString();
                if ('modified_at' in updateData && !updateData.modified_at) {
                    updateData.modified_at = now;
                }
                if ('updated_at' in updateData && !updateData.updated_at) {
                    updateData.updated_at = now;
                }
                const updateColumns = Object.keys(updateData);
                const processedUpdateValuesPromises = updateColumns.map(async (colName) => {
                    const val = updateData[colName];
                    const pgType = await this.client.getColumnPgType(String(this.schema), String(this.table), colName);
                    if (typeof val === 'bigint') {
                        return val.toString();
                    }
                    if ((pgType === 'json' || pgType === 'jsonb') &&
                        (Array.isArray(val) || (val !== null && typeof val === 'object' && !(val instanceof Date)))) {
                        return this.stringifyJsonValue(val);
                    }
                    return val;
                });
                const processedUpdateValues = await Promise.all(processedUpdateValuesPromises);
                const setColumns = updateColumns.map((key, index) => `"${String(key)}" = $${index + 1}`);
                query = `UPDATE ${schemaTable} SET ${setColumns.join(', ')}`;
                values = [...processedUpdateValues, ...this.whereValues];
                query += this.buildWhereClause(processedUpdateValues);
                query += returning;
                break;
            }
            case 'DELETE': {
                query = `DELETE FROM ${schemaTable}`;
                values = [...this.whereValues];
                query += this.buildWhereClause();
                query += returning;
                break;
            }
        }
        // Append clauses that apply to the outermost query
        if (this.queryType === 'SELECT') {
            // WHERE is already in the query or subquery
            // ORDER BY, LIMIT, and OFFSET always apply to the outer query
            if (this.orderByColumns.length > 0) {
                query += ` ORDER BY ${this.orderByColumns.join(', ')}`;
            }
            if (this.limitValue !== undefined) {
                query += ` LIMIT ${this.limitValue}`;
            }
            if (this.offsetValue !== undefined) {
                query += ` OFFSET ${this.offsetValue}`;
            }
        }
        return { query, values, baseQuery, baseValues };
    }
    parseExplainPlanRows(planValue) {
        if (planValue == null) {
            return null;
        }
        let parsedPlan = planValue;
        if (typeof parsedPlan === 'string') {
            try {
                parsedPlan = JSON.parse(parsedPlan);
            }
            catch {
                return null;
            }
        }
        if (Array.isArray(parsedPlan)) {
            parsedPlan = parsedPlan[0];
        }
        if (!parsedPlan || typeof parsedPlan !== 'object') {
            return null;
        }
        const plan = parsedPlan.Plan ?? parsedPlan;
        const rows = plan['Plan Rows']
            ?? plan.plan_rows
            ?? plan.planRows;
        if (rows == null) {
            return null;
        }
        const count = Number(rows);
        return Number.isFinite(count) ? count : null;
    }
    async estimateCount(executor, baseQuery, baseValues) {
        if (!baseQuery) {
            return null;
        }
        try {
            const explainResult = await executor.query(`EXPLAIN (FORMAT JSON) ${baseQuery}`, baseValues ?? []);
            const row = explainResult.rows[0];
            if (!row) {
                return null;
            }
            const planValue = Object.values(row)[0];
            return this.parseExplainPlanRows(planValue);
        }
        catch (error) {
            if (this.verbose) {
                console.warn('[SupaLite VERBOSE] Failed to estimate count:', error);
            }
            return null;
        }
    }
    async execute() {
        try {
            const { query, values, baseQuery, baseValues } = await this.buildQuery(); // await buildQuery
            if (this.verbose) {
                console.log('[SupaLite VERBOSE] SQL:', query);
                console.log('[SupaLite VERBOSE] Values:', values);
            }
            const executor = this.client.getQueryClient();
            const needsEstimate = this.countOption === 'planned' || this.countOption === 'estimated';
            const result = (this.headOption && needsEstimate)
                ? { rows: [], rowCount: 0 }
                : await executor.query(query, values);
            if (this.queryType === 'DELETE' && !this.shouldReturnData()) {
                return {
                    data: [],
                    error: null,
                    count: result.rowCount,
                    status: 200,
                    statusText: 'OK',
                };
            }
            if (this.queryType === 'UPDATE' && !this.shouldReturnData()) {
                return {
                    data: [],
                    error: null,
                    count: result.rowCount,
                    status: 200,
                    statusText: 'OK',
                };
            }
            if (this.queryType === 'INSERT' && !this.shouldReturnData()) {
                return {
                    data: [],
                    error: null,
                    count: result.rowCount,
                    status: 201,
                    statusText: 'Created',
                };
            }
            let countResult = null;
            let dataResult = result.rows;
            const estimatedCount = needsEstimate
                ? await this.estimateCount(executor, baseQuery, baseValues)
                : null;
            if (this.headOption) {
                if (needsEstimate) {
                    countResult = estimatedCount ?? 0;
                }
                else {
                    countResult = Number(result.rows[0].count);
                }
                dataResult = [];
            }
            else if (this.countOption === 'exact') {
                if (result.rows.length > 0) {
                    countResult = Number(result.rows[0].exact_count);
                    // exact_count 열을 모든 데이터 객체에서 제거
                    dataResult = result.rows.map(row => {
                        const newRow = { ...row };
                        delete newRow.exact_count;
                        return newRow;
                    });
                }
                else {
                    countResult = 0;
                }
            }
            else if (needsEstimate) {
                countResult = estimatedCount ?? result.rowCount;
            }
            else {
                countResult = result.rowCount;
            }
            if (this.singleMode) {
                if (dataResult.length > 1) {
                    return {
                        data: null,
                        error: new errors_1.PostgresError('PGRST114: Multiple rows returned'),
                        count: countResult,
                        status: 406,
                        statusText: 'Not Acceptable. Expected a single row but found multiple.',
                    };
                }
                if (dataResult.length === 0) {
                    if (this.singleMode === 'strict') {
                        return {
                            data: null,
                            error: new errors_1.PostgresError('PGRST116: No rows found'),
                            count: 0,
                            status: 404,
                            statusText: 'Not Found. Expected a single row but found no rows.',
                        };
                    }
                    return {
                        data: null,
                        error: null,
                        count: 0,
                        status: 200,
                        statusText: 'OK',
                    };
                }
                return {
                    data: dataResult[0],
                    error: null,
                    count: 1,
                    status: 200,
                    statusText: 'OK',
                };
            }
            return {
                data: dataResult,
                error: null,
                count: countResult,
                status: 200,
                statusText: 'OK',
            };
        }
        catch (err) {
            if (this.verbose) {
                console.error('[SupaLite VERBOSE] Error:', err);
            }
            return {
                data: [],
                error: new errors_1.PostgresError(err.message),
                count: null,
                status: 500,
                statusText: 'Internal Server Error',
            };
        }
    }
    insert(data, options) {
        this.queryType = 'INSERT';
        this.insertData = data;
        this.conflictTarget = options?.onConflict;
        this.ignoreDuplicates = options?.ignoreDuplicates;
        return this;
    }
    update(data) {
        this.queryType = 'UPDATE';
        this.updateData = data;
        return this;
    }
    delete() {
        this.queryType = 'DELETE';
        return this;
    }
}
exports.QueryBuilder = QueryBuilder;
_a = Symbol.toStringTag;
