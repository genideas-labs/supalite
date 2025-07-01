import { SupaLitePG } from '../postgres-client';
import { Pool } from 'pg';
import { config } from 'dotenv';
import { DatabaseSchema, TableBase } from '../types';

config();

// Define types for the test tables
type AuthorsTableRow = { id: number; name: string };
type AuthorsTableInsert = { id?: number; name: string };
type AuthorsTableUpdate = { id?: number; name?: string };

type BooksTableRow = { id: number; title: string; author_id: number };
type BooksTableInsert = { id?: number; title: string; author_id: number };
type BooksTableUpdate = { id?: number; title?: string; author_id?: number };

// Define the test-specific database schema
interface TestDatabaseWithJoin extends DatabaseSchema {
  public: {
    Tables: {
      authors: TableBase & { Row: AuthorsTableRow; Insert: AuthorsTableInsert; Update: AuthorsTableUpdate; Relationships: [] };
      books: TableBase & {
        Row: BooksTableRow;
        Insert: BooksTableInsert;
        Update: BooksTableUpdate;
        Relationships: [
          {
            foreignKeyName: "books_author_id_fkey";
            columns: ["author_id"];
            referencedRelation: "authors";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const connectionString = process.env.DB_CONNECTION || 'postgresql://testuser:testpassword@localhost:5432/testdb';

describe('QueryBuilder with Join Queries', () => {
  let client: SupaLitePG<TestDatabaseWithJoin>;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS authors (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS books (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        author_id INTEGER REFERENCES authors(id) ON DELETE CASCADE
      );
    `);
  });

  beforeEach(async () => {
    client = new SupaLitePG<TestDatabaseWithJoin>({ connectionString, verbose: true });
    // Clear and re-populate data for each test
    await pool.query('TRUNCATE TABLE books, authors RESTART IDENTITY CASCADE;');
    await pool.query(`
      INSERT INTO authors (name) VALUES ('George Orwell'), ('Jane Austen');
      INSERT INTO books (title, author_id) VALUES
        ('1984', 1),
        ('Animal Farm', 1),
        ('Pride and Prejudice', 2);
    `);
  });

  afterEach(async () => {
    if (client) {
      await client.close();
    }
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS books;`);
    await pool.query(`DROP TABLE IF EXISTS authors;`);
    await pool.end();
  });

  test('should fetch main records and nested foreign records', async () => {
    type AuthorWithBooks = AuthorsTableRow & {
      books: BooksTableRow[];
    };

    const { data, error } = await client
      .from('authors')
      .select('*, books(*)');

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const typedData = data as AuthorWithBooks[];
    expect(typedData).toHaveLength(2);

    const orwell = typedData.find(a => a.name === 'George Orwell');
    const austen = typedData.find(a => a.name === 'Jane Austen');

    expect(orwell).toBeDefined();
    expect(orwell?.books).toHaveLength(2);
    expect(orwell?.books.map(b => b.title)).toEqual(expect.arrayContaining(['1984', 'Animal Farm']));

    expect(austen).toBeDefined();
    expect(austen?.books).toHaveLength(1);
    expect(austen?.books[0].title).toBe('Pride and Prejudice');
  });

  test('should fetch specific columns from main and nested records', async () => {
    type AuthorWithBookTitles = { name: string } & {
      books: { title: string }[];
    };

    const { data, error } = await client
      .from('authors')
      .select('name, books(title)');

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const typedData = data as AuthorWithBookTitles[];
    expect(typedData).toHaveLength(2);

    const orwell = typedData.find(a => a.name === 'George Orwell');
    expect(orwell).toBeDefined();
    expect(orwell?.books).toHaveLength(2);
    expect(orwell?.books[0]).toHaveProperty('title');
    expect(orwell?.books[0]).not.toHaveProperty('id');
  });
});
