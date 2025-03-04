"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertIntoTestTable = insertIntoTestTable;
exports.getFromTestTable = getFromTestTable;
async function insertIntoTestTable(client, name, value) {
    const { data, error } = await client
        .from('test_table')
        .insert({ name, value })
        .select('*')
        .single();
    if (error) {
        throw error;
    }
    return data;
}
async function getFromTestTable(client, conditions) {
    const { data, error } = await client.from('test_table').select('*').match(conditions);
    if (error) {
        throw error;
    }
    return data;
}
