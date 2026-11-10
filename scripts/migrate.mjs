import {createClient} from '@libsql/client';
import {mkdir} from 'node:fs/promises';
import {schema} from '../lib/schema.mjs';
const local = process.env.PHI_LOCAL_STORAGE === '1' && !process.env.VERCEL;
const url = process.env.TURSO_DATABASE_URL || (local ? 'file:.data/vault.db' : '');
if (!url || (!local && !/^(libsql|https):\/\//.test(url))) throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
if (local) await mkdir('.data', {recursive: true});
const client = createClient({url, authToken: process.env.TURSO_AUTH_TOKEN || process.env.TURSO_DATABASE_AUTH_TOKEN});
try {await client.executeMultiple(schema); console.log('PHI VAULT schema ready.');}
finally {client.close();}
