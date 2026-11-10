'use client';
import {useState} from 'react';
import {Download, Upload, LoaderCircle, CheckCircle2, FileJson} from 'lucide-react';
import {MAX_BACKUP_BYTES, buildBackup, parseBackup, metadata, restoreArtwork, type Backup, type BackupData, type ArtworkFile} from '../lib/backup';
import {prepareArtwork} from '../lib/upload-image';
import {downloadFile} from '../lib/report';
import type {Chart} from '../lib/game';

export default function DataTransfer({data, charts, onBusy, onImported}: {
  data:BackupData; charts:Chart[]; onBusy:(value:boolean)=>void; onImported:()=>Promise<unknown>;
}) {
  const [working,setWorking]=useState(false),[includeImages,setIncludeImages]=useState(true);
  const [incoming,setIncoming]=useState<Backup|null>(null),[failed,setFailed]=useState<ArtworkFile[]>([]);
  const [progress,setProgress]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function request(path:string,method='POST',body?:unknown) {
    if(data.profile.id){if(body instanceof FormData)body.set('targetProfileId',data.profile.id);else body={...(body as object),targetProfileId:data.profile.id};}
    const response=await fetch('/api/'+path,{method,headers:body instanceof FormData?undefined:{'Content-Type':'application/json'},body:body instanceof FormData?body:JSON.stringify(body)});
    let result:{error?:string};try{result=await response.json() as {error?:string};}catch{throw new Error('網站暫時無法處理，請稍後重試');}
    if(!response.ok)throw new Error(result?.error||'資料儲存失敗');return result;
  }
  async function run(work:()=>Promise<void>) {
    setWorking(true);onBusy(true);setError('');setMessage('');
    try{await work();}catch(error){setError((error as Error).message);}finally{setWorking(false);onBusy(false);setProgress('');}
  }
  async function exportData() {
    await run(async()=>{
      const backup=await buildBackup(data,includeImages,setProgress);
      const blob=new Blob([JSON.stringify(backup)],{type:'application/json'});
      if(blob.size>MAX_BACKUP_BYTES)throw new Error('備份超過 64 MB，請取消包含曲繪後再試');
      downloadFile(blob,'PHI-VAULT-'+data.profile.username.replace(/[<>:"/\\|?*]/g,'_')+'-transfer.json');
      setMessage(`已下載 ${backup.records.length} 筆成績及 ${backup.artworkFiles.length} 張自訂曲繪。請到新網站登入，選擇這份備份合併。`);
    });
  }
  async function choose(file:File) {
    await run(async()=>{
      setIncoming(null);setFailed([]);
      if(file.size>MAX_BACKUP_BYTES)throw new Error('備份檔案上限為 64 MB');
      let value;try{value=JSON.parse(await file.text());}catch{throw new Error('請選擇有效的 JSON 備份');}
      setIncoming(parseBackup(value,charts));
    });
  }
  async function importData(retry=false) {
    if(!incoming)return;
    await run(async()=>{
      if(!retry){setProgress('正在合併成績與課題…');await request('import','POST',metadata(incoming));}
      const images=retry?failed:incoming.artworkFiles;
      const result=await restoreArtwork(images,request,prepareArtwork,setProgress);
      setFailed(result.failed);await onImported();
      setMessage(result.failed.length?`成績已合併；本次 ${result.restored} 張曲繪已還原，${result.failed.length} 張尚未完成，可按下方按鈕重試。`:
        retry?'剩餘曲繪已全部還原。':`已將 ${incoming.records.length} 筆成績、課題及 ${images.length} 張自訂曲繪合併到「${data.profile.username}」。`);
    });
  }
  return <div className="transfer-content">
    <p className="panel-description">把原站的紀錄帶到新網站。先下載資料備份，再到新網站登入你的帳號，選擇備份並合併。</p>
    <section className="transfer-section"><h3><Download size={17}/>下載這個帳號的完整資料</h3>
      <p>包含最佳分數、ACC、FC/AP、課題及自訂譜面。</p>
      <label className="transfer-checkbox"><input type="checkbox" checked={includeImages} disabled={working} onChange={e=>setIncludeImages(e.target.checked)}/>包含自訂曲繪（{data.artworks.length} 張）</label>
      <button className="button secondary" disabled={working} onClick={exportData}><Download size={16}/>下載我的資料</button>
    </section>
    <section className="transfer-section"><h3><Upload size={17}/>從舊版或其他裝置匯入</h3>
      <p>選檔後會先顯示預覽，確認後才合併到目前帳號。較佳的分數與 ACC 會保留。</p>
      <label className={'button secondary '+(working?'disabled':'')}><FileJson size={16}/>選擇資料備份<input hidden type="file" accept="application/json,.json" disabled={working} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void choose(file);}}/></label>
      {incoming&&<div className="transfer-preview"><div><small>備份帳號</small><strong>{incoming.username}</strong></div><div><small>合併至</small><strong>{data.profile.username}</strong></div>
        <p>{incoming.records.length} 筆成績 · {incoming.customCharts.length} 張自訂譜面 · {incoming.challenge?'包含課題':'未包含課題'} · {incoming.artworkFiles.length} 張曲繪</p>
        <button className="button primary full" disabled={working} onClick={()=>void importData(false)}><CheckCircle2 size={17}/>合併到目前帳號</button>
      </div>}
    </section>
    {working&&<p className="transfer-progress" role="status"><LoaderCircle size={17} className="spin"/>{progress||'正在讀取備份…'}</p>}
    {message&&<p className="transfer-success" role="status">{message}</p>}
    {failed.length>0&&<button className="button secondary" disabled={working} onClick={()=>void importData(true)}>重試未完成的 {failed.length} 張曲繪</button>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <p className="form-footnote">備份上限 64 MB，不包含密碼與登入憑證。請自行保管檔案；新網站需先連接資料庫才能匯入。</p>
  </div>;
}
