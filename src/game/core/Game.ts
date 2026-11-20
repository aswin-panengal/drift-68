import { CAMERA_NAMES, DEFAULT_SAVE,recordKey,type HostMessage,type SaveData,type DisplayMode,type Screen,type Snapshot } from '../../shared/types';
import { validSnapshot,recoverSave } from '../../shared/validation';
import { Bridge } from './Bridge';
import { Simulation,createSnapshot } from './Simulation';
import { GameLoop } from './GameLoop';
import { InputManager } from '../systems/InputManager';
import { AudioManager } from '../systems/AudioManager';
import { RendererManager } from '../rendering/RendererManager';
import { CARS } from '../vehicle/CarConfigs';
import { tireSlip } from '../vehicle/VehiclePhysics';
import { TRACKS,TrackPath } from '../tracks/TrackConfigs';
import { icon,roadLogo } from '../ui/icons';

const time=(t:number):string=>`${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;
const points=(n:number):string=>Math.floor(n).toLocaleString('en-US');
const button=(action:string,text:string,primary=false,ico=''):string=>`<button data-action="${action}" class="${primary?'primary':''}">${ico?icon(ico):''}<span>${text}</span>${primary?icon('arrow'):''}</button>`;
const iconButton=(action:string,label:string,ico:string):string=>`<button class="icon-button" data-action="${action}" title="${label}" aria-label="${label}">${icon(ico)}</button>`;

export class Game {
  readonly bridge=new Bridge();readonly audio=new AudioManager();readonly root:HTMLElement;
  simulation=new Simulation(createSnapshot(structuredClone(DEFAULT_SAVE)));
  data:SaveData=structuredClone(DEFAULT_SAVE);mode:DisplayMode='sidebar';
  renderer?:RendererManager;readonly loop:GameLoop;readonly input:InputManager;
  active=false;lease=false;token=0;visible=true;
  private returnScreen:Screen='title';private flow=false;private newRecord=false;private lastHud=0;private lastCapture=0;private error='';
  private overlay:HTMLElement;private hud:HTMLElement;private scene:HTMLElement;private diagnostic:HTMLElement;
  private counters={fps:0,frameTime:0,frames:0,updates:0};private fpsTime=performance.now();private lastFrames=0;
  private toastTimer=0;
  constructor(app:HTMLElement){
    app.innerHTML=`<main id="game-root" tabindex="0" aria-label="Drift Break game. Click the scene to drive."><div id="scene"></div><header id="topbar"><div class="wordmark">${roadLogo}<span>drift break</span></div><nav aria-label="Game view">${iconButton('restart','Restart lap','restart')}${iconButton('pause','Pause game','pause')}${iconButton('expand','Open in editor','expand')}${iconButton('maximize','Maximize editor','expand')}${iconButton('sidebar','Return to Explorer','sidebar')}</nav></header><div id="hud" hidden></div><section id="overlay" aria-label="Game menus"></section><div id="toast" role="status" aria-live="polite"></div><pre id="diagnostics" hidden></pre><div id="focus-hint" hidden>Click the road to drive</div></main>`;
    this.root=app.querySelector('#game-root')!;this.overlay=app.querySelector('#overlay')!;this.hud=app.querySelector('#hud')!;this.scene=app.querySelector('#scene')!;this.diagnostic=app.querySelector('#diagnostics')!;
    if (this.bridge.standalone) {
      this.root.dataset.standalone = '';
    }
    this.loop=new GameLoop(dt=>this.update(dt),dt=>this.render(dt),30);
    this.input=new InputManager(this.root,()=>this.active&&this.lease&&this.visible&&this.state.screen==='drive',()=>this.pause(),action=>{
      if (action === 'pause') this.pause();
      if (action === 'reset') {
        this.simulation.reset();
        this.renderer?.resetTracking();
        this.toast('Back on track. Combo cleared.');
      }
      if (action === 'camera') {
        const settings = this.state.settings;
        settings.camera = (settings.camera + 1) % CAMERA_NAMES.length;
        this.toast(`${CAMERA_NAMES[settings.camera]} camera`);
        this.persist();
      }
    });
    this.root.addEventListener('click',this.click);
    this.root.addEventListener('change',this.change);
    this.root.addEventListener('keydown',this.menuKeys);
    this.bridge.listen(m=>this.receive(m));this.bridge.post({type:'ready'});
    window.addEventListener('pagehide',this.pagehide);
    if(import.meta.env.DEV){Object.assign(window,{__drift:this});}
  }
  get state():Snapshot {return this.simulation.state;}
  private receive(message:HostMessage):void {
    if(message.type==='idle'){
      this.stop();this.audio.dispose();this.lease=false;this.data=recoverSave(message.data);this.disposeRenderer();
      this.root.dataset.screen='idle';this.overlay.hidden=false;this.hud.hidden=true;
      this.overlay.innerHTML=`<div class="welcome"><div class="welcome-mark">${roadLogo}</div><h1>Take the<br>scenic route.</h1><p>Code. Drift. Relax.</p>${button('claim','Open Drift Break',true)}<small>A little drive. A clearer mind.<br>Offline, and ready when you are.</small></div>`;this.syncMode();return;
    }
    if(message.type==='initialize'){
      this.stop();this.lease=false;this.token=message.token;this.data=recoverSave(message.data);this.mode=message.mode;
      const restored=message.snapshot??this.bridge.restored();
      const state=validSnapshot(restored)?structuredClone(restored):createSnapshot(this.data);state.settings={...this.data.settings};
      if(state.screen==='drive')state.screen='pause';
      this.simulation=new Simulation(state);
      try{this.ensureRenderer();this.loadScene();this.show(state.screen);this.root.setAttribute('aria-busy','true');this.overlay.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=true;});this.bridge.post({type:'initialized',token:this.token});}
      catch(error){this.disposeRenderer();this.error=error instanceof Error?error.message:'Unable to create a WebGL scene.';this.showError();}
      return;
    }
    if(message.type==='grant'&&message.token===this.token){this.lease=true;this.root.setAttribute('aria-busy','false');this.overlay.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=false;});return;}
    if(message.type==='suspend'&&message.token===this.token){this.pause();this.stop();this.audio.dispose();this.bridge.post({type:'suspended',token:this.token,snapshot:this.snapshot()});this.lease=false;this.disposeRenderer();return;}
    if(message.type==='visibility'){
      this.visible=message.visible;if(!message.visible){this.pause();this.capture();this.disposeRenderer();}
      else if(this.lease){try{this.ensureRenderer();this.loadScene();this.show(this.state.screen);}catch{this.showError();}}
      return;
    }
    if(message.type==='mode'){this.mode=message.mode;this.syncMode();this.renderer?.configure(this.state.settings,this.mode);this.still();}
    if(message.type==='data'){this.data=recoverSave(message.data);if(this.state.screen==='circuits'||this.state.screen==='results')this.show(this.state.screen);}
    if(message.type==='error'){this.error=message.message;this.showError();}
  }
  private ensureRenderer():void {
    if(this.renderer)return;
    this.renderer=new RendererManager(this.scene,this.state.settings,this.mode,()=>{this.pause();this.toast('Graphics paused. Waiting for the WebGL context to recover.');},()=>{if(this.renderer&&!this.renderer.contextLost){this.still();}});
  }
  private disposeRenderer():void {this.renderer?.dispose();this.renderer=undefined;}
  private loadScene():void {this.renderer?.load(this.state,this.simulation.path,this.state.screen==='garage');}
  private syncMode():void {this.root.dataset.mode=this.mode;this.loop.fps=this.mode==='sidebar'||this.state.settings.quality==='low'?30:60;const max=this.root.querySelector<HTMLButtonElement>('[data-action="maximize"]')!;max.innerHTML=icon(this.mode==='maximized'?'restore':'expand');max.title=this.mode==='maximized'?'Restore editor':'Maximize editor';max.setAttribute('aria-label',max.title);}
  private still():void {this.renderer?.draw(this.state,0,true);}
  private stop():void {this.active=false;this.loop.stop();this.input?.clear();this.audio.stop();}
  pause():void {
    if(!this.active)return;this.stop();if(this.state.screen==='drive'){this.show('pause');this.capture();}
  }
  private start():void {
    if(!this.lease||!this.visible||this.renderer?.contextLost)return;
    this.show('drive');this.root.focus({preventScroll:true});this.active=true;this.input.clear();
    this.root.querySelector<HTMLElement>('#focus-hint')!.hidden=true;
    void this.audio.unlock(this.state.settings);this.loop.start();this.capture();
  }
  private beginDrive():void {this.simulation.restart();this.loadScene();this.show('drive');this.capture();}
  private snapshot():Snapshot {return structuredClone(this.state);}
  private capture():void {const snapshot=this.snapshot();this.bridge.snapshot(snapshot);if(this.lease)this.bridge.post({type:'snapshot',token:this.token,snapshot});}
  private persist():void {this.data.car=this.state.car;this.data.track=this.state.track;this.data.zen=this.state.zen;this.data.settings={...this.state.settings};this.bridge.post({type:'save',data:this.data});this.renderer?.configure(this.state.settings,this.mode);this.syncMode();this.capture();}
  private update(dt:number):void {
    if(!this.active||!this.lease||!this.visible)return;
    const input=this.input.read(this.state.settings.gamepad);
    if(!this.active)return;
    const finished = this.simulation.step(input, dt);
    const vehicle = this.state.vehicle;
    this.audio.update(vehicle, tireSlip(vehicle), this.state.settings);
    if(finished){
      this.stop();void this.audio.playCue(this.state.settings,true);
      const s=this.state,score=Math.floor(s.score.banked),old=this.data.records[recordKey(s.track,s.car)];this.newRecord=!old||score>old.score;
      this.bridge.post({type:'record',track:s.track,car:s.car,entry:{score,time:s.lap.elapsed,longest:s.score.longest,multiplier:s.score.bestMultiplier}});
      this.show('results');this.capture();return;
    }
    this.lastCapture+=dt;if(this.lastCapture>2){this.lastCapture=0;this.capture();}
  }
  private render(dt:number):void {
    this.renderer?.draw(this.state,dt);this.lastHud+=dt;
    if(this.lastHud>=.1){this.lastHud=0;this.updateHud();}
    if(import.meta.env.DEV){
      const now=performance.now();if(now-this.fpsTime>500){this.counters={fps:(this.loop.frames-this.lastFrames)*1000/(now-this.fpsTime),frameTime:dt*1000,frames:this.loop.frames,updates:this.loop.updates};this.fpsTime=now;this.lastFrames=this.loop.frames;
        if(new URLSearchParams(location.search).has('debug')){this.diagnostic.hidden=false;const heap=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize;this.diagnostic.textContent=JSON.stringify({...this.counters,...this.renderer?.diagnostics(),heapBytes:heap,view:this.mode},null,2);}
      }
    }
  }
  diagnostics():object {return {...this.counters,...this.renderer?.diagnostics(),running:this.loop.running,active:this.active,lease:this.lease,token:this.token,view:this.mode,simulationUpdates:this.loop.updates};}
  private show(screen:Screen):void {
    if(screen!=='drive')this.stop();
    this.input.clear();this.state.screen=screen;this.root.dataset.screen=screen;this.error='';
    this.overlay.hidden=screen==='drive';this.hud.hidden=!['drive','pause'].includes(screen);
    this.root.querySelector<HTMLElement>('#focus-hint')!.hidden=screen!=='drive'||this.active;
    if(screen==='drive'){
      this.overlay.innerHTML='';this.buildHud();this.updateHud();this.still();return;
    }
    if(screen==='pause'){this.buildHud();this.updateHud();}
    const car=CARS[this.state.car],track=TRACKS[this.state.track];
    let content='';
    if(screen==='title')content=`<div class="title-copy"><h1>Take the<br>scenic route.</h1><p class="intro">A small escape between<br>big ideas.</p><div class="menu-actions">${button('start-flow','Start Drive',true)}${button('garage','Garage')}${button('circuits','Circuits')}${button('settings','Settings')}</div><button class="text-button" data-action="zen-flow">Just unwind in Zen Drive ${icon('arrow')}</button><footer>Code. Drift. Relax.<span>All roads lead back to you.</span></footer></div>`;
    if(screen==='garage'){
      content=`${this.back('title')}<h1>Your kind<br>of escape.</h1><p class="intro">Four personalities. Find your rhythm.</p><div class="car-list" role="group" aria-label="Choose car">${Object.values(CARS).map(c=>`<button data-car="${c.id}" class="car-choice ${c.id===car.id?'selected':''}" aria-pressed="${c.id===car.id}"><span class="swatch swatch-${c.id}"></span><span>${c.name}<small>${c.personality}</small></span><span class="selection-dot"></span></button>`).join('')}</div><div class="car-detail"><h2>${car.name}</h2><p>${car.description}</p><dl class="handling">${(['power','handling','drift'] as const).map(k=>`<div><dt>${k==='drift'?'Drift tendency':k[0]!.toUpperCase()+k.slice(1)}</dt><dd aria-label="${car[k]} of 5">${Array.from({length:5},(_,i)=>`<i class="${i<car[k]?'filled':''}"></i>`).join('')}</dd></div>`).join('')}<div><dt>Response</dt><dd>${car.personality.split(' · ')[0]}</dd></div></dl></div>${button('select-car',this.flow?'Choose circuit':'Select & continue',true)}`;
    }
    if(screen==='circuits'){
      content=`${this.back('garage')}<h1>A change<br>of scenery.</h1><p class="intro">One lap. No hurry. Make it yours.</p><div class="circuit-list" role="group" aria-label="Choose circuit">${Object.values(TRACKS).map(t=>{const path=new TrackPath(t),best=this.data.records[recordKey(t.id,this.state.car)];return `<button class="circuit-choice ${t.id===track.id?'selected':''}" data-track="${t.id}" aria-pressed="${t.id===track.id}"><svg class="track-preview ${t.id}" viewBox="-145 -135 290 270" aria-label="${t.name} circuit outline"><path class="map-shadow" d="${path.svgPath()}"/><path class="map-road" d="${path.svgPath()}"/><circle cx="0" cy="${path.samples[0]!.z}" r="5"/></svg><span><strong>${t.name}</strong><small>${t.difficulty} · ${Math.round(path.length)} m</small><small>${best?`Personal best ${points(best.score)}`:'A fresh road. Set your first best.'}</small></span></button>`;}).join('')}</div><p class="track-description">${track.description}</p><div class="mode-switch"><button data-action="challenge" aria-pressed="${!this.state.zen}" class="${!this.state.zen?'chosen':''}">Lap challenge</button><button data-action="zen" aria-pressed="${this.state.zen}" class="${this.state.zen?'chosen':''}">Zen Drive</button></div>${button('begin',this.state.zen?'Begin Zen Drive':'Head to the start',true)}`;
    }
    if(screen==='pause')content=`<div class="pause-copy"><h1>A moment<br>to breathe.</h1><p class="intro">${track.name}<br><span>${car.name} · ${this.state.zen?'Zen Drive':'Lap challenge'}</span></p><div class="menu-actions">${button('resume','Resume drive',true,'play')}${button('restart','Restart Lap',false,'restart')}${button('garage','Garage')}${button('circuits','Circuits')}${button('settings','Settings')}${button('title','Exit to Title')}</div><p class="quiet">Your drive is paused. Coding comes first.</p></div>`;
    if(screen==='settings')content=`${this.back(this.returnScreen)}<h1>Make yourself<br>comfortable.</h1><p class="intro">A quieter drive, your way.</p><div class="settings-list">${this.select('quality','Graphics quality',[['auto','Auto · adaptive'],['low','Low · 30 FPS'],['medium','Medium'],['high','High · shadows']])}${this.select('camera','Camera',CAMERA_NAMES.map((name, index) => [String(index), name]))}${this.toggle('sound','Sound','Engine, tires, and small cues')}<label class="setting"><span>Volume</span><input aria-label="Volume" data-setting="volume" type="range" min="0" max="1" step=".05" value="${this.state.settings.volume}"></label>${this.toggle('reducedMotion','Reduced motion','Steadier camera and softer audio')}${this.toggle('minimap','Minimap')}${this.toggle('advancedHud','Lap time & details')}${this.toggle('gamepad','Gamepad','Standard mapping · focus required')}</div><button data-action="reset-records" class="text-button danger">Reset local records</button><p class="quiet">Saved in ${this.bridge.standalone ? 'this browser' : 'VS Code'}. No account, no telemetry.</p>`;
    if(screen==='results'){
      const s=this.state,score=Math.floor(s.score.banked),best=Math.max(score,this.data.records[recordKey(s.track,s.car)]?.score??0);
      content=`<div class="results-copy"><h1>That was<br>a good detour.</h1><p class="intro">${track.name} · ${car.name}</p>${this.newRecord?'<p class="record-label">A new personal best</p>':''}<div class="final-score"><strong>${points(score)}</strong><span>drift points</span></div><dl class="results-stats"><div><dt>Personal best</dt><dd>${points(best)}</dd></div><div><dt>Longest drift</dt><dd>${s.score.longest.toFixed(1)} s</dd></div><div><dt>Best multiplier</dt><dd>×${s.score.bestMultiplier.toFixed(1)}</dd></div><div><dt>Lap time</dt><dd>${time(s.lap.elapsed)}</dd></div></dl><div class="menu-actions">${button('retry','One more lap',true)}${button('circuits','Change Circuit')}${button('zen-now','Unwind in Zen Drive')}${button('title','Back to Title')}</div></div>`;
    }
    this.overlay.innerHTML=`<div class="menu-sheet" data-menu="${screen}">${content}</div><div class="scene-caption"><span>${screen==='garage'?car.name:track.name}</span><small>${screen==='garage'?car.personality:track.difficulty+' · '+(this.state.zen?'Zen Drive':'One lap, your own pace')}</small></div>`;
    this.syncMode();this.still();
  }
  private back(action:string):string {return `<button class="back-button" data-action="${action}">${icon('back')}<span>Back</span></button>`;}
  private toggle(key:'sound'|'reducedMotion'|'minimap'|'advancedHud'|'gamepad',label:string,help=''):string {return `<label class="setting"><span>${label}${help?`<small>${help}</small>`:''}</span><input type="checkbox" role="switch" data-setting="${key}" aria-label="${label}" ${this.state.settings[key]?'checked':''}></label>`;}
  private select(key:'quality'|'camera',label:string,options:string[][]):string {return `<label class="setting"><span>${label}</span><select data-setting="${key}" aria-label="${label}">${options.map(([value,text])=>`<option value="${value}" ${String(this.state.settings[key])===value?'selected':''}>${text}</option>`).join('')}</select></label>`;}
  private buildHud():void {
    this.hud.innerHTML=`<div class="score-block" ${this.state.zen?'hidden':''}><span class="hud-label">DRIFT SCORE</span><div><strong id="score">0</strong><span id="combo">×1.0</span></div><small id="pending"></small></div><div class="lap-block"><span class="hud-label">${this.state.zen?'ZEN DRIVE':'LAP 1 / 1'}</span><strong id="lap-time">0:00.0</strong><small id="progress">Checkpoint 0 / 12</small></div><div class="speed-block"><strong id="speed">0</strong><span>km/h</span><div class="boost"><span>BOOST</span><meter id="boost" min="0" max="1" value=".25" aria-label="Boost charge"></meter></div></div><div class="minimap ${this.state.track}"><svg viewBox="-145 -135 290 270" aria-label="Track minimap"><path d="${this.simulation.path.svgPath()}"/><circle id="map-player" r="7"/></svg></div><div class="controls-hint"><span><kbd>W A S D</kbd> drive</span><span><kbd>Space</kbd> drift</span><span><kbd>Shift</kbd> boost</span><span><kbd>Esc</kbd> pause</span></div>`;
    this.hud.classList.toggle('simple',!this.state.settings.advancedHud);this.hud.classList.toggle('no-map',!this.state.settings.minimap);
  }
  private updateHud():void {
    if(this.hud.hidden)return;const s=this.state;
    const set=(id:string,value:string)=>{const el=this.hud.querySelector('#'+id);if(el&&el.textContent!==value)el.textContent=value;};
    set('score',points(s.score.banked+s.score.pending));set('combo',`×${s.score.multiplier.toFixed(1)}`);set('pending',s.score.pending>0?`+${points(s.score.pending)} in this combo`:s.zen?'':'Find your flow');
    set('speed',String(Math.round(Math.hypot(s.vehicle.vx,s.vehicle.vz)*3.6)));set('lap-time',time(s.lap.elapsed));set('progress',s.zen?'No finish. No hurry.':`Checkpoint ${s.lap.next-1} / 12`);
    const boost=this.hud.querySelector<HTMLMeterElement>('#boost');if(boost)boost.value=s.vehicle.boost;
    const player=this.hud.querySelector('#map-player');player?.setAttribute('cx',s.vehicle.x.toFixed(1));player?.setAttribute('cy',s.vehicle.z.toFixed(1));
    this.hud.classList.toggle('drifting',s.score.active);
  }
  private click=(event:MouseEvent):void=>{
    const target=event.target as HTMLElement,control=target.closest<HTMLElement>('[data-action],[data-car],[data-track]');
    if(!control){if(this.state.screen==='drive'&&this.lease)this.start();return;}
    const car=control.dataset.car,track=control.dataset.track;
    void this.audio.playCue(this.state.settings);
    if(car&&car in CARS){this.state.car=car as Snapshot['car'];this.simulation.restart();this.loadScene();this.persist();this.show('garage');return;}
    if(track&&track in TRACKS){this.state.track=track as Snapshot['track'];this.simulation.restart();this.loadScene();this.persist();this.show('circuits');return;}
    const action=control.dataset.action;
    if(action==='claim'){this.overlay.innerHTML='<div class="welcome"><h1>Finding your road.</h1><p role="status">Preparing a little escape…</p><progress aria-label="Loading game"></progress></div>';this.bridge.post({type:'claim'});return;}
    if(action==='expand'){this.pause();this.capture();this.bridge.post({type:'openEditor'});return;}
    if(action==='sidebar'){this.pause();this.capture();this.bridge.post({type:'openSidebar'});return;}
    if(action==='maximize'){this.pause();this.bridge.post({type:'maximize'});return;}
    if(action==='retry-graphics'){this.bridge.post({type:'claim'});return;}
    if(!this.lease)return;
    if(action==='start-flow'||action==='zen-flow'){this.flow=true;this.state.zen=action==='zen-flow';this.show('garage');this.loadScene();return;}
    if(action==='select-car'){this.persist();this.show('circuits');this.loadScene();return;}
    if(action==='begin'||action==='retry'||action==='restart'){this.stop();this.beginDrive();return;}
    if(action==='resume'){this.start();return;}
    if(action==='pause'){if(this.active)this.pause();else if(this.state.screen!=='pause')this.show('pause');return;}
    if(action==='zen-now'){this.state.zen=true;this.persist();this.beginDrive();return;}
    if(action==='zen'||action==='challenge'){this.state.zen=action==='zen';this.persist();this.show('circuits');return;}
    if(action==='reset-records'){this.bridge.post({type:'resetRecords'});return;}
    if(action==='settings'){this.returnScreen=this.state.screen==='drive'?'pause':this.state.screen;this.show('settings');return;}
    if(action==='title'||action==='garage'||action==='circuits'||action==='pause'){this.show(action);this.loadScene();this.capture();}
  };
  private change=(event:Event):void=>{
    const element=event.target as HTMLInputElement|HTMLSelectElement,key=element.dataset.setting;if(!key)return;
    const settings=this.state.settings;
    if(key==='quality')settings.quality=element.value as typeof settings.quality;
    else if(key==='volume')settings.volume=Number(element.value);
    else if(key==='camera')settings.camera=Number(element.value);
    else if(['sound','reducedMotion','minimap','advancedHud','gamepad'].includes(key)){(settings as unknown as Record<string,unknown>)[key]=(element as HTMLInputElement).checked;}
    if(key==='sound'&&settings.sound)void this.audio.playCue(settings);
    this.root.classList.toggle('reduced-motion',settings.reducedMotion);this.persist();this.still();
  };
  private menuKeys=(event:KeyboardEvent):void=>{
    if(event.defaultPrevented||this.state.screen==='drive'||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.code==='Escape'&&this.lease){event.preventDefault();if(this.state.screen==='pause'){this.show('drive');this.root.focus();}else if(this.state.screen==='settings')this.show(this.returnScreen);else{this.show('title');this.loadScene();}}
  };
  private toast(message:string):void {clearTimeout(this.toastTimer);const element=this.root.querySelector('#toast')!;element.textContent=message;if(message)this.toastTimer=window.setTimeout(()=>{element.textContent='';},3500);}
  private showError(): void {
    this.stop();
    this.overlay.hidden = false;
    this.hud.hidden = true;
    this.overlay.innerHTML = `<div class="welcome"><h1>A little<br>pit stop.</h1><p id="error-message"></p>${button('retry-graphics','Try again',true)}${button('expand','Open in editor')}</div>`;
    const platform = this.bridge.standalone ? 'your browser' : 'VS Code';
    this.overlay.querySelector('#error-message')!.textContent = this.error || `WebGL is unavailable. Enable hardware acceleration in ${platform}, then try again.`;
  }
  private pagehide=():void=>{this.pause();this.capture();this.disposeRenderer();this.audio.dispose();};
  dispose():void {clearTimeout(this.toastTimer);this.pagehide();this.loop.stop();this.input.dispose();this.bridge.dispose();this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);this.root.removeEventListener('keydown',this.menuKeys);window.removeEventListener('pagehide',this.pagehide);}
}
