import {validateRecord, type Chart, type ScoreRecord, type ChallengeEntry} from './game.ts';

export const MAX_BACKUP_BYTES = 64_000_000;
const MAX_IMAGE_BYTES = 5_000_000;
export type ArtworkFile = {songId: string; mime: string; base64: string};
export type Backup = {
  format: 'phi-vault-v1'; username: string; exportedAt: string;
  records: ScoreRecord[]; customCharts: Chart[]; challenge: ChallengeEntry[] | null;
  artworkFiles: ArtworkFile[];
};
export type BackupData = {
  profile: {id?: string; username: string}; records: ScoreRecord[]; customCharts: Chart[];
  challenge: ChallengeEntry[] | null; artworks: {songId: string}[];
};
export type Progress = (message: string) => void;
type Requester = (path: string, method?: string, body?: unknown) => Promise<unknown>;

function invalid(message: string): never { throw new Error(message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('備份格式不正確');
  return value as Record<string, unknown>;
}
function customChart(value: unknown): Chart {
  const c = object(value);
  if (typeof c.id !== 'string' || !c.id.startsWith('custom-') || c.id.length > 100 || c.songId !== c.id ||
      typeof c.title !== 'string' || !c.title.trim() || c.title.length > 120 || typeof c.artist !== 'string' || c.artist.length > 120 ||
      !['EZ','HD','IN','AT','Legacy'].includes(String(c.difficulty)) || typeof c.constant !== 'number' || !Number.isFinite(c.constant) || c.constant < 1 || c.constant > 20 ||
      typeof c.level !== 'number' || !Number.isInteger(c.level) || c.level < 1 || c.level > 20) invalid('備份包含無效的自訂譜面');
  return {id:c.id, songId:c.id, title:c.title, artist:c.artist, difficulty:String(c.difficulty), constant:c.constant, level:c.level, artwork:'/fallback.svg'};
}
export function metadata(backup: Backup) {
  return {format:backup.format, username:backup.username, exportedAt:backup.exportedAt,
    records:backup.records, customCharts:backup.customCharts, challenge:backup.challenge};
}
export function artworkByteLength(image: ArtworkFile) {
  return image.base64.length / 4 * 3 - (image.base64.endsWith('==') ? 2 : image.base64.endsWith('=') ? 1 : 0);
}
function imageSignature(image: ArtworkFile) {
  const head = atob(image.base64.slice(0, 40));
  const byte = (index: number) => head.charCodeAt(index);
  return image.mime === 'image/png' ? artworkByteLength(image) >= 24 && [137,80,78,71,13,10,26,10].every((v,i)=>byte(i)===v) :
    image.mime === 'image/jpeg' ? byte(0)===255 && byte(1)===216 && byte(2)===255 :
    head.slice(0,4)==='RIFF' && head.slice(8,12)==='WEBP';
}
export function parseBackup(value: unknown, catalog: Chart[]): Backup {
  const b = object(value);
  if (b.format !== 'phi-vault-v1' || !Array.isArray(b.records) || b.records.length > 2000) invalid('請選擇 PHI VAULT 匯出的資料備份');
  if (b.customCharts !== undefined && !Array.isArray(b.customCharts)) invalid('自訂譜面格式不正確');
  const custom = (b.customCharts || []) as unknown[];
  if (custom.length > 300) invalid('自訂譜面超過 300 張');
  const customCharts = custom.map(customChart);
  const known = new Map([...catalog, ...customCharts].map(c=>[c.id,c]));
  const records = b.records.map(value => {
    const r = validateRecord(value), stamp = object(value).updatedAt;
    if (!known.has(r.chartId)) invalid('備份包含未知譜面：' + r.chartId);
    return {...r, updatedAt:typeof stamp==='number' && Number.isFinite(stamp) ? stamp : 0};
  });
  let challenge: ChallengeEntry[] | null = null;
  if (b.challenge !== undefined && b.challenge !== null) {
    if (!Array.isArray(b.challenge) || b.challenge.length !== 3) invalid('課題需包含三張譜面');
    challenge = b.challenge.map(value => {
      const r = validateRecord({...object(value),status:'NONE'});
      if (!known.has(r.chartId) || known.get(r.chartId)?.difficulty==='Legacy' || Math.abs(r.score/10000-r.acc)>.011) invalid('課題資料不正確');
      return {chartId:r.chartId, score:r.score, acc:r.acc};
    });
    if (new Set(challenge.map(e=>e.chartId)).size !== 3) invalid('課題包含重複譜面');
  }
  if (b.artworkFiles !== undefined && !Array.isArray(b.artworkFiles)) invalid('曲繪備份格式不正確');
  const rawImages = (b.artworkFiles || []) as unknown[];
  if (rawImages.length > 1000) invalid('曲繪數量超過限制');
  const songs = new Set([...known.values()].map(c=>c.songId)), seen = new Set<string>();
  let totalBytes = 0;
  const artworkFiles = rawImages.map(value => {
    const a = object(value);
    if (typeof a.songId !== 'string' || !songs.has(a.songId) || seen.has(a.songId) || !['image/png','image/jpeg','image/webp'].includes(String(a.mime)) ||
        typeof a.base64 !== 'string' || !a.base64 || a.base64.length % 4 !== 0 || a.base64.length > 6_666_668 || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64)) invalid('備份包含無效或重複的曲繪');
    const image = {songId:a.songId, mime:String(a.mime), base64:a.base64};
    if (artworkByteLength(image) > MAX_IMAGE_BYTES || !imageSignature(image)) invalid('備份圖片格式不正確，或超過 5 MB');
    seen.add(image.songId); totalBytes += image.base64.length;
    if (totalBytes > MAX_BACKUP_BYTES) invalid('完整備份超過 64 MB');
    return image;
  });
  const backup: Backup = {format:'phi-vault-v1', username:typeof b.username==='string'?b.username.slice(0,50):'舊帳號',
    exportedAt:typeof b.exportedAt==='string'?b.exportedAt:'', records, customCharts, challenge, artworkFiles};
  if (new TextEncoder().encode(JSON.stringify(metadata(backup))).length > 1_000_000) invalid('成績及譜面資料超過 1 MB');
  return backup;
}

