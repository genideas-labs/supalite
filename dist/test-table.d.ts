import { SupaLitePG } from './postgres-client';
export declare function insertIntoTestTable(client: SupaLitePG<any>, name: string, value: number): Promise<any>;
export declare function getFromTestTable(client: SupaLitePG<any>, conditions: {
    [key: string]: any;
}): Promise<any>;
