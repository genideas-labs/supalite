export class PostgresError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'PostgresError';
    this.code = code;

    // Ensure proper prototype chain for ES5
    Object.setPrototypeOf(this, PostgresError.prototype);
  }
}
