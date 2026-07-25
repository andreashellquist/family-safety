import { readdir, readFile } from 'node:fs/promises';
import { Client } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Set it in your shell; do not commit it.');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
const migrationsDirectory = new URL('../db/migrations/', import.meta.url);
const migrationNames = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();

await client.connect();
try {
  await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const { rows } = await client.query('select name from schema_migrations');
  const applied = new Set(rows.map(({ name }) => name));
  // This project initially shipped 001 without a migration ledger. Preserve an
  // already-provisioned database by recording that known baseline once, instead
  // of attempting to create its tables again.
  if (!applied.has('001_family_safety.sql')) {
    const { rows: existingSchema } = await client.query("select to_regclass('public.app_users') as app_users");
    if (existingSchema[0].app_users) {
      await client.query("insert into schema_migrations (name) values ('001_family_safety.sql') on conflict do nothing");
      applied.add('001_family_safety.sql');
    }
  }
  for (const name of migrationNames) {
    if (applied.has(name)) continue;
    const migration = await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');
    try {
      await client.query(migration);
      await client.query('insert into schema_migrations (name) values ($1)', [name]);
      console.log(`Applied ${name}`);
    } catch (error) {
      throw error;
    }
  }
} finally {
  await client.end();
}
