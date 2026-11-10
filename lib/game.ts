export type Difficulty='EZ'|'HD'|'IN'|'AT'|'Legacy';
export type Chart={id:string;songId:string;difficulty:string;constant:number;level:number;title:string;artist:string;artwork:string};
export type ScoreRecord={chartId:string;score:number;acc:number;status:string;updatedAt:number};
export type Ranked=Chart & ScoreRecord & {rks:number};
export type ChallengeEntry={chartId:string;score:number;acc:number};
export function chartRks(acc:number,constant:number){return acc<70?0:constant*Math.pow((acc-55)/45,2);}
export function grade(score:number,status:string){return score===1000000||status==='AP'?'φ':status==='FC'?'V':score>=960000?'V':score>=920000?'S':score>=880000?'A':score>=820000?'B':score>=700000?'C':'F';}
export function gradeClass(score:number,status:string){return grade(score,status)==='φ'?'ap':status==='FC'?'fc':'normal';}
export function rankRecords(records:ScoreRecord[],charts:Chart[]){
 const map=new Map(charts.map(c=>[c.id,c]));
 const all=records.flatMap(r=>{const chart=map.get(r.chartId);return chart?[{...chart,...r,rks:chartRks(r.acc,chart.constant)}]:[];}).sort((a,b)=>b.rks-a.rks||b.acc-a.acc||b.score-a.score||a.id.localeCompare(b.id));
 const phi=all.filter(r=>r.acc===100&&r.score===1000000).slice(0,3);
 const best=all.slice(0,27),overflow=all.slice(27,33);
 return {all,best,phi,overflow,rks:([...best,...phi].reduce((s,r)=>s+r.rks,0))/30};
}
export function challengeTier(entries:ChallengeEntry[]){
 const total=entries.reduce((s,e)=>s+e.score,0);
 return total===3000000?{color:'rainbow',label:'虹色'}:total>=2940000?{color:'gold',label:'金色'}:total>=2850000?{color:'red',label:'紅色'}:total>=2700000?{color:'blue',label:'藍色'}:total>=2460000?{color:'green',label:'綠色'}:{color:'white',label:'白色'};
}
export function validateRecord(value:unknown):{chartId:string;score:number;acc:number;status:string}{
 if(!value||typeof value!=='object')throw new Error('成績格式不正確');const r=value as Record<string,unknown>;
 if(typeof r.chartId!=='string'||r.chartId.length>200||!Number.isInteger(r.score)||Number(r.score)<0||Number(r.score)>1000000||typeof r.acc!=='number'||!Number.isFinite(r.acc)||r.acc<0||r.acc>100||!['NONE','FC','AP'].includes(String(r.status)))throw new Error('請輸入 0–1,000,000 的整數分數，以及 0–100 的 ACC');
 const ap=r.status==='AP'||r.score===1000000||r.acc===100;
 return {chartId:r.chartId,score:ap?1000000:Number(r.score),acc:ap?100:r.acc,status:ap?'AP':String(r.status)};
}
