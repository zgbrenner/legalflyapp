/** A source-coordinate projection. It does not invent idle activity. */
export class Atlas {
  constructor(canvas,caption){this.canvas=canvas;this.caption=caption;this.points=[];this.last=null;this.draw();}
  setManifest(m){this.manifest=m;this.points=m.sample.map((p,i)=>({...p,sampleIndex:i})).filter(p=>Array.isArray(p.position)&&p.position.length===3&&p.position.every(Number.isFinite));this.draw();}
  setFrame(frame){this.last=frame;this.draw();}
  clear(){this.last=null;this.draw();}
  draw(){
    const ctx=this.canvas.getContext('2d'),w=this.canvas.width,h=this.canvas.height;ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#2b3028';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#555c4d';ctx.lineWidth=1;
    for(const x of [30,w-30]){ctx.beginPath();ctx.moveTo(x,30);ctx.lineTo(x,45);ctx.moveTo(x,h-45);ctx.lineTo(x,h-30);ctx.stroke();}
    ctx.font='12px system-ui';ctx.fillStyle='#c4c6b6';ctx.fillText('MALE CNS / SOURCE SOMA POSITIONS',46,45);
    if(!this.points.length){ctx.font='italic 24px Georgia';ctx.textAlign='center';ctx.fillText('The nervous system is not loaded.',w/2,h/2);ctx.textAlign='left';return;}
    const xs=this.points.map(p=>p.position[0]),zs=this.points.map(p=>p.position[2]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    const scale=Math.min((w-130)/Math.max(1,maxX-minX),(h-160)/Math.max(1,maxZ-minZ)),dx=(w-(maxX-minX)*scale)/2,dy=(h-(maxZ-minZ)*scale)/2;
    const values=this.last?.values||[];const peak=Math.max(1e-10,...values.map(Math.abs));
    for(const p of this.points){const a=Math.abs(values[p.sampleIndex]||0)/peak;ctx.fillStyle=p.superclass.includes('vnc')?`rgba(201,166,112,${.25+a*.75})`:`rgba(209,219,188,${.19+a*.81})`;ctx.beginPath();ctx.arc(dx+(p.position[0]-minX)*scale,dy+(p.position[2]-minZ)*scale,1.3+a*2.8,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#c4c6b6';ctx.font='12px system-ui';ctx.fillText('X / Z projection · not reconstructed morphology',46,h-34);
    const omitted=this.manifest.sample.length-this.points.length;
    this.caption.textContent=this.last?`Step ${this.last.step}/24. ${this.last.active.toLocaleString()} neurons above |activity| 10⁻⁸. Whole-network RMS ${this.last.rms.toFixed(6)}. ${this.points.length.toLocaleString()} sampled soma positions; ${omitted} lack coordinates. Brightness is relative to this frame.`:`${this.points.length.toLocaleString()} recorded soma positions, sampled from the complete graph. ${omitted} sampled neurons lack coordinates and are omitted from the picture only. No activity has been simulated yet.`;
  }
}
