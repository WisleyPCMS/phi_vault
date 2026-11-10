import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseBackup,metadata,buildBackup,restoreArtwork} from '../lib/backup.ts';
const catalog=JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url)));
const charts=catalog.songs.flatMap(s=>s.charts.map(c=>({...c,title:s.title,artist:s.artist,artwork:s.artwork})));
const image=await readFile(new URL('../public'+catalog.songs[0].artwork,import.meta.url));
const base=()=>({format:'phi-vault-v1',username:'舊帳號',records:[{chartId:charts[0].id,score:980000,acc:99,status:'FC'}],customCharts:[],challenge:null});
const art=()=>({songId:charts[0].songId,mime:'image/webp',base64:image.toString('base64')});

test('old JSON backups remain compatible and credential fields are discarded',()=>{
 const backup=parseBackup({...base(),password:'never-export',token:'never-export',records:[{...base().records[0],password_hash:'never-export'}]},charts);
 assert.equal(backup.artworkFiles.length,0);assert.equal(backup.records[0].status,'FC');
 assert.ok(!JSON.stringify(metadata(backup)).includes('never-export'));
});
test('backup with artwork round-trips and images stay outside the metadata request',async()=>{
 const data={profile:{username:'中文帳號'},records:base().records,customCharts:[],challenge:null,artworks:[{songId:charts[0].songId}]};
 const backup=await buildBackup(data,true,()=>{},async()=>new Response(image,{headers:{'Content-Type':'image/webp'}}));
 const parsed=parseBackup(JSON.parse(JSON.stringify(backup)),charts);
 assert.equal(parsed.artworkFiles[0].base64,image.toString('base64'));assert.equal(parsed.username,'中文帳號');
 assert.ok(!Object.hasOwn(metadata(parsed),'artworkFiles'));
});
test('score-only export makes no artwork requests',async()=>{
 let requests=0;const data={profile:{username:'test'},records:[],customCharts:[],challenge:null,artworks:[{songId:charts[0].songId}]};
 const backup=await buildBackup(data,false,()=>{},async()=>{requests++;throw new Error('should not fetch');});
 assert.equal(requests,0);assert.deepEqual(backup.artworkFiles,[]);
});
test('malformed backups fail before importing any records',()=>{
 for(const bad of [null,[],{...base(),format:'other'},{...base(),records:[{...base().records[0],chartId:'unknown'}]},
  {...base(),records:[{...base().records[0],score:1000001}]},{...base(),customCharts:[null]},
  {...base(),challenge:[{chartId:charts[0].id,score:1,acc:1}]}])assert.throws(()=>parseBackup(bad,charts));
});
test('unknown songs, duplicates, SVGs, invalid base64 and oversized artwork are rejected',()=>{
 for(const artworkFiles of [[{...art(),songId:'unknown'}],[art(),art()],[{...art(),mime:'image/svg+xml'}],
  [{...art(),base64:'not-valid-base64'}],[{...art(),base64:Buffer.alloc(5_000_001).toString('base64')}],
  [{...art(),base64:Buffer.from('RIFF fake file').toString('base64')}]])assert.throws(()=>parseBackup({...base(),artworkFiles},charts));
});
test('failed artwork remains retryable without importing metadata again',async()=>{
 const other={...art(),songId:charts.find(c=>c.songId!==charts[0].songId).songId};
 const calls=[];let fail=true;
 const request=async(path,method,form)=>{assert.equal(path,'artwork');assert.equal(method,'POST');const song=form.get('songId');calls.push(song);assert.equal(form.get('file').type,'image/webp');if(song===other.songId&&fail)throw new Error('network');};
 const result=await restoreArtwork([art(),other],request,async f=>f,()=>{});
 assert.equal(result.restored,1);assert.deepEqual(result.failed,[other]);
 fail=false;const retry=await restoreArtwork(result.failed,request,async f=>f,()=>{});
 assert.equal(retry.restored,1);assert.deepEqual(retry.failed,[]);assert.deepEqual(calls,[art().songId,other.songId,other.songId]);
});
