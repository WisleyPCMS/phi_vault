// Read-only rendering QA. Supply a local backup; outputs stay in ignored .data.
// The optional native Canvas module is a QA tool, never a production dependency.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {rankRecords,grade} from '../lib/game.ts';
import {makeReportModel,reportSlots,REPORT_CARD} from '../lib/report-layout.ts';
import {renderReportCanvas,createReport} from '../lib/report-canvas.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const [input,output='.data/report-qa',modulePath='.data/report-render/node_modules/@napi-rs/canvas/index.js']=process.argv.slice(2);
if(!input)throw new Error('Usage: node scripts/render-report-qa.mjs backup.json [output-dir] [native-canvas-module]');
const {createCanvas,Image,GlobalFonts,loadImage}=await import(pathToFileURL(path.resolve(root,modulePath)).href);
const out=path.resolve(root,output);await mkdir(out,{recursive:true});
for(const weight of ['Regular','Medium','SemiBold','Bold','ExtraBold'])GlobalFonts.registerFromPath(path.join(root,'public/fonts/BarlowCondensed-'+weight+'.ttf'),'Barlow Condensed');
if(process.platform==='win32')for(const font of ['msjh.ttc','msjhbd.ttc'])GlobalFonts.registerFromPath(path.join(process.env.WINDIR||'C:/Windows','Fonts',font));
const bytes=await readFile(path.resolve(input)),inputHash=createHash('sha256').update(bytes).digest('hex');
const backup=JSON.parse(bytes),catalog=JSON.parse(await readFile(path.join(root,'data/catalog.json'),'utf8'));
assert.equal(backup.format,'phi-vault-v1');assert.ok(Array.isArray(backup.records));
const charts=[...catalog.songs.flatMap(song=>song.charts.map(chart=>({...chart,title:song.title,artist:song.artist,artwork:song.artwork}))),...(backup.customCharts||[])];
const before=JSON.stringify({records:backup.records,charts,challenge:backup.challenge});
const model=makeReportModel(backup.username,backup.records,charts,backup.challenge);
assert.deepEqual(model.ranking,rankRecords(backup.records,charts));
const publicRoot=path.join(root,'public');
function assetPath(src){
  if(!src.startsWith('/'))throw new Error('QA loads only local public artwork');
  const resolved=path.resolve(publicRoot,src.slice(1));
  if(!resolved.startsWith(publicRoot+path.sep))throw new Error('Artwork outside public directory');
  return resolved;
}
const sources=[...new Set([...reportSlots(model,'full').flatMap(s=>s.record?[s.record.artwork]:[]),'/fallback.svg'])];
const images=new Map(),missing=[];
await Promise.all(sources.map(async src=>{try{images.set(src,await loadImage(assetPath(src)));}catch{missing.push(src);images.set(src,null);}}));
const results=[],pngs=new Map();
for(const mode of ['full','social'])for(const scale of [1,2]){
  const canvas=createCanvas(1,1),audit=renderReportCanvas(canvas,model,images,{mode,scale,watermark:true});
  assert.equal(audit.cards.length,mode==='full'?36:30);
  for(const card of audit.cards){
    assert.ok(card.x>=0&&card.y>=0&&card.x+446<=1500&&card.y+126<=(mode==='full'?2160:1800));
    if(card.title){assert.ok(card.title.widths.every(width=>width<=217+.001));assert.ok(card.title.lines.length<=2);assert.ok(card.title.top>=5&&card.title.bottom<=52,card.label+' title is vertically clipped');}
    if(card.score){assert.ok(card.score.left>=card.gradeRight+7,card.label+' score overlaps grade');assert.ok(card.score.right<=card.x+REPORT_CARD.textRight+.001);}
  }
  const png=canvas.toBuffer('image/png'),name=mode+'-'+audit.width+'.png';
  const meta=await sharp(png).metadata();assert.equal(meta.width,audit.width);assert.equal(meta.height,audit.height);
  await writeFile(path.join(out,name),png);pngs.set(mode+'-'+scale,png);
  results.push({name,width:meta.width,height:meta.height,bytes:png.length,cards:audit.cards.length,audit:audit.cards});
}
// Allow two color levels on <0.1% of channels for native Canvas antialias rounding.
const comparisons=[];
for(const scale of [1,2]){
  const crop={left:0,top:0,width:1500*scale,height:1709*scale};
  const full=await sharp(pngs.get('full-'+scale)).extract(crop).raw().toBuffer(),social=await sharp(pngs.get('social-'+scale)).extract(crop).raw().toBuffer();
  let maxDifference=0,differentChannels=0;
  for(let i=0;i<full.length;i++){const diff=Math.abs(full[i]-social[i]);if(diff)differentChannels++;maxDifference=Math.max(maxDifference,diff);}
  assert.ok(maxDifference<=2&&differentChannels/full.length<.001,'shared header and cards differ at scale '+scale);
  comparisons.push({scale,maxDifference,differentChannels});
}
await sharp(pngs.get('full-2')).resize({width:750}).png().toFile(path.join(out,'full-preview-750.png'));
const fullSlots=reportSlots(model,'full'),focus=['P1','P3','#1','#12','#15','#26','#27','#28','#33'];
const panels=[];
for(const [i,label] of focus.entries()){
  const slot=fullSlots.find(s=>s.label===label),crop={left:slot.x*2,top:(slot.y-6)*2,width:446*2,height:132*2};
  panels.push({input:await sharp(pngs.get('full-2')).extract(crop).png().toBuffer(),left:(i%3)*916+12,top:Math.floor(i/3)*288+12});
}
await sharp({create:{width:2748,height:864,channels:3,background:'#0d181f'}}).composite(panels).png().toFile(path.join(out,'focus-cards.png'));
// Force the actual fallback font metrics through the same layout checks.
const fallbackAudit=renderReportCanvas(createCanvas(1,1),model,images,{mode:'full',scale:1,watermark:true,numericFont:'Arial, sans-serif'});
for(const card of fallbackAudit.cards)if(card.score)assert.ok(card.score.left>=card.gradeRight+7,card.label+' fallback overlap');

