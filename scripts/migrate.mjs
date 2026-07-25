import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Set it in your shell; do not commit it.');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
const migration = await readFile(new URL('../db/migrations/001_family_safety.sql', import.meta.url), 'utf8');

await client.connect();
try {
  await client.query(migration);
  console.log('Applied 001_family_safety.sql');
} finally {
  await client.end();
}
