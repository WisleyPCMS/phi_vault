import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankRecords} from '../lib/game.ts';
import {reportSize,makeReportModel,reportSlots,layoutTitle,ellipsize,numberLayout,coverCrop,graphemes} from '../lib/report-layout.ts';

const measure=(text,size=18)=>graphemes(text).length*size*.6;
const charts=Array.from({length:40},(_,i)=>({id:String(i),songId:String(i),title:'Original title '+i,artist:'test',artwork:'/test.webp',difficulty:i%2?'AT':'IN',constant:20-i*.1,level:19}));
const records=charts.map(c=>({chartId:c.id,score:1000000,acc:100,status:'AP',updatedAt:1}));

test('both modes retain the same ranking, fixed slots, AP duplication and input data',()=>{
  const before=JSON.stringify({charts,records});
  const model=makeReportModel('test',records,charts,null);
  assert.deepEqual(model.ranking,rankRecords(records,charts));
  const full=reportSlots(model,'full'),social=reportSlots(model,'social');
  assert.equal(full.length,36);assert.equal(social.length,30);
  assert.deepEqual(full.slice(0,30),social);
  for(const [label,chartId,y] of [['#1','0',399],['#27','26',1583],['#28','27',1806],['#33','32',1954]]){
    const slot=full.find(s=>s.label===label);assert.equal(slot.record.chartId,chartId);assert.equal(slot.y,y);
  }
  for(const s of full.slice(0,3))assert.ok(social.slice(3).some(b=>b.record.chartId===s.record.chartId));
  assert.equal(JSON.stringify({charts,records}),before);
  assert.equal(reportSlots(makeReportModel('empty',[],charts,null),'full').filter(s=>s.record).length,0);
});

test('physical PNG dimensions cover both resolutions and reject unsupported options',()=>{
  for(const [mode,height] of [['full',2160],['social',1800]])for(const scale of [1,2])assert.deepEqual(reportSize(mode,scale),{width:1500*scale,height:height*scale});
  assert.throws(()=>reportSize('other',1));assert.throws(()=>reportSize('full',3));
});

test('long Latin, CJK and emoji titles fit two bounded lines without changing originals',()=>{
  for(const original of ['What do you want more than a Happy ending?','祈 -我ら神祖と共に歩む者なり-','非常長的中文曲名'.repeat(10),'👩‍👩‍👧‍👦🇲🇴é'.repeat(30),'  full   original\n title  ']){
    const before=original,title=layoutTitle(original,217,measure);
    assert.equal(original,before);assert.ok(title.lines.length<=2);
    assert.ok(title.lines.every(line=>measure(line,title.size)<=217));
    assert.ok(title.size>=17);
    for(const line of title.lines)assert.ok(!/[\uD800-\uDBFF]$/.test(line));
  }
  const short=layoutTitle('Ark',217,measure);assert.equal(short.size,21);assert.deepEqual(short.lines,['Ark']);
  assert.ok(layoutTitle('x'.repeat(200),217,measure).truncated);
});

test('ellipsis is included in the measured width and never splits graphemes',()=>{
  const text='👩‍👩‍👧‍👦🇲🇴é'.repeat(20),result=ellipsize(text,40,t=>graphemes(t).length*10);
  assert.equal(graphemes(result).length,4);assert.ok(result.endsWith('…'));
  assert.equal(ellipsize('abcdef',1,measure),'');assert.equal(ellipsize('abc',100,measure),'abc');
});

test('tabular score widths are stable across digits and adapt to fallback fonts',()=>{
  const proportional=(text,size)=>[...text].reduce((s,c)=>s+(c==='1'?.3:.6)*size,0);
  const a=numberLayout('111111',154,40,32,proportional),b=numberLayout('888888',154,40,32,proportional);
  assert.equal(a.width,b.width);assert.deepEqual(a.advances,b.advances);
  assert.ok(numberLayout('1000000',154,40,32,proportional).width<=154);
});

test('artwork uses a centered cover crop for portrait, landscape and square images',()=>{
  for(const [iw,ih] of [[100,100],[300,100],[100,300]]){
    const crop=coverCrop(iw,ih,245,126);assert.ok(crop.width>=245&&crop.height>=126);
    assert.ok(Math.abs(crop.x*2+crop.width-245)<1e-8);assert.ok(Math.abs(crop.y*2+crop.height-126)<1e-8);
  }
  assert.throws(()=>coverCrop(0,100,245,126));
});
