import {grade, gradeClass, type Chart, type ScoreRecord, type ChallengeEntry} from './game.ts';
import {drawChallengePlaque} from './report-plaque.ts';
import {cancelled, loadReportFonts, loadReportImages, type ReportImages} from './report-assets.ts';
import {REPORT_WIDTH, REPORT_HEIGHTS, REPORT_CARD, makeReportModel, reportSlots, reportSize, layoutTitle, fitSingleLine, numberLayout, coverCrop, type ReportMode, type ReportScale, type ReportModel} from './report-layout.ts';

export type ReportOptions = {mode?:ReportMode;scale?:ReportScale;watermark?:boolean;signal?:AbortSignal;onProgress?:(message:string)=>void};
export type ReportResult = {blob:Blob;width:number;height:number;mode:ReportMode;scale:ReportScale;warnings:string[]};
type CanvasOptions = {mode:ReportMode;scale:ReportScale;watermark:boolean;numericFont?:string};
const TEXT_FONT='Arial, "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
const NUMERIC_FONT='"Barlow Condensed", Arial, sans-serif';

export function renderReportCanvas(canvas:HTMLCanvasElement,model:ReportModel,images:ReportImages,options:CanvasOptions) {
  const {width,height}=reportSize(options.mode,options.scale),baseHeight=REPORT_HEIGHTS[options.mode];
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context||canvas.width!==width||canvas.height!==height)throw new Error('此裝置無法建立高清圖片，請改用標準解析度');
  const ctx:CanvasRenderingContext2D=context;
  const numericFont=options.numericFont||NUMERIC_FONT;
  ctx.save();ctx.scale(options.scale,options.scale);ctx.textBaseline='alphabetic';ctx.textAlign='left';
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  if('fontKerning' in ctx)ctx.fontKerning='none';
  const font=(size:number,weight=600,numeric=false)=>{ctx.font=`${weight} ${size}px ${numeric?numericFont:TEXT_FONT}`;};
  const measure=(text:string,size:number,weight=600,numeric=false)=>{font(size,weight,numeric);return ctx.measureText(text).width;};
  function number(text:string,x:number,y:number,maxWidth:number,maxSize:number,minSize:number,align:'left'|'right'|'center'='right',weight=700,color='#f8fcfa') {
    const layout=numberLayout(text,maxWidth,maxSize,minSize,(value,size)=>measure(value,size,weight,true));
    font(layout.size,weight,true);ctx.fillStyle=color;ctx.textAlign='left';
    const left=x-(align==='right'?layout.width:align==='center'?layout.width/2:0);let offset=0;
    layout.chars.forEach((char,i)=>{const actual=ctx.measureText(char).width;ctx.fillText(char,left+offset+(layout.advances[i]-actual)/2,y);offset+=layout.advances[i]+layout.gap;});
    return {left,right:left+layout.width,size:layout.size,width:layout.width};
  }
  // Keep the same background coordinates in both modes: the shared cards are identical.
  const bg=ctx.createLinearGradient(0,0,REPORT_WIDTH,REPORT_HEIGHTS.full);
  bg.addColorStop(0,'#0d181f');bg.addColorStop(.5,'#102c2c');bg.addColorStop(1,'#0c151d');
  ctx.fillStyle=bg;ctx.fillRect(0,0,REPORT_WIDTH,baseHeight);
  ctx.strokeStyle='#85e2bb0c';
  for(let i=-2200;i<2200;i+=100){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+REPORT_HEIGHTS.full,REPORT_HEIGHTS.full);ctx.stroke();}

  if(model.plaque)drawChallengePlaque(ctx,model.plaque.color,model.plaque.level,65,17,156,88);
  else{ctx.fillStyle='#b2c7c0';font(17);ctx.fillText('課題未設定',80,76);}
  ctx.beginPath();ctx.moveTo(62,110);ctx.lineTo(239,110);ctx.lineTo(230,145);ctx.lineTo(53,145);ctx.closePath();ctx.fillStyle='#eef6f1';ctx.fill();
  number(model.ranking.rks.toFixed(4),146,136,165,28,24,'center',700,'#13251f');
  const username=fitSingleLine(model.username,1165,47,32,(value,size)=>measure(value,size,700));
  ctx.fillStyle='#f5faf8';font(username.size,700);ctx.fillText(username.text,270,96);
  ctx.fillStyle='#b2c7bf';font(16);ctx.fillText('RANKING SCORE / B27 + φ3',272,131);
  ctx.fillStyle='#aec6bc';font(16,500);ctx.fillText('P3 取最高定數的 3 張 AP；可與 B27 重複計入，總 RKS 固定除以 30。',55,160);

  function section(title:string,subtitle:string,y:number) {
    ctx.fillStyle='#b8f1d7';font(22,700);ctx.fillText(title,55,y);
    ctx.fillStyle='#a6beb4';font(15,600);ctx.fillText(subtitle,245,y);
    ctx.strokeStyle='#698d8540';ctx.beginPath();ctx.moveTo(600,y-7);ctx.lineTo(1445,y-7);ctx.stroke();
  }
  section('φ 3','ALL PERFECT · TOP THREE',188);
  section('BEST 27','YOUR HIGHEST RANKING SCORES',375);
  if(options.mode==='full')section('OVERFLOW','NEXT SIX · KEEP PUSHING',1782);
  const audit:{label:string;chartId?:string;x:number;y:number;title?:{lines:string[];size:number;widths:number[];right:number;top:number;bottom:number};score?:{left:number;right:number;size:number;width:number};gradeRight?:number}[]=[];
  for(const slot of reportSlots(model,options.mode)) {
    const {record:r,x,y,label}=slot,{width:w,height:h}=REPORT_CARD;
    ctx.save();ctx.beginPath();ctx.moveTo(x+25,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w-4,y+h);ctx.lineTo(x,y+h);ctx.closePath();ctx.clip();
    ctx.fillStyle='#1a2a2c';ctx.fillRect(x,y,w,h);
    const image=r?(images.get(r.artwork)||images.get('/fallback.svg')):null;
    ctx.save();ctx.beginPath();ctx.rect(x,y,245,h);ctx.clip();
    if(image) {
      const crop=coverCrop(image.naturalWidth||image.width,image.naturalHeight||image.height,245,h);
      ctx.drawImage(image,x+crop.x,y+crop.y,crop.width,crop.height);
    } else {
      ctx.fillStyle='#18322e';ctx.fillRect(x,y,245,h);ctx.strokeStyle='#5e8c7838';
      for(let line=-h;line<245;line+=26){ctx.beginPath();ctx.moveTo(x+line,y);ctx.lineTo(x+line+h,y+h);ctx.stroke();}
      ctx.fillStyle='#9cc6b580';font(75,600);ctx.fillText('φ',x+85,y+90);
    }
    ctx.restore();
    const tint=ctx.createLinearGradient(x+160,y,x+w,y);
    tint.addColorStop(0,'#10232830');tint.addColorStop(.3,r?.difficulty==='AT'?'#522d38f2':'#194f59f2');
    tint.addColorStop(1,r?.difficulty==='AT'?'#5b303c':'#23616a');ctx.fillStyle=tint;ctx.fillRect(x+145,y,w-145,h);
    ctx.fillStyle=r?.difficulty==='AT'?'#ce8795':'#7cdec9';ctx.fillRect(x+w-4,y,4,h);
    const metrics:typeof audit[number]={label,chartId:r?.chartId,x,y};
    if(r) {
      const title=layoutTitle(r.title,REPORT_CARD.textRight-REPORT_CARD.titleLeft,(value,size)=>measure(value,size,600));
      ctx.save();ctx.beginPath();ctx.rect(x+REPORT_CARD.titleLeft,y+5,REPORT_CARD.textRight-REPORT_CARD.titleLeft,47);ctx.clip();
      ctx.fillStyle='#f1f7f4';font(title.size,600);ctx.textAlign='right';
      // Center actual glyph bounds, including CJK ascenders and Latin descenders.
      const bounds=title.lines.map(line=>ctx.measureText(line));
      const ascent=Math.max(...bounds.map(b=>b.actualBoundingBoxAscent??title.size)),descent=Math.max(...bounds.map(b=>b.actualBoundingBoxDescent??title.size*.25));
      const blockHeight=ascent+descent+(title.lines.length-1)*21,top=5+(47-blockHeight)/2,baseline=top+ascent;
      title.lines.forEach((line,index)=>ctx.fillText(line,x+REPORT_CARD.textRight,y+baseline+index*21));
      metrics.title={lines:title.lines,size:title.size,widths:bounds.map(b=>b.width),right:x+REPORT_CARD.textRight,top,bottom:top+blockHeight};ctx.restore();
      const result=number(String(r.score),x+REPORT_CARD.textRight,y+86,154,40,32);
      metrics.score=result;
      const labelGrade=grade(r.score,r.status);
      ctx.fillStyle=gradeClass(r.score,r.status)==='ap'?'#f1ed98':gradeClass(r.score,r.status)==='fc'?'#8ed3ff':'#f7faf7';
      font(37,800,true);ctx.textAlign='left';ctx.fillText(labelGrade,x+220,y+85);
      metrics.gradeRight=x+220+ctx.measureText(labelGrade).width;
      ctx.strokeStyle='#d9eee650';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+215,y+96);ctx.lineTo(x+REPORT_CARD.textRight,y+96);ctx.stroke();
      ctx.fillStyle='#c4dad0';font(11,700);ctx.fillText('ACC',x+216,y+116);
      number(r.acc.toFixed(2)+'%',x+REPORT_CARD.textRight,y+117,136,20,18,'right',600,'#eef7f2');
      // Preserve the original red IN / black AT lower-left information band.
      ctx.fillStyle=r.difficulty==='IN'?'#c72b41':r.difficulty==='AT'?'#07090c':'#101920';ctx.fillRect(x+2,y+82,110,44);
      ctx.strokeStyle=r.difficulty==='IN'?'#f88c98':'#77828b';ctx.lineWidth=1;ctx.strokeRect(x+2.5,y+82.5,109,43);
      const difficulty=fitSingleLine(r.difficulty+' '+r.constant.toFixed(1),92,17,14,(value,size)=>measure(value,size,700));
      ctx.fillStyle='#fff';font(difficulty.size,700);ctx.fillText(difficulty.text,x+12,y+100);
      number(r.rks.toFixed(2),x+12,y+121,65,18,16,'left',700,'#fff');
      ctx.fillStyle='#e6edf1';font(11,700);ctx.fillText('RKS',x+83,y+120);
    } else {
      ctx.textAlign='center';ctx.fillStyle='#b3c8c0';font(18);ctx.fillText('尚無成績',x+w/2,y+73);ctx.textAlign='left';
    }
    ctx.restore();
    ctx.fillStyle='#eef6f1';ctx.beginPath();ctx.moveTo(x+15,y-5);ctx.lineTo(x+73,y-5);ctx.lineTo(x+67,y+15);ctx.lineTo(x+9,y+15);ctx.closePath();ctx.fill();
    ctx.fillStyle='#18342c';font(14,700,true);ctx.fillText(label,x+20,y+10);audit.push(metrics);
  }
  if(options.watermark){ctx.textAlign='center';ctx.fillStyle='#abcfc0';font(15,700);ctx.fillText('PHI VAULT  /  EVERY BREAKTHROUGH, ARCHIVED.',750,baseHeight-25);}
  ctx.restore();
  return {width,height,cards:audit};
}

