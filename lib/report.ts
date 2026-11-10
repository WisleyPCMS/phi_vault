import { challengeTier,grade,gradeClass,rankRecords,type Chart,type ScoreRecord,type Ranked,type ChallengeEntry } from './game';
function loadImage(src:string):Promise<HTMLImageElement|null>{return new Promise(resolve=>{const img=new Image(),timer=setTimeout(()=>resolve(null),12000);img.onload=()=>{clearTimeout(timer);resolve(img);};img.onerror=()=>{clearTimeout(timer);resolve(null);};img.src=src;});}
export function drawChallengePlaque(ctx:CanvasRenderingContext2D,color:string,level:number,x:number,y:number,width=156,height=88){
 const edges:Record<string,string>={white:'#f1f5f4',green:'#62ff00',blue:'#00e4ff',red:'#ff6500',gold:'#f5f000',rainbow:'#00dcff'};
 const fills:Record<string,string>={white:'#d6e1de50',green:'#509b2b80',blue:'#2d899980',red:'#a34a248a',gold:'#aaa92985'};
 const edge=edges[color]||edges.white,top=y+height*.52,bottom=y+height*.94,left=x+width*.06,right=x+width*.94,slant=height*.12;
 ctx.save();const fill=ctx.createLinearGradient(left,top,right,bottom);
 if(color==='rainbow'){['#00bddd80','#4bbd5690','#a9b42c90','#ce3a55a0'].forEach((c,i)=>fill.addColorStop(i/3,c));}else{fill.addColorStop(0,edge+'12');fill.addColorStop(.2,fills[color]||fills.white);fill.addColorStop(.88,fills[color]||fills.white);fill.addColorStop(1,edge+'22');}
 ctx.beginPath();ctx.moveTo(left+slant,top);ctx.lineTo(right+slant,top);ctx.lineTo(right,bottom);ctx.lineTo(left,bottom);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
 const stripe=Math.max(3,width*.032);ctx.shadowBlur=12;ctx.shadowColor=edge;ctx.fillStyle=edge;ctx.beginPath();ctx.moveTo(left+slant,top);ctx.lineTo(left+slant+stripe,top);ctx.lineTo(left+stripe,bottom);ctx.lineTo(left,bottom);ctx.closePath();ctx.fill();
 ctx.shadowColor=color==='rainbow'?'#ff596c':edge;ctx.fillStyle=color==='rainbow'?'#ff596c':edge;ctx.beginPath();ctx.moveTo(right+slant-stripe,top);ctx.lineTo(right+slant,top);ctx.lineTo(right,bottom);ctx.lineTo(right-stripe,bottom);ctx.closePath();ctx.fill();
 ctx.shadowBlur=3;ctx.shadowColor='#ffffff30';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font=`300 ${Math.round(height*.96)}px Arial, sans-serif`;ctx.fillText(String(level),x+width*.53,y+height*.73);ctx.restore();
}
export async function generateReport(username:string,records:ScoreRecord[],charts:Chart[],challenge:ChallengeEntry[]|null,watermark=true){
 const {best,phi,overflow,rks}=rankRecords(records,charts),canvas=document.createElement('canvas');canvas.width=1500;canvas.height=2160;const ctx=canvas.getContext('2d')!;
 const bg=ctx.createLinearGradient(0,0,1500,2160);bg.addColorStop(0,'#0d181f');bg.addColorStop(.5,'#102c2c');bg.addColorStop(1,'#0c151d');ctx.fillStyle=bg;ctx.fillRect(0,0,1500,2160);
 ctx.strokeStyle='#85e2bb0c';for(let i=-2000;i<2000;i+=100){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+2160,2160);ctx.stroke();}
 const images=new Map<string,HTMLImageElement|null>();await Promise.all([...new Set([...phi,...best,...overflow].map(r=>r.artwork))].map(async src=>images.set(src,await loadImage(src))));
 const font=(size:number,weight=500)=>{ctx.font=`${weight} ${size}px Arial, "Microsoft JhengHei", sans-serif`;};
 const fit=(text:string,max:number)=>{let t=text;while(ctx.measureText(t).width>max&&t.length>0)t=t.slice(0,-1);return t===text?t:t+'…';};
 if(challenge){const tier=challengeTier(challenge),level=challenge.reduce((s,e)=>s+(charts.find(c=>c.id===e.chartId)?.level||0),0);drawChallengePlaque(ctx,tier.color,level,65,17,156,88);}else{ctx.fillStyle='#8eaaa7';font(17);ctx.fillText('課題未設定',80,76);}
 ctx.beginPath();ctx.moveTo(62,110);ctx.lineTo(239,110);ctx.lineTo(230,145);ctx.lineTo(53,145);ctx.closePath();ctx.fillStyle='#eef6f1';ctx.fill();ctx.textAlign='center';ctx.fillStyle='#13251f';font(28,700);ctx.fillText(rks.toFixed(4),146,136);ctx.textAlign='left';
 ctx.fillStyle='#f5faf8';font(47,700);ctx.fillText(fit(username,1165),270,96);ctx.fillStyle='#8eaaa7';font(16);ctx.fillText('RANKING SCORE / B27 + φ3',272,131);
 function section(title:string,sub:string,y:number){ctx.fillStyle='#b8f1d7';font(22,700);ctx.fillText(title,55,y);ctx.fillStyle='#73938c';font(15);ctx.fillText(sub,245,y);ctx.strokeStyle='#698d8540';ctx.beginPath();ctx.moveTo(540,y-7);ctx.lineTo(1445,y-7);ctx.stroke();}
 function card(r:Ranked|undefined,index:number,x:number,y:number,prefix:string){const w=446,h=126;ctx.save();ctx.beginPath();ctx.moveTo(x+25,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w-4,y+h);ctx.lineTo(x,y+h);ctx.closePath();ctx.clip();ctx.fillStyle='#1a2a2c';ctx.fillRect(x,y,w,h);
  const img=r?images.get(r.artwork):null;if(img){const ratio=Math.max(245/img.width,h/img.height);ctx.drawImage(img,x+(245-img.width*ratio)/2,y+(h-img.height*ratio)/2,img.width*ratio,img.height*ratio);}
  const tint=ctx.createLinearGradient(x+160,y,x+w,y);tint.addColorStop(0,'#10232825');tint.addColorStop(.3,r?.difficulty==='AT'?'#6c303ce8':'#194f59ee');tint.addColorStop(1,r?.difficulty==='AT'?'#703342':'#23616a');ctx.fillStyle=tint;ctx.fillRect(x+145,y,w-145,h);ctx.fillStyle=r?.difficulty==='AT'?'#f77887':'#7cdec9';ctx.fillRect(x+w-4,y,4,h);
  if(r){ctx.textAlign='right';ctx.fillStyle='#fff';font(r.title.length>25?14:18,600);ctx.fillText(fit(r.title,245),x+w-15,y+25);font(34,600);ctx.fillText(String(r.score),x+w-18,y+73);font(18);ctx.fillStyle='#daf0e9';ctx.fillText(r.acc.toFixed(2)+'%',x+w-18,y+106);ctx.textAlign='left';ctx.fillStyle=gradeClass(r.score,r.status)==='ap'?'#f1ed8b':gradeClass(r.score,r.status)==='fc'?'#7cceff':'#fff';font(44,800);ctx.fillText(grade(r.score,r.status),x+223,y+86);ctx.fillStyle=r.difficulty==='IN'?'#df132d':r.difficulty==='AT'?'#06070a':'#090e14ee';ctx.fillRect(x+2,y+87,82,39);ctx.fillStyle='#fff';font(13,700);ctx.fillText(r.difficulty+' '+r.constant.toFixed(1),x+9,y+102);font(15,700);ctx.fillText(r.rks.toFixed(2),x+9,y+120);
  }else{ctx.textAlign='center';ctx.fillStyle='#6c8580';font(18);ctx.fillText('尚無成績',x+w/2,y+73);ctx.textAlign='left';}
  ctx.restore();ctx.fillStyle='#eef6f1';ctx.beginPath();ctx.moveTo(x+15,y-5);ctx.lineTo(x+73,y-5);ctx.lineTo(x+67,y+15);ctx.lineTo(x+9,y+15);ctx.closePath();ctx.fill();ctx.fillStyle='#18342c';font(13,700);ctx.fillText(prefix+String(index+1),x+20,y+10);
 }
 section('φ 3','ALL PERFECT · TOP THREE',174);Array.from({length:3},(_,i)=>card(phi[i],i,55+i*473,197,'P'));
 section('BEST 27','YOUR HIGHEST RANKING SCORES',375);Array.from({length:27},(_,i)=>card(best[i],i,55+(i%3)*473,399+Math.floor(i/3)*148,'#'));
 section('OVERFLOW','NEXT SIX · KEEP PUSHING',1782);Array.from({length:6},(_,i)=>card(overflow[i],i+27,55+(i%3)*473,1806+Math.floor(i/3)*148,'#'));
 if(watermark){ctx.textAlign='center';ctx.fillStyle='#9bcbb7';font(14,700);ctx.fillText('PHI VAULT  /  EVERY BREAKTHROUGH, ARCHIVED.',750,2135);}
 return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('無法生成圖片')),'image/png'));
}
export function downloadFile(blob:Blob,filename:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
