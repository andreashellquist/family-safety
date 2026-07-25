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
  // This project initially shipped 001 without a migration ledger. Only record
  // a legacy baseline if the complete schema and its RLS helpers exist. Seeing
  // one table alone is not evidence that the authorization layer was installed.
  if (!applied.has('001_family_safety.sql')) {
    const { rows: existingSchema } = await client.query(`
      select
        to_regclass('public.app_users') is not null as app_users,
        to_regclass('public.families') is not null as families,
        to_regclass('public.family_memberships') is not null as memberships,
        to_regclass('public.devices') is not null as devices,
        to_regprocedure('public.current_app_user_id()') is not null as current_user,
        to_regprocedure('public.is_family_member(uuid)') is not null as family_member,
        to_regprocedure('public.is_family_parent(uuid)') is not null as family_parent
    `);
    const schema = existingSchema[0];
    if (schema.app_users && schema.families && schema.memberships && schema.devices && schema.current_user && schema.family_member && schema.family_parent) {
      await client.query("insert into schema_migrations (name) values ('001_family_safety.sql') on conflict do nothing");
      applied.add('001_family_safety.sql');
    } else if (schema.app_users) {
      throw new Error('Found a partial legacy schema. Restore the complete 001 baseline or add its missing objects before recording it as migrated.');
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
