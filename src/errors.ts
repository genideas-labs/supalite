export class PostgresError extends Error {
  code?: string;
  details?: string;
  hint?: string;
  position?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;

  constructor(message: string, pgError?: any) {
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
