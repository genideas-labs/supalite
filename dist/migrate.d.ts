export type MigrationSection = {
    sql: string;
    disableTransaction: boolean;
};
export type ParsedMigration = {
    up: MigrationSection;
    down: MigrationSection | null;
};
export declare const parseMigrationSql: (content: string) => ParsedMigration;
export declare const parseMigrationFilename: (filename: string) => {
    version: string;
    name: string;
};
export type MigrationFile = {
    version: string;
    name: string;
    filename: string;
    path: string;
};
export declare const listMigrationFiles: (dir: string) => Promise<MigrationFile[]>;
type TableRef = {
    schema: string;
    table: string;
};
export declare const parseTableRef: (ref: string) => TableRef;
export type MigrateOptions = {
    dbUrl: string;
    dir?: string;
    migrationsTable?: string;
};
export type MigrationStatusEntry = {
    version: string;
    name: string;
    filename: string;
    applied: boolean;
};
export declare const migrateStatus: (opts: MigrateOptions) => Promise<MigrationStatusEntry[]>;
export type MigrateUpResult = {
    applied: string[];
    pending: string[];
};
export declare const migrateUp: (opts: MigrateOptions & {
    dryRun?: boolean;
}) => Promise<MigrateUpResult>;
export type MarkAppliedResult = {
    marked: string[];
    alreadyApplied: string[];
};
export declare const migrateMarkApplied: (opts: MigrateOptions & {
    version?: string;
    all?: boolean;
}) => Promise<MarkAppliedResult>;
export type NewMigrationResult = {
    path: string;
    filename: string;
    version: string;
};
export declare const migrationTimestamp: (date?: Date) => string;
export declare const migrateNew: (opts: {
    name: string;
    dir?: string;
    timestamp?: string;
}) => Promise<NewMigrationResult>;
export {};
