import type { Settings,VehicleState } from '../../shared/types';
export class AudioManager {
  private context?:AudioContext;private master?:GainNode;private engine?:OscillatorNode;private engineGain?:GainNode;
  private tire?:AudioBufferSourceNode;private tireGain?:GainNode;private muted=true;
  async unlock(settings:Settings):Promise<void> {
    if(!settings.sound)return;
    if(!this.context){
      const ctx=this.context=new AudioContext();this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
      this.engine=ctx.createOscillator();this.engine.type='triangle';this.engine.frequency.value=44;this.engineGain=ctx.createGain();this.engineGain.gain.value=.04;this.engine.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
      const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=buffer.getChannelData(0);let seed=321;
      for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=(seed/2147483647*2-1)*.4;}
      const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1400;filter.Q.value=.6;
      this.tire=ctx.createBufferSource();this.tire.buffer=buffer;this.tire.loop=true;this.tireGain=ctx.createGain();this.tireGain.gain.value=0;this.tire.connect(filter);filter.connect(this.tireGain);this.tireGain.connect(this.master);this.tire.start();
    }
    this.muted=false;await this.context.resume();this.master!.gain.setTargetAtTime(settings.volume*(settings.reducedMotion?.65:1),this.context.currentTime,.04);
  }
  update(v:VehicleState,slip:number,settings:Settings):void {
    if(!this.context||this.muted)return;const t=this.context.currentTime;
    this.engine!.frequency.setTargetAtTime(42+Math.abs(v.speed)*4+v.throttle*22,t,.09);this.engineGain!.gain.setTargetAtTime(.035+v.throttle*.035,t,.08);this.tireGain!.gain.setTargetAtTime(.064 * slip,t,.08);this.master!.gain.setTargetAtTime(settings.sound?settings.volume*(settings.reducedMotion?.65:1):0,t,.08);
  }
  cue(finish=false):void {
    const ctx=this.context;if(!ctx||this.muted||!this.master)return;
    const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(finish?440:600,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(finish?880:450,ctx.currentTime+.12);gain.gain.setValueAtTime(.035,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.2);osc.connect(gain);gain.connect(this.master);osc.start();osc.stop(ctx.currentTime+.22);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  async playCue(settings:Settings,finish=false):Promise<void> {
    if(!settings.sound)return;
    const wasMuted=this.muted;
    if(!this.context)await this.unlock(settings);
    const ctx=this.context;if(!ctx)return;
    if(wasMuted){this.muted=true;if(this.master)this.master.gain.value=0;}
    await ctx.resume();
    const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(finish?440:600,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(finish?880:450,ctx.currentTime+.12);gain.gain.setValueAtTime(settings.volume*.05,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.2);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.22);
    osc.onended=()=>{osc.disconnect();gain.disconnect();if(this.muted)void ctx.suspend();};
  }
  stop():void {this.muted=true;if(this.context&&this.master){this.master.gain.value=0;void this.context.suspend();}}
  dispose():void {this.stop();this.engine?.stop();this.tire?.stop();void this.context?.close();this.context=undefined;}
}