// Exercise the browser-facing export wrapper with native Canvas and controlled
// local Image/font adapters. This is not an end-to-end browser test.
const nativeSrc=Object.getOwnPropertyDescriptor(Image.prototype,'src').set;
const canvases=[];
globalThis.Image=function(){
  const image=new Image();
  Object.defineProperty(image,'src',{set(src){try{nativeSrc.call(image,readFileSync(assetPath(src)));}catch{queueMicrotask(()=>image.onerror?.(new Error('missing')));}}});
  image.removeAttribute=()=>{image.onload=null;image.onerror=null;};return image;
};
let encoding='ok';
globalThis.document={fonts:{load:async()=>[{}]},createElement(tag){
  assert.equal(tag,'canvas');const canvas=createCanvas(1,1);canvases.push(canvas);
  canvas.toBlob=callback=>{if(encoding==='throw')throw new Error('tainted');queueMicrotask(()=>callback(encoding==='null'?null:new Blob([canvas.toBuffer('image/png')],{type:'image/png'})));};return canvas;
}};
const progress=[];
const exported=await createReport(backup.username,backup.records,charts,backup.challenge,{mode:'social',scale:2,onProgress:value=>progress.push(value)});
assert.equal(exported.blob.type,'image/png');assert.equal(exported.width,3000);assert.equal(exported.height,3600);assert.deepEqual(exported.warnings,[]);assert.ok(progress.length>3);
assert.ok(canvases.every(c=>c.width===1&&c.height===1),'canvas memory released');
for(const failure of ['null','throw']){
  encoding=failure;await assert.rejects(createReport(backup.username,backup.records,charts,backup.challenge,{mode:'social'}),failure==='null'?/無法生成 PNG/:/安全匯出/);
}
const controller=new AbortController();controller.abort();
await assert.rejects(createReport(backup.username,backup.records,charts,backup.challenge,{signal:controller.signal}),{name:'AbortError'});
assert.equal(JSON.stringify({records:backup.records,charts,challenge:backup.challenge}),before);
assert.equal(createHash('sha256').update(await readFile(path.resolve(input))).digest('hex'),inputHash);
const summary={sourceHash:inputHash,exportedAt:backup.exportedAt,records:backup.records.length,rks:model.ranking.rks.toFixed(4),missingArtwork:missing,comparisons,grades:[...new Set(model.ranking.best.map(r=>grade(r.score,r.status)))],difficulties:[...new Set(model.ranking.best.map(r=>r.difficulty))],apDuplicated:model.ranking.phi.filter(p=>model.ranking.best.some(b=>b.chartId===p.chartId)).length,outputs:results,boundaries:fullSlots.filter(s=>['#1','#27','#28','#33'].includes(s.label)).map(s=>({label:s.label,title:s.record?.title,difficulty:s.record?.difficulty,score:s.record?.score}))};
await writeFile(path.join(out,'results.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,outputs:results.map(({audit,...result})=>result)},null,2));
