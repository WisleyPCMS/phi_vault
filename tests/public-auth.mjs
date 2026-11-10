import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const origin=process.env.PHI_TEST_URL||'http://127.0.0.1:3002';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw new Error('Local tests only');
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url)));
const chartId=catalog.songs[0].charts[0].id,songId=catalog.songs[0].id;
const password='QA_'+crypto.randomUUID(),username='QA-Public-'+Date.now();
let checks=0;
async function call(path,method='GET',body,session='',expected=200){
  const r=await fetch(origin+'/api/'+path,{method,headers:{Cookie:session,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  assert.equal(r.status,expected,path+' '+await r.clone().text());checks++;return r;
}
const registration=await call('auth/register','POST',{username,password});
const session=registration.headers.get('set-cookie').split(';')[0];
assert.match(registration.headers.get('set-cookie'),/HttpOnly/);assert.match(registration.headers.get('set-cookie'),/SameSite=Lax/);assert.match(registration.headers.get('set-cookie'),/Max-Age=86400/);checks+=3;
await call('auth/register','POST',{username:username.toUpperCase(),password},'',400);
await call('data','GET',undefined,'phi_session='+'a'.repeat(64),401);
const csrf=await fetch(origin+'/api/auth/register',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({username:'csrf-'+username,password})});assert.equal(csrf.status,403);checks++;
await Promise.all([
  call('records','PUT',{chartId,score:970000,acc:98,status:'FC'},session),
  call('records','PUT',{chartId,score:980000,acc:97,status:'NONE'},session),
  call('records','PUT',{chartId,score:960000,acc:99,status:'NONE'},session),
]);
let data=await (await call('data','GET',undefined,session)).json();
assert.deepEqual(data.records.map(r=>[r.score,r.acc,r.status]),[[980000,99,'FC']]);checks++;
assert.equal(JSON.stringify(data).includes('password_hash'),false);checks++;
const art=new FormData();art.set('songId',songId);art.set('file',new File([await readFile(new URL('../public'+catalog.songs[0].artwork,import.meta.url))],'art.webp',{type:'image/webp'}));
await call('artwork','POST',art,session);
const image=await call('artwork?songId='+encodeURIComponent(songId),'GET',undefined,session);assert.match(image.headers.get('cache-control'),/no-store/);checks++;
const other=await call('auth/register','POST',{username:username+'-other',password});const otherSession=other.headers.get('set-cookie').split(';')[0];
await call('artwork?songId='+encodeURIComponent(songId),'GET',undefined,otherSession,404);
const bad=new FormData();bad.set('songId',songId);bad.set('file',new File([new Uint8Array([137,80,78,71,0,0])],'broken.png',{type:'image/png'}));await call('artwork','POST',bad,session,400);
const secondLogin=await call('auth/login','POST',{username,password});const secondSession=secondLogin.headers.get('set-cookie').split(';')[0];
await call('auth/logout','POST',undefined,session);await call('data','GET',undefined,session,401);await call('data','GET',undefined,secondSession);
await call('password','PUT',{current:password,next:password+'new'},secondSession);await call('data','GET',undefined,secondSession,401);
await call('data','GET',undefined,otherSession);
for(let i=0;i<8;i++)await call('auth/login','POST',{username:username+'-other',password:password+'wrong'},'',401);
await call('auth/login','POST',{username:username+'-other',password},'',429);
console.log(JSON.stringify({publicAuthChecks:checks,status:'passed',scope:'local only'}));
