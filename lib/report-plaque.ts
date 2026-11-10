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
