import type { TrackId, Vec2 } from '../../shared/types';
export interface TrackConfig { id: TrackId; name:string; difficulty:string; description:string; width:number; points: readonly (readonly [number,number])[]; sky:string; ground:string; shoulder:string; foliage:string[]; fog:string; sun:string }
export const TRACKS: Record<TrackId,TrackConfig> = {
  coastal:{id:'coastal',name:'Coastal Drive',difficulty:'Easy',description:'Salt air, open curves, and a little room to breathe.',width:15,
    points:[[0,90],[-65,90],[-112,55],[-120,-5],[-85,-65],[-20,-90],[55,-78],[105,-35],[110,25],[70,65]],
    sky:'#b4d3da',ground:'#7d9b72',shoulder:'#cbbb91',foliage:['#50795b','#648c62','#8b9b65'],fog:'#b4d3da',sun:'#fff0d1'},
  alpine:{id:'alpine',name:'Alpine Pass',difficulty:'Medium',description:'Pine-scented switchbacks beneath a quiet mountain sky.',width:13,
    points:[[0,100],[-70,98],[-115,60],[-100,12],[-50,8],[-45,-30],[-110,-50],[-95,-100],[-25,-110],[25,-70],[22,-20],[75,-20],[120,25],[100,85],[50,110]],
    sky:'#b0c7d0',ground:'#6d886b',shoulder:'#a2a28b',foliage:['#345c4e','#426b56','#57785e'],fog:'#b0c7d0',sun:'#fff1d9'},
  autumn:{id:'autumn',name:'Autumn Valley',difficulty:'Technical',description:'Amber canopies, linked bends, and the long way home.',width:12,
    points:[[0,105],[-65,100],[-100,65],[-65,28],[-105,-5],[-90,-65],[-35,-100],[0,-60],[40,-95],[95,-68],[105,-15],[60,10],[98,55],[65,95]],
    sky:'#dbc9af',ground:'#a69b5d',shoulder:'#c3ad78',foliage:['#bd6b3b','#d19446','#9b4f38','#a79b4d'],fog:'#dbc9af',sun:'#ffddb0'},
};
const catmull = (a:number,b:number,c:number,d:number,t:number) => .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
export interface TrackSample extends Vec2 { tx:number; tz:number; distance:number }
export class TrackPath {
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly checkpoints: TrackSample[];
  constructor(readonly config:TrackConfig, readonly count=480) {
    const pts=config.points, size=pts.length;
    for(let i=0;i<count;i++) {
      const u=i/count*size, j=Math.floor(u), t=u-j;
      const a=pts[(j-1+size)%size]!,b=pts[j%size]!,c=pts[(j+1)%size]!,d=pts[(j+2)%size]!;
      this.samples.push({x:catmull(a[0],b[0],c[0],d[0],t),z:catmull(a[1],b[1],c[1],d[1],t),tx:0,tz:0,distance:0});
    }
    let length=0;
    for(let i=0;i<count;i++) {const s=this.samples[i]!,prev=this.samples[(i+count-1)%count]!,next=this.samples[(i+1)%count]!;const l=Math.hypot(next.x-prev.x,next.z-prev.z);s.tx=(next.x-prev.x)/l;s.tz=(next.z-prev.z)/l;s.distance=length;length+=Math.hypot(next.x-s.x,next.z-s.z);}
    this.length=length;
    this.checkpoints=Array.from({length:12},(_,i)=>this.samples[Math.floor(i*count/12)]!);
  }
  nearest(x:number,z:number): {point:TrackSample;distance:number;index:number;side:number} {
    let best=Infinity, index=0, px=0,pz=0,along=0;
    for(let i=0;i<this.count;i++) {
      const a=this.samples[i]!,b=this.samples[(i+1)%this.count]!,dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
      const sx=a.x+t*dx,sz=a.z+t*dz,dd=(x-sx)**2+(z-sz)**2;
      if(dd<best){best=dd;index=i;px=sx;pz=sz;along=a.distance+t*Math.hypot(dx,dz);}
    }
    const s=this.samples[index]!;
    return {point:{...s,x:px,z:pz,distance:along},distance:Math.sqrt(best),index,side:(x-px)*-s.tz+(z-pz)*s.tx};
  }
  spawn(checkpoint=0): {x:number;z:number;heading:number} {
    const s=this.checkpoints[checkpoint]!;return {x:s.x+s.tx*2,z:s.z+s.tz*2,heading:Math.atan2(s.tx,s.tz)};
  }
  svgPath():string {return this.samples.filter((_,i)=>i%5===0).map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ')+' Z';}
}
