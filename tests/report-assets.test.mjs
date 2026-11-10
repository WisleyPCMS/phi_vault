import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadReportImages,loadReportFonts} from '../lib/report-assets.ts';

function imageFactory(plans={},log=[]){
  return ()=>({width:100,height:100,naturalWidth:100,naturalHeight:100,onload:null,onerror:null,
    set src(value){this.value=value;log.push({src:value,cors:this.crossOrigin});const plan=plans[value];if(plan==='hang')return;setTimeout(()=>plan==='fail'?this.onerror?.():this.onload?.(),1);},
    removeAttribute(){this.removed=true;},
    async decode(){const plan=plans[this.value];if(plan==='decode-fail')throw new Error('decode failed');if(plan==='slow-decode')await new Promise(resolve=>setTimeout(resolve,20));this.decoded=true;},
  });
}

test('artwork is deduplicated, decoded, and cross-origin CORS is set before src',async()=>{
  const log=[],result=await loadReportImages(['/a','/a','https://other.example/art','data:image/png;base64,AAAA'],{imageFactory:imageFactory({'/a':'slow-decode'},log),baseUrl:'https://vault.example/',perImageTimeout:500,totalTimeout:1000});
  assert.equal(log.filter(x=>x.src==='/a').length,1);assert.equal(log.filter(x=>x.src==='/fallback.svg').length,1);
  assert.equal(log.find(x=>x.src==='/a').cors,undefined);assert.equal(log.find(x=>x.src.startsWith('data:')).cors,undefined);
  assert.equal(log.find(x=>x.src.startsWith('https:')).cors,'anonymous');
  assert.ok([...result.images.values()].every(x=>x.decoded));assert.deepEqual(result.missing,[]);
});

test('failed, undecodable and timed-out images finish with an explicit missing list',async()=>{
  const result=await loadReportImages(['/failed','/decode','/timeout'],{imageFactory:imageFactory({'/failed':'fail','/decode':'decode-fail','/timeout':'hang'}),perImageTimeout:25,totalTimeout:200});
  assert.deepEqual(result.missing,['/failed','/decode','/timeout']);assert.ok(result.images.get('/fallback.svg'));
});

test('a bounded worker pool and total deadline stop a blocked artwork queue',async()=>{
  const log=[],sources=Array.from({length:10},(_,i)=>'/'+i),plans=Object.fromEntries(sources.map(src=>[src,'hang']));
  const result=await loadReportImages(sources,{imageFactory:imageFactory(plans,log),concurrency:2,perImageTimeout:1000,totalTimeout:25});
  assert.equal(log.length,2);assert.equal(result.missing.length,10);
});

test('cancelling image loading rejects instead of returning a partial success',async()=>{
  const controller=new AbortController();
  const pending=loadReportImages(['/hang'],{signal:controller.signal,imageFactory:imageFactory({'/hang':'hang'})});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
  await assert.rejects(loadReportImages([],{signal:controller.signal}),{name:'AbortError'});
});

test('font loading waits for all required weights and falls back on failure or deadline',async()=>{
  const requested=[];
  assert.equal(await loadReportFonts(undefined,{load:async font=>{requested.push(font);return [{}];}}),true);
  assert.equal(requested.length,3);assert.ok(requested.some(x=>x.startsWith('800')));
  assert.equal(await loadReportFonts(undefined,{load:async()=>[]}),false);
  assert.equal(await loadReportFonts(undefined,{load:()=>{throw new Error('unavailable');}}),false);
  assert.equal(await loadReportFonts(undefined,{load:()=>new Promise(()=>{})},20),false);
});

test('font wait supports cancellation',async()=>{
  const controller=new AbortController(),pending=loadReportFonts(controller.signal,{load:()=>new Promise(()=>{})});
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
});
