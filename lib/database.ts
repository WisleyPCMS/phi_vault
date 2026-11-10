import 'server-only';
import {createClient, type Client, type InValue} from '@libsql/client';
import {mkdir} from 'node:fs/promises';
import {schema} from './schema.mjs';

// The small adapter keeps record upserts and full-library imports transactional.
class Statement {
  constructor(readonly client: Client, readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: InValue[]) { return new Statement(this.client, this.sql, args); }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.client.execute({sql: this.sql, args: this.args});
    return (result.rows[0] as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>(): Promise<{results: T[]}> {
    const result = await this.client.execute({sql: this.sql, args: this.args});
    return {results: result.rows as T[]};
  }
  async run() { return this.client.execute({sql: this.sql, args: this.args}); }
}

let pending: ReturnType<typeof connect> | undefined;
async function connect() {
  const local = process.env.PHI_LOCAL_STORAGE === '1' && !process.env.VERCEL;
  const url = process.env.TURSO_DATABASE_URL || (local ? 'file:.data/vault.db' : '');
  if (!url || (!local && !/^(libsql|https):\/\//.test(url))) {
    throw Object.assign(new Error('雲端資料庫尚未設定'), {status: 503});
  }
  if (local) await mkdir('.data', {recursive: true});
  const client = createClient({url, authToken: process.env.TURSO_AUTH_TOKEN || process.env.TURSO_DATABASE_AUTH_TOKEN});
  try { await client.executeMultiple(schema); }
  catch (error) { client.close(); throw error; }
  return {
    prepare(sql: string) { return new Statement(client, sql); },
    batch(statements: Statement[]) {
      return client.batch(statements.map(s => ({sql: s.sql, args: s.args})), 'write');
    },
  };
}
export async function getDatabase() {
  pending ??= connect().catch(error => {pending = undefined; throw error;});
  return pending;
}
