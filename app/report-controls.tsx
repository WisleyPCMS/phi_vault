'use client';
import {reportSize,type ReportMode,type ReportScale} from '../lib/report-layout';

export default function ReportControls({mode,scale,onMode,onScale,disabled=false}:{
  mode:ReportMode;scale:ReportScale;onMode:(value:ReportMode)=>void;onScale:(value:ReportScale)=>void;disabled?:boolean;
}) {
  const size=reportSize(mode,scale);
  return <div className="report-controls">
    <label>輸出範圍<select aria-label="成績圖輸出範圍" value={mode} disabled={disabled} onChange={e=>onMode(e.target.value as ReportMode)}>
      <option value="full">完整長圖 · P3 + B27 + Overflow</option><option value="social">社群分享 · P3 + B27</option>
    </select></label>
    <label>PNG 解析度<select aria-label="成績圖解析度" value={scale} disabled={disabled} onChange={e=>onScale(Number(e.target.value) as ReportScale)}>
      <option value={1}>標準 · 1500 px 寬</option><option value={2}>高清 · 3000 px 寬</option>
    </select></label>
    <p className="report-size-note">輸出尺寸 {size.width} × {size.height} · 三欄卡片 · PNG</p>
  </div>;
}
