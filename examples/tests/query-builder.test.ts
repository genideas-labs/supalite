import { SupaLitePG } from '../../src/postgres-client';
import { insertIntoTestTable, getFromTestTable } from '../test-table';
import { config } from 'dotenv';

config();

async function runTest() {
  const client = new SupaLitePG({
    connectionString: process.env.DB_CONNECTION,
  });

  try {
    // 테스트 데이터를 삽입합니다.
    await insertIntoTestTable(client, 'test1', 10);
    await insertIntoTestTable(client, 'test2', 20);

    // match 메서드를 사용하여 데이터를 조회합니다.
    const result1 = await getFromTestTable(client, { name: 'test1' });
    console.log('Result 1:', result1);

    const result2 = await getFromTestTable(client, { value: 20 });
    console.log('Result 2:', result2);

    const result3 = await getFromTestTable(client, { name: 'test1', value: 10 });
    console.log('Result 3:', result3);

    const result4 = await getFromTestTable(client, { name: 'test3' });
    console.log('Result 4:', result4);
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await client.close();
  }
}

runTest();
