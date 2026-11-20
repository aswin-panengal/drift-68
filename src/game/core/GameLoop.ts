export class GameLoop {
  private raf=0;private previous=0;private accumulator=0;private rendered=0;
  updates=0;frames=0;running=false;
  constructor(private readonly update:(dt:number)=>void,private readonly render:(dt:number)=>void,public fps=60){}
  start():void {if(this.running)return;this.running=true;this.previous=performance.now();this.rendered=this.previous;this.accumulator=0;this.raf=requestAnimationFrame(this.frame);}
  stop():void {this.running=false;cancelAnimationFrame(this.raf);this.raf=0;this.accumulator=0;}
  private frame=(now:number):void=>{
    if(!this.running)return;
    const delta=Math.min(.1,Math.max(0,(now-this.previous)/1000));this.previous=now;this.accumulator+=delta;
    let steps=0;
    while(this.accumulator>=1/60&&steps<6){this.update(1/60);this.accumulator-=1/60;this.updates++;steps++;if(!this.running)return;}
    if(now-this.rendered>=1000/this.fps-1){const elapsed=(now-this.rendered)/1000;this.rendered=now;this.render(elapsed);this.frames++;}
    if(this.running)this.raf=requestAnimationFrame(this.frame);
  };
}
