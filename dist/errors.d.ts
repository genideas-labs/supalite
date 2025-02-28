export declare class PostgresError extends Error {
    code?: string;
    details?: string;
    hint?: string;
    position?: string;
    schema?: string;
    table?: string;
    column?: string;
    dataType?: string;
    constraint?: string;
    constructor(message: string, pgError?: any);
    toJSON(): {
        message: string;
        code: string | undefined;
        details: string | undefined;
        hint: string | undefined;
        position: string | undefined;
        schema: string | undefined;
        table: string | undefined;
        column: string | undefined;
        dataType: string | undefined;
        constraint: string | undefined;
    };
}
