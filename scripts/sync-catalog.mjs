import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const root = new URL('../', import.meta.url);
const base = 'https://raw.githubusercontent.com/7aGiven/Phigros_Resource/';
async function download(url) { const res=await fetch(url); if(!res.ok) throw new Error(`${res.status}: ${url}`); return res; }
const [info, difficulty, version] = await Promise.all(['info.tsv','difficulty.tsv','version.txt'].map(async n=>(await download(base+'info/'+n)).text()));
const diffs=new Map(difficulty.trim().split('\n').map(l=>{const [id,...ds]=l.trim().split('\t');return [id,ds.map(Number)];}));
await mkdir(new URL('public/illustrations/',root),{recursive:true});
await mkdir(new URL('data/',root),{recursive:true});
const songs=info.trim().split('\n').map(l=>{const [id,title,artist,illustrator]=l.trim().split('\t');const key=createHash('sha256').update(id).digest('hex').slice(0,16);return {id,title,artist,illustrator,artwork:'/illustrations/'+key+'.webp',charts:(diffs.get(id)||[]).flatMap((constant,i)=>constant>0?[{id:id+'::'+['EZ','HD','IN','AT','Legacy'][i],songId:id,difficulty:['EZ','HD','IN','AT','Legacy'][i],constant,level:Math.floor(constant)}]:[])};}).filter(s=>s.charts.length);
let next=0, count=0; const failed=[];
await Promise.all(Array.from({length:6},async()=>{while(next<songs.length){const song=songs[next++];const target=new URL('public'+song.artwork,root);try {await readFile(target);}catch{try{let res;try{res=await download(base+'illustrationLowRes/'+encodeURIComponent(song.id)+'.png');}catch{res=await download(base+'illustrationLowRes/'+encodeURIComponent(song.id)+'_IN.png');}const bytes=Buffer.from(await res.arrayBuffer());await writeFile(target,await sharp(bytes).resize({width:960,withoutEnlargement:true}).webp({quality:90,effort:5}).toBuffer());}catch(e){failed.push(song.id);song.artwork='/fallback.svg';}} count++; if(count%75===0) console.log('Illustrations '+count+'/'+songs.length);}}));
const catalog={version:version.trim(),syncedAt:new Date().toISOString(),source:'https://github.com/7aGiven/Phigros_Resource',songs};
await writeFile(new URL('data/catalog.json',root),JSON.stringify(catalog));
console.log(JSON.stringify({version:catalog.version,songs:songs.length,charts:songs.flatMap(s=>s.charts).length,failed}));
