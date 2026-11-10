export type ReportImages = Map<string,HTMLImageElement|null>;
type AssetOptions = {signal?:AbortSignal;onProgress?:(done:number,total:number)=>void;imageFactory?:()=>HTMLImageElement;baseUrl?:string;perImageTimeout?:number;totalTimeout?:number;concurrency?:number};
export function cancelled(signal?:AbortSignal) {
  if(signal?.aborted)throw new DOMException('已取消生成成績圖','AbortError');
}
function readImage(src:string,signal:AbortSignal,options:AssetOptions):Promise<HTMLImageElement|null> {
  return new Promise(resolve=>{
    if(signal.aborted){resolve(null);return;}
    const image=options.imageFactory?.()||new Image();let settled=false;
    const finish=(result:HTMLImageElement|null)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);
      image.onload=null;image.onerror=null;
      if(!result)image.removeAttribute?.('src');
      resolve(result);
    };
    const abort=()=>finish(null),timer=setTimeout(abort,options.perImageTimeout??8000);
    signal.addEventListener('abort',abort,{once:true});
    image.onerror=()=>finish(null);
    image.onload=()=>{
      const decoded=()=>finish((image.naturalWidth||image.width)>0&&(image.naturalHeight||image.height)>0?image:null);
      if(typeof image.decode==='function')Promise.resolve().then(()=>image.decode()).then(decoded,()=>finish(null));else decoded();
    };
    try{
      const base=options.baseUrl||(typeof location==='undefined'?'http://localhost/':location.href),url=new URL(src,base);
      if(['http:','https:'].includes(url.protocol)&&url.origin!==new URL(base).origin)image.crossOrigin='anonymous';
      image.decoding='async';image.src=src;
    }catch{finish(null);}
  });
}
export async function loadReportImages(sources:string[],options:AssetOptions={}) {
  cancelled(options.signal);
  const unique=[...new Set(sources)],queue=[...new Set([...unique,'/fallback.svg'])],images:ReportImages=new Map();
  const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,options.totalTimeout??18000);
  options.signal?.addEventListener('abort',abort,{once:true});let next=0,done=0;
  const worker=async()=>{
    while(next<queue.length){const src=queue[next++];images.set(src,controller.signal.aborted?null:await readImage(src,controller.signal,options));done++;options.onProgress?.(done,queue.length);}
  };
  try{await Promise.all(Array.from({length:Math.min(options.concurrency??6,queue.length)},worker));}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
  cancelled(options.signal);
  return {images,missing:unique.filter(src=>!images.get(src))};
}
export async function loadReportFonts(signal?:AbortSignal,fontSet:FontFaceSet|undefined=typeof document==='undefined'?undefined:document.fonts,timeout=4000):Promise<boolean> {
  cancelled(signal);
  if(!fontSet)return false;
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(value:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(value);};
    const abort=()=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('已取消生成成績圖','AbortError'));};
    const timer=setTimeout(()=>finish(false),timeout);signal?.addEventListener('abort',abort,{once:true});
    Promise.all([600,700,800].map(weight=>Promise.resolve().then(()=>fontSet.load(`${weight} 40px "Barlow Condensed"`,'0123456789.%VSφ'))))
      .then(faces=>finish(faces.every(face=>face.length>0)),()=>finish(false));
  });
}
