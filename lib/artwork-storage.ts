import 'server-only';
import {get, put} from '@vercel/blob';
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

function localPath(key: string) {
  if (!/^artworks\/[a-f0-9-]+\/[a-f0-9]{64}$/.test(key)) throw new Error('Invalid artwork key');
  return resolve('.data', key);
}
const local = () => process.env.PHI_LOCAL_STORAGE === '1' && !process.env.VERCEL;
export async function saveArtwork(key: string, bytes: Uint8Array, contentType: string) {
  if (local()) {
    const path = localPath(key);
    await mkdir(dirname(path), {recursive: true});
    const temp = path + '.' + crypto.randomUUID() + '.tmp';
    await writeFile(temp, bytes);
    await rename(temp, path);
    return key;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    throw Object.assign(new Error('圖片儲存空間尚未設定'), {status: 503});
  }
  const result = await put(key, Buffer.from(bytes), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true,
    contentType, cacheControlMaxAge: 60,
  });
  return result.url;
}
export async function loadArtwork(key: string): Promise<Response | null> {
  const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
  if (local()) {
    try { return new Response(await readFile(localPath(key)), {headers: {...headers, 'Content-Type': 'image/webp'}}); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  const result = await get(key, {access: 'private', useCache: false});
  return result?.stream ? new Response(result.stream, {headers: {...headers, 'Content-Type': result.blob.contentType || 'image/webp'}}) : null;
}
