import { getDb } from './client.js';
import { toPlain } from './records.js';

type Vars = Record<string, unknown>;

/** Runs a query whose last statement returns a single record (e.g. `SELECT ... FROM ONLY`, `CREATE ONLY`). */
export async function queryOne<T>(sql: string, vars: Vars = {}): Promise<T | null> {
  const results = await getDb().query(sql, vars).collect<unknown[]>();
  const last = results.at(-1);
  return last == null ? null : toPlain<T>(last);
}

/** Runs a query whose last statement returns a list of records. */
export async function queryMany<T>(sql: string, vars: Vars = {}): Promise<T[]> {
  const results = await getDb().query(sql, vars).collect<unknown[]>();
  const last = results.at(-1);
  return Array.isArray(last) ? toPlain<T[]>(last) : [];
}
