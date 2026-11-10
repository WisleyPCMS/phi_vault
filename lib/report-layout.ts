import {rankRecords, challengeTier, type Chart, type ScoreRecord, type ChallengeEntry} from './game.ts';

export type ReportMode = 'full' | 'social';
export type ReportScale = 1 | 2;
export const REPORT_WIDTH = 1500;
export const REPORT_CARD = {width:446, height:126, columnGap:27, rowStep:148, left:55, titleLeft:211, textRight:428};
export const REPORT_HEIGHTS:Record<ReportMode,number> = {full:2160, social:1800};
export const REPORT_MODE_LABELS:Record<ReportMode,string> = {full:'完整長圖', social:'社群分享版'};
export type ReportModel = ReturnType<typeof makeReportModel>;
export function reportSize(mode:ReportMode,scale:ReportScale) {
  if(!['full','social'].includes(mode)||![1,2].includes(scale))throw new Error('不支援的成績圖輸出設定');
  return {width:REPORT_WIDTH*scale,height:REPORT_HEIGHTS[mode]*scale};
}
export function makeReportModel(username:string,records:ScoreRecord[],charts:Chart[],challenge:ChallengeEntry[]|null) {
  // Ranking stays in game.ts. Both export modes use this exact same result.
  const ranking=rankRecords(records,charts);
  const plaque=challenge?{...challengeTier(challenge),level:challenge.reduce((total,e)=>total+(charts.find(c=>c.id===e.chartId)?.level||0),0)}:null;
  return {username,ranking,plaque};
}
export function reportSlots(model:ReportModel,mode:ReportMode) {
  const phi=Array.from({length:3},(_,i)=>({record:model.ranking.phi[i],rank:i+1,label:'P'+(i+1),x:55+i*473,y:211,group:'phi' as const}));
  const best=Array.from({length:27},(_,i)=>({record:model.ranking.best[i],rank:i+1,label:'#'+(i+1),x:55+(i%3)*473,y:399+Math.floor(i/3)*148,group:'best' as const}));
  const overflow=Array.from({length:6},(_,i)=>({record:model.ranking.overflow[i],rank:i+28,label:'#'+(i+28),x:55+(i%3)*473,y:1806+Math.floor(i/3)*148,group:'overflow' as const}));
  return [...phi,...best,...(mode==='full'?overflow:[])];
}
export function graphemes(text:string):string[] {
  if(typeof Intl.Segmenter==='function')return Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),part=>part.segment);
  return Array.from(text);
}
export function ellipsize(text:string,width:number,measure:(text:string)=>number) {
  if(measure(text)<=width)return text;
  const parts=graphemes(text),ellipsis='…';
  if(measure(ellipsis)>width)return '';
  let lo=0,hi=parts.length;
  while(lo<hi){const middle=Math.ceil((lo+hi)/2);if(measure(parts.slice(0,middle).join('')+ellipsis)<=width)lo=middle;else hi=middle-1;}
  return parts.slice(0,lo).join('').trimEnd()+ellipsis;
}
export function layoutTitle(original:string,width:number,measure:(text:string,size:number)=>number) {
  const text=original.replace(/\s+/g,' ').trim();
  for(let size=21;size>=17;size-=.5)if(measure(text,size)<=width)return {lines:[text],size,truncated:false};
  const size=18,parts=graphemes(text);let lo=0,hi=parts.length;
  while(lo<hi){const middle=Math.ceil((lo+hi)/2);if(measure(parts.slice(0,middle).join(''),size)<=width)lo=middle;else hi=middle-1;}
  if(lo===0)return {lines:[ellipsize(text,width,t=>measure(t,size))],size,truncated:true};
  // Prefer a word boundary without leaving more than half the first line empty.
  const candidate=parts.slice(0,lo).join(''),space=candidate.lastIndexOf(' ');
  const first=space>candidate.length*.55?candidate.slice(0,space):candidate;
  const rest=text.slice(first.length).trimStart();
  const last=ellipsize(rest,width,t=>measure(t,size));
  return {lines:[first.trimEnd(),last],size,truncated:last!==rest};
}
export function fitSingleLine(text:string,width:number,maxSize:number,minSize:number,measure:(text:string,size:number)=>number) {
  for(let size=maxSize;size>=minSize;size--)if(measure(text,size)<=width)return {text,size};
  return {text:ellipsize(text,width,t=>measure(t,minSize)),size:minSize};
}
export function coverCrop(imageWidth:number,imageHeight:number,width:number,height:number) {
  if(imageWidth<=0||imageHeight<=0)throw new Error('圖片尺寸不正確');
  const ratio=Math.max(width/imageWidth,height/imageHeight);
  return {x:(width-imageWidth*ratio)/2,y:(height-imageHeight*ratio)/2,width:imageWidth*ratio,height:imageHeight*ratio};
}
export function numberLayout(text:string,maxWidth:number,maxSize:number,minSize:number,measure:(text:string,size:number)=>number) {
  const chars=Array.from(text);
  for(let size=maxSize;size>=minSize;size--){
    const cell=Math.max(...Array.from('0123456789',digit=>measure(digit,size))),gap=.4;
    const advances=chars.map(char=>/\d/.test(char)?cell:measure(char,size));
    const width=advances.reduce((sum,value)=>sum+value,0)+Math.max(0,chars.length-1)*gap;
    if(width<=maxWidth||size===minSize)return {size,width,cell,gap,chars,advances};
  }
  throw new Error('數字排版設定不正確');
}
