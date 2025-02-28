import { SupaliteConfig, DatabaseSchema } from './types';
import { SupaLitePG } from './postgres-client';
export declare class SupaliteClient<T extends DatabaseSchema> extends SupaLitePG<T> {
    constructor(config?: SupaliteConfig);
}
export { SupaLitePG } from './postgres-client';
export * from './types';
export * from './errors';
