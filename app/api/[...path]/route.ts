import { getDatabase } from '../../../lib/database';
import { saveArtwork, loadArtwork } from '../../../lib/artwork-storage';
import sharp from 'sharp';
import catalog from '../../../data/catalog.json';
import { validateRecord } from '../../../lib/game';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Profile={id:string;username:string;password_hash:string;salt:string};
const encoder=new TextEncoder();
const toHex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>toHex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
const random=()=>toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
async function hashPassword(password:string,salt:string){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return toHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:600000,hash:'SHA-256'},key,256));}
function equal(a:string,b:string){let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
function json(data:unknown,status=200,cookie?:string){const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(cookie)headers['Set-Cookie']=cookie;return new Response(JSON.stringify(data),{status,headers});}
function cookie(token:string,r:Request,clear=false){return `phi_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:86400}${new URL(r.url).protocol==='https:'?'; Secure':''}`;}
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
async function read(r:Request){if(Number(r.headers.get('content-length'))>1000000)fail('資料超過大小限制',413);const text=await r.text();if(text.length>1000000)fail('資料超過大小限制',413);let result;try{result=JSON.parse(text);}catch{fail('JSON 格式不正確');}if(!result||typeof result!=='object'||Array.isArray(result))fail('資料格式不正確');return result;}
const baseCharts=new Map(catalog.songs.flatMap(s=>s.charts).map(c=>[c.id,c]));
async function handler(request:Request){
 try{
  const db=await getDatabase();
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,''),now=Date.now();
  if(request.method!=='GET'){const origin=request.headers.get('origin');if(origin&&origin!==url.origin)fail('請從本站操作',403);}
  const token=request.headers.get('cookie')?.match(/(?:^|;\s*)phi_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const profile=token?await db.prepare('SELECT p.* FROM sessions s JOIN profiles p ON s.profile_id=p.id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha(token),now).first<Profile>():null;
  if(path==='auth/me'&&request.method==='GET')return json({profile:profile?{id:profile.id,username:profile.username}:null});
  if(path==='auth/logout'&&request.method==='POST'){if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();return json({ok:true},200,cookie('',request,true));}
  if((path==='auth/register'||path==='auth/login')&&request.method==='POST'){
   const b=await read(request),username=String(b.username||'').normalize('NFKC').trim(),password=b.password;
   if(!username||username.length>50||/[\x00-\x1f]/.test(username)||typeof password!=='string'||password.length<8||password.length>128)fail('帳號需為 1–50 個字，密碼需為 8–128 個字');
   const normalized=username.toLowerCase(),limitKey=await sha('account::'+normalized);
   // Vercel overwrites x-real-ip; only a hash is stored for rate limiting.
   const ipKey=await sha('auth-ip::'+(request.headers.get('x-real-ip')||'local'));
   const ipLimit=await db.prepare('SELECT attempts,reset_at FROM login_limits WHERE key=?').bind(ipKey).first<{attempts:number;reset_at:number}>();
   if(ipLimit&&ipLimit.reset_at>now&&ipLimit.attempts>=60)fail('嘗試次數過多，請 15 分鐘後再試',429);
   await db.prepare('INSERT INTO login_limits (key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END').bind(ipKey,now+900000,now,now).run();
   const limit=await db.prepare('SELECT attempts,reset_at FROM login_limits WHERE key=?').bind(limitKey).first<{attempts:number;reset_at:number}>();if(limit&&limit.reset_at>now&&limit.attempts>=8)fail('嘗試次數過多，請 15 分鐘後再試',429);
   let found=await db.prepare('SELECT * FROM profiles WHERE normalized=?').bind(normalized).first<Profile>();
   if(path==='auth/register'){
    if(found)fail('此遊戲帳號名已建立，請改用登入');
    const id=crypto.randomUUID(),salt=random(),hash=await hashPassword(password,salt);
    try{await db.prepare('INSERT INTO profiles (id,username,normalized,password_hash,salt,created_at) VALUES (?,?,?,?,?,?)').bind(id,username,normalized,hash,salt,now).run();}catch(error){if(/unique|constraint/i.test((error as Error).message))fail('此帳號已存在，請登入');throw error;}
    found={id,username,password_hash:hash,salt};
   }else{
    const hash=await hashPassword(password,found?.salt||'unregistered-account-salt');
    if(!found||!equal(hash,found.password_hash)){
     await db.prepare('INSERT INTO login_limits (key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END').bind(limitKey,now+900000,now,now).run();fail('帳號或密碼不正確',401);
    }
   }
   const fresh=random();await db.batch([db.prepare('DELETE FROM login_limits WHERE key=? OR reset_at<?').bind(limitKey,now),db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),db.prepare('INSERT INTO sessions (token_hash,profile_id,expires_at) VALUES (?,?,?)').bind(await sha(fresh),found!.id,now+86400000)]);
   return json({profile:{id:found!.id,username:found!.username}},200,cookie(fresh,request));
  }
  if(!profile)fail('請登入遊戲成績帳號',401);const pid=profile.id;
  const hasChart=async(id:string)=>baseCharts.has(id)||!!await db.prepare('SELECT chart_id FROM custom_charts WHERE profile_id=? AND chart_id=?').bind(pid,id).first();
  if(path==='data'&&request.method==='GET'){
   const [r,c,ch,a]=await Promise.all([db.prepare('SELECT chart_id AS chartId,score,acc,status,updated_at AS updatedAt FROM records WHERE profile_id=? ORDER BY updated_at DESC').bind(pid).all(),db.prepare('SELECT chart_id AS id,song_id AS songId,title,artist,difficulty,constant,level FROM custom_charts WHERE profile_id=?').bind(pid).all(),db.prepare('SELECT entries FROM challenges WHERE profile_id=?').bind(pid).first<{entries:string}>(),db.prepare('SELECT song_id AS songId,updated_at AS updatedAt FROM artworks WHERE profile_id=?').bind(pid).all()]);
   return json({profile:{id:pid,username:profile.username},records:r.results,customCharts:c.results,challenge:ch?JSON.parse(ch.entries):null,artworks:a.results});
  }
  if(path==='records'&&request.method==='PUT'){
   const r=validateRecord(await read(request));if(!await hasChart(r.chartId))fail('找不到此譜面');
   await db.prepare("INSERT INTO records (profile_id,chart_id,score,acc,status,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(profile_id,chart_id) DO UPDATE SET score=max(records.score,excluded.score),acc=max(records.acc,excluded.acc),status=CASE WHEN records.status='AP' OR excluded.status='AP' THEN 'AP' WHEN records.status='FC' OR excluded.status='FC' THEN 'FC' ELSE 'NONE' END,updated_at=excluded.updated_at").bind(pid,r.chartId,r.score,r.acc,r.status,now).run();return json({ok:true});
  }
  if(path==='records'&&request.method==='DELETE'){const id=url.searchParams.get('chartId');if(!id)fail('缺少譜面');await db.prepare('DELETE FROM records WHERE profile_id=? AND chart_id=?').bind(pid,id).run();return json({ok:true});}
  if(path==='challenge'&&request.method==='PUT'){
   const b=await read(request);if(!Array.isArray(b.entries)||b.entries.length!==3)fail('課題模式需選擇三張譜面');
   const entries=b.entries.map((e:object)=>{const r=validateRecord({...e,status:'NONE'});return {chartId:r.chartId,score:r.score,acc:r.acc};});
   if(new Set(entries.map((e:{chartId:string})=>e.chartId)).size!==3)fail('同一課題不能重複選擇相同譜面');
   for(const e of entries){const custom=baseCharts.has(e.chartId)?null:await db.prepare('SELECT difficulty FROM custom_charts WHERE profile_id=? AND chart_id=?').bind(pid,e.chartId).first<{difficulty:string}>();if(!baseCharts.has(e.chartId)&&!custom||(baseCharts.get(e.chartId)?.difficulty||custom?.difficulty)==='Legacy')fail('課題模式包含無效譜面');if(Math.abs(e.score/10000-e.acc)>0.011)fail('課題模式分數應約等於 ACC × 10,000');}
   await db.prepare('INSERT INTO challenges (profile_id,entries,updated_at) VALUES (?,?,?) ON CONFLICT(profile_id) DO UPDATE SET entries=excluded.entries,updated_at=excluded.updated_at').bind(pid,JSON.stringify(entries),now).run();return json({ok:true});
  }
  if(path==='charts'&&request.method==='POST'){
   const b=await read(request);if(typeof b.title!=='string'||!b.title.trim()||b.title.length>120||typeof b.artist!=='string'||b.artist.length>120||!['EZ','HD','IN','AT','Legacy'].includes(b.difficulty)||typeof b.constant!=='number'||!Number.isFinite(b.constant)||b.constant<1||b.constant>20||!Number.isInteger(b.level)||b.level<1||b.level>20)fail('曲目資料不完整或定數無效');
   const count=await db.prepare('SELECT count(*) AS n FROM custom_charts WHERE profile_id=?').bind(pid).first<{n:number}>();if((count?.n||0)>=300)fail('自訂譜面上限為 300 張');
   const id='custom-'+crypto.randomUUID();await db.prepare('INSERT INTO custom_charts (profile_id,chart_id,song_id,title,artist,difficulty,constant,level) VALUES (?,?,?,?,?,?,?,?)').bind(pid,id,id,b.title.trim(),b.artist.trim(),b.difficulty,b.constant,b.level).run();return json({ok:true,id});
  }
  if(path==='artwork'&&request.method==='POST'){
   if(Number(request.headers.get('content-length'))>3500000)fail('圖片太大，請透過網頁重新選擇圖片',413);
   const form=await request.formData(),file=form.get('file'),songId=String(form.get('songId')||'');
   if(form.has('targetProfileId')&&form.get('targetProfileId')!==pid)fail('登入帳號已變更，請重新開啟搬移視窗',409);
   if(!(file instanceof File)||file.size>3400000||!['image/png','image/jpeg','image/webp'].includes(file.type))fail('請選擇 PNG、JPG 或 WebP 圖片，並透過網頁上傳');
   if(!catalog.songs.some(s=>s.id===songId)&&!await db.prepare('SELECT chart_id FROM custom_charts WHERE profile_id=? AND song_id=?').bind(pid,songId).first())fail('找不到曲目');
   const bytes=await file.arrayBuffer(),head=new Uint8Array(bytes);const png=head[0]===137&&head[1]===80&&head[2]===78&&head[3]===71,jpg=head[0]===255&&head[1]===216&&head[2]===255,webp=String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP';if(!png&&!jpg&&!webp)fail('圖片內容格式不正確');
   let image:Buffer;try{image=await sharp(Buffer.from(bytes),{limitInputPixels:40000000,animated:false}).rotate().resize(2048,2048,{fit:'inside',withoutEnlargement:true}).webp({quality:86}).toBuffer();}catch{fail('無法讀取圖片，請換一張圖片再試');}
   if(image.length>3000000)fail('圖片內容過大，請縮小後再試');
   const key=await saveArtwork('artworks/'+pid+'/'+await sha(songId),image,'image/webp');await db.prepare('INSERT INTO artworks (profile_id,song_id,object_key,updated_at) VALUES (?,?,?,?) ON CONFLICT(profile_id,song_id) DO UPDATE SET object_key=excluded.object_key,updated_at=excluded.updated_at').bind(pid,songId,key,now).run();return json({ok:true});
  }
  if(path==='artwork'&&request.method==='GET'){
   const a=await db.prepare('SELECT object_key FROM artworks WHERE profile_id=? AND song_id=?').bind(pid,url.searchParams.get('songId')||'').first<{object_key:string}>();return (a&&await loadArtwork(a.object_key))||new Response('Not found',{status:404});
  }
  if(path==='password'&&request.method==='PUT'){
   const b=await read(request);if(typeof b.current!=='string'||typeof b.next!=='string'||b.next.length<8||b.next.length>128)fail('新密碼需為 8–128 個字');if(!equal(await hashPassword(b.current,profile.salt),profile.password_hash))fail('目前密碼不正確',401);
   const salt=random(),hash=await hashPassword(b.next,salt);await db.batch([db.prepare('UPDATE profiles SET password_hash=?,salt=? WHERE id=? AND password_hash=?').bind(hash,salt,pid,profile.password_hash),db.prepare('DELETE FROM sessions WHERE profile_id=?').bind(pid)]);return json({ok:true},200,cookie('',request,true));
  }
  if(path==='import'&&request.method==='POST'){
   const b=await read(request);if(b.format!=='phi-vault-v1'||!Array.isArray(b.records)||b.records.length>2000)fail('請選擇 PHI VAULT 匯出的 JSON 備份');
   if(b.targetProfileId!==undefined&&b.targetProfileId!==pid)fail('登入帳號已變更，請重新開啟搬移視窗',409);
   const custom=Array.isArray(b.customCharts)?b.customCharts:[];if(custom.length>300)fail('自訂譜面數量超過限制');
   const prior=await db.prepare('SELECT chart_id AS id,difficulty FROM custom_charts WHERE profile_id=?').bind(pid).all<{id:string;difficulty:string}>();
   const known=new Map<string,{difficulty:string}>([...baseCharts,...prior.results.map(c=>[c.id,c] as [string,typeof c])]);const statements=[];
   for(const c of custom){if(!c||typeof c.id!=='string'||!c.id.startsWith('custom-')||c.id.length>100||c.songId!==c.id||typeof c.title!=='string'||!c.title.trim()||c.title.length>120||typeof c.artist!=='string'||c.artist.length>120||!['EZ','HD','IN','AT','Legacy'].includes(c.difficulty)||typeof c.constant!=='number'||!Number.isFinite(c.constant)||c.constant<1||c.constant>20||!Number.isInteger(c.level)||c.level<1||c.level>20)fail('備份包含無效自訂譜面');if(!known.has(c.id))known.set(c.id,c);}
   const parsed=b.records.map(validateRecord);for(const r of parsed)if(!known.has(r.chartId))fail('備份包含未知譜面：'+r.chartId);
   // A single write transaction imports records, custom charts and challenge together.
   if(custom.length)statements.push(db.prepare("INSERT INTO custom_charts (profile_id,chart_id,song_id,title,artist,difficulty,constant,level) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.songId'),json_extract(value,'$.title'),json_extract(value,'$.artist'),json_extract(value,'$.difficulty'),json_extract(value,'$.constant'),json_extract(value,'$.level') FROM json_each(?) WHERE 1 ON CONFLICT(profile_id,chart_id) DO NOTHING").bind(pid,JSON.stringify(custom)));
   if(parsed.length)statements.push(db.prepare("INSERT INTO records (profile_id,chart_id,score,acc,status,updated_at) SELECT ?,json_extract(value,'$.chartId'),json_extract(value,'$.score'),json_extract(value,'$.acc'),json_extract(value,'$.status'),? FROM json_each(?) WHERE 1 ON CONFLICT(profile_id,chart_id) DO UPDATE SET score=max(records.score,excluded.score),acc=max(records.acc,excluded.acc),status=CASE WHEN records.status='AP' OR excluded.status='AP' THEN 'AP' WHEN records.status='FC' OR excluded.status='FC' THEN 'FC' ELSE 'NONE' END,updated_at=excluded.updated_at").bind(pid,now,JSON.stringify(parsed)));
   if(b.challenge!==undefined&&b.challenge!==null){if(!Array.isArray(b.challenge)||b.challenge.length!==3)fail('備份包含無效課題');const entries=b.challenge.map((e:object)=>{const r=validateRecord({...e,status:'NONE'});return {chartId:r.chartId,score:r.score,acc:r.acc};});if(new Set(entries.map((e:{chartId:string})=>e.chartId)).size!==3)fail('備份課題包含重複譜面');for(const e of entries){if(!known.has(e.chartId))fail('備份課題包含未知譜面');if(known.get(e.chartId)?.difficulty==='Legacy'||Math.abs(e.score/10000-e.acc)>0.011)fail('備份課題成績不正確');}statements.push(db.prepare('INSERT INTO challenges (profile_id,entries,updated_at) VALUES (?,?,?) ON CONFLICT(profile_id) DO UPDATE SET entries=excluded.entries,updated_at=excluded.updated_at').bind(pid,JSON.stringify(entries),now));}
   if(statements.length)await db.batch(statements);return json({ok:true,count:b.records.length});
  }
  fail('找不到此功能',404);
 }catch(e){const error=e as Error & {status?:number},status=error.status||(/ACC|成績格式/.test(error.message)?400:500);if(status===500)console.error('Vault API failed',error);return json({error:status===500?'儲存失敗，請稍後重試':error.message},status);}
}
export const GET=handler;export const POST=handler;export const PUT=handler;export const DELETE=handler;
