"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresError = void 0;
class PostgresError extends Error {
    constructor(message, pgError) {
        super(message);
        this.name = 'PostgresError';
        if (pgError) {
            this.code = pgError.code;
            this.details = pgError.detail;
            this.hint = pgError.hint;
            this.position = pgError.position;
            this.schema = pgError.schema;
            this.table = pgError.table;
            this.column = pgError.column;
            this.dataType = pgError.dataType;
            this.constraint = pgError.constraint;
        }
        // Ensure proper prototype chain for ES5
        Object.setPrototypeOf(this, PostgresError.prototype);
    }
    toJSON() {
        return {
            message: this.message,
            code: this.code,
            details: this.details,
            hint: this.hint,
            position: this.position,
            schema: this.schema,
            table: this.table,
            column: this.column,
            dataType: this.dataType,
            constraint: this.constraint
        };
    }
}
exports.PostgresError = PostgresError;