export function imageFile(image: ArtworkFile): File {
  const binary = atob(image.base64), bytes = Uint8Array.from(binary, c=>c.charCodeAt(0));
  const extension = image.mime === 'image/png' ? 'png' : image.mime === 'image/jpeg' ? 'jpg' : 'webp';
  return new File([bytes], 'artwork.'+extension, {type:image.mime});
}
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i=0; i<bytes.length; i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
export async function buildBackup(data: BackupData, includeImages: boolean, progress: Progress,
  readArtwork: (songId:string)=>Promise<Response> = songId=>fetch('/api/artwork?songId='+encodeURIComponent(songId), {cache:'no-store'})): Promise<Backup> {
  const backup: Backup = {format:'phi-vault-v1', username:data.profile.username, exportedAt:new Date().toISOString(),
    records:data.records, customCharts:data.customCharts, challenge:data.challenge, artworkFiles:[]};
  let total = new TextEncoder().encode(JSON.stringify(backup)).length;
  if (includeImages) for (const [index,art] of data.artworks.entries()) {
    progress(`正在備份曲繪 ${index+1} / ${data.artworks.length}`);
    const response = await readArtwork(art.songId);
    if (!response.ok) invalid('曲繪讀取失敗，請重新登入後再試');
    const mime = response.headers.get('content-type')?.split(';')[0] || '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!['image/png','image/jpeg','image/webp'].includes(mime) || bytes.length > MAX_IMAGE_BYTES) invalid('曲繪格式不正確，或超過 5 MB');
    const image = {songId:art.songId, mime, base64:encode(bytes)};
    total += JSON.stringify(image).length + 1;
    if (total > MAX_BACKUP_BYTES) invalid('完整備份超過 64 MB，請取消包含自訂曲繪後再匯出');
    backup.artworkFiles.push(image);
  }
  return backup;
}
export async function restoreArtwork(images: ArtworkFile[], request: Requester, prepare: (file: File)=>Promise<File>, progress: Progress) {
  const failed: ArtworkFile[] = [];
  for (const [index,image] of images.entries()) {
    progress(`正在還原曲繪 ${index+1} / ${images.length}`);
    try {
      const form = new FormData();
      form.set('songId', image.songId); form.set('file', await prepare(imageFile(image)));
      await request('artwork', 'POST', form);
    } catch { failed.push(image); }
  }
  return {failed, restored:images.length-failed.length};
}
