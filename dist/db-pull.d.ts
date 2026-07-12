export type DbPullOptions = {
    dbUrl: string;
    schemas?: string[];
    includeExtensionObjects?: boolean;
    ifNotExists?: boolean;
    format?: 'plain' | 'dbmate';
};
export declare const formatBaseline: (baseline: string, format?: "plain" | "dbmate") => string;
export declare const generateBaselineSql: (options: DbPullOptions) => Promise<string>;
