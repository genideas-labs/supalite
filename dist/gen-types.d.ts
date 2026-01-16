type NameCase = 'preserve' | 'snake' | 'camel' | 'pascal';
export type GenTypesOptions = {
    dbUrl: string;
    schemas?: string[];
    dateAsDate?: boolean;
    includeRelationships?: boolean;
    includeConstraints?: boolean;
    includeIndexes?: boolean;
    includeCompositeTypes?: boolean;
    includeFunctionSignatures?: boolean;
    typeCase?: NameCase;
    functionCase?: NameCase;
};
export type DumpFunctionsSqlOptions = {
    dbUrl: string;
    schemas?: string[];
    includeProcedures?: boolean;
};
export declare const generateTypes: (options: GenTypesOptions) => Promise<string>;
export declare const dumpFunctionsSql: (options: DumpFunctionsSqlOptions) => Promise<string>;
export {};