function encodePng(canvas:HTMLCanvasElement,signal?:AbortSignal):Promise<Blob> {
  cancelled(signal);
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(blob:Blob|null,error?:unknown)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(error)reject(error);else if(blob?.size)resolve(blob);else reject(new Error('無法生成 PNG，請改用標準解析度後重試'));
    };
    const abort=()=>finish(null,new DOMException('已取消生成成績圖','AbortError'));
    const timer=setTimeout(()=>finish(null,new Error('PNG 編碼逾時，請改用標準解析度後重試')),20000);
    signal?.addEventListener('abort',abort,{once:true});
    try{canvas.toBlob(blob=>finish(blob),'image/png');}catch{finish(null,new Error('圖片無法安全匯出，請重新載入曲繪後再試'));}
  });
}
export async function createReport(username:string,records:ScoreRecord[],charts:Chart[],challenge:ChallengeEntry[]|null,options:ReportOptions={}):Promise<ReportResult> {
  const mode=options.mode??'full',scale=options.scale??1;
  reportSize(mode,scale);cancelled(options.signal);
  const model=makeReportModel(username,records,charts,challenge);
  const sources=reportSlots(model,mode).flatMap(slot=>slot.record?[slot.record.artwork]:[]);
  options.onProgress?.('準備字體與曲繪…');
  const [fontReady,assets]=await Promise.all([
    loadReportFonts(options.signal),
    loadReportImages(sources,{signal:options.signal,onProgress:(done,total)=>options.onProgress?.(`載入曲繪 ${done} / ${total}…`)}),
  ]);
  cancelled(options.signal);
  const warnings:string[]=[];
  if(assets.missing.length)warnings.push(`${assets.missing.length} 張曲繪未能載入，已使用預設封面；可重新生成再試。`);
  if(!fontReady)warnings.push('數字字體未能及時載入，已使用備用字體並重新計算文字寬度。');
  const canvas=document.createElement('canvas');
  try {
    options.onProgress?.('繪製成績卡片…');cancelled(options.signal);
    const {width,height}=renderReportCanvas(canvas,model,assets.images,{mode,scale,watermark:options.watermark??true,numericFont:fontReady?NUMERIC_FONT:'Arial, sans-serif'});
    options.onProgress?.('正在生成高解析 PNG…');
    const blob=await encodePng(canvas,options.signal);cancelled(options.signal);
    return {blob,width,height,mode,scale,warnings};
  } finally {canvas.width=1;canvas.height=1;}
}
// Keep the original public API for existing callers.
export async function generateReport(username:string,records:ScoreRecord[],charts:Chart[],challenge:ChallengeEntry[]|null,watermark=true,options:ReportOptions={}) {
  return (await createReport(username,records,charts,challenge,{...options,watermark})).blob;
}
export function downloadFile(blob:Blob,filename:string) {
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
  document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
