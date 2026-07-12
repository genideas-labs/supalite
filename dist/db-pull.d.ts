export type DbPullOptions = {
    dbUrl: string;
    schemas?: string[];
    includeExtensionObjects?: boolean;
    ifNotExists?: boolean;
};
export declare const generateBaselineSql: (options: DbPullOptions) => Promise<string>;
